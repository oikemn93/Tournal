-- AUDIT ONLY: align semantic column metadata with current production.
-- Clean replay contains no production rows.

-- Dependent application views are recreated exactly after base-column type fixes.
drop view if exists public.invoices_app;
drop view if exists public.products_app;
drop view if exists public.stock_entries_app;

-- audit_log.id is GENERATED ALWAYS AS IDENTITY in production, not a synthetic serial.
alter table public.audit_log alter column id drop default;
drop sequence if exists public.audit_log_id_seq;
alter table public.audit_log alter column id add generated always as identity;

alter table public.caisse_sessions
  alter column fond_fermeture type numeric(12,2),
  alter column fond_ouverture type numeric(12,2),
  alter column fond_ouverture set default 0,
  alter column fond_ouverture set not null,
  alter column total_charges type numeric(12,2),
  alter column total_ventes type numeric(12,2);

alter table public.charges
  alter column montant type numeric(12,2),
  alter column montant set not null;

alter table public.client_credit_refunds
  alter column amount type numeric(12,2),
  alter column amount set not null;

alter table public.clients
  alter column total type numeric(12,2),
  alter column total set default 0,
  alter column total set not null;

alter table public.inventory_lines
  alter column counting_detail set default '{}'::jsonb,
  alter column counting_detail set not null,
  alter column fifo_counted_cost set default 0,
  alter column fifo_counted_cost set not null,
  alter column fifo_theoretical_cost set default 0,
  alter column fifo_theoretical_cost set not null,
  alter column fifo_unit_cost set default 0,
  alter column fifo_unit_cost set not null,
  alter column length_per_piece set default 0,
  alter column length_per_piece set not null,
  alter column pieces_per_lot set default 0,
  alter column pieces_per_lot set not null,
  alter column product_name set not null,
  alter column purchase_price set default 0,
  alter column purchase_price set not null,
  alter column sale_price set default 0,
  alter column sale_price set not null,
  alter column theoretical_qty set not null,
  alter column unit set not null;

alter table public.inventory_sessions
  alter column as_of_at set default now(),
  alter column as_of_at set not null,
  alter column id set default gen_random_uuid(),
  alter column operator_id set default auth.uid(),
  alter column operator_id set not null,
  alter column scope_label set not null,
  alter column scope_type set not null,
  alter column status set default 'draft'::text,
  alter column status set not null,
  alter column total_counted_cost set default 0,
  alter column total_counted_cost set not null,
  alter column total_counted_sales set default 0,
  alter column total_counted_sales set not null,
  alter column total_potential_margin set default 0,
  alter column total_potential_margin set not null,
  alter column total_theoretical_cost set default 0,
  alter column total_theoretical_cost set not null,
  alter column total_theoretical_sales set default 0,
  alter column total_theoretical_sales set not null,
  alter column total_variance_cost set default 0,
  alter column total_variance_cost set not null,
  alter column total_variance_sales set default 0,
  alter column total_variance_sales set not null;

alter table public.invoice_lines
  alter column nom drop not null,
  alter column nom drop default,
  alter column prix_unit type numeric(12,2),
  alter column prix_unit set default 0,
  alter column prix_unit set not null,
  alter column qty type numeric(12,3),
  alter column qty set default 1,
  alter column qty set not null,
  alter column sell_qty type numeric(12,3);

alter table public.invoice_payments
  alter column batch_id set not null,
  alter column operator_name set not null,
  alter column payment_method set not null;

alter table public.invoices
  alter column montant type numeric(12,2),
  alter column montant set default 0,
  alter column montant set not null,
  alter column status set default 'en_attente'::text,
  alter column status set not null,
  alter column type set default 'vente'::text,
  alter column type set not null;

alter table public.products
  alter column low_stock_threshold type numeric(12,3),
  alter column low_stock_threshold drop default,
  alter column low_stock_threshold drop not null,
  alter column nom drop default,
  alter column nom set not null,
  alter column prix_achat type numeric(12,2),
  alter column prix_achat set default 0,
  alter column prix_achat set not null,
  alter column stock type numeric(12,3),
  alter column stock set default 0,
  alter column stock set not null,
  alter column unit set default 'unité'::text,
  alter column unit set not null;

alter table public.stock_entries
  alter column prix_unit type numeric(12,2),
  alter column product_id set not null,
  alter column qty type numeric(12,3),
  alter column qty set not null,
  alter column type set not null;

