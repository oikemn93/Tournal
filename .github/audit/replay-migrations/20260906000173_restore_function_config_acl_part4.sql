-- AUDIT ONLY: normalize function configuration and effective EXECUTE ACLs to current production.

alter function public.get_push_public_key() reset all;
alter function public.get_push_public_key() set search_path to '';
revoke all on function public.get_push_public_key() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_push_public_key() to authenticated;
grant execute on function public.get_push_public_key() to postgres;
grant execute on function public.get_push_public_key() to service_role;

alter function public.get_supplier_current_balances(p_boutique_id text) reset all;
alter function public.get_supplier_current_balances(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function public.get_supplier_current_balances(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.get_supplier_current_balances(p_boutique_id text) to authenticated;
grant execute on function public.get_supplier_current_balances(p_boutique_id text) to postgres;
grant execute on function public.get_supplier_current_balances(p_boutique_id text) to service_role;

alter function public.is_boutique_sync_v2_enabled(p_boutique_id text) reset all;
alter function public.is_boutique_sync_v2_enabled(p_boutique_id text) set search_path to '';
revoke all on function public.is_boutique_sync_v2_enabled(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.is_boutique_sync_v2_enabled(p_boutique_id text) to authenticated;
grant execute on function public.is_boutique_sync_v2_enabled(p_boutique_id text) to postgres;
grant execute on function public.is_boutique_sync_v2_enabled(p_boutique_id text) to service_role;

alter function public.link_return_client_advance() reset all;
alter function public.link_return_client_advance() set search_path to pg_catalog, public;
revoke all on function public.link_return_client_advance() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.link_return_client_advance() to postgres;
grant execute on function public.link_return_client_advance() to service_role;

alter function public.list_inventory_sessions(p_boutique_id text, p_limit integer) reset all;
alter function public.list_inventory_sessions(p_boutique_id text, p_limit integer) set search_path to pg_catalog, public, private;
revoke all on function public.list_inventory_sessions(p_boutique_id text, p_limit integer) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.list_inventory_sessions(p_boutique_id text, p_limit integer) to authenticated;
grant execute on function public.list_inventory_sessions(p_boutique_id text, p_limit integer) to postgres;
grant execute on function public.list_inventory_sessions(p_boutique_id text, p_limit integer) to service_role;

alter function public.list_inventory_sessions_internal_unmasked(p_boutique_id text, p_limit integer) reset all;
alter function public.list_inventory_sessions_internal_unmasked(p_boutique_id text, p_limit integer) set search_path to pg_catalog, public, private;
revoke all on function public.list_inventory_sessions_internal_unmasked(p_boutique_id text, p_limit integer) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.list_inventory_sessions_internal_unmasked(p_boutique_id text, p_limit integer) to postgres;
grant execute on function public.list_inventory_sessions_internal_unmasked(p_boutique_id text, p_limit integer) to service_role;

alter function public.lock_app_session(p_boutique_id text) reset all;
alter function public.lock_app_session(p_boutique_id text) set search_path to '';
revoke all on function public.lock_app_session(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.lock_app_session(p_boutique_id text) to authenticated;
grant execute on function public.lock_app_session(p_boutique_id text) to postgres;
grant execute on function public.lock_app_session(p_boutique_id text) to service_role;

alter function public.mark_all_notifications_read() reset all;
alter function public.mark_all_notifications_read() set search_path to '';
revoke all on function public.mark_all_notifications_read() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_all_notifications_read() to postgres;
grant execute on function public.mark_all_notifications_read() to service_role;

alter function public.mark_all_notifications_read(p_boutique_id text) reset all;
alter function public.mark_all_notifications_read(p_boutique_id text) set search_path to '';
revoke all on function public.mark_all_notifications_read(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.mark_all_notifications_read(p_boutique_id text) to authenticated;
grant execute on function public.mark_all_notifications_read(p_boutique_id text) to postgres;
grant execute on function public.mark_all_notifications_read(p_boutique_id text) to service_role;

alter function public.mark_notification_read(p_id bigint) reset all;
alter function public.mark_notification_read(p_id bigint) set search_path to '';
revoke all on function public.mark_notification_read(p_id bigint) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.mark_notification_read(p_id bigint) to authenticated;
grant execute on function public.mark_notification_read(p_id bigint) to postgres;
grant execute on function public.mark_notification_read(p_id bigint) to service_role;

alter function public.open_caisse_session(p_boutique_id text, p_idempotency_key uuid, p_fond_ouverture numeric) reset all;
alter function public.open_caisse_session(p_boutique_id text, p_idempotency_key uuid, p_fond_ouverture numeric) set search_path to public, private;
revoke all on function public.open_caisse_session(p_boutique_id text, p_idempotency_key uuid, p_fond_ouverture numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.open_caisse_session(p_boutique_id text, p_idempotency_key uuid, p_fond_ouverture numeric) to authenticated;
grant execute on function public.open_caisse_session(p_boutique_id text, p_idempotency_key uuid, p_fond_ouverture numeric) to postgres;
grant execute on function public.open_caisse_session(p_boutique_id text, p_idempotency_key uuid, p_fond_ouverture numeric) to service_role;

alter function public.protect_return_client_advance() reset all;
alter function public.protect_return_client_advance() set search_path to pg_catalog, public;
revoke all on function public.protect_return_client_advance() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.protect_return_client_advance() to postgres;
grant execute on function public.protect_return_client_advance() to service_role;

alter function public.record_client_advance(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_note text) reset all;
alter function public.record_client_advance(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_note text) set search_path to pg_catalog, public, private;
revoke all on function public.record_client_advance(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_note text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_client_advance(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_note text) to authenticated;
grant execute on function public.record_client_advance(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_note text) to postgres;
grant execute on function public.record_client_advance(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_note text) to service_role;

alter function public.record_client_payment(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date) reset all;
alter function public.record_client_payment(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date) set search_path to pg_catalog, public, private;
revoke all on function public.record_client_payment(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_client_payment(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date) to authenticated;
grant execute on function public.record_client_payment(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date) to postgres;
grant execute on function public.record_client_payment(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date) to service_role;

alter function public.record_express_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) reset all;
alter function public.record_express_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) set search_path to '';
revoke all on function public.record_express_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_express_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to authenticated;
grant execute on function public.record_express_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to postgres;
grant execute on function public.record_express_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to service_role;

alter function public.record_multi_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_payments jsonb) reset all;
alter function public.record_multi_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_payments jsonb) set search_path to pg_catalog, public, private;
revoke all on function public.record_multi_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_payments jsonb) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_multi_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_payments jsonb) to authenticated;
grant execute on function public.record_multi_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_payments jsonb) to postgres;
grant execute on function public.record_multi_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_payments jsonb) to service_role;

