import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const workerSource = fs.readFileSync("public/service-worker.js", "utf8");
const mainSource = fs.readFileSync("src/main.tsx", "utf8");

assert.match(workerSource, /rpc === 'create_sale'/, "create_sale must be handled explicitly offline");
assert.match(workerSource, /p_idempotency_key/, "offline queue must preserve the server idempotency key");
assert.match(workerSource, /OFF-\$\{stamp\}/, "offline invoices must use a distinct OFF- temporary prefix");
assert.match(workerSource, /p_payment_method[\s\S]*espèces/i, "offline payment policy must restrict payments to cash");
assert.match(workerSource, /retours\/remboursements, droits\/utilisateurs, transferts/, "unsafe offline mutations must be blocked explicitly");
assert.match(mainSource, /OFFLINE_CONFIRM_MS = 20_000/, "offline mode must use a confirmation delay");
assert.match(mainSource, /OFFLINE_WARNING_MS = 12 \* 60 \* 60 \* 1000/, "prolonged offline use must warn after 12h");
assert.match(mainSource, /sort\(\(a, b\) => a\.createdAt - b\.createdAt\)/, "replay must be chronological");

class FakeServer {
  constructor() {
    this.nextInvoice = 1;
    this.stock = new Map([[1, 12], [2, 9]]);
    this.idempotency = new Map();
    this.payments = new Map();
  }

  createSale(body) {
    const key = body.p_idempotency_key;
    if (this.idempotency.has(key)) return this.idempotency.get(key);
    for (const line of body.p_lines) {
      const current = this.stock.get(line.productId) ?? 0;
      if (current < line.qty) throw new Error(`stock insuffisant ${line.productId}`);
    }
    for (const line of body.p_lines) {
      this.stock.set(line.productId, (this.stock.get(line.productId) ?? 0) - line.qty);
    }
    const result = { invoice_id: `F-${String(this.nextInvoice++).padStart(4, "0")}` };
    this.idempotency.set(key, result);
    return result;
  }

  recordPayment(body) {
    const key = body.p_idempotency_key;
    if (this.payments.has(key)) return this.payments.get(key);
    const result = { invoice_id: body.p_invoice_id, amount: body.p_amount };
    this.payments.set(key, result);
    return result;
  }
}

function buildQueue(run) {
  return [
    {
      id: `sale:${run}:1`,
      kind: "create_sale",
      createdAt: 1000,
      tempInvoiceId: `OFF-20260913150000-${String(run).padStart(2, "0")}A1`,
      body: { p_idempotency_key: `sale-key-${run}-1`, p_lines: [{ productId: 1, qty: 2, prixUnit: 1000 }] },
    },
    {
      id: `pay:${run}:1`,
      kind: "record_payment",
      createdAt: 1100,
      body: { p_idempotency_key: `pay-key-${run}-1`, p_invoice_id: `OFF-20260913150000-${String(run).padStart(2, "0")}A1`, p_amount: 2000, p_payment_method: "Espèces" },
    },
    {
      id: `sale:${run}:2`,
      kind: "create_sale",
      createdAt: 1200,
      tempInvoiceId: `OFF-20260913150100-${String(run).padStart(2, "0")}A2`,
      body: { p_idempotency_key: `sale-key-${run}-2`, p_lines: [{ productId: 1, qty: 3, prixUnit: 1000 }, { productId: 2, qty: 1, prixUnit: 500 }] },
    },
    {
      id: `sale:${run}:3`,
      kind: "create_sale",
      createdAt: 1300,
      tempInvoiceId: `OFF-20260913150200-${String(run).padStart(2, "0")}A3`,
      body: { p_idempotency_key: `sale-key-${run}-3`, p_lines: [{ productId: 2, qty: 2, prixUnit: 500 }] },
    },
  ];
}

