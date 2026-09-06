import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const token = process.env.QA_TOKEN;
const boutique = process.env.QA_BOUTIQUE;
const productIds = (process.env.QA_PRODUCT_IDS || '').split(',').map(Number).filter(Number.isFinite);
if (!base || !key || !token || !boutique || productIds.length < 10) throw new Error('missing QA environment');

const headers = {
  apikey: key,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function request(path, { method = 'GET', body } = {}) {
  const t0 = performance.now();
  const r = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const ms = performance.now() - t0;
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} ${path}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = r.status;
    err.ms = ms;
    throw err;
  }
  return { data, ms };
}

const rpc = (name, body) => request(`rpc/${name}`, { method: 'POST', body });
const enc = encodeURIComponent;

function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a,b) => a-b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)];
}
const round = n => n == null ? null : Math.round(n * 100) / 100;

const readParams = {
  p_boutique_id: boutique,
  p_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  p_to: null,
  p_include_pending: true,
};

async function timedInvoiceRead() {
  const { data, ms } = await rpc('read_bounded_invoice_summaries', readParams);
  if (!Array.isArray(data)) throw new Error('invoice summary RPC did not return an array');
  return { ms, rows: data.length };
}

async function verifyTransaction({ invoiceId, uniqueClient, productId, expectedAmount, createA, createB, payA, payB }) {
  let duplicate = 0;
  let divergence = 0;
  const notes = [];
  if (!createA?.invoice_id || createA.invoice_id !== createB?.invoice_id || createA.invoice_number !== createB?.invoice_number) {
    duplicate += 1;
    notes.push('create_sale retry response mismatch');
  }
  if (!payA?.payment?.id || payA.payment.id !== payB?.payment?.id || payA.invoice_id !== payB?.invoice_id) {
    duplicate += 1;
    notes.push('record_payment retry response mismatch');
  }

  const invoiceQ = `invoices?select=id,montant,acompte,status,stock_deducted_at,client_nom&boutique_id=eq.${enc(boutique)}&id=eq.${enc(invoiceId)}`;
  const paymentsQ = `invoice_payments?select=id,amount,batch_id,source&boutique_id=eq.${enc(boutique)}&invoice_id=eq.${enc(invoiceId)}`;
  const linesQ = `invoice_lines?select=id,product_id,qty&boutique_id=eq.${enc(boutique)}&invoice_id=eq.${enc(invoiceId)}`;
  const stockQ = `stock_entries?select=id,product_id,qty,source_invoice_id,source_invoice_line_id&boutique_id=eq.${enc(boutique)}&source_invoice_id=eq.${enc(invoiceId)}`;
  const duplicatesQ = `invoices?select=id&boutique_id=eq.${enc(boutique)}&client_nom=eq.${enc(uniqueClient)}`;
  const [invoiceR, paymentsR, linesR, stockR, duplicatesR] = await Promise.all([
    request(invoiceQ), request(paymentsQ), request(linesQ), request(stockQ), request(duplicatesQ),
  ]);

  const inv = invoiceR.data?.[0];
  if (!inv || Number(inv.montant) !== expectedAmount || Number(inv.acompte) !== expectedAmount || inv.status !== 'payée' || !inv.stock_deducted_at) {
    divergence += 1;
    notes.push('invoice settlement state mismatch');
  }
  if (!Array.isArray(paymentsR.data) || paymentsR.data.length !== 1 || Number(paymentsR.data[0]?.amount) !== expectedAmount) {
    divergence += 1;
    notes.push(`payment count/amount mismatch (${paymentsR.data?.length ?? 'n/a'})`);
  }
  if (!Array.isArray(linesR.data) || linesR.data.length !== 1 || Number(linesR.data[0]?.product_id) !== productId) {
    divergence += 1;
    notes.push('invoice line mismatch');
  }
  const lineQty = Number(linesR.data?.[0]?.qty ?? 0);
  if (!Array.isArray(stockR.data) || stockR.data.length !== 1 || Number(stockR.data[0]?.product_id) !== productId || Number(stockR.data[0]?.qty) !== -lineQty) {
    divergence += 1;
    notes.push(`stock movement mismatch (${stockR.data?.length ?? 'n/a'})`);
  }
  if (!Array.isArray(duplicatesR.data) || duplicatesR.data.length !== 1 || duplicatesR.data[0]?.id !== invoiceId) {
    duplicate += 1;
    notes.push(`duplicate invoice count mismatch (${duplicatesR.data?.length ?? 'n/a'})`);
  }
  return { duplicate, divergence, notes };
}