alter function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) reset all;
alter function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) set search_path to pg_catalog, public, private;
revoke all on function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to authenticated;
grant execute on function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to postgres;
grant execute on function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to service_role;

alter function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text) reset all;
alter function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text) set search_path to pg_catalog, public, private;
revoke all on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text) to authenticated;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text) to postgres;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text) to service_role;

alter function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint) reset all;
alter function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint) set search_path to pg_catalog, public, private;
revoke all on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint) to authenticated;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint) to postgres;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint) to service_role;

alter function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint, p_reference text) reset all;
alter function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint, p_reference text) set search_path to pg_catalog, public, private;
revoke all on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint, p_reference text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint, p_reference text) to authenticated;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint, p_reference text) to postgres;
grant execute on function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint, p_reference text) to service_role;

alter function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text) reset all;
alter function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text) set search_path to pg_catalog, public, private;
revoke all on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text) to authenticated;
grant execute on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text) to postgres;
grant execute on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text) to service_role;

alter function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text, p_payment_date date) reset all;
alter function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text, p_payment_date date) set search_path to pg_catalog, public, private;
revoke all on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text, p_payment_date date) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text, p_payment_date date) to authenticated;
grant execute on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text, p_payment_date date) to postgres;
grant execute on function public.record_supplier_payment(p_boutique_id text, p_supplier_id bigint, p_idempotency_key uuid, p_montant numeric, p_payment_method text, p_note text, p_payment_date date) to service_role;