create view public.invoices_app with (security_barrier=true) as
 SELECT id,
    boutique_id,
    client_id,
    client_nom,
    client_tel,
    montant,
    acompte,
    invoice_date,
    status,
    type,
    payment_method,
    operator_id,
    created_at,
    updated_at,
    numero,
    stock_deducted_at,
    client_email_snapshot,
    client_adresse_snapshot,
    client_ville_snapshot,
    client_type_snapshot,
    boutique_nom_snapshot,
    boutique_ville_snapshot,
    boutique_adresse_snapshot,
    boutique_tel_snapshot,
    boutique_email_snapshot,
    boutique_logo_snapshot,
    operator_nom_snapshot,
    return_of_invoice_id,
    due_date,
    origin,
    cancel_reason,
    cancelled_at,
    cancelled_by,
    credit_note_number,
    return_refund_amount,
    return_receivable_reduction,
    return_credit_restore,
    return_client_credit_amount,
    delivery_confirmed_at,
    delivery_confirmed_by,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', l.id, 'boutique_id', l.boutique_id, 'invoice_id', l.invoice_id, 'product_id', l.product_id, 'nom', l.nom, 'qty', l.qty, 'unit', l.unit, 'prix_unit', l.prix_unit, 'sell_unit', l.sell_unit, 'sell_qty', l.sell_qty, 'created_at', l.created_at, 'prix_achat', CASE WHEN (l.boutique_id IN ( SELECT x.boutique_id FROM private.auth_read_boutique_ids(ARRAY['marges'::text]) x(boutique_id))) THEN l.prix_achat ELSE NULL::numeric END, 'source_invoice_line_id', l.source_invoice_line_id) ORDER BY l.id) AS jsonb_agg
           FROM invoice_lines l
          WHERE l.boutique_id = i.boutique_id AND l.invoice_id = i.id), '[]'::jsonb) AS invoice_lines
   FROM invoices i
  WHERE (boutique_id IN ( SELECT s.boutique_id FROM private.auth_read_boutique_ids(ARRAY['factures'::text, 'clients'::text, 'vente'::text, 'compta'::text, 'encaissement_vente'::text, 'remboursement'::text, 'annulation_commande'::text, 'transferts'::text]) s(boutique_id)));

create view public.products_app with (security_barrier=true) as
 SELECT id,
    boutique_id,
    nom,
    category_id,
    CASE WHEN (boutique_id IN ( SELECT s.boutique_id FROM private.auth_read_boutique_ids(ARRAY['marges'::text]) s(boutique_id))) THEN prix_achat ELSE NULL::numeric END AS prix_achat,
    prix_vente,
    stock,
    unit,
    sell_unit,
    sell_qty,
    low_stock_threshold,
    barcode,
    actif,
    created_at,
    updated_at,
    image_url,
    supplier_name,
    pieces_per_lot,
    length_per_piece
   FROM products p
  WHERE (boutique_id IN ( SELECT s.boutique_id FROM private.auth_read_boutique_ids(ARRAY['stock'::text, 'vente'::text, 'inventaire'::text, 'transferts'::text, 'fournisseurs'::text]) s(boutique_id)));

create view public.stock_entries_app with (security_barrier=true) as
 SELECT id,
    boutique_id,
    product_id,
    type,
    qty,
    CASE WHEN (boutique_id IN ( SELECT x.boutique_id FROM private.auth_read_boutique_ids(ARRAY['marges'::text]) x(boutique_id))) THEN prix_unit ELSE NULL::numeric END AS prix_unit,
    entry_date,
    operator_id,
    note,
    created_at,
    supplier_id,
    reference,
    source_invoice_id,
    source_invoice_line_id,
    return_invoice_id,
    return_invoice_line_id,
    transfer_id,
    transfer_line_id
   FROM stock_entries s
  WHERE (boutique_id IN ( SELECT x.boutique_id FROM private.auth_read_boutique_ids(ARRAY['stock'::text, 'inventaire'::text, 'transferts'::text, 'fournisseurs'::text]) x(boutique_id)));

revoke all on public.invoices_app, public.products_app, public.stock_entries_app from public, anon, authenticated, service_role;
grant all on public.invoices_app, public.products_app, public.stock_entries_app to postgres, authenticated, service_role;
