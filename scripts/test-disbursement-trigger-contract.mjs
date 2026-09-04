import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20260904183500_consolidate_disbursement_guards.sql','utf8');
for (const token of [
  'drop trigger if exists trg_enforce_charge_disbursement on public.charges',
  'drop trigger if exists trg_guard_supplier_payment_disbursement on public.charges',
  'drop trigger if exists client_credit_refunds_require_disbursement on public.client_credit_refunds',
  'drop function if exists private.enforce_charge_disbursement()',
  'drop function if exists private.guard_supplier_payment_disbursement()',
  'drop function if exists private.guard_client_credit_refund_disbursement()',
]) if (!sql.includes(token)) throw new Error(`missing disbursement consolidation token: ${token}`);
console.log('disbursement_trigger_contract_ok');
