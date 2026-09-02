import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/20260903_harden_permission_read_boundaries.sql', 'utf8');
const permissions = fs.readFileSync('src/app/permissions.ts', 'utf8');

const expectedPolicies = [
  'categories: select permitted',
  'products: select permitted',
  'stock_entries: select permitted',
  'clients: select permitted',
  'suppliers: select permitted',
  'invoices: select permitted',
  'invoice_lines: select permitted',
  'invoice_payments: select permitted',
  'client_advances: select permitted',
  'client_credit_refunds: select permitted',
  'client_credit_refund_allocations: select permitted',
  'charges: select permitted',
  'caisse_sessions: select permitted',
  'partners_read_authorized',
];

assert.ok(migration.includes('private.auth_has_any_permission'), 'read helper must be centralized');
for (const policy of expectedPolicies) {
  assert.ok(migration.includes(`"${policy}"`), `missing hardened policy: ${policy}`);
}

assert.ok(migration.includes("array['clients','dashboard']"), 'client reads must preserve dashboard compatibility while remaining permission-scoped');
assert.ok(migration.includes("array['stock','vente','inventaire','transferts','dashboard','fournisseurs']"), 'product reads must be limited to dependent domains');
assert.ok(migration.includes("array['charges','compta','fournisseurs','stock','dashboard']"), 'charge reads must be limited to financial/dependent domains');
assert.ok(migration.includes("private.auth_has_permission(boutique_id, 'transferts')"), 'partner directory must require transfers permission');

assert.ok(/"Vendeur"\s*:\s*\{[^}]*stock:false/.test(permissions), 'seller preset must not administer stock by default');
assert.ok(/"Vendeur"\s*:\s*\{[^}]*transferts:false/.test(permissions), 'seller preset must not transfer stock by default');
assert.ok(/"Vendeuse"\s*:\s*\{[^}]*stock:false/.test(permissions), 'seller preset must not administer stock by default');
assert.ok(/"Vendeuse"\s*:\s*\{[^}]*transferts:false/.test(permissions), 'seller preset must not transfer stock by default');
assert.ok(/"Caissier"\s*:\s*\{[^}]*encaissement_vente:true/.test(permissions), 'cashier payment right must remain enabled');
assert.ok(/"Caissier"\s*:\s*\{[^}]*vente:false/.test(permissions), 'cashier must not gain sale creation implicitly');

console.log('Permission read boundaries and least-privilege presets: OK');