alter function public.record_transfer_charge_payment(p_boutique_id text, p_charge_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text) reset all;
alter function public.record_transfer_charge_payment(p_boutique_id text, p_charge_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text) set search_path to pg_catalog, public, private;
revoke all on function public.record_transfer_charge_payment(p_boutique_id text, p_charge_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.record_transfer_charge_payment(p_boutique_id text, p_charge_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to authenticated;
grant execute on function public.record_transfer_charge_payment(p_boutique_id text, p_charge_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to postgres;
grant execute on function public.record_transfer_charge_payment(p_boutique_id text, p_charge_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text) to service_role;

alter function public.refund_client_credit_fifo(p_boutique_id text, p_client_id bigint, p_amount numeric, p_payment_method text, p_idempotency_key uuid, p_note text) reset all;
alter function public.refund_client_credit_fifo(p_boutique_id text, p_client_id bigint, p_amount numeric, p_payment_method text, p_idempotency_key uuid, p_note text) set search_path to pg_catalog, public, private;
revoke all on function public.refund_client_credit_fifo(p_boutique_id text, p_client_id bigint, p_amount numeric, p_payment_method text, p_idempotency_key uuid, p_note text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.refund_client_credit_fifo(p_boutique_id text, p_client_id bigint, p_amount numeric, p_payment_method text, p_idempotency_key uuid, p_note text) to authenticated;
grant execute on function public.refund_client_credit_fifo(p_boutique_id text, p_client_id bigint, p_amount numeric, p_payment_method text, p_idempotency_key uuid, p_note text) to postgres;
grant execute on function public.refund_client_credit_fifo(p_boutique_id text, p_client_id bigint, p_amount numeric, p_payment_method text, p_idempotency_key uuid, p_note text) to service_role;

alter function public.reject_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) reset all;
alter function public.reject_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) set search_path to pg_catalog, public, private;
revoke all on function public.reject_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.reject_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) to authenticated;
grant execute on function public.reject_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) to postgres;
grant execute on function public.reject_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid) to service_role;

alter function public.remove_boutique_partner(p_boutique_id text, p_partner_boutique_id text) reset all;
alter function public.remove_boutique_partner(p_boutique_id text, p_partner_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function public.remove_boutique_partner(p_boutique_id text, p_partner_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.remove_boutique_partner(p_boutique_id text, p_partner_boutique_id text) to authenticated;
grant execute on function public.remove_boutique_partner(p_boutique_id text, p_partner_boutique_id text) to postgres;
grant execute on function public.remove_boutique_partner(p_boutique_id text, p_partner_boutique_id text) to service_role;

alter function public.remove_push_subscription(p_endpoint text) reset all;
alter function public.remove_push_subscription(p_endpoint text) set search_path to '';
revoke all on function public.remove_push_subscription(p_endpoint text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.remove_push_subscription(p_endpoint text) to authenticated;
grant execute on function public.remove_push_subscription(p_endpoint text) to postgres;
grant execute on function public.remove_push_subscription(p_endpoint text) to service_role;

alter function public.request_ops_boutique_access(p_boutique_id text, p_reason text, p_requested_minutes integer) reset all;
alter function public.request_ops_boutique_access(p_boutique_id text, p_reason text, p_requested_minutes integer) set search_path to pg_catalog, public, private;
revoke all on function public.request_ops_boutique_access(p_boutique_id text, p_reason text, p_requested_minutes integer) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.request_ops_boutique_access(p_boutique_id text, p_reason text, p_requested_minutes integer) to authenticated;
grant execute on function public.request_ops_boutique_access(p_boutique_id text, p_reason text, p_requested_minutes integer) to postgres;
grant execute on function public.request_ops_boutique_access(p_boutique_id text, p_reason text, p_requested_minutes integer) to service_role;

alter function public.reset_user_quick_pin(p_user_id uuid) reset all;
alter function public.reset_user_quick_pin(p_user_id uuid) set search_path to '';
revoke all on function public.reset_user_quick_pin(p_user_id uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.reset_user_quick_pin(p_user_id uuid) to authenticated;
grant execute on function public.reset_user_quick_pin(p_user_id uuid) to postgres;
grant execute on function public.reset_user_quick_pin(p_user_id uuid) to service_role;

alter function public.return_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_lines jsonb, p_refund_method text) reset all;
alter function public.return_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_lines jsonb, p_refund_method text) set search_path to pg_catalog, public, private;
revoke all on function public.return_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_lines jsonb, p_refund_method text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.return_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_lines jsonb, p_refund_method text) to authenticated;
grant execute on function public.return_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_lines jsonb, p_refund_method text) to postgres;
grant execute on function public.return_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_lines jsonb, p_refund_method text) to service_role;

