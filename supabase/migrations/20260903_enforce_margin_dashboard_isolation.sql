-- Phase 2: apply only after the frontend has switched to products_app,
-- stock_entries_app, invoices_app and get_dashboard_summary.

-- Remove direct browser access to acquisition costs while preserving the safe
-- columns needed by existing narrow table writes/reads.
revoke select on public.products from authenticated;
grant select (
  id,boutique_id,nom,category_id,prix_vente,stock,unit,sell_unit,sell_qty,
  low_stock_threshold,barcode,actif,created_at,updated_at,image_url,supplier_name,
  pieces_per_lot,length_per_piece
) on public.products to authenticated;

revoke select on public.invoice_lines from authenticated;
grant select (
  id,boutique_id,invoice_id,product_id,nom,qty,unit,prix_unit,sell_unit,sell_qty,
  created_at,source_invoice_line_id
) on public.invoice_lines to authenticated;

revoke select on public.stock_entries from authenticated;
grant select (
  id,boutique_id,product_id,type,qty,entry_date,operator_id,note,created_at,
  supplier_id,reference,source_invoice_id,source_invoice_line_id,return_invoice_id,
  return_invoice_line_id,transfer_id,transfer_line_id
) on public.stock_entries to authenticated;

-- Dashboard no longer needs raw business-table reads. Keep only domain-specific
-- access and the aggregate RPC created in phase 1.
drop policy if exists "categories: select permitted" on public.categories;
create policy "categories: select permitted"
on public.categories for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','vente','inventaire','transferts']));

drop policy if exists "products: select permitted" on public.products;
create policy "products: select permitted"
on public.products for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','vente','inventaire','transferts','fournisseurs']));

drop policy if exists "stock_entries: select permitted" on public.stock_entries;
create policy "stock_entries: select permitted"
on public.stock_entries for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','inventaire','transferts','fournisseurs']));

drop policy if exists "clients: select permitted" on public.clients;
create policy "clients: select permitted"
on public.clients for select to authenticated
using (private.auth_has_permission(boutique_id, 'clients'));

drop policy if exists "invoices: select permitted" on public.invoices;
create policy "invoices: select permitted"
on public.invoices for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts'
]));

drop policy if exists "invoice_lines: select permitted" on public.invoice_lines;
create policy "invoice_lines: select permitted"
on public.invoice_lines for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts'
]));

drop policy if exists "invoice_payments: select permitted" on public.invoice_payments;
create policy "invoice_payments: select permitted"
on public.invoice_payments for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','compta','encaissement_vente','remboursement','transferts'
]));

drop policy if exists "charges: select permitted" on public.charges;
create policy "charges: select permitted"
on public.charges for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['charges','compta','fournisseurs','stock']));

drop policy if exists "caisse_sessions: select permitted" on public.caisse_sessions;
create policy "caisse_sessions: select permitted"
on public.caisse_sessions for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['encaissement_vente','charges','compta']));
