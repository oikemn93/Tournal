-- AUDIT ONLY: restore exact current production triggers after column typmod changes.

drop trigger if exists caisse_sessions_emit_closed_notification on public.caisse_sessions;
CREATE TRIGGER caisse_sessions_emit_closed_notification AFTER UPDATE OF closed_at ON caisse_sessions FOR EACH ROW EXECUTE FUNCTION private.emit_caisse_closed_notification();

drop trigger if exists tournal_sync_caisse_sessions on public.caisse_sessions;
CREATE TRIGGER tournal_sync_caisse_sessions AFTER INSERT OR DELETE OR UPDATE ON caisse_sessions FOR EACH ROW EXECUTE FUNCTION private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'caisse', 'caisse_session');

drop trigger if exists trg_caisse_updated_at on public.caisse_sessions;
CREATE TRIGGER trg_caisse_updated_at BEFORE UPDATE ON caisse_sessions FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists charges_emit_created_notification on public.charges;
CREATE TRIGGER charges_emit_created_notification AFTER INSERT ON charges FOR EACH ROW EXECUTE FUNCTION private.emit_charge_created_notification();

drop trigger if exists charges_require_disbursement on public.charges;
CREATE TRIGGER charges_require_disbursement BEFORE INSERT OR UPDATE OF paid_amount, status, montant ON charges FOR EACH ROW EXECUTE FUNCTION private.guard_charge_disbursement();

drop trigger if exists tournal_sync_charges on public.charges;
CREATE TRIGGER tournal_sync_charges AFTER INSERT OR DELETE OR UPDATE ON charges FOR EACH ROW EXECUTE FUNCTION private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'charges', 'charge');

drop trigger if exists trg_charges_updated_at on public.charges;
CREATE TRIGGER trg_charges_updated_at BEFORE UPDATE ON charges FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists client_credit_refunds_daily_caisse on public.client_credit_refunds;
CREATE TRIGGER client_credit_refunds_daily_caisse BEFORE INSERT ON client_credit_refunds FOR EACH ROW EXECUTE FUNCTION private.enforce_daily_caisse_on_receipt();

drop trigger if exists trg_client_credit_refund_disbursement on public.client_credit_refunds;
CREATE TRIGGER trg_client_credit_refund_disbursement BEFORE INSERT OR UPDATE OF amount ON client_credit_refunds FOR EACH ROW EXECUTE FUNCTION private.enforce_client_credit_refund_disbursement();

drop trigger if exists trg_client_credit_refund_immutable on public.client_credit_refunds;
CREATE TRIGGER trg_client_credit_refund_immutable BEFORE DELETE OR UPDATE ON client_credit_refunds FOR EACH ROW EXECUTE FUNCTION private.guard_client_credit_refund_immutability();

drop trigger if exists tournal_sync_clients on public.clients;
CREATE TRIGGER tournal_sync_clients AFTER INSERT OR DELETE OR UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'clients', 'client');

drop trigger if exists trg_clients_updated_at on public.clients;
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists invoice_lines_guard_return_provenance on public.invoice_lines;
CREATE TRIGGER invoice_lines_guard_return_provenance BEFORE INSERT OR UPDATE OF boutique_id, invoice_id, source_invoice_line_id, product_id, nom, qty, unit, prix_unit, sell_unit, sell_qty ON invoice_lines FOR EACH ROW EXECUTE FUNCTION private.guard_return_line_provenance();

drop trigger if exists tournal_sync_invoice_lines on public.invoice_lines;
CREATE TRIGGER tournal_sync_invoice_lines AFTER INSERT OR DELETE OR UPDATE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION private.emit_boutique_row_sync('boutique_id', 'invoice_id', 'invoice_id', 'id', 'sales', 'invoice_line');

drop trigger if exists trg_commit_client_stock_after_invoice_line on public.invoice_lines;
CREATE CONSTRAINT TRIGGER trg_commit_client_stock_after_invoice_line AFTER INSERT ON invoice_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.commit_client_stock_after_invoice_line();

drop trigger if exists trg_enforce_return_line_provenance on public.invoice_lines;
CREATE TRIGGER trg_enforce_return_line_provenance BEFORE INSERT OR UPDATE OF qty, product_id, source_invoice_line_id ON invoice_lines FOR EACH ROW EXECUTE FUNCTION enforce_return_line_provenance();

drop trigger if exists trg_invoice_lines_active_product on public.invoice_lines;
CREATE TRIGGER trg_invoice_lines_active_product BEFORE INSERT ON invoice_lines FOR EACH ROW EXECUTE FUNCTION private.enforce_active_product_on_sale_line();

drop trigger if exists trg_protect_source_sale_line_after_return on public.invoice_lines;
CREATE TRIGGER trg_protect_source_sale_line_after_return BEFORE DELETE OR UPDATE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION private.protect_source_sale_line_after_return();

drop trigger if exists trg_return_line_immutable on public.invoice_lines;
CREATE TRIGGER trg_return_line_immutable BEFORE DELETE OR UPDATE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION private.guard_return_line_immutability();

drop trigger if exists invoices_emit_return_notification on public.invoices;
CREATE TRIGGER invoices_emit_return_notification AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION private.emit_invoice_return_notification();

drop trigger if exists invoices_emit_sale_notification on public.invoices;
CREATE TRIGGER invoices_emit_sale_notification AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION private.emit_invoice_sale_notification();