alter function public.rls_auto_enable() reset all;
alter function public.rls_auto_enable() set search_path to pg_catalog;
revoke all on function public.rls_auto_enable() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.rls_auto_enable() to postgres;
grant execute on function public.rls_auto_enable() to service_role;

alter function public.save_inventory_count(p_session_id uuid, p_product_id bigint, p_counted_qty numeric, p_counting_detail jsonb) reset all;
alter function public.save_inventory_count(p_session_id uuid, p_product_id bigint, p_counted_qty numeric, p_counting_detail jsonb) set search_path to pg_catalog, public, private;
revoke all on function public.save_inventory_count(p_session_id uuid, p_product_id bigint, p_counted_qty numeric, p_counting_detail jsonb) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.save_inventory_count(p_session_id uuid, p_product_id bigint, p_counted_qty numeric, p_counting_detail jsonb) to authenticated;
grant execute on function public.save_inventory_count(p_session_id uuid, p_product_id bigint, p_counted_qty numeric, p_counting_detail jsonb) to postgres;
grant execute on function public.save_inventory_count(p_session_id uuid, p_product_id bigint, p_counted_qty numeric, p_counting_detail jsonb) to service_role;

alter function public.search_boutique_directory(p_source_boutique_id text, p_query text) reset all;
alter function public.search_boutique_directory(p_source_boutique_id text, p_query text) set search_path to pg_catalog, public, private;
revoke all on function public.search_boutique_directory(p_source_boutique_id text, p_query text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.search_boutique_directory(p_source_boutique_id text, p_query text) to authenticated;
grant execute on function public.search_boutique_directory(p_source_boutique_id text, p_query text) to postgres;
grant execute on function public.search_boutique_directory(p_source_boutique_id text, p_query text) to service_role;

alter function public.set_notification_preference(p_boutique_id text, p_category text, p_in_app_enabled boolean, p_push_enabled boolean) reset all;
alter function public.set_notification_preference(p_boutique_id text, p_category text, p_in_app_enabled boolean, p_push_enabled boolean) set search_path to '';
revoke all on function public.set_notification_preference(p_boutique_id text, p_category text, p_in_app_enabled boolean, p_push_enabled boolean) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.set_notification_preference(p_boutique_id text, p_category text, p_in_app_enabled boolean, p_push_enabled boolean) to authenticated;
grant execute on function public.set_notification_preference(p_boutique_id text, p_category text, p_in_app_enabled boolean, p_push_enabled boolean) to postgres;
grant execute on function public.set_notification_preference(p_boutique_id text, p_category text, p_in_app_enabled boolean, p_push_enabled boolean) to service_role;

alter function public.set_quick_pin(p_pin text) reset all;
alter function public.set_quick_pin(p_pin text) set search_path to '';
revoke all on function public.set_quick_pin(p_pin text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.set_quick_pin(p_pin text) to authenticated;
grant execute on function public.set_quick_pin(p_pin text) to postgres;
grant execute on function public.set_quick_pin(p_pin text) to service_role;

alter function public.snapshot_invoice_identity() reset all;
alter function public.snapshot_invoice_identity() set search_path to public;
revoke all on function public.snapshot_invoice_identity() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.snapshot_invoice_identity() to postgres;
grant execute on function public.snapshot_invoice_identity() to service_role;

alter function public.start_app_session(p_boutique_id text) reset all;
alter function public.start_app_session(p_boutique_id text) set search_path to '';
revoke all on function public.start_app_session(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.start_app_session(p_boutique_id text) to authenticated;
grant execute on function public.start_app_session(p_boutique_id text) to postgres;
grant execute on function public.start_app_session(p_boutique_id text) to service_role;

alter function public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text, p_as_of_at timestamp with time zone) reset all;
alter function public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text, p_as_of_at timestamp with time zone) set search_path to pg_catalog, public, private;
revoke all on function public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text, p_as_of_at timestamp with time zone) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text, p_as_of_at timestamp with time zone) to authenticated;
grant execute on function public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text, p_as_of_at timestamp with time zone) to postgres;
grant execute on function public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text, p_as_of_at timestamp with time zone) to service_role;

