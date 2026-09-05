-- AUDIT ONLY: normalize function configuration and effective EXECUTE ACLs to current production.

alter function private.enforce_daily_caisse_on_receipt() reset all;
alter function private.enforce_daily_caisse_on_receipt() set search_path to '';
revoke all on function private.enforce_daily_caisse_on_receipt() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_daily_caisse_on_receipt() to postgres;

alter function private.enforce_pos_full_payment() reset all;
alter function private.enforce_pos_full_payment() set search_path to pg_catalog, public, private;
revoke all on function private.enforce_pos_full_payment() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_pos_full_payment() to postgres;

alter function private.enforce_sale_stock_lifecycle() reset all;
alter function private.enforce_sale_stock_lifecycle() set search_path to pg_catalog, public, private;
revoke all on function private.enforce_sale_stock_lifecycle() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_sale_stock_lifecycle() to postgres;

alter function private.enforce_transfer_destination_mapping() reset all;
alter function private.enforce_transfer_destination_mapping() set search_path to pg_catalog, public, private;
revoke all on function private.enforce_transfer_destination_mapping() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_transfer_destination_mapping() to PUBLIC;
grant execute on function private.enforce_transfer_destination_mapping() to postgres;

alter function private.enforce_transfer_disbursement_caisse() reset all;
alter function private.enforce_transfer_disbursement_caisse() set search_path to '';
revoke all on function private.enforce_transfer_disbursement_caisse() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_transfer_disbursement_caisse() to PUBLIC;
grant execute on function private.enforce_transfer_disbursement_caisse() to postgres;

alter function private.enforce_transfer_line_total_stock() reset all;
alter function private.enforce_transfer_line_total_stock() set search_path to pg_catalog, public, private;
revoke all on function private.enforce_transfer_line_total_stock() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_transfer_line_total_stock() to PUBLIC;
grant execute on function private.enforce_transfer_line_total_stock() to postgres;

alter function private.ensure_boutique_self_supplier() reset all;
alter function private.ensure_boutique_self_supplier() set search_path to pg_catalog, public, private;
revoke all on function private.ensure_boutique_self_supplier() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.ensure_boutique_self_supplier() to PUBLIC;
grant execute on function private.ensure_boutique_self_supplier() to postgres;

alter function private.ensure_ops_onboarding_row() reset all;
alter function private.ensure_ops_onboarding_row() set search_path to pg_catalog, public, private;
revoke all on function private.ensure_ops_onboarding_row() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.ensure_ops_onboarding_row() to PUBLIC;
grant execute on function private.ensure_ops_onboarding_row() to postgres;

alter function private.fifo_outflow_cost(p_boutique_id text, p_product_id bigint, p_outflow_entry_id bigint) reset all;
alter function private.fifo_outflow_cost(p_boutique_id text, p_product_id bigint, p_outflow_entry_id bigint) set search_path to pg_catalog, public, private;
revoke all on function private.fifo_outflow_cost(p_boutique_id text, p_product_id bigint, p_outflow_entry_id bigint) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.fifo_outflow_cost(p_boutique_id text, p_product_id bigint, p_outflow_entry_id bigint) to PUBLIC;
grant execute on function private.fifo_outflow_cost(p_boutique_id text, p_product_id bigint, p_outflow_entry_id bigint) to postgres;

