import fs from 'node:fs';
import assert from 'node:assert/strict';

const stockSql = fs.readFileSync('.github/audit/replay-migrations/20260906181500_stock_integrity_guardrails.sql','utf8');
const inventoryRaceSql = fs.readFileSync('.github/audit/replay-migrations/20260906191745_inventory_race_same_transaction_guard.sql','utf8');
const dashboardSql = fs.readFileSync('.github/audit/replay-migrations/20260906192500_dashboard_fifo_stock_value.sql','utf8');

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

console.log('Stock integrity contract OK');