alter function public.sync_push_subscription_context(p_endpoint text) reset all;
alter function public.sync_push_subscription_context(p_endpoint text) set search_path to '';
revoke all on function public.sync_push_subscription_context(p_endpoint text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.sync_push_subscription_context(p_endpoint text) to authenticated;
grant execute on function public.sync_push_subscription_context(p_endpoint text) to postgres;
grant execute on function public.sync_push_subscription_context(p_endpoint text) to service_role;

alter function public.update_boutique_assignment_permissions(p_boutique_id text, p_user_id uuid, p_role text, p_droits jsonb) reset all;
alter function public.update_boutique_assignment_permissions(p_boutique_id text, p_user_id uuid, p_role text, p_droits jsonb) set search_path to pg_catalog, public, private;
revoke all on function public.update_boutique_assignment_permissions(p_boutique_id text, p_user_id uuid, p_role text, p_droits jsonb) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.update_boutique_assignment_permissions(p_boutique_id text, p_user_id uuid, p_role text, p_droits jsonb) to authenticated;
grant execute on function public.update_boutique_assignment_permissions(p_boutique_id text, p_user_id uuid, p_role text, p_droits jsonb) to postgres;
grant execute on function public.update_boutique_assignment_permissions(p_boutique_id text, p_user_id uuid, p_role text, p_droits jsonb) to service_role;

alter function public.update_category(p_boutique_id text, p_category_id text, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) reset all;
alter function public.update_category(p_boutique_id text, p_category_id text, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) set search_path to pg_catalog, public, private;
revoke all on function public.update_category(p_boutique_id text, p_category_id text, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.update_category(p_boutique_id text, p_category_id text, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) to authenticated;
grant execute on function public.update_category(p_boutique_id text, p_category_id text, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) to postgres;
grant execute on function public.update_category(p_boutique_id text, p_category_id text, p_nom text, p_unit_vente text, p_pieces_per_lot numeric, p_length_per_piece numeric) to service_role;

alter function public.update_client_payment_terms(p_boutique_id text, p_client_id bigint, p_payment_terms_days integer) reset all;
alter function public.update_client_payment_terms(p_boutique_id text, p_client_id bigint, p_payment_terms_days integer) set search_path to pg_catalog, public, private;
revoke all on function public.update_client_payment_terms(p_boutique_id text, p_client_id bigint, p_payment_terms_days integer) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.update_client_payment_terms(p_boutique_id text, p_client_id bigint, p_payment_terms_days integer) to authenticated;
grant execute on function public.update_client_payment_terms(p_boutique_id text, p_client_id bigint, p_payment_terms_days integer) to postgres;
grant execute on function public.update_client_payment_terms(p_boutique_id text, p_client_id bigint, p_payment_terms_days integer) to service_role;

alter function public.update_client_profile(p_boutique_id text, p_client_id bigint, p_name text, p_phone text, p_email text, p_city text, p_address text, p_contact text) reset all;
alter function public.update_client_profile(p_boutique_id text, p_client_id bigint, p_name text, p_phone text, p_email text, p_city text, p_address text, p_contact text) set search_path to pg_catalog, public, private;
revoke all on function public.update_client_profile(p_boutique_id text, p_client_id bigint, p_name text, p_phone text, p_email text, p_city text, p_address text, p_contact text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.update_client_profile(p_boutique_id text, p_client_id bigint, p_name text, p_phone text, p_email text, p_city text, p_address text, p_contact text) to authenticated;
grant execute on function public.update_client_profile(p_boutique_id text, p_client_id bigint, p_name text, p_phone text, p_email text, p_city text, p_address text, p_contact text) to postgres;
grant execute on function public.update_client_profile(p_boutique_id text, p_client_id bigint, p_name text, p_phone text, p_email text, p_city text, p_address text, p_contact text) to service_role;

alter function public.update_pending_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_client_id bigint, p_client_nom text, p_client_tel text, p_lines jsonb) reset all;
alter function public.update_pending_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_client_id bigint, p_client_nom text, p_client_tel text, p_lines jsonb) set search_path to pg_catalog, public, private;
revoke all on function public.update_pending_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_client_id bigint, p_client_nom text, p_client_tel text, p_lines jsonb) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.update_pending_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_client_id bigint, p_client_nom text, p_client_tel text, p_lines jsonb) to authenticated;
grant execute on function public.update_pending_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_client_id bigint, p_client_nom text, p_client_tel text, p_lines jsonb) to postgres;
grant execute on function public.update_pending_sale(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_client_id bigint, p_client_nom text, p_client_tel text, p_lines jsonb) to service_role;