alter function private.fifo_stock_value(p_boutique_id text, p_product_id bigint, p_as_of_at timestamp with time zone, p_target_qty numeric) reset all;
alter function private.fifo_stock_value(p_boutique_id text, p_product_id bigint, p_as_of_at timestamp with time zone, p_target_qty numeric) set search_path to pg_catalog, public, private;
revoke all on function private.fifo_stock_value(p_boutique_id text, p_product_id bigint, p_as_of_at timestamp with time zone, p_target_qty numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.fifo_stock_value(p_boutique_id text, p_product_id bigint, p_as_of_at timestamp with time zone, p_target_qty numeric) to postgres;

alter function private.fifo_unit_cost(p_boutique_id text, p_product_id bigint, p_qty numeric) reset all;
alter function private.fifo_unit_cost(p_boutique_id text, p_product_id bigint, p_qty numeric) set search_path to pg_catalog, public, private;
revoke all on function private.fifo_unit_cost(p_boutique_id text, p_product_id bigint, p_qty numeric) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.fifo_unit_cost(p_boutique_id text, p_product_id bigint, p_qty numeric) to postgres;

alter function private.guard_charge_disbursement() reset all;
alter function private.guard_charge_disbursement() set search_path to pg_catalog, public, private;
revoke all on function private.guard_charge_disbursement() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_charge_disbursement() to PUBLIC;
grant execute on function private.guard_charge_disbursement() to postgres;

alter function private.guard_client_credit_refund_allocation_immutability() reset all;
alter function private.guard_client_credit_refund_allocation_immutability() set search_path to pg_catalog, public, private;
revoke all on function private.guard_client_credit_refund_allocation_immutability() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_client_credit_refund_allocation_immutability() to PUBLIC;
grant execute on function private.guard_client_credit_refund_allocation_immutability() to postgres;

alter function private.guard_client_credit_refund_immutability() reset all;
alter function private.guard_client_credit_refund_immutability() set search_path to pg_catalog, public, private;
revoke all on function private.guard_client_credit_refund_immutability() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_client_credit_refund_immutability() to postgres;

alter function private.guard_direct_product_stock_update() reset all;
alter function private.guard_direct_product_stock_update() set search_path to pg_catalog, public;
revoke all on function private.guard_direct_product_stock_update() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_direct_product_stock_update() to postgres;

alter function private.guard_future_return_invoice_integrity() reset all;
alter function private.guard_future_return_invoice_integrity() set search_path to pg_catalog, public, private;
revoke all on function private.guard_future_return_invoice_integrity() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_future_return_invoice_integrity() to postgres;

alter function private.guard_new_return_line_totals() reset all;
alter function private.guard_new_return_line_totals() set search_path to pg_catalog, public, private;
revoke all on function private.guard_new_return_line_totals() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_new_return_line_totals() to authenticated;
grant execute on function private.guard_new_return_line_totals() to postgres;

alter function private.guard_ops_account_update() reset all;
alter function private.guard_ops_account_update() set search_path to pg_catalog, public, private;
revoke all on function private.guard_ops_account_update() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_ops_account_update() to PUBLIC;
grant execute on function private.guard_ops_account_update() to postgres;

alter function private.guard_return_invoice_immutability() reset all;
alter function private.guard_return_invoice_immutability() set search_path to pg_catalog, public, private;
revoke all on function private.guard_return_invoice_immutability() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_return_invoice_immutability() to authenticated;
grant execute on function private.guard_return_invoice_immutability() to postgres;
grant execute on function private.guard_return_invoice_immutability() to service_role;

alter function private.guard_return_line_immutability() reset all;
alter function private.guard_return_line_immutability() set search_path to pg_catalog, public, private;
revoke all on function private.guard_return_line_immutability() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_return_line_immutability() to authenticated;
grant execute on function private.guard_return_line_immutability() to postgres;
grant execute on function private.guard_return_line_immutability() to service_role;

alter function private.guard_return_line_provenance() reset all;
alter function private.guard_return_line_provenance() set search_path to pg_catalog, public, private;
revoke all on function private.guard_return_line_provenance() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_return_line_provenance() to authenticated;
grant execute on function private.guard_return_line_provenance() to postgres;
grant execute on function private.guard_return_line_provenance() to service_role;

alter function private.guard_return_payment_disbursement() reset all;
alter function private.guard_return_payment_disbursement() set search_path to pg_catalog, public, private;
revoke all on function private.guard_return_payment_disbursement() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_return_payment_disbursement() to PUBLIC;
grant execute on function private.guard_return_payment_disbursement() to postgres;

alter function private.guard_return_payment_immutability() reset all;
alter function private.guard_return_payment_immutability() set search_path to pg_catalog, public, private;
revoke all on function private.guard_return_payment_immutability() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_return_payment_immutability() to postgres;

alter function private.guard_return_stock_entry_immutability() reset all;
alter function private.guard_return_stock_entry_immutability() set search_path to pg_catalog, public, private;
revoke all on function private.guard_return_stock_entry_immutability() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_return_stock_entry_immutability() to postgres;

alter function private.guard_return_stock_provenance() reset all;
alter function private.guard_return_stock_provenance() set search_path to pg_catalog, public, private;
revoke all on function private.guard_return_stock_provenance() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.guard_return_stock_provenance() to PUBLIC;
grant execute on function private.guard_return_stock_provenance() to postgres;

alter function private.handle_new_user() reset all;
alter function private.handle_new_user() set search_path to pg_catalog, public;
revoke all on function private.handle_new_user() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.handle_new_user() to postgres;

alter function private.invoice_net_due(p_boutique_id text, p_invoice_id text) reset all;
alter function private.invoice_net_due(p_boutique_id text, p_invoice_id text) set search_path to pg_catalog, public, private;
revoke all on function private.invoice_net_due(p_boutique_id text, p_invoice_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.invoice_net_due(p_boutique_id text, p_invoice_id text) to postgres;
grant execute on function private.invoice_net_due(p_boutique_id text, p_invoice_id text) to service_role;

alter function private.mark_ops_onboarding_catalogue() reset all;
alter function private.mark_ops_onboarding_catalogue() set search_path to pg_catalog, public, private;
revoke all on function private.mark_ops_onboarding_catalogue() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.mark_ops_onboarding_catalogue() to PUBLIC;
grant execute on function private.mark_ops_onboarding_catalogue() to postgres;

alter function private.mark_ops_onboarding_receipt() reset all;
alter function private.mark_ops_onboarding_receipt() set search_path to pg_catalog, public, private;
revoke all on function private.mark_ops_onboarding_receipt() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.mark_ops_onboarding_receipt() to PUBLIC;
grant execute on function private.mark_ops_onboarding_receipt() to postgres;

alter function private.mark_ops_onboarding_sale() reset all;
alter function private.mark_ops_onboarding_sale() set search_path to pg_catalog, public, private;
revoke all on function private.mark_ops_onboarding_sale() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.mark_ops_onboarding_sale() to PUBLIC;
grant execute on function private.mark_ops_onboarding_sale() to postgres;

alter function private.mark_ops_onboarding_user() reset all;
alter function private.mark_ops_onboarding_user() set search_path to pg_catalog, public, private;
revoke all on function private.mark_ops_onboarding_user() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.mark_ops_onboarding_user() to PUBLIC;
grant execute on function private.mark_ops_onboarding_user() to postgres;

alter function private.next_credit_note_number(p_boutique_id text) reset all;
alter function private.next_credit_note_number(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function private.next_credit_note_number(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.next_credit_note_number(p_boutique_id text) to postgres;
grant execute on function private.next_credit_note_number(p_boutique_id text) to service_role;

alter function private.next_invoice_number(p_boutique_id text) reset all;
alter function private.next_invoice_number(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function private.next_invoice_number(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.next_invoice_number(p_boutique_id text) to postgres;

alter function private.normalize_phone(p_value text) reset all;
alter function private.normalize_phone(p_value text) set search_path to pg_catalog;
revoke all on function private.normalize_phone(p_value text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.normalize_phone(p_value text) to postgres;

alter function private.notification_category(p_action text) reset all;
alter function private.notification_category(p_action text) set search_path to '';
revoke all on function private.notification_category(p_action text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.notification_category(p_action text) to postgres;

alter function private.notification_channel_enabled(p_boutique_id text, p_category text, p_channel text) reset all;
alter function private.notification_channel_enabled(p_boutique_id text, p_category text, p_channel text) set search_path to '';
revoke all on function private.notification_channel_enabled(p_boutique_id text, p_category text, p_channel text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.notification_channel_enabled(p_boutique_id text, p_category text, p_channel text) to postgres;

alter function private.notification_tab(p_category text) reset all;
alter function private.notification_tab(p_category text) set search_path to '';
revoke all on function private.notification_tab(p_category text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.notification_tab(p_category text) to postgres;

alter function private.protect_source_sale_after_return() reset all;
alter function private.protect_source_sale_after_return() set search_path to pg_catalog, public, private;
revoke all on function private.protect_source_sale_after_return() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.protect_source_sale_after_return() to PUBLIC;
grant execute on function private.protect_source_sale_after_return() to postgres;

alter function private.protect_source_sale_line_after_return() reset all;
alter function private.protect_source_sale_line_after_return() set search_path to pg_catalog, public, private;
revoke all on function private.protect_source_sale_line_after_return() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.protect_source_sale_line_after_return() to PUBLIC;
grant execute on function private.protect_source_sale_line_after_return() to postgres;

alter function private.protect_source_sale_payment_after_return() reset all;
alter function private.protect_source_sale_payment_after_return() set search_path to pg_catalog, public, private;
revoke all on function private.protect_source_sale_payment_after_return() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.protect_source_sale_payment_after_return() to PUBLIC;
grant execute on function private.protect_source_sale_payment_after_return() to postgres;

alter function private.protect_source_sale_stock_after_return() reset all;
alter function private.protect_source_sale_stock_after_return() set search_path to pg_catalog, public, private;
revoke all on function private.protect_source_sale_stock_after_return() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.protect_source_sale_stock_after_return() to PUBLIC;
grant execute on function private.protect_source_sale_stock_after_return() to postgres;

alter function private.purge_old_boutique_sync_events() reset all;
alter function private.purge_old_boutique_sync_events() set search_path to '';
revoke all on function private.purge_old_boutique_sync_events() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.purge_old_boutique_sync_events() to postgres;

alter function private.purge_old_notifications() reset all;
alter function private.purge_old_notifications() set search_path to '';
revoke all on function private.purge_old_notifications() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.purge_old_notifications() to postgres;

alter function private.release_pending_committed_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) reset all;
alter function private.release_pending_committed_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) set search_path to pg_catalog, public, private;
revoke all on function private.release_pending_committed_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.release_pending_committed_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) to postgres;

alter function private.release_pending_pos_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) reset all;
alter function private.release_pending_pos_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) set search_path to pg_catalog, public, private;
revoke all on function private.release_pending_pos_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.release_pending_pos_stock(p_boutique_id text, p_invoice_id text, p_user uuid, p_reason text) to postgres;

alter function private.set_boutique_state_metadata() reset all;
alter function private.set_boutique_state_metadata() set search_path to pg_catalog, public;
revoke all on function private.set_boutique_state_metadata() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.set_boutique_state_metadata() to postgres;

alter function private.sync_ops_account_for_new_boutique() reset all;
alter function private.sync_ops_account_for_new_boutique() set search_path to pg_catalog, public, private;
revoke all on function private.sync_ops_account_for_new_boutique() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.sync_ops_account_for_new_boutique() to PUBLIC;
grant execute on function private.sync_ops_account_for_new_boutique() to postgres;

alter function private.sync_source_invoice_return_status() reset all;
alter function private.sync_source_invoice_return_status() set search_path to pg_catalog, public, private;
revoke all on function private.sync_source_invoice_return_status() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.sync_source_invoice_return_status() to postgres;
