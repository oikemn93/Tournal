-- AUDIT ONLY: normalize function configuration and effective EXECUTE ACLs to current production.
-- Generated from read-only production catalog metadata; no function bodies or data included.

alter function private._recalc_client_total(p_boutique_id text, p_client_id bigint) reset all;
alter function private._recalc_client_total(p_boutique_id text, p_client_id bigint) set search_path to pg_catalog, public;
revoke all on function private._recalc_client_total(p_boutique_id text, p_client_id bigint) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private._recalc_client_total(p_boutique_id text, p_client_id bigint) to postgres;
grant execute on function private._recalc_client_total(p_boutique_id text, p_client_id bigint) to service_role;

alter function private._set_updated_at() reset all;
alter function private._set_updated_at() set search_path to pg_catalog, public;
revoke all on function private._set_updated_at() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private._set_updated_at() to postgres;
grant execute on function private._set_updated_at() to service_role;

alter function private._sync_boutique_owner() reset all;
alter function private._sync_boutique_owner() set search_path to pg_catalog, public;
revoke all on function private._sync_boutique_owner() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private._sync_boutique_owner() to postgres;
grant execute on function private._sync_boutique_owner() to service_role;

alter function private._update_client_total() reset all;
alter function private._update_client_total() set search_path to pg_catalog, public, private;
revoke all on function private._update_client_total() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private._update_client_total() to postgres;
grant execute on function private._update_client_total() to service_role;

alter function private.apply_ops_interaction_account() reset all;
alter function private.apply_ops_interaction_account() set search_path to pg_catalog, public, private;
revoke all on function private.apply_ops_interaction_account() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.apply_ops_interaction_account() to PUBLIC;
grant execute on function private.apply_ops_interaction_account() to postgres;

alter function private.apply_ops_task_account() reset all;
alter function private.apply_ops_task_account() set search_path to pg_catalog, public, private;
revoke all on function private.apply_ops_task_account() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.apply_ops_task_account() to PUBLIC;
grant execute on function private.apply_ops_task_account() to postgres;

alter function private.apply_ops_ticket_defaults() reset all;
alter function private.apply_ops_ticket_defaults() set search_path to pg_catalog, public, private;
revoke all on function private.apply_ops_ticket_defaults() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.apply_ops_ticket_defaults() to PUBLIC;
grant execute on function private.apply_ops_ticket_defaults() to postgres;

