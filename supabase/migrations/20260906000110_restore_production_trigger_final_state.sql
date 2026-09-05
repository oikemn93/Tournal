-- AUDIT ONLY: restore current production trigger final state.
-- No production data is touched.

drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

drop trigger if exists trg_auth_settings_updated_at on public.auth_settings;
CREATE TRIGGER trg_auth_settings_updated_at BEFORE UPDATE ON auth_settings FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_ba_updated_at on public.boutique_assignments;
CREATE TRIGGER trg_ba_updated_at BEFORE UPDATE ON boutique_assignments FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_sync_owner on public.boutique_assignments;
CREATE TRIGGER trg_sync_owner AFTER INSERT OR DELETE OR UPDATE ON boutique_assignments FOR EACH ROW EXECUTE FUNCTION private._sync_boutique_owner();

drop trigger if exists trg_boutique_state_metadata on public.boutique_state;
CREATE TRIGGER trg_boutique_state_metadata BEFORE INSERT OR UPDATE ON boutique_state FOR EACH ROW EXECUTE FUNCTION private.set_boutique_state_metadata();

drop trigger if exists trg_boutiques_updated_at on public.boutiques;
CREATE TRIGGER trg_boutiques_updated_at BEFORE UPDATE ON boutiques FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_caisse_updated_at on public.caisse_sessions;
CREATE TRIGGER trg_caisse_updated_at BEFORE UPDATE ON caisse_sessions FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_charges_updated_at on public.charges;
CREATE TRIGGER trg_charges_updated_at BEFORE UPDATE ON charges FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_clients_updated_at on public.clients;
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists invoices_emit_sale_notification on public.invoices;
CREATE TRIGGER invoices_emit_sale_notification AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION private.emit_invoice_sale_notification();

drop trigger if exists trg_invoice_client_total on public.invoices;
CREATE TRIGGER trg_invoice_client_total AFTER INSERT OR DELETE OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION private._update_client_total();

drop trigger if exists trg_invoices_updated_at on public.invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_snapshot_invoice_identity on public.invoices;
CREATE TRIGGER trg_snapshot_invoice_identity BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION snapshot_invoice_identity();

drop trigger if exists trg_pu_updated_at on public.platform_users;
CREATE TRIGGER trg_pu_updated_at BEFORE UPDATE ON platform_users FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_guard_direct_product_stock_update on public.products;
CREATE TRIGGER trg_guard_direct_product_stock_update BEFORE UPDATE OF stock ON products FOR EACH ROW EXECUTE FUNCTION private.guard_direct_product_stock_update();

drop trigger if exists trg_products_updated_at on public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION private._set_updated_at();