function runLostResponseScenario(run) {
  const queue = buildQueue(run);
  const server = new FakeServer();
  const invoiceMap = new Map();

  // Hardest network case: create_sale commits, but its HTTP response disappears.
  // The retry MUST carry the exact same idempotency key and therefore resolve to
  // the same invoice without a second stock deduction.
  const originalKey = queue[0].body.p_idempotency_key;
  const committedButLost = server.createSale(queue[0].body);
  const stockAfterLostResponse = server.stock.get(1);
  const retryBody = structuredClone(queue[0].body);
  assert.equal(retryBody.p_idempotency_key, originalKey, `run ${run}: retry key must be preserved byte-for-byte`);
  const retryResult = server.createSale(retryBody);
  assert.equal(retryResult.invoice_id, committedButLost.invoice_id, `run ${run}: retry must resolve to the same invoice`);
  assert.equal(server.stock.get(1), stockAfterLostResponse, `run ${run}: retry must not deduct stock twice`);
  invoiceMap.set(queue[0].tempInvoiceId, retryResult.invoice_id);

  for (const record of queue.slice(1).sort((a, b) => a.createdAt - b.createdAt)) {
    if (record.kind === "create_sale") {
      const result = server.createSale(record.body);
      invoiceMap.set(record.tempInvoiceId, result.invoice_id);
      continue;
    }
    const officialInvoiceId = invoiceMap.get(record.body.p_invoice_id);
    assert.ok(officialInvoiceId, `run ${run}: payment replay must wait for temporary invoice mapping`);
    server.recordPayment({ ...record.body, p_invoice_id: officialInvoiceId });
  }

  assert.equal(server.idempotency.size, 3, `run ${run}: three offline sales must create exactly three server invoices`);
  assert.equal(server.payments.size, 1, `run ${run}: cash payment must replay exactly once`);
  assert.equal(server.stock.get(1), 7, `run ${run}: product 1 stock must reflect 2 + 3 units sold exactly once`);
  assert.equal(server.stock.get(2), 6, `run ${run}: product 2 stock must reflect 1 + 2 units sold exactly once`);
  assert.equal(invoiceMap.size, 3, `run ${run}: every temporary invoice must receive one official mapping`);
}

// A single green retry test can hide accidental state coupling. Run the exact
// commit-then-lost-response sequence repeatedly with fresh server state and keys.
for (let run = 1; run <= 50; run += 1) runLostResponseScenario(run);

async function testOnlineCreateSalePassthrough() {
  const listeners = new Map();
  let upstreamCalls = 0;
  const upstreamPayload = {
    invoice_id: "F-ONLINE-0001",
    client_id: null,
    total: 3500,
    due_date: null,
  };

  const context = {
    self: {
      location: { origin: "https://app.tournal.test" },
      clients: {
        claim: async () => undefined,
        matchAll: async () => [],
      },
      skipWaiting: () => undefined,
      addEventListener(type, handler) { listeners.set(type, handler); },
      registration: { showNotification: async () => undefined },
    },
    caches: {
      open: async () => ({ addAll: async () => undefined, put: async () => undefined }),
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    },
    indexedDB: {
      open() { throw new Error("online create_sale must never touch the offline IndexedDB queue"); },
    },
    fetch: async (request) => {
      upstreamCalls += 1;
      assert.equal(new URL(request.url).pathname, "/rest/v1/rpc/create_sale", "online sale must call the original create_sale endpoint");
      return new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    Request,
    Response,
    URL,
    AbortController,
    DOMException,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Promise,
    crypto: webcrypto,
    console,
  };

  vm.runInNewContext(workerSource, context, { filename: "public/service-worker.js" });
  const fetchHandler = listeners.get("fetch");
  assert.equal(typeof fetchHandler, "function", "service worker fetch handler must be registered");

  const idempotencyKey = "online-sale-key-001";
  const request = new Request("https://example.supabase.co/rest/v1/rpc/create_sale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_boutique_id: "boutique-online",
      p_idempotency_key: idempotencyKey,
      p_client_nom: "Client comptoir",
      p_lines: [{ productId: 1, nom: "Produit", qty: 1, unit: "unité", prixUnit: 3500 }],
    }),
  });

  let responsePromise;
  fetchHandler({
    request,
    respondWith(value) { responsePromise = Promise.resolve(value); },
  });
  assert.ok(responsePromise, "Supabase create_sale must be intercepted by the service worker handler");
  const response = await responsePromise;
  const body = await response.json();

  assert.equal(upstreamCalls, 1, "normal online sale must perform exactly one upstream request");
  assert.equal(response.status, 200, "normal online response status must pass through unchanged");
  assert.deepEqual(body, upstreamPayload, "normal online create_sale response must pass through unchanged");
  assert.equal(body.invoice_id.startsWith("OFF-"), false, "normal online sale must never receive a temporary offline invoice number");
}

await testOnlineCreateSalePassthrough();

console.log("Offline POS contract OK: 50 reproducible lost-response retries, 3-sale offline replay, coherent stock, and normal online create_sale passthrough.");
