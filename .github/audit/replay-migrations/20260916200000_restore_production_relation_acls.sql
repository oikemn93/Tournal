-- AUDIT ONLY: reproduce production ACLs in the synthetic PostgreSQL 17 replay.
-- Never deploy this file to production. Snapshot verified read-only 2026-09-30.
-- These grants describe existing production rights; they do not authorize new rights.
revoke all on public.boutique_state, public.invoice_payments,
  public.notifications, public.push_subscriptions from public, anon, authenticated, service_role;
grant all on public.boutique_state, public.invoice_payments,
  public.notifications, public.push_subscriptions to postgres, service_role;
grant select, maintain on public.boutique_state, public.invoice_payments to authenticated;
grant select, maintain, references, trigger, truncate on
  public.notifications, public.push_subscriptions to authenticated;
