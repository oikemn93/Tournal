-- AUDIT ONLY: normalize function configuration and effective EXECUTE ACLs to current production.

alter function private.sync_user_profile_from_auth() reset all;
alter function private.sync_user_profile_from_auth() set search_path to pg_catalog, public;
revoke all on function private.sync_user_profile_from_auth() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.sync_user_profile_from_auth() to postgres;

alter function private.trace_transfer_sender_as_supplier() reset all;
alter function private.trace_transfer_sender_as_supplier() set search_path to pg_catalog, public, private;
revoke all on function private.trace_transfer_sender_as_supplier() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.trace_transfer_sender_as_supplier() to PUBLIC;
grant execute on function private.trace_transfer_sender_as_supplier() to postgres;

alter function private.track_ops_ticket_response() reset all;
alter function private.track_ops_ticket_response() set search_path to pg_catalog, public, private;
revoke all on function private.track_ops_ticket_response() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.track_ops_ticket_response() to PUBLIC;
grant execute on function private.track_ops_ticket_response() to postgres;

alter function private.transfer_destination_product_is_compatible(p_boutique_id text, p_product_id bigint, p_unit text) reset all;
alter function private.transfer_destination_product_is_compatible(p_boutique_id text, p_product_id bigint, p_unit text) set search_path to pg_catalog, public;
revoke all on function private.transfer_destination_product_is_compatible(p_boutique_id text, p_product_id bigint, p_unit text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.transfer_destination_product_is_compatible(p_boutique_id text, p_product_id bigint, p_unit text) to PUBLIC;
grant execute on function private.transfer_destination_product_is_compatible(p_boutique_id text, p_product_id bigint, p_unit text) to postgres;

alter function public.accept_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) reset all;
alter function public.accept_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) set search_path to pg_catalog, public, private;
revoke all on function public.accept_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.accept_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) to authenticated;
grant execute on function public.accept_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) to postgres;
grant execute on function public.accept_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) to service_role;

alter function public.accept_stock_transfer_custom(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) reset all;
alter function public.accept_stock_transfer_custom(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) set search_path to pg_catalog, public, private;
revoke all on function public.accept_stock_transfer_custom(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.accept_stock_transfer_custom(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) to authenticated;
grant execute on function public.accept_stock_transfer_custom(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) to postgres;
grant execute on function public.accept_stock_transfer_custom(p_transfer_id uuid, p_idempotency_key uuid, p_line_mappings jsonb) to service_role;

alter function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text, p_phone text) reset all;
alter function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text, p_phone text) set search_path to pg_catalog, public, private;
revoke all on function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text, p_phone text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text, p_phone text) to authenticated;
grant execute on function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text, p_phone text) to postgres;
grant execute on function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text, p_phone text) to service_role;

