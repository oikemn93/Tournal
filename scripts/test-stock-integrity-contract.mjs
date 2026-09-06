import fs from 'node:fs';
import assert from 'node:assert/strict';

const stockSql = fs.readFileSync('.github/audit/replay-migrations/20260906181500_stock_integrity_guardrails.sql','utf8');
const inventoryRaceSql = fs.readFileSync('.github/audit/replay-migrations/20260906191745_inventory_race_same_transaction_guard.sql','utf8');
const dashboardSql = fs.readFileSync('.github/audit/replay-migrations/20260906192500_dashboard_fifo_stock_value.sql','utf8');
const app = fs.readFileSync('src/app/App.tsx','utf8');
const inventory = fs.readFileSync('src/app/utils/inventory.ts','utf8');
const pos = fs.readFileSync('src/app/screens/POSView.tsx','utf8');

assert.ok(stockSql.includes('v_stock_deducted:=private.commit_invoice_stock('), 'record_payment must use canonical stock commit');
assert.ok(!stockSql.includes('set stock=stock-v_sale_line.qty'), 'record_payment must not decrement stock directly');
assert.ok(stockSql.includes('stock cannot become more negative for product'), 'global negative-stock floor guard missing');
assert.ok(stockSql.includes('trg_guard_negative_product_stock_update'), 'negative-stock update trigger missing');
assert.ok(stockSql.includes("st.relationship_type='commercial'"), 'commercial transfer lifecycle exemption missing');
assert.ok(stockSql.includes("commercial transfer invoice must have committed stock"), 'commercial transfer must fail closed without committed stock');
assert.ok(stockSql.includes('for update of p'), 'inventory product lock missing');
assert.ok(stockSql.includes('v_diff:=v_line.counted_qty-v_current'), 'inventory correction must use final locked theoretical stock');
assert.ok(inventoryRaceSql.includes('se.created_at>=v_session.started_at'), 'same-transaction inventory movement detection missing');
assert.ok(inventoryRaceSql.includes('for update of p'), 'final inventory guard must keep deterministic product locking');
assert.ok(dashboardSql.includes('private.fifo_stock_value('), 'dashboard stock value must use FIFO');
assert.ok(!dashboardSql.includes('greatest(p.stock,0)*coalesce(p.prix_achat,0)'), 'dashboard must not value stock from mutable purchase price');

// Deferred history must never alter the current quantity established by the
// bounded snapshot. The first production bug made MEULFEU 803 -> 551 by adding
// an older net -252 window twice. The first attempted fix rebuilt the bootstrap
// correctly but then productQty applied another time-window filter, producing
// the exact opposite overcorrection: 803 -> 1055. The invariant is simply that
// the reconciled merged rows sum to the authoritative live quantity.
assert.ok(app.includes('mergeStockEntriesPreservingCurrentQty'), 'deferred stock history needs a stock-aware merge');
assert.ok(app.includes('currentTotal - (actualTotalByProduct.get(productId) ?? 0)'), 'deferred merge must rebuild reconciliation quantity');
assert.ok(!app.includes('entries: byIdPreferCurrent(current.entries, older.entries)'), 'stock entries must not use the generic deferred merge');
assert.ok(inventory.includes('return entries.filter(entry => entry.productId === pid).reduce((sum, entry) => sum + entry.qty, 0);'), 'productQty must sum the reconciled stock rows exactly once');
assert.ok(!inventory.includes('entryAt >= anchorAt'), 'productQty must not apply a second bootstrap time-window filter');
assert.ok(pos.includes('return productQty(p.id, entries);'), 'POS stock must use the canonical client quantity helper');

const current = [
  { id: -1, productId: 1, qty: 516, movementType: 'bootstrap' },
  { id: 10, productId: 1, qty: 287, movementType: 'ajustement' },
];
const older = [{ id: 5, productId: 1, qty: -252, movementType: 'ajustement' }];
const authoritative = current.reduce((sum, row) => sum + row.qty, 0);
const naiveMerged = authoritative + older.reduce((sum, row) => sum + row.qty, 0);
const actualMerged = [...older, ...current.filter(row => row.movementType !== 'bootstrap')];
const actualTotal = actualMerged.reduce((sum, row) => sum + row.qty, 0);
const rebuiltBootstrap = authoritative - actualTotal;
const reconciledMerged = [{ id: -1, productId: 1, qty: rebuiltBootstrap, movementType: 'bootstrap' }, ...actualMerged];
const correctedQty = reconciledMerged.reduce((sum, row) => sum + row.qty, 0);
const wrongAnchoredQty = rebuiltBootstrap + current.filter(row => row.movementType !== 'bootstrap').reduce((sum, row) => sum + row.qty, 0);

assert.equal(authoritative, 803);
assert.equal(naiveMerged, 551, 'fixture must reproduce the original production UI bug');
assert.equal(wrongAnchoredQty, 1055, 'fixture must reproduce the deployed overcorrection');
assert.equal(correctedQty, 803, 'deferred history must preserve current stock exactly');

console.log('Stock integrity contract OK');