async function vu(plateau, vuId, readSamples) {
  const productId = productIds[(vuId - 1) % productIds.length];
  const uniqueClient = `QA-${plateau}-${String(vuId).padStart(3,'0')}-${crypto.randomUUID().slice(0,8)}`;
  const amount = 1000;
  const result = { duplicate: 0, divergence: 0, errors: 0, notes: [] };
  try {
    for (let i = 0; i < 5; i++) {
      const rr = await timedInvoiceRead();
      readSamples.push(rr.ms);
    }
    const createKey = crypto.randomUUID();
    const createBody = {
      p_boutique_id: boutique,
      p_idempotency_key: createKey,
      p_client_nom: uniqueClient,
      p_client_tel: null,
      p_lines: [{ productId, nom: `QA Product ${productId}`, qty: 1, unit: 'unité', prixUnit: amount }],
      p_payment_method: 'QA',
      p_client_id: null,
      p_origin: 'pos',
      p_confirm_duplicate: true,
    };
    const createA = (await rpc('create_sale', createBody)).data;
    const createB = (await rpc('create_sale', createBody)).data;
    const invoiceId = createA?.invoice_id;
    if (!invoiceId) throw new Error('create_sale returned no invoice_id');

    const payKey = crypto.randomUUID();
    const payBody = {
      p_boutique_id: boutique,
      p_invoice_id: invoiceId,
      p_idempotency_key: payKey,
      p_amount: amount,
      p_payment_method: 'QA',
    };
    const payA = (await rpc('record_payment', payBody)).data;
    const payB = (await rpc('record_payment', payBody)).data;
    const checked = await verifyTransaction({ invoiceId, uniqueClient, productId, expectedAmount: amount, createA, createB, payA, payB });
    result.duplicate += checked.duplicate;
    result.divergence += checked.divergence;
    result.notes.push(...checked.notes);
  } catch (e) {
    result.errors += 1;
    result.notes.push(String(e?.message || e));
  }
  return result;
}

async function runPlateau(users) {
  // One unmeasured warm-up wave at the exact target concurrency.
  await Promise.all(Array.from({ length: users }, () => timedInvoiceRead().catch(() => null)));
  const readSamples = [];
  const started = performance.now();
  const outcomes = await Promise.all(Array.from({ length: users }, (_, i) => vu(users, i + 1, readSamples)));
  const elapsedMs = performance.now() - started;
  const duplicates = outcomes.reduce((a,x) => a + x.duplicate, 0);
  const divergences = outcomes.reduce((a,x) => a + x.divergence, 0);
  const errors = outcomes.reduce((a,x) => a + x.errors, 0);
  const notes = outcomes.flatMap((x,i) => x.notes.map(n => `VU${i+1}: ${n}`)).slice(0,50);
  return {
    users,
    readSamples: readSamples.length,
    p50_ms: round(percentile(readSamples, .50)),
    p95_ms: round(percentile(readSamples, .95)),
    p99_ms: round(percentile(readSamples, .99)),
    max_ms: round(readSamples.length ? Math.max(...readSamples) : null),
    elapsed_ms: round(elapsedMs),
    errors,
    duplicate_transactions: duplicates,
    consistency_divergences: divergences,
    notes,
  };
}

const report = {
  campaign: 'banking-readiness-20260906',
  boutique,
  started_at: new Date().toISOString(),
  plateaus: [],
};
for (const users of [10,25,50,100]) {
  const r = await runPlateau(users);
  report.plateaus.push(r);
  console.log(`PLATEAU ${users} p95=${r.p95_ms}ms errors=${r.errors} dup=${r.duplicate_transactions} divergence=${r.consistency_divergences}`);
}
report.finished_at = new Date().toISOString();
report.go = Boolean(
  report.plateaus[0]?.p95_ms < 250 &&
  report.plateaus.every(p => p.errors === 0 && p.duplicate_transactions === 0 && p.consistency_divergences === 0)
);
fs.writeFileSync('qa-banking-report.json', JSON.stringify(report, null, 2));
console.log(`BANKING_GO=${report.go}`);
// Do not fail the workflow on a performance/business gate: always upload the full report.