alter function public.update_supplier(p_boutique_id text, p_supplier_id bigint, p_nom text, p_tel text, p_ville text, p_email text, p_contact text, p_notes text, p_payment_terms_days integer) reset all;
alter function public.update_supplier(p_boutique_id text, p_supplier_id bigint, p_nom text, p_tel text, p_ville text, p_email text, p_contact text, p_notes text, p_payment_terms_days integer) set search_path to pg_catalog, public, private;
revoke all on function public.update_supplier(p_boutique_id text, p_supplier_id bigint, p_nom text, p_tel text, p_ville text, p_email text, p_contact text, p_notes text, p_payment_terms_days integer) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.update_supplier(p_boutique_id text, p_supplier_id bigint, p_nom text, p_tel text, p_ville text, p_email text, p_contact text, p_notes text, p_payment_terms_days integer) to authenticated;
grant execute on function public.update_supplier(p_boutique_id text, p_supplier_id bigint, p_nom text, p_tel text, p_ville text, p_email text, p_contact text, p_notes text, p_payment_terms_days integer) to postgres;
grant execute on function public.update_supplier(p_boutique_id text, p_supplier_id bigint, p_nom text, p_tel text, p_ville text, p_email text, p_contact text, p_notes text, p_payment_terms_days integer) to service_role;

alter function public.validate_app_session(p_boutique_id text) reset all;
alter function public.validate_app_session(p_boutique_id text) set search_path to '';
revoke all on function public.validate_app_session(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.validate_app_session(p_boutique_id text) to authenticated;
grant execute on function public.validate_app_session(p_boutique_id text) to postgres;
grant execute on function public.validate_app_session(p_boutique_id text) to service_role;

alter function public.verify_quick_pin(p_pin text, p_boutique_id text) reset all;
alter function public.verify_quick_pin(p_pin text, p_boutique_id text) set search_path to '';
revoke all on function public.verify_quick_pin(p_pin text, p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function public.verify_quick_pin(p_pin text, p_boutique_id text) to authenticated;
grant execute on function public.verify_quick_pin(p_pin text, p_boutique_id text) to postgres;
grant execute on function public.verify_quick_pin(p_pin text, p_boutique_id text) to service_role;
