import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260903203000_complete_permission_audit_hardening.sql', 'utf8');

for (const policy of [
  'client_advances: select permitted',
  'client_credit_refunds: select permitted',
  'client_credit_refund_allocations: select permitted',
  'suppliers: select permitted',
  'partners_read_authorized',
  'stock_transfers: select permitted',
  'stock_transfer_lines: select permitted',
  'transfer_charge_payments: select',
]) {
  if (!sql.includes(policy)) throw new Error(`Missing hardened read policy: ${policy}`);
}

if (!sql.includes('auth_has_any_read_permission') || !sql.includes('auth_has_read_permission')) {
  throw new Error('Read policies must use read-permission helpers');
}

for (const sensitive of [
  "'purchasePrice', null",
  "'fifoTheoreticalCost', null",
  "'fifoCountedCost', null",
  "'fifoUnitCost', null",
  "'theoreticalCost', null",
  "'countedCost', null",
  "'potentialMargin', null",
]) {
  if (!sql.includes(sensitive)) throw new Error(`Inventory margin mask missing: ${sensitive}`);
}

if (!sql.includes("auth_has_permission(v_boutique,'inventaire')")) {
  throw new Error('Inventory action must keep active-session inventaire guard');
}
if (!sql.includes("auth_has_permission(v_boutique,'marges')")) {
  throw new Error('Inventory response must branch on marges permission');
}
if (!sql.includes('revoke all on function public.get_inventory_session_internal_unmasked(uuid) from public, anon, authenticated')) {
  throw new Error('Unmasked inventory detail must not remain callable by authenticated');
}
if (!sql.includes('revoke all on function public.list_inventory_sessions_internal_unmasked(text,integer) from public, anon, authenticated')) {
  throw new Error('Unmasked inventory list must not remain callable by authenticated');
}

if (!sql.includes("array['charges','compta']")) {
  throw new Error('Full charge ledger must remain reserved to charges/compta');
}
if (!sql.includes("array['stock','fournisseurs']")) {
  throw new Error('Stock/fournisseurs supplier-ledger compatibility missing');
}
if (!sql.includes("source in ('supplier_receipt','supplier_payment','transfer')")) {
  throw new Error('Stock/fournisseurs charge visibility must be supplier/transfer scoped');
}

if (sql.includes('charges_app')) {
  throw new Error('Do not leave an unused parallel charges projection in this migration');
}

console.log('permission_audit_hardening_static_ok');