alter function private.auth_can_collect_payment(p_boutique_id text) reset all;
alter function private.auth_can_collect_payment(p_boutique_id text) set search_path to '';
revoke all on function private.auth_can_collect_payment(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_can_collect_payment(p_boutique_id text) to authenticated;
grant execute on function private.auth_can_collect_payment(p_boutique_id text) to postgres;

alter function private.auth_can_disburse(p_boutique_id text) reset all;
alter function private.auth_can_disburse(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function private.auth_can_disburse(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_can_disburse(p_boutique_id text) to authenticated;
grant execute on function private.auth_can_disburse(p_boutique_id text) to postgres;

alter function private.auth_has_active_app_session(p_boutique_id text) reset all;
alter function private.auth_has_active_app_session(p_boutique_id text) set search_path to '';
revoke all on function private.auth_has_active_app_session(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_active_app_session(p_boutique_id text) to authenticated;
grant execute on function private.auth_has_active_app_session(p_boutique_id text) to postgres;

alter function private.auth_has_active_ops_access(p_boutique_id text) reset all;
alter function private.auth_has_active_ops_access(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function private.auth_has_active_ops_access(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_active_ops_access(p_boutique_id text) to postgres;

alter function private.auth_has_any_permission(p_boutique_id text, p_permissions text[]) reset all;
alter function private.auth_has_any_permission(p_boutique_id text, p_permissions text[]) set search_path to '';
revoke all on function private.auth_has_any_permission(p_boutique_id text, p_permissions text[]) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_any_permission(p_boutique_id text, p_permissions text[]) to authenticated;
grant execute on function private.auth_has_any_permission(p_boutique_id text, p_permissions text[]) to postgres;

alter function private.auth_has_any_read_permission(p_boutique_id text, p_permissions text[]) reset all;
alter function private.auth_has_any_read_permission(p_boutique_id text, p_permissions text[]) set search_path to '';
revoke all on function private.auth_has_any_read_permission(p_boutique_id text, p_permissions text[]) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_any_read_permission(p_boutique_id text, p_permissions text[]) to PUBLIC;
grant execute on function private.auth_has_any_read_permission(p_boutique_id text, p_permissions text[]) to postgres;

alter function private.auth_has_boutique_access(p_boutique_id text) reset all;
alter function private.auth_has_boutique_access(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function private.auth_has_boutique_access(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_boutique_access(p_boutique_id text) to authenticated;
grant execute on function private.auth_has_boutique_access(p_boutique_id text) to postgres;

alter function private.auth_has_permission(p_boutique_id text, p_permission text) reset all;
alter function private.auth_has_permission(p_boutique_id text, p_permission text) set search_path to '';
revoke all on function private.auth_has_permission(p_boutique_id text, p_permission text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_permission(p_boutique_id text, p_permission text) to authenticated;
grant execute on function private.auth_has_permission(p_boutique_id text, p_permission text) to postgres;

alter function private.auth_has_read_permission(p_boutique_id text, p_permission text) reset all;
alter function private.auth_has_read_permission(p_boutique_id text, p_permission text) set search_path to '';
revoke all on function private.auth_has_read_permission(p_boutique_id text, p_permission text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_read_permission(p_boutique_id text, p_permission text) to PUBLIC;
grant execute on function private.auth_has_read_permission(p_boutique_id text, p_permission text) to postgres;

alter function private.auth_has_write_access(p_boutique_id text) reset all;
alter function private.auth_has_write_access(p_boutique_id text) set search_path to '';
revoke all on function private.auth_has_write_access(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_has_write_access(p_boutique_id text) to authenticated;
grant execute on function private.auth_has_write_access(p_boutique_id text) to postgres;
grant execute on function private.auth_has_write_access(p_boutique_id text) to service_role;

alter function private.auth_is_active_user() reset all;
alter function private.auth_is_active_user() set search_path to pg_catalog, public, private;
revoke all on function private.auth_is_active_user() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_is_active_user() to authenticated;
grant execute on function private.auth_is_active_user() to postgres;

alter function private.auth_is_assigned_to(p_boutique_id text) reset all;
alter function private.auth_is_assigned_to(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function private.auth_is_assigned_to(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_is_assigned_to(p_boutique_id text) to authenticated;
grant execute on function private.auth_is_assigned_to(p_boutique_id text) to postgres;
grant execute on function private.auth_is_assigned_to(p_boutique_id text) to service_role;

alter function private.auth_is_ops_staff() reset all;
alter function private.auth_is_ops_staff() set search_path to pg_catalog, public, private;
revoke all on function private.auth_is_ops_staff() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_is_ops_staff() to authenticated;
grant execute on function private.auth_is_ops_staff() to postgres;

alter function private.auth_is_owner_of(p_boutique_id text) reset all;
alter function private.auth_is_owner_of(p_boutique_id text) set search_path to pg_catalog, public, private;
revoke all on function private.auth_is_owner_of(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_is_owner_of(p_boutique_id text) to authenticated;
grant execute on function private.auth_is_owner_of(p_boutique_id text) to postgres;
grant execute on function private.auth_is_owner_of(p_boutique_id text) to service_role;

alter function private.auth_is_super_admin() reset all;
alter function private.auth_is_super_admin() set search_path to pg_catalog, public, private;
revoke all on function private.auth_is_super_admin() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_is_super_admin() to authenticated;
grant execute on function private.auth_is_super_admin() to postgres;
grant execute on function private.auth_is_super_admin() to service_role;

alter function private.auth_notification_context_matches(p_boutique_id text) reset all;
alter function private.auth_notification_context_matches(p_boutique_id text) set search_path to '';
revoke all on function private.auth_notification_context_matches(p_boutique_id text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_notification_context_matches(p_boutique_id text) to authenticated;
grant execute on function private.auth_notification_context_matches(p_boutique_id text) to postgres;

alter function private.auth_ops_role() reset all;
alter function private.auth_ops_role() set search_path to pg_catalog, public, private;
revoke all on function private.auth_ops_role() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_ops_role() to authenticated;
grant execute on function private.auth_ops_role() to postgres;

alter function private.auth_owned_boutique_ids() reset all;
alter function private.auth_owned_boutique_ids() set search_path to '';
revoke all on function private.auth_owned_boutique_ids() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_owned_boutique_ids() to authenticated;
grant execute on function private.auth_owned_boutique_ids() to postgres;

alter function private.auth_read_boutique_ids(p_permissions text[]) reset all;
alter function private.auth_read_boutique_ids(p_permissions text[]) set search_path to '';
revoke all on function private.auth_read_boutique_ids(p_permissions text[]) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.auth_read_boutique_ids(p_permissions text[]) to authenticated;
grant execute on function private.auth_read_boutique_ids(p_permissions text[]) to postgres;

alter function private.commit_client_stock_after_invoice_line() reset all;
alter function private.commit_client_stock_after_invoice_line() set search_path to pg_catalog, public, private;
revoke all on function private.commit_client_stock_after_invoice_line() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.commit_client_stock_after_invoice_line() to postgres;

alter function private.commit_invoice_stock(p_boutique_id text, p_invoice_id text, p_committed_at timestamp with time zone, p_user uuid, p_mark_delivery boolean) reset all;
alter function private.commit_invoice_stock(p_boutique_id text, p_invoice_id text, p_committed_at timestamp with time zone, p_user uuid, p_mark_delivery boolean) set search_path to pg_catalog, public, private;
revoke all on function private.commit_invoice_stock(p_boutique_id text, p_invoice_id text, p_committed_at timestamp with time zone, p_user uuid, p_mark_delivery boolean) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.commit_invoice_stock(p_boutique_id text, p_invoice_id text, p_committed_at timestamp with time zone, p_user uuid, p_mark_delivery boolean) to postgres;

alter function private.commit_pos_stock_after_invoice_line() reset all;
alter function private.commit_pos_stock_after_invoice_line() set search_path to pg_catalog, public, private;
revoke all on function private.commit_pos_stock_after_invoice_line() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.commit_pos_stock_after_invoice_line() to postgres;

alter function private.confirm_password_changed_from_auth() reset all;
alter function private.confirm_password_changed_from_auth() set search_path to '';
revoke all on function private.confirm_password_changed_from_auth() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.confirm_password_changed_from_auth() to postgres;

alter function private.create_boutique(p_id text, p_nom text, p_ville text, p_adresse text, p_tel text, p_email text, p_logo_url text, p_devise text) reset all;
alter function private.create_boutique(p_id text, p_nom text, p_ville text, p_adresse text, p_tel text, p_email text, p_logo_url text, p_devise text) set search_path to pg_catalog, public;
revoke all on function private.create_boutique(p_id text, p_nom text, p_ville text, p_adresse text, p_tel text, p_email text, p_logo_url text, p_devise text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.create_boutique(p_id text, p_nom text, p_ville text, p_adresse text, p_tel text, p_email text, p_logo_url text, p_devise text) to postgres;
grant execute on function private.create_boutique(p_id text, p_nom text, p_ville text, p_adresse text, p_tel text, p_email text, p_logo_url text, p_devise text) to service_role;

alter function private.default_transfer_permission() reset all;
alter function private.default_transfer_permission() set search_path to '';
revoke all on function private.default_transfer_permission() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.default_transfer_permission() to PUBLIC;
grant execute on function private.default_transfer_permission() to postgres;

alter function private.dispatch_notification_push() reset all;
alter function private.dispatch_notification_push() set search_path to '';
revoke all on function private.dispatch_notification_push() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.dispatch_notification_push() to postgres;

alter function private.emit_audit_notification() reset all;
alter function private.emit_audit_notification() set search_path to '';
revoke all on function private.emit_audit_notification() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_audit_notification() to postgres;

alter function private.emit_boutique_row_sync() reset all;
alter function private.emit_boutique_row_sync() set search_path to '';
revoke all on function private.emit_boutique_row_sync() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_boutique_row_sync() to postgres;

alter function private.emit_boutique_sync_event(p_boutique_id text, p_domain text, p_entity_type text, p_entity_id text, p_record_id text, p_operation text) reset all;
alter function private.emit_boutique_sync_event(p_boutique_id text, p_domain text, p_entity_type text, p_entity_id text, p_record_id text, p_operation text) set search_path to '';
revoke all on function private.emit_boutique_sync_event(p_boutique_id text, p_domain text, p_entity_type text, p_entity_id text, p_record_id text, p_operation text) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_boutique_sync_event(p_boutique_id text, p_domain text, p_entity_type text, p_entity_id text, p_record_id text, p_operation text) to postgres;

alter function private.emit_caisse_closed_notification() reset all;
alter function private.emit_caisse_closed_notification() set search_path to '';
revoke all on function private.emit_caisse_closed_notification() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_caisse_closed_notification() to postgres;

alter function private.emit_charge_created_notification() reset all;
alter function private.emit_charge_created_notification() set search_path to '';
revoke all on function private.emit_charge_created_notification() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_charge_created_notification() to postgres;

alter function private.emit_important_notification(p_boutique_id text, p_category text, p_title text, p_body text, p_icon text, p_action_tab text, p_action_filter jsonb, p_source_event_key text, p_allow_push boolean) reset all;
alter function private.emit_important_notification(p_boutique_id text, p_category text, p_title text, p_body text, p_icon text, p_action_tab text, p_action_filter jsonb, p_source_event_key text, p_allow_push boolean) set search_path to '';
revoke all on function private.emit_important_notification(p_boutique_id text, p_category text, p_title text, p_body text, p_icon text, p_action_tab text, p_action_filter jsonb, p_source_event_key text, p_allow_push boolean) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_important_notification(p_boutique_id text, p_category text, p_title text, p_body text, p_icon text, p_action_tab text, p_action_filter jsonb, p_source_event_key text, p_allow_push boolean) to postgres;

alter function private.emit_invoice_return_notification() reset all;
alter function private.emit_invoice_return_notification() set search_path to '';
revoke all on function private.emit_invoice_return_notification() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_invoice_return_notification() to postgres;

alter function private.emit_invoice_sale_notification() reset all;
alter function private.emit_invoice_sale_notification() set search_path to '';
revoke all on function private.emit_invoice_sale_notification() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_invoice_sale_notification() to postgres;

alter function private.emit_low_stock_notification() reset all;
alter function private.emit_low_stock_notification() set search_path to '';
revoke all on function private.emit_low_stock_notification() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_low_stock_notification() to postgres;

alter function private.emit_payment_due_notifications() reset all;
alter function private.emit_payment_due_notifications() set search_path to '';
revoke all on function private.emit_payment_due_notifications() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_payment_due_notifications() to postgres;

alter function private.emit_stock_transfer_notification() reset all;
alter function private.emit_stock_transfer_notification() set search_path to '';
revoke all on function private.emit_stock_transfer_notification() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_stock_transfer_notification() to PUBLIC;
grant execute on function private.emit_stock_transfer_notification() to postgres;

alter function private.emit_stock_transfer_sync() reset all;
alter function private.emit_stock_transfer_sync() set search_path to '';
revoke all on function private.emit_stock_transfer_sync() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_stock_transfer_sync() to postgres;

alter function private.emit_transfer_notification(p_boutique_id text, p_title text, p_body text, p_event_key text, p_transfer_id uuid) reset all;
alter function private.emit_transfer_notification(p_boutique_id text, p_title text, p_body text, p_event_key text, p_transfer_id uuid) set search_path to '';
revoke all on function private.emit_transfer_notification(p_boutique_id text, p_title text, p_body text, p_event_key text, p_transfer_id uuid) from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.emit_transfer_notification(p_boutique_id text, p_title text, p_body text, p_event_key text, p_transfer_id uuid) to PUBLIC;
grant execute on function private.emit_transfer_notification(p_boutique_id text, p_title text, p_body text, p_event_key text, p_transfer_id uuid) to postgres;

alter function private.enforce_active_product_on_sale_line() reset all;
alter function private.enforce_active_product_on_sale_line() set search_path to pg_catalog, public, private;
revoke all on function private.enforce_active_product_on_sale_line() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_active_product_on_sale_line() to PUBLIC;
grant execute on function private.enforce_active_product_on_sale_line() to postgres;

alter function private.enforce_client_credit_refund_disbursement() reset all;
alter function private.enforce_client_credit_refund_disbursement() set search_path to pg_catalog, public, private;
revoke all on function private.enforce_client_credit_refund_disbursement() from PUBLIC, anon, authenticated, service_role, postgres;
grant execute on function private.enforce_client_credit_refund_disbursement() to postgres;
