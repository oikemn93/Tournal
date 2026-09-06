import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('.github/audit/replay-migrations/20260906181500_stock_integrity_guardrails.sql','utf8');

assert.ok(sql.includes('v_stock_deducted:=private.commit_invoice_stock('), 'record_payment must use canonical stock commit');
assert.ok(!sql.includes('set stock=stock-v_sale_line.qty'), 'record_payment must not decrement stock directly');
assert.ok(sql.includes('stock cannot become more negative for product'), 'global negative-stock floor guard missing');
assert.ok(sql.includes('trg_guard_negative_product_stock_update'), 'negative-stock update trigger missing');
assert.ok(sql.includes("st.relationship_type='commercial'"), 'commercial transfer lifecycle exemption missing');
assert.ok(sql.includes("commercial transfer invoice must have committed stock"), 'commercial transfer must fail closed without committed stock');
assert.ok(sql.includes('se.created_at>v_session.started_at'), 'inventory concurrent-movement detection missing');
assert.ok(sql.includes('for update of p'), 'inventory product lock missing');
assert.ok(sql.includes('v_diff:=v_line.counted_qty-v_current'), 'inventory correction must use final locked theoretical stock');

console.log('Stock integrity contract OK');