alter function public.apply_client_advance_fifo(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric) reset all;
alter function public.apply_client_advance_fifo(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric) set search_path to pg_catalog, public, private;
revoke all on function public.apply_client_advance_fifo(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.apply_client_advance_fifo(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric) to authenticated;
grant execute on function public.apply_client_advance_fifo(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric) to postgres;
grant execute on function public.apply_client_advance_fifo(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric) to service_role;

alter function public.apply_client_advance_to_invoice(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric) reset all;
alter function public.apply_client_advance_to_invoice(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric) set search_path to pg_catalog, public, private;
revoke all on function public.apply_client_advance_to_invoice(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.apply_client_advance_to_invoice(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric) to authenticated;
grant execute on function public.apply_client_advance_to_invoice(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric) to postgres;
grant execute on function public.apply_client_advance_to_invoice(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric) to service_role;

alter function public.cancel_inventory_session(p_session_id uuid) reset all;
alter function public.cancel_inventory_session(p_session_id uuid) set search_path to pg_catalog, public, private;
revoke all on function public.cancel_inventory_session(p_session_id uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.cancel_inventory_session(p_session_id uuid) to authenticated;
grant execute on function public.cancel_inventory_session(p_session_id uuid) to postgres;
grant execute on function public.cancel_inventory_session(p_session_id uuid) to service_role;

alter function public.cancel_pending_sale(p_boutique_id text, p_invoice_id text, p_reason text, p_origin_context text) reset all;
alter function public.cancel_pending_sale(p_boutique_id text, p_invoice_id text, p_reason text, p_origin_context text) set search_path to pg_catalog, public, private;
revoke all on function public.cancel_pending_sale(p_boutique_id text, p_invoice_id text, p_reason text, p_origin_context text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.cancel_pending_sale(p_boutique_id text, p_invoice_id text, p_reason text, p_origin_context text) to authenticated;
grant execute on function public.cancel_pending_sale(p_boutique_id text, p_invoice_id text, p_reason text, p_origin_context text) to postgres;
grant execute on function public.cancel_pending_sale(p_boutique_id text, p_invoice_id text, p_reason text, p_origin_context text) to service_role;

alter function public.cancel_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) reset all;
alter function public.cancel_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) set search_path to pg_catalog, public, private;
revoke all on function public.cancel_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.cancel_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) to authenticated;
grant execute on function public.cancel_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) to postgres;
grant execute on function public.cancel_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) to service_role;

alter function public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_device_label text) reset all;
alter function public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_device_label text) set search_path to '';
revoke all on function public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_device_label text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_device_label text) to authenticated;
grant execute on function public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_device_label text) to postgres;
grant execute on function public.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_device_label text) to service_role;

alter function public.close_caisse_session(p_boutique_id text, p_session_id text, p_idempotency_key uuid, p_fond_fermeture numeric, p_total_ventes numeric, p_total_charges numeric) reset all;
alter function public.close_caisse_session(p_boutique_id text, p_session_id text, p_idempotency_key uuid, p_fond_fermeture numeric, p_total_ventes numeric, p_total_charges numeric) set search_path to public, private;
revoke all on function public.close_caisse_session(p_boutique_id text, p_session_id text, p_idempotency_key uuid, p_fond_fermeture numeric, p_total_ventes numeric, p_total_charges numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.close_caisse_session(p_boutique_id text, p_session_id text, p_idempotency_key uuid, p_fond_fermeture numeric, p_total_ventes numeric, p_total_charges numeric) to authenticated;
grant execute on function public.close_caisse_session(p_boutique_id text, p_session_id text, p_idempotency_key uuid, p_fond_fermeture numeric, p_total_ventes numeric, p_total_charges numeric) to postgres;
grant execute on function public.close_caisse_session(p_boutique_id text, p_session_id text, p_idempotency_key uuid, p_fond_fermeture numeric, p_total_ventes numeric, p_total_charges numeric) to service_role;

alter function public.complete_password_change() reset all;
alter function public.complete_password_change() set search_path to '';
revoke all on function public.complete_password_change() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.complete_password_change() to authenticated;
grant execute on function public.complete_password_change() to postgres;
grant execute on function public.complete_password_change() to service_role;

alter function public.confirm_client_delivery(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid) reset all;
alter function public.confirm_client_delivery(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid) set search_path to pg_catalog, public, private;
revoke all on function public.confirm_client_delivery(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.confirm_client_delivery(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid) to authenticated;
grant execute on function public.confirm_client_delivery(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid) to postgres;
grant execute on function public.confirm_client_delivery(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid) to service_role;

alter function public.correct_supplier_receipt(p_boutique_id text, p_stock_entry_id bigint, p_idempotency_key uuid, p_new_qty numeric, p_new_amount numeric) reset all;
alter function public.correct_supplier_receipt(p_boutique_id text, p_stock_entry_id bigint, p_idempotency_key uuid, p_new_qty numeric, p_new_amount numeric) set search_path to pg_catalog, public, private;
revoke all on function public.correct_supplier_receipt(p_boutique_id text, p_stock_entry_id bigint, p_idempotency_key uuid, p_new_qty numeric, p_new_amount numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.correct_supplier_receipt(p_boutique_id text, p_stock_entry_id bigint, p_idempotency_key uuid, p_new_qty numeric, p_new_amount numeric) to authenticated;
grant execute on function public.correct_supplier_receipt(p_boutique_id text, p_stock_entry_id bigint, p_idempotency_key uuid, p_new_qty numeric, p_new_amount numeric) to postgres;
grant execute on function public.correct_supplier_receipt(p_boutique_id text, p_stock_entry_id bigint, p_idempotency_key uuid, p_new_qty numeric, p_new_amount numeric) to service_role;

alter function public.create_category(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) reset all;
alter function public.create_category(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) set search_path to pg_catalog, public, private;
revoke all on function public.create_category(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_category(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) to authenticated;
grant execute on function public.create_category(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) to postgres;
grant execute on function public.create_category(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) to service_role;

alter function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text) reset all;
alter function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text) set search_path to pg_catalog, public, private;
revoke all on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text) to authenticated;
grant execute on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text) to postgres;
grant execute on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text) to service_role;

