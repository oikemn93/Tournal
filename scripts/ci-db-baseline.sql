\set ON_ERROR_STOP on

create schema if not exists private;

create table public.boutiques(
  id text primary key,
  nom text not null,
  ville text,
  tel text,
  directory_visible boolean not null default true
);
create table public.platform_users(
  id uuid primary key,
  phone text not null unique,
  nom text not null,
  initials text not null,
  is_super_admin boolean not null default false,
  is_suspended boolean not null default false,
  must_change_password boolean not null default false
);
create table public.boutique_assignments(
  id bigint primary key,
  boutique_id text not null references public.boutiques(id),
  user_id uuid not null references public.platform_users(id),
  role text not null,
  droits jsonb not null default '{}'::jsonb,
  unique(boutique_id,user_id)
);
create table private.app_sessions(
  user_id uuid not null,
  boutique_id text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  session_id uuid primary key,
  locked_at timestamptz
);
create table public.clients(
  id bigint primary key,
  boutique_id text not null,
  nom text not null,
  type text not null default 'B2C',
  total numeric not null default 0
);
create table public.products(
  id bigint primary key,
  boutique_id text not null,
  nom text not null default 'Product',
  stock numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  prix_achat numeric,
  actif boolean not null default true
);
create table public.invoices(
  id text primary key,
  boutique_id text not null,
  client_id bigint,
  montant numeric not null default 0,
  invoice_date timestamptz not null default now(),
  status text not null default 'payée',
  type text not null default 'Vente',
  return_of_invoice_id text
);
create table public.invoice_lines(
  id bigint primary key,
  boutique_id text not null,
  invoice_id text not null,
  product_id bigint,
  nom text not null default 'Product',
  qty numeric not null default 1,
  sell_qty numeric,
  prix_unit numeric not null default 0,
  prix_achat numeric
);
create table public.invoice_payments(
  id bigint primary key,
  boutique_id text not null,
  invoice_id text not null,
  amount numeric not null,
  paid_at timestamptz not null default now()
);
create table public.stock_entries(
  id bigint primary key,
  boutique_id text not null,
  product_id bigint,
  qty numeric not null,
  entry_date timestamptz not null default now(),
  source_invoice_line_id bigint,
  return_invoice_line_id bigint,
  type text,
  prix_unit numeric
);
create table public.charges(
  id bigint primary key,
  boutique_id text not null,
  label text not null,
  montant numeric not null,
  categorie text,
  charge_date timestamptz not null default now(),
  operator_id uuid,
  status text not null default 'paid',
  paid_amount numeric not null default 0,
  source text not null default 'manual'
);
create table public.client_credit_refunds(
  id bigint primary key,
  boutique_id text not null,
  client_id bigint not null,
  amount numeric not null,
  payment_method text not null,
  refunded_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  operator_id uuid not null,
  operator_name text not null,
  idempotency_key uuid not null,
  note text
);
create table public.stock_transfers(
  id uuid primary key default gen_random_uuid(),
  from_boutique_id text not null,
  to_boutique_id text not null
);
create table public.boutique_partners(
  boutique_id text not null,
  partner_boutique_id text not null,
  primary key(boutique_id,partner_boutique_id)
);
create table public.inventory_sessions(
  id uuid primary key,
  boutique_id text not null,
  scope_type text,
  scope_id text,
  scope_label text,
  status text,
  operator_id uuid,
  started_at timestamptz not null default now(),
  as_of_at timestamptz,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  total_theoretical_cost numeric,
  total_counted_cost numeric,
  total_theoretical_sales numeric,
  total_counted_sales numeric,
  total_potential_margin numeric,
  total_variance_cost numeric,
  total_variance_sales numeric
);
create table public.inventory_lines(
  session_id uuid not null,
  product_id bigint not null,
  product_name text,
  category_name text,
  unit text,
  theoretical_qty numeric,
  final_theoretical_qty numeric,
  counted_qty numeric,
  difference_qty numeric,
  purchase_price numeric,
  sale_price numeric,
  fifo_theoretical_cost numeric,
  fifo_counted_cost numeric,
  fifo_unit_cost numeric,
  pieces_per_lot numeric,
  length_per_piece numeric,
  counting_detail jsonb,
  stock_entry_id bigint,
  primary key(session_id,product_id)
);

