import fs from 'node:fs';
import assert from 'node:assert/strict';

const pos = fs.readFileSync('src/app/screens/POSView.tsx','utf8');
assert.ok(pos.includes('const matchIndex = prev.findIndex(existing =>'), 'POS identical-line merge missing');
assert.ok(pos.includes('(existing.sellUnit ?? existing.unit) === (item.sellUnit ?? item.unit)'), 'POS line identity must include effective unit');
assert.ok(pos.includes('Math.abs(existing.prixUnit - item.prixUnit) < 0.000001'), 'POS line identity must include price');
assert.ok(!pos.includes('setCart(prev => [...prev, item]);'), 'POS still blindly duplicates identical lines');
assert.ok(pos.includes('removeFromCart(lineIndex: number)'), 'POS removal must remain line-specific');
assert.ok(pos.includes('updateCartQty(lineIndex: number'), 'POS quantity update must remain line-specific');

const clients = fs.readFileSync('src/app/screens/ClientsView.tsx','utf8');
assert.ok(clients.includes('const canCancel = canCancelPendingOrder && inv.origin === "client_profile"'), 'Client cancellation UI does not honor explicit permission');
assert.ok(!clients.includes('deliveryPending&&'), 'obsolete delivery state still rendered');
assert.ok(!clients.includes('confirmDelivery('), 'obsolete manual delivery call remains');
assert.ok(clients.includes('!!viewedInvoice.stockDeductedAt && invoicePaidAmount(viewedInvoice) > 0'), 'detail return action must require committed stock');

const share = fs.readFileSync('supabase/functions/create-invoice-share/index.ts','utf8');
const insertAt = share.indexOf('admin.from("document_shares").insert');
const revokeAt = share.indexOf('.neq("token_hash", tokenHash)');
assert.ok(insertAt >= 0 && revokeAt > insertAt, 'new share must be published before old token revocation');

const sql = fs.readFileSync('supabase/migrations/20260902235500_stabilize_sales_stock_regressions.sql','utf8');
assert.ok(sql.includes('private.release_pending_committed_stock'), 'generic committed-stock release missing');
assert.ok(sql.includes("current_setting('tournal.pos_full_split',true)"), 'POS multi-payment trigger bypass missing');
assert.ok(sql.includes("private.auth_has_permission(p_boutique_id, 'annulation_commande')"), 'cancellation permission guard missing');
assert.ok(sql.includes('perform private.release_pending_committed_stock'), 'edit/cancel stock release invariant missing');
assert.ok(!sql.includes("coalesce(v_invoice.origin,'pos') <> 'pos'"), 'generic release must not reject client orders');

console.log('Sales/stock regression contract OK');
