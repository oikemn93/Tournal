-- Transaction-grade read-path optimization.
-- Compute authorized boutique scopes once per statement instead of invoking
-- permission helpers once for every business row.

create or replace function private.auth_read_boutique_ids(p_permissions text[])
returns table(boutique_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as (
    select
      private.auth_is_super_admin() as is_super,
      private.auth_is_active_user() as is_active,
      auth.uid() as uid
  )
  select b.id
  from public.boutiques b, ctx
  where ctx.is_super
     or (
       ctx.is_active
       and exists (
         select 1
         from public.boutique_assignments ba
         where ba.boutique_id = b.id
           and ba.user_id = ctx.uid
           and (
             ba.role = 'owner'
             or exists (
               select 1
               from unnest(p_permissions) p(permission)
               where coalesce((ba.droits ->> p.permission)::boolean, false)
             )
           )
       )
     );
$$;
revoke all on function private.auth_read_boutique_ids(text[]) from public, anon;
grant execute on function private.auth_read_boutique_ids(text[]) to authenticated;

create or replace function private.auth_owned_boutique_ids()
returns table(boutique_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as (
    select
      private.auth_is_super_admin() as is_super,
      private.auth_is_active_user() as is_active,
      auth.uid() as uid
  )
  select b.id
  from public.boutiques b, ctx
  where ctx.is_super
     or (
       ctx.is_active
       and exists (
         select 1
         from public.boutique_assignments ba
         where ba.boutique_id = b.id
           and ba.user_id = ctx.uid
           and ba.role = 'owner'
       )
     );
$$;
revoke all on function private.auth_owned_boutique_ids() from public, anon;
grant execute on function private.auth_owned_boutique_ids() to authenticated;

alter policy "invoices: select permitted" on public.invoices
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']) s));
alter policy "invoice_lines: select permitted" on public.invoice_lines
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']) s));
alter policy "invoice_payments: select permitted" on public.invoice_payments
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['factures','clients','compta','encaissement_vente','remboursement','transferts']) s));
alter policy "products: select permitted" on public.products
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['stock','vente','inventaire','transferts','fournisseurs']) s));
alter policy "stock_entries: select permitted" on public.stock_entries
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['stock','inventaire','transferts','fournisseurs']) s));
alter policy "clients: select permitted" on public.clients
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['clients']) s));
alter policy "suppliers: select permitted" on public.suppliers
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['fournisseurs','stock','charges','transferts']) s));
alter policy "categories: select permitted" on public.categories
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['stock','vente','inventaire','transferts']) s));
alter policy "caisse_sessions: select permitted" on public.caisse_sessions
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['encaissement_vente','charges','compta']) s));
alter policy "client_advances: select permitted" on public.client_advances
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['clients','encaissement_vente','remboursement','compta']) s));
alter policy "client_credit_refunds: select permitted" on public.client_credit_refunds
  using (boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['clients','remboursement','compta']) s));
alter policy "audit_log: select" on public.audit_log
  using (boutique_id in (select s.boutique_id from private.auth_owned_boutique_ids() s));
alter policy "charges: select permitted" on public.charges
  using (
    boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['charges','compta']) s)
    or (
      boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['stock','fournisseurs']) s)
      and source = any(array['supplier_receipt','supplier_payment','transfer'])
    )
  );

-- Keep these views as security-definer facades because authenticated does not
-- receive raw cost-column privileges. Authorization is still explicit in each
-- view, but its scope is evaluated once instead of once per row.
create or replace view public.products_app with (security_barrier=true) as
select
  p.id,p.boutique_id,p.nom,p.category_id,
  case when p.boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['marges']) s)
       then p.prix_achat else null::numeric end as prix_achat,
  p.prix_vente,p.stock,p.unit,p.sell_unit,p.sell_qty,p.low_stock_threshold,p.barcode,p.actif,
  p.created_at,p.updated_at,p.image_url,p.supplier_name,p.pieces_per_lot,p.length_per_piece
from public.products p
where p.boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['stock','vente','inventaire','transferts','fournisseurs']) s);

create or replace view public.stock_entries_app with (security_barrier=true) as
select
  s.id,s.boutique_id,s.product_id,s.type,s.qty,
  case when s.boutique_id in (select x.boutique_id from private.auth_read_boutique_ids(array['marges']) x)
       then s.prix_unit else null::numeric end as prix_unit,
  s.entry_date,s.operator_id,s.note,s.created_at,s.supplier_id,s.reference,
  s.source_invoice_id,s.source_invoice_line_id,s.return_invoice_id,s.return_invoice_line_id,
  s.transfer_id,s.transfer_line_id
from public.stock_entries s
where s.boutique_id in (select x.boutique_id from private.auth_read_boutique_ids(array['stock','inventaire','transferts','fournisseurs']) x);

create or replace view public.invoices_app with (security_barrier=true) as
select
  i.id,i.boutique_id,i.client_id,i.client_nom,i.client_tel,i.montant,i.acompte,i.invoice_date,
  i.status,i.type,i.payment_method,i.operator_id,i.created_at,i.updated_at,i.numero,i.stock_deducted_at,
  i.client_email_snapshot,i.client_adresse_snapshot,i.client_ville_snapshot,i.client_type_snapshot,
  i.boutique_nom_snapshot,i.boutique_ville_snapshot,i.boutique_adresse_snapshot,i.boutique_tel_snapshot,
  i.boutique_email_snapshot,i.boutique_logo_snapshot,i.operator_nom_snapshot,i.return_of_invoice_id,
  i.due_date,i.origin,i.cancel_reason,i.cancelled_at,i.cancelled_by,i.credit_note_number,
  i.return_refund_amount,i.return_receivable_reduction,i.return_credit_restore,i.return_client_credit_amount,
  i.delivery_confirmed_at,i.delivery_confirmed_by,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',l.id,'boutique_id',l.boutique_id,'invoice_id',l.invoice_id,'product_id',l.product_id,
        'nom',l.nom,'qty',l.qty,'unit',l.unit,'prix_unit',l.prix_unit,'sell_unit',l.sell_unit,
        'sell_qty',l.sell_qty,'created_at',l.created_at,
        'prix_achat',case when l.boutique_id in (select x.boutique_id from private.auth_read_boutique_ids(array['marges']) x)
                         then l.prix_achat else null::numeric end,
        'source_invoice_line_id',l.source_invoice_line_id
      ) order by l.id
    )
    from public.invoice_lines l
    where l.boutique_id=i.boutique_id and l.invoice_id=i.id
  ), '[]'::jsonb) as invoice_lines
from public.invoices i
where i.boutique_id in (select s.boutique_id from private.auth_read_boutique_ids(array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']) s);
