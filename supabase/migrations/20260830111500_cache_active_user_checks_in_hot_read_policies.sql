-- Performance-only RLS rewrite. Authorization semantics are unchanged:
-- active super-admin OR active user assigned to the row's boutique.
-- Scalar subqueries let PostgreSQL evaluate the zero-argument auth helpers as
-- InitPlans once per statement instead of once per candidate business row.

alter policy "invoices: select" on public.invoices using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=invoices.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "invoice_lines: select" on public.invoice_lines using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=invoice_lines.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "invoice_payments: select" on public.invoice_payments using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=invoice_payments.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "stock_entries: select" on public.stock_entries using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=stock_entries.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "products: select" on public.products using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=products.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "categories: select" on public.categories using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=categories.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "clients: select" on public.clients using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=clients.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "suppliers: select" on public.suppliers using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=suppliers.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "charges: select" on public.charges using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=charges.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "caisse_sessions: select" on public.caisse_sessions using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=caisse_sessions.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "client_advances: select" on public.client_advances using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=client_advances.boutique_id and ba.user_id=(select auth.uid())
  ))
);
alter policy "client_credit_refunds: select" on public.client_credit_refunds using (
  (select private.auth_is_super_admin()) or ((select private.auth_is_active_user()) and exists (
    select 1 from public.boutique_assignments ba where ba.boutique_id=client_credit_refunds.boutique_id and ba.user_id=(select auth.uid())
  ))
);
