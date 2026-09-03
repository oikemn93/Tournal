-- Keep the existing bootstrap query compatible while preventing Stock and
-- Suppliers from reading unrelated operational expenses.
drop policy if exists "charges: select permitted" on public.charges;
create policy "charges: select permitted"
on public.charges for select to authenticated
using (
  private.auth_has_any_read_permission(boutique_id, array['charges','compta'])
  or (
    private.auth_has_any_read_permission(boutique_id, array['stock','fournisseurs'])
    and source in ('supplier_receipt','supplier_payment','transfer')
  )
);
