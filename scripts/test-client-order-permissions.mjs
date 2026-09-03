import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260903204500_require_clients_permission_for_client_orders.sql', 'utf8');
const stabilized = fs.readFileSync('supabase/migrations/20260902235500_stabilize_sales_stock_regressions.sql', 'utf8');

for (const required of [
  "coalesce(p_origin, 'pos') = 'client_profile'",
  "not private.auth_has_permission(p_boutique_id, 'clients')",
  "coalesce(v_invoice.origin, 'pos') = 'client_profile'",
]) {
  if (!migration.includes(required)) throw new Error(`Missing client-order permission guard: ${required}`);
}

if (!migration.includes("not private.auth_has_permission(p_boutique_id, 'vente')")) {
  throw new Error('Client-order fix must preserve vente permission guard');
}

for (const stockInvariant of [
  'private.release_pending_committed_stock',
  'delete from public.invoice_lines',
]) {
  if (!migration.includes(stockInvariant)) throw new Error(`Pending-order stock/edit invariant missing: ${stockInvariant}`);
}

if (!stabilized.includes('create or replace function private.enforce_pos_full_payment()')) {
  throw new Error('POS full-payment guard regression');
}

console.log('client_order_permission_contract_ok');