create or replace function private.auth_is_super_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.platform_users u where u.id=auth.uid() and u.is_super_admin and not u.is_suspended);
$$;
create or replace function private.auth_is_active_user()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.platform_users u where u.id=auth.uid() and not u.is_suspended and not u.must_change_password
  );
$$;
create or replace function private.auth_has_active_app_session(p_boutique_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from private.app_sessions s
    where s.user_id=auth.uid() and s.boutique_id=p_boutique_id
      and s.session_id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.locked_at is null and s.expires_at>now()
  );
$$;
create or replace function private.auth_has_permission(p_boutique_id text,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.auth_is_super_admin() or (
    private.auth_is_active_user()
    and private.auth_has_active_app_session(p_boutique_id)
    and exists(select 1 from public.boutique_assignments ba where ba.boutique_id=p_boutique_id and ba.user_id=auth.uid() and (ba.role='owner' or coalesce((ba.droits->>p_permission)::boolean,false)))
  );
$$;
create or replace function private.auth_has_read_permission(p_boutique_id text,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.auth_is_super_admin() or (
    private.auth_is_active_user()
    and exists(select 1 from public.boutique_assignments ba where ba.boutique_id=p_boutique_id and ba.user_id=auth.uid() and (ba.role='owner' or coalesce((ba.droits->>p_permission)::boolean,false)))
  );
$$;
create or replace function private.fifo_outflow_cost(p_boutique_id text,p_product_id bigint,p_stock_entry_id bigint)
returns numeric language sql stable as $$ select 0::numeric $$;

create or replace function private.guard_charge_disbursement()
returns trigger language plpgsql security definer set search_path='pg_catalog','public','private' as $$
declare v_cash_out numeric:=0;
begin
  if tg_op='INSERT' then
    v_cash_out:=case when new.status='paid' then greatest(coalesce(new.paid_amount,new.montant,0),coalesce(new.montant,0)) else greatest(coalesce(new.paid_amount,0),0) end;
  else
    v_cash_out:=greatest(coalesce(new.paid_amount,0)-coalesce(old.paid_amount,0),0);
  end if;
  if v_cash_out>0 and not private.auth_has_permission(new.boutique_id,'decaissement') then raise exception 'forbidden'; end if;
  return new;
end $$;
create trigger charges_require_disbursement before insert or update on public.charges for each row execute function private.guard_charge_disbursement();

create or replace function private.enforce_charge_disbursement()
returns trigger language plpgsql as $$ begin return new; end $$;
create trigger trg_enforce_charge_disbursement before insert or update on public.charges for each row execute function private.enforce_charge_disbursement();
create or replace function private.guard_supplier_payment_disbursement()
returns trigger language plpgsql as $$ begin return new; end $$;
create trigger trg_guard_supplier_payment_disbursement before insert or update on public.charges for each row execute function private.guard_supplier_payment_disbursement();

create or replace function private.enforce_client_credit_refund_disbursement()
returns trigger language plpgsql security definer set search_path='pg_catalog','public','private' as $$
begin
  if not private.auth_has_permission(new.boutique_id,'remboursement') or not private.auth_has_permission(new.boutique_id,'decaissement') then raise exception 'forbidden'; end if;
  return new;
end $$;
create trigger trg_client_credit_refund_disbursement before insert on public.client_credit_refunds for each row execute function private.enforce_client_credit_refund_disbursement();
create or replace function private.guard_client_credit_refund_disbursement()
returns trigger language plpgsql as $$ begin return new; end $$;
create trigger client_credit_refunds_require_disbursement before insert on public.client_credit_refunds for each row execute function private.guard_client_credit_refund_disbursement();

create or replace function public.start_inventory_session(p_boutique_id text,p_scope_type text,p_scope_id text default null,p_as_of_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private' as $$
begin
  if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  return '{}'::jsonb;
end $$;

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.auth_has_permission(text,text) to authenticated;
grant execute on function private.auth_has_read_permission(text,text) to authenticated;
grant execute on function public.start_inventory_session(text,text,text,timestamptz) to authenticated;