alter function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text, p_fournisseur text) reset all;
alter function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text, p_fournisseur text) set search_path to pg_catalog, public, private;
revoke all on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text, p_fournisseur text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text, p_fournisseur text) to authenticated;
grant execute on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text, p_fournisseur text) to postgres;
grant execute on function public.create_charge(p_boutique_id text, p_idempotency_key uuid, p_label text, p_montant numeric, p_categorie text, p_note text, p_fournisseur text) to service_role;

alter function public.create_client(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_type text, p_tel text, p_email text, p_ville text) reset all;
alter function public.create_client(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_type text, p_tel text, p_email text, p_ville text) set search_path to pg_catalog, public, private;
revoke all on function public.create_client(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_type text, p_tel text, p_email text, p_ville text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_client(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_type text, p_tel text, p_email text, p_ville text) to authenticated;
grant execute on function public.create_client(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_type text, p_tel text, p_email text, p_ville text) to postgres;
grant execute on function public.create_client(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_type text, p_tel text, p_email text, p_ville text) to service_role;

alter function public.create_product(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit text, p_category_id text, p_prix_achat numeric, p_prix_vente numeric) reset all;
alter function public.create_product(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit text, p_category_id text, p_prix_achat numeric, p_prix_vente numeric) set search_path to pg_catalog, public, private;
revoke all on function public.create_product(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit text, p_category_id text, p_prix_achat numeric, p_prix_vente numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_product(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit text, p_category_id text, p_prix_achat numeric, p_prix_vente numeric) to authenticated;
grant execute on function public.create_product(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit text, p_category_id text, p_prix_achat numeric, p_prix_vente numeric) to postgres;
grant execute on function public.create_product(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit text, p_category_id text, p_prix_achat numeric, p_prix_vente numeric) to service_role;

alter function public.create_sale(p_boutique_id text, p_idempotency_key uuid, p_client_nom text, p_client_tel text, p_lines jsonb, p_payment_method text, p_client_id bigint, p_origin text, p_confirm_duplicate boolean) reset all;
alter function public.create_sale(p_boutique_id text, p_idempotency_key uuid, p_client_nom text, p_client_tel text, p_lines jsonb, p_payment_method text, p_client_id bigint, p_origin text, p_confirm_duplicate boolean) set search_path to pg_catalog, public, private;
revoke all on function public.create_sale(p_boutique_id text, p_idempotency_key uuid, p_client_nom text, p_client_tel text, p_lines jsonb, p_payment_method text, p_client_id bigint, p_origin text, p_confirm_duplicate boolean) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_sale(p_boutique_id text, p_idempotency_key uuid, p_client_nom text, p_client_tel text, p_lines jsonb, p_payment_method text, p_client_id bigint, p_origin text, p_confirm_duplicate boolean) to authenticated;
grant execute on function public.create_sale(p_boutique_id text, p_idempotency_key uuid, p_client_nom text, p_client_tel text, p_lines jsonb, p_payment_method text, p_client_id bigint, p_origin text, p_confirm_duplicate boolean) to postgres;
grant execute on function public.create_sale(p_boutique_id text, p_idempotency_key uuid, p_client_nom text, p_client_tel text, p_lines jsonb, p_payment_method text, p_client_id bigint, p_origin text, p_confirm_duplicate boolean) to service_role;

alter function public.create_stock_transfer(p_from_boutique_id text, p_to_boutique_id text, p_idempotency_key uuid, p_lines jsonb, p_note text) reset all;
alter function public.create_stock_transfer(p_from_boutique_id text, p_to_boutique_id text, p_idempotency_key uuid, p_lines jsonb, p_note text) set search_path to pg_catalog, public, private;
revoke all on function public.create_stock_transfer(p_from_boutique_id text, p_to_boutique_id text, p_idempotency_key uuid, p_lines jsonb, p_note text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_stock_transfer(p_from_boutique_id text, p_to_boutique_id text, p_idempotency_key uuid, p_lines jsonb, p_note text) to authenticated;
grant execute on function public.create_stock_transfer(p_from_boutique_id text, p_to_boutique_id text, p_idempotency_key uuid, p_lines jsonb, p_note text) to postgres;
grant execute on function public.create_stock_transfer(p_from_boutique_id text, p_to_boutique_id text, p_idempotency_key uuid, p_lines jsonb, p_note text) to service_role;

alter function public.create_supplier(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_tel text, p_ville text) reset all;
alter function public.create_supplier(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_tel text, p_ville text) set search_path to pg_catalog, public, private;
revoke all on function public.create_supplier(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_tel text, p_ville text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.create_supplier(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_tel text, p_ville text) to authenticated;
grant execute on function public.create_supplier(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_tel text, p_ville text) to postgres;
grant execute on function public.create_supplier(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_tel text, p_ville text) to service_role;

alter function public.decide_ops_access_request(p_request_id bigint, p_approve boolean, p_note text) reset all;
alter function public.decide_ops_access_request(p_request_id bigint, p_approve boolean, p_note text) set search_path to pg_catalog, public, private;
revoke all on function public.decide_ops_access_request(p_request_id bigint, p_approve boolean, p_note text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.decide_ops_access_request(p_request_id bigint, p_approve boolean, p_note text) to authenticated;
grant execute on function public.decide_ops_access_request(p_request_id bigint, p_approve boolean, p_note text) to postgres;
grant execute on function public.decide_ops_access_request(p_request_id bigint, p_approve boolean, p_note text) to service_role;

alter function public.delete_category(p_boutique_id text, p_category_id text) reset all;
alter function public.delete_category(p_boutique_id text, p_category_id text) set search_path to pg_catalog, public, private;
revoke all on function public.delete_category(p_boutique_id text, p_category_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.delete_category(p_boutique_id text, p_category_id text) to authenticated;
grant execute on function public.delete_category(p_boutique_id text, p_category_id text) to postgres;
grant execute on function public.delete_category(p_boutique_id text, p_category_id text) to service_role;

alter function public.delete_client_if_unused(p_boutique_id text, p_client_id bigint) reset all;
alter function public.delete_client_if_unused(p_boutique_id text, p_client_id bigint) set search_path to pg_catalog, public, private;
revoke all on function public.delete_client_if_unused(p_boutique_id text, p_client_id bigint) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.delete_client_if_unused(p_boutique_id text, p_client_id bigint) to authenticated;
grant execute on function public.delete_client_if_unused(p_boutique_id text, p_client_id bigint) to postgres;
grant execute on function public.delete_client_if_unused(p_boutique_id text, p_client_id bigint) to service_role;

alter function public.dismiss_all_notifications() reset all;
alter function public.dismiss_all_notifications() set search_path to '';
revoke all on function public.dismiss_all_notifications() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.dismiss_all_notifications() to authenticated;
grant execute on function public.dismiss_all_notifications() to postgres;
grant execute on function public.dismiss_all_notifications() to service_role;

alter function public.dismiss_all_notifications(p_boutique_id text) reset all;
alter function public.dismiss_all_notifications(p_boutique_id text) set search_path to '';
revoke all on function public.dismiss_all_notifications(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.dismiss_all_notifications(p_boutique_id text) to authenticated;
grant execute on function public.dismiss_all_notifications(p_boutique_id text) to postgres;
grant execute on function public.dismiss_all_notifications(p_boutique_id text) to service_role;

alter function public.enforce_return_invoice_disbursement() reset all;
alter function public.enforce_return_invoice_disbursement() set search_path to pg_catalog, public, private;
revoke all on function public.enforce_return_invoice_disbursement() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.enforce_return_invoice_disbursement() to postgres;
grant execute on function public.enforce_return_invoice_disbursement() to service_role;

alter function public.enforce_return_line_provenance() reset all;
alter function public.enforce_return_line_provenance() set search_path to pg_catalog, public, private;
revoke all on function public.enforce_return_line_provenance() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.enforce_return_line_provenance() to postgres;
grant execute on function public.enforce_return_line_provenance() to service_role;

alter function public.finalize_inventory_session(p_session_id uuid) reset all;
alter function public.finalize_inventory_session(p_session_id uuid) set search_path to pg_catalog, public, private;
revoke all on function public.finalize_inventory_session(p_session_id uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.finalize_inventory_session(p_session_id uuid) to authenticated;
grant execute on function public.finalize_inventory_session(p_session_id uuid) to postgres;
grant execute on function public.finalize_inventory_session(p_session_id uuid) to service_role;

alter function public.get_boutique_partners(p_boutique_id text) reset all;
alter function public.get_boutique_partners(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function public.get_boutique_partners(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_boutique_partners(p_boutique_id text) to authenticated;
grant execute on function public.get_boutique_partners(p_boutique_id text) to postgres;
grant execute on function public.get_boutique_partners(p_boutique_id text) to service_role;

alter function public.get_dashboard_summary(p_boutique_id text, p_from timestamp with time zone, p_to timestamp with time zone) reset all;
alter function public.get_dashboard_summary(p_boutique_id text, p_from timestamp with time zone, p_to timestamp with time zone) set search_path to pg_catalog, public, private;
revoke all on function public.get_dashboard_summary(p_boutique_id text, p_from timestamp with time zone, p_to timestamp with time zone) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_dashboard_summary(p_boutique_id text, p_from timestamp with time zone, p_to timestamp with time zone) to authenticated;
grant execute on function public.get_dashboard_summary(p_boutique_id text, p_from timestamp with time zone, p_to timestamp with time zone) to postgres;
grant execute on function public.get_dashboard_summary(p_boutique_id text, p_from timestamp with time zone, p_to timestamp with time zone) to service_role;

alter function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text) reset all;
alter function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text) set search_path to pg_catalog, public, private;
revoke all on function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text) to authenticated;
grant execute on function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text) to postgres;
grant execute on function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text) to service_role;

alter function public.get_fifo_realized_margin(p_boutique_id text, p_from_at timestamp with time zone, p_to_at timestamp with time zone) reset all;
alter function public.get_fifo_realized_margin(p_boutique_id text, p_from_at timestamp with time zone, p_to_at timestamp with time zone) set search_path to pg_catalog, public, private;
revoke all on function public.get_fifo_realized_margin(p_boutique_id text, p_from_at timestamp with time zone, p_to_at timestamp with time zone) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_fifo_realized_margin(p_boutique_id text, p_from_at timestamp with time zone, p_to_at timestamp with time zone) to authenticated;
grant execute on function public.get_fifo_realized_margin(p_boutique_id text, p_from_at timestamp with time zone, p_to_at timestamp with time zone) to postgres;
grant execute on function public.get_fifo_realized_margin(p_boutique_id text, p_from_at timestamp with time zone, p_to_at timestamp with time zone) to service_role;

alter function public.get_internal_invoice_cleanup_config() reset all;
alter function public.get_internal_invoice_cleanup_config() set search_path to '';
revoke all on function public.get_internal_invoice_cleanup_config() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_internal_invoice_cleanup_config() to postgres;
grant execute on function public.get_internal_invoice_cleanup_config() to service_role;

alter function public.get_internal_push_config() reset all;
alter function public.get_internal_push_config() set search_path to '';
revoke all on function public.get_internal_push_config() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_internal_push_config() to postgres;
grant execute on function public.get_internal_push_config() to service_role;

alter function public.get_inventory_session(p_session_id uuid) reset all;
alter function public.get_inventory_session(p_session_id uuid) set search_path to pg_catalog, public, private;
revoke all on function public.get_inventory_session(p_session_id uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_inventory_session(p_session_id uuid) to authenticated;
grant execute on function public.get_inventory_session(p_session_id uuid) to postgres;
grant execute on function public.get_inventory_session(p_session_id uuid) to service_role;

alter function public.get_inventory_session_internal_unmasked(p_session_id uuid) reset all;
alter function public.get_inventory_session_internal_unmasked(p_session_id uuid) set search_path to pg_catalog, public, private;
revoke all on function public.get_inventory_session_internal_unmasked(p_session_id uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_inventory_session_internal_unmasked(p_session_id uuid) to postgres;
grant execute on function public.get_inventory_session_internal_unmasked(p_session_id uuid) to service_role;

alter function public.get_my_ops_profile() reset all;
alter function public.get_my_ops_profile() set search_path to pg_catalog, public, private;
revoke all on function public.get_my_ops_profile() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_my_ops_profile() to authenticated;
grant execute on function public.get_my_ops_profile() to postgres;
grant execute on function public.get_my_ops_profile() to service_role;

alter function public.get_ops_attention_counts() reset all;
alter function public.get_ops_attention_counts() set search_path to pg_catalog, public, private;
revoke all on function public.get_ops_attention_counts() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_ops_attention_counts() to authenticated;
grant execute on function public.get_ops_attention_counts() to postgres;
grant execute on function public.get_ops_attention_counts() to service_role;

alter function public.get_ops_boutique_overview() reset all;
alter function public.get_ops_boutique_overview() set search_path to pg_catalog, public, private;
revoke all on function public.get_ops_boutique_overview() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_ops_boutique_overview() to authenticated;
grant execute on function public.get_ops_boutique_overview() to postgres;
grant execute on function public.get_ops_boutique_overview() to service_role;

alter function public.get_ops_manager_metrics() reset all;
alter function public.get_ops_manager_metrics() set search_path to pg_catalog, public, private;
revoke all on function public.get_ops_manager_metrics() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_ops_manager_metrics() to authenticated;
grant execute on function public.get_ops_manager_metrics() to postgres;
grant execute on function public.get_ops_manager_metrics() to service_role;

alter function public.get_ops_shell() reset all;
alter function public.get_ops_shell() set search_path to pg_catalog, public, private;
revoke all on function public.get_ops_shell() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_ops_shell() to authenticated;
grant execute on function public.get_ops_shell() to postgres;
grant execute on function public.get_ops_shell() to service_role;

alter function public.get_ops_support_diagnostic(p_boutique_id text) reset all;
alter function public.get_ops_support_diagnostic(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function public.get_ops_support_diagnostic(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_ops_support_diagnostic(p_boutique_id text) to authenticated;
grant execute on function public.get_ops_support_diagnostic(p_boutique_id text) to postgres;
grant execute on function public.get_ops_support_diagnostic(p_boutique_id text) to service_role;

alter function public.get_pin_status() reset all;
alter function public.get_pin_status() set search_path to '';
revoke all on function public.get_pin_status() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_pin_status() to authenticated;
grant execute on function public.get_pin_status() to postgres;
grant execute on function public.get_pin_status() to service_role;
