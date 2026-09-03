-- Restore boutique reads after margin/dashboard isolation.
-- Read authorization must not depend on the short-lived app-session lock:
-- otherwise an expired/locked app session is returned by PostgREST as an empty
-- dataset instead of allowing the client to restore the session. Writes keep
-- using private.auth_has_permission(), which still requires an active app session.

create or replace function private.auth_has_read_permission(p_boutique_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_is_super_admin()
      or (
        private.auth_is_active_user()
        and exists(
          select 1 from public.boutique_assignments ba
          where ba.boutique_id = p_boutique_id
            and ba.user_id = auth.uid()
            and (ba.role = 'owner' or coalesce((ba.droits->>p_permission)::boolean,false))
        )
      );
$$;

create or replace function private.auth_has_any_read_permission(p_boutique_id text, p_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_is_super_admin()
      or (
        private.auth_is_active_user()
        and exists(
          select 1 from public.boutique_assignments ba
          where ba.boutique_id = p_boutique_id
            and ba.user_id = auth.uid()
            and (
              ba.role = 'owner'
              or exists (
                select 1 from unnest(p_permissions) p(permission)
                where coalesce((ba.droits->>p.permission)::boolean,false)
              )
            )
        )
      );
$$;

create or replace view public.products_app
with (security_barrier = true)
as
select
  p.id,p.boutique_id,p.nom,p.category_id,
  case when private.auth_has_read_permission(p.boutique_id,'marges') then p.prix_achat else null end as prix_achat,
  p.prix_vente,p.stock,p.unit,p.sell_unit,p.sell_qty,p.low_stock_threshold,p.barcode,p.actif,
  p.created_at,p.updated_at,p.image_url,p.supplier_name,p.pieces_per_lot,p.length_per_piece
from public.products p
where private.auth_has_any_read_permission(p.boutique_id,array['stock','vente','inventaire','transferts','fournisseurs']);

create or replace view public.stock_entries_app
with (security_barrier = true)
as
select
  s.id,s.boutique_id,s.product_id,s.type,s.qty,
  case when private.auth_has_read_permission(s.boutique_id,'marges') then s.prix_unit else null end as prix_unit,
  s.entry_date,s.operator_id,s.note,s.created_at,s.supplier_id,s.reference,s.source_invoice_id,
  s.source_invoice_line_id,s.return_invoice_id,s.return_invoice_line_id,s.transfer_id,s.transfer_line_id
from public.stock_entries s
where private.auth_has_any_read_permission(s.boutique_id,array['stock','inventaire','transferts','fournisseurs']);

create or replace view public.invoices_app
with (security_barrier = true)
as
select
  i.*,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',l.id,'boutique_id',l.boutique_id,'invoice_id',l.invoice_id,'product_id',l.product_id,
      'nom',l.nom,'qty',l.qty,'unit',l.unit,'prix_unit',l.prix_unit,'sell_unit',l.sell_unit,
      'sell_qty',l.sell_qty,'created_at',l.created_at,
      'prix_achat',case when private.auth_has_read_permission(l.boutique_id,'marges') then l.prix_achat else null end,
      'source_invoice_line_id',l.source_invoice_line_id
    ) order by l.id)
    from public.invoice_lines l
    where l.boutique_id=i.boutique_id and l.invoice_id=i.id
  ),'[]'::jsonb) as invoice_lines
from public.invoices i
where private.auth_has_any_read_permission(i.boutique_id,array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']);

drop policy if exists "categories: select permitted" on public.categories;
create policy "categories: select permitted" on public.categories for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['stock','vente','inventaire','transferts']));

drop policy if exists "products: select permitted" on public.products;
create policy "products: select permitted" on public.products for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['stock','vente','inventaire','transferts','fournisseurs']));

drop policy if exists "stock_entries: select permitted" on public.stock_entries;
create policy "stock_entries: select permitted" on public.stock_entries for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['stock','inventaire','transferts','fournisseurs']));

drop policy if exists "clients: select permitted" on public.clients;
create policy "clients: select permitted" on public.clients for select to authenticated
using (private.auth_has_read_permission(boutique_id,'clients'));

drop policy if exists "invoices: select permitted" on public.invoices;
create policy "invoices: select permitted" on public.invoices for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']));

drop policy if exists "invoice_lines: select permitted" on public.invoice_lines;
create policy "invoice_lines: select permitted" on public.invoice_lines for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']));

drop policy if exists "invoice_payments: select permitted" on public.invoice_payments;
create policy "invoice_payments: select permitted" on public.invoice_payments for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['factures','clients','compta','encaissement_vente','remboursement','transferts']));

drop policy if exists "charges: select permitted" on public.charges;
create policy "charges: select permitted" on public.charges for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['charges','compta','fournisseurs','stock']));

drop policy if exists "caisse_sessions: select permitted" on public.caisse_sessions;
create policy "caisse_sessions: select permitted" on public.caisse_sessions for select to authenticated
using (private.auth_has_any_read_permission(boutique_id,array['encaissement_vente','charges','compta']));
