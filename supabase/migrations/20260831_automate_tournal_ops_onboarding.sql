create or replace function private.ensure_ops_onboarding_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.ops_onboarding (boutique_id)
  values (new.id)
  on conflict (boutique_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ops_onboarding_boutique on public.boutiques;
create trigger trg_ops_onboarding_boutique
after insert on public.boutiques
for each row execute function private.ensure_ops_onboarding_row();

create or replace function private.mark_ops_onboarding_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.ops_onboarding (boutique_id, users_ready, owner_ready)
  values (new.boutique_id, true, new.role = 'owner')
  on conflict (boutique_id) do update
    set users_ready = true,
        owner_ready = public.ops_onboarding.owner_ready or excluded.owner_ready,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ops_onboarding_assignment on public.boutique_assignments;
create trigger trg_ops_onboarding_assignment
after insert or update of role on public.boutique_assignments
for each row execute function private.mark_ops_onboarding_user();

create or replace function private.mark_ops_onboarding_catalogue()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.ops_onboarding (boutique_id, catalogue_ready)
  values (new.boutique_id, true)
  on conflict (boutique_id) do update
    set catalogue_ready = true,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ops_onboarding_product on public.products;
create trigger trg_ops_onboarding_product
after insert on public.products
for each row execute function private.mark_ops_onboarding_catalogue();

create or replace function private.mark_ops_onboarding_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.type = 'achat' and new.qty > 0 then
    insert into public.ops_onboarding (boutique_id, first_receipt_at)
    values (new.boutique_id, new.entry_date)
    on conflict (boutique_id) do update
      set first_receipt_at = least(
            coalesce(public.ops_onboarding.first_receipt_at, excluded.first_receipt_at),
            excluded.first_receipt_at
          ),
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ops_onboarding_receipt on public.stock_entries;
create trigger trg_ops_onboarding_receipt
after insert on public.stock_entries
for each row execute function private.mark_ops_onboarding_receipt();

create or replace function private.mark_ops_onboarding_sale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce(new.type, '') not in ('Retour','Transfert interne','B2B Achat') then
    insert into public.ops_onboarding (boutique_id, first_sale_at)
    values (new.boutique_id, new.invoice_date)
    on conflict (boutique_id) do update
      set first_sale_at = least(
            coalesce(public.ops_onboarding.first_sale_at, excluded.first_sale_at),
            excluded.first_sale_at
          ),
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ops_onboarding_sale on public.invoices;
create trigger trg_ops_onboarding_sale
after insert on public.invoices
for each row execute function private.mark_ops_onboarding_sale();

update public.ops_onboarding o
set owner_ready = exists (
      select 1 from public.boutique_assignments a
      where a.boutique_id = o.boutique_id and a.role = 'owner'
    ),
    users_ready = exists (
      select 1 from public.boutique_assignments a
      where a.boutique_id = o.boutique_id
    ),
    catalogue_ready = exists (
      select 1 from public.products p
      where p.boutique_id = o.boutique_id
    ),
    first_receipt_at = coalesce(o.first_receipt_at, (
      select min(s.entry_date) from public.stock_entries s
      where s.boutique_id = o.boutique_id and s.type = 'achat' and s.qty > 0
    )),
    first_sale_at = coalesce(o.first_sale_at, (
      select min(i.invoice_date) from public.invoices i
      where i.boutique_id = o.boutique_id
        and coalesce(i.type,'') not in ('Retour','Transfert interne','B2B Achat')
    )),
    updated_at = now();
