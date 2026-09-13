import assert from "node:assert/strict";
import fs from "node:fs";

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

const queue = [
  {
    id: "sale:1",
    kind: "create_sale",
    createdAt: 1000,
    tempInvoiceId: "OFF-20260913150000-A001",
    body: { p_idempotency_key: "sale-key-1", p_lines: [{ productId: 1, qty: 2, prixUnit: 1000 }] },
  },
  {
    id: "pay:1",
    kind: "record_payment",
    createdAt: 1100,
    body: { p_idempotency_key: "pay-key-1", p_invoice_id: "OFF-20260913150000-A001", p_amount: 2000, p_payment_method: "Espèces" },
  },
  {
    id: "sale:2",
    kind: "create_sale",
    createdAt: 1200,
    tempInvoiceId: "OFF-20260913150100-A002",
    body: { p_idempotency_key: "sale-key-2", p_lines: [{ productId: 1, qty: 3, prixUnit: 1000 }, { productId: 2, qty: 1, prixUnit: 500 }] },
  },
  {
    id: "sale:3",
    kind: "create_sale",
    createdAt: 1300,
    tempInvoiceId: "OFF-20260913150200-A003",
    body: { p_idempotency_key: "sale-key-3", p_lines: [{ productId: 2, qty: 2, prixUnit: 500 }] },
  },
];

const server = new FakeServer();
const invoiceMap = new Map();

// Simulate the hardest network case: the first RPC commits on the server, but
// the response is lost. Replaying with the SAME key must return the same sale
// and must not deduct stock twice.
const committedButLost = server.createSale(queue[0].body);
const stockAfterLostResponse = server.stock.get(1);
const retryResult = server.createSale(queue[0].body);
assert.equal(retryResult.invoice_id, committedButLost.invoice_id, "retry must resolve to the same invoice");
assert.equal(server.stock.get(1), stockAfterLostResponse, "idempotent retry must not deduct stock twice");
invoiceMap.set(queue[0].tempInvoiceId, retryResult.invoice_id);

for (const record of queue.slice(1).sort((a, b) => a.createdAt - b.createdAt)) {
  if (record.kind === "create_sale") {
    const result = server.createSale(record.body);
    invoiceMap.set(record.tempInvoiceId, result.invoice_id);
    continue;
  }
  const officialInvoiceId = invoiceMap.get(record.body.p_invoice_id);
  assert.ok(officialInvoiceId, "payment replay must wait for temporary invoice mapping");
  server.recordPayment({ ...record.body, p_invoice_id: officialInvoiceId });
}

assert.equal(server.idempotency.size, 3, "three offline sales must create exactly three server invoices");
assert.equal(server.payments.size, 1, "cash payment must replay exactly once");
assert.equal(server.stock.get(1), 7, "product 1 stock must reflect 2 + 3 units sold exactly once");
assert.equal(server.stock.get(2), 6, "product 2 stock must reflect 1 + 2 units sold exactly once");
assert.equal(invoiceMap.size, 3, "every temporary invoice must receive one official mapping");

console.log("Offline POS contract OK: cut, 3 queued sales, cash payment, reconnect, idempotent replay, coherent stock.");