drop trigger if exists tournal_sync_invoices on public.invoices;
CREATE TRIGGER tournal_sync_invoices AFTER INSERT OR DELETE OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'sales', 'invoice');

drop trigger if exists trg_enforce_return_invoice_disbursement on public.invoices;
CREATE TRIGGER trg_enforce_return_invoice_disbursement BEFORE INSERT OR UPDATE OF return_refund_amount ON invoices FOR EACH ROW EXECUTE FUNCTION enforce_return_invoice_disbursement();

drop trigger if exists trg_enforce_sale_stock_lifecycle on public.invoices;
CREATE CONSTRAINT TRIGGER trg_enforce_sale_stock_lifecycle AFTER INSERT OR UPDATE ON invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.enforce_sale_stock_lifecycle();

drop trigger if exists trg_guard_future_return_invoice_integrity on public.invoices;
CREATE TRIGGER trg_guard_future_return_invoice_integrity BEFORE INSERT OR UPDATE OF boutique_id, type, return_of_invoice_id, client_id, montant, return_refund_amount, return_receivable_reduction, return_credit_restore ON invoices FOR EACH ROW EXECUTE FUNCTION private.guard_future_return_invoice_integrity();

drop trigger if exists trg_invoice_client_total on public.invoices;
CREATE TRIGGER trg_invoice_client_total AFTER INSERT OR DELETE OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION private._update_client_total();

drop trigger if exists trg_invoices_updated_at on public.invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_new_return_line_totals on public.invoices;
CREATE CONSTRAINT TRIGGER trg_new_return_line_totals AFTER INSERT ON invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.guard_new_return_line_totals();

drop trigger if exists trg_ops_onboarding_sale on public.invoices;
CREATE TRIGGER trg_ops_onboarding_sale AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION private.mark_ops_onboarding_sale();

drop trigger if exists trg_protect_source_sale_after_return on public.invoices;
CREATE TRIGGER trg_protect_source_sale_after_return BEFORE DELETE OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION private.protect_source_sale_after_return();

drop trigger if exists trg_return_invoice_immutable on public.invoices;
CREATE TRIGGER trg_return_invoice_immutable BEFORE DELETE OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION private.guard_return_invoice_immutability();

drop trigger if exists trg_snapshot_invoice_identity on public.invoices;
CREATE TRIGGER trg_snapshot_invoice_identity BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION snapshot_invoice_identity();

drop trigger if exists trg_sync_source_invoice_return_status on public.invoices;
CREATE TRIGGER trg_sync_source_invoice_return_status AFTER INSERT OR UPDATE OF return_receivable_reduction ON invoices FOR EACH ROW WHEN (lower(TRIM(BOTH FROM COALESCE(new.type, ''::text))) = 'retour'::text AND new.return_of_invoice_id IS NOT NULL) EXECUTE FUNCTION private.sync_source_invoice_return_status();

drop trigger if exists products_low_stock_notification on public.products;
CREATE TRIGGER products_low_stock_notification AFTER UPDATE OF stock, low_stock_threshold ON products FOR EACH ROW EXECUTE FUNCTION private.emit_low_stock_notification();

drop trigger if exists tournal_sync_products on public.products;
CREATE TRIGGER tournal_sync_products AFTER INSERT OR DELETE OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'catalogue', 'product');

drop trigger if exists trg_guard_direct_product_stock_update on public.products;
CREATE TRIGGER trg_guard_direct_product_stock_update BEFORE UPDATE OF stock ON products FOR EACH ROW EXECUTE FUNCTION private.guard_direct_product_stock_update();

drop trigger if exists trg_ops_onboarding_product on public.products;
CREATE TRIGGER trg_ops_onboarding_product AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION private.mark_ops_onboarding_catalogue();

drop trigger if exists trg_products_updated_at on public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists tournal_sync_stock_entries on public.stock_entries;
CREATE TRIGGER tournal_sync_stock_entries AFTER INSERT OR DELETE OR UPDATE ON stock_entries FOR EACH ROW EXECUTE FUNCTION private.emit_boutique_row_sync('boutique_id', 'product_id', 'product_id', 'id', 'stock', 'stock_entry');

drop trigger if exists trg_guard_return_stock_provenance on public.stock_entries;
CREATE TRIGGER trg_guard_return_stock_provenance BEFORE INSERT OR UPDATE OF boutique_id, product_id, type, qty, source_invoice_id, source_invoice_line_id, return_invoice_id, return_invoice_line_id ON stock_entries FOR EACH ROW EXECUTE FUNCTION private.guard_return_stock_provenance();

drop trigger if exists trg_ops_onboarding_receipt on public.stock_entries;
CREATE TRIGGER trg_ops_onboarding_receipt AFTER INSERT ON stock_entries FOR EACH ROW EXECUTE FUNCTION private.mark_ops_onboarding_receipt();

drop trigger if exists trg_protect_source_sale_stock_after_return on public.stock_entries;
CREATE TRIGGER trg_protect_source_sale_stock_after_return BEFORE DELETE OR UPDATE ON stock_entries FOR EACH ROW EXECUTE FUNCTION private.protect_source_sale_stock_after_return();

drop trigger if exists trg_return_stock_entry_immutable on public.stock_entries;
CREATE TRIGGER trg_return_stock_entry_immutable BEFORE DELETE OR UPDATE ON stock_entries FOR EACH ROW EXECUTE FUNCTION private.guard_return_stock_entry_immutability();
