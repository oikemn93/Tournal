-- ═══════════════════════════════════════════════════════════════════════════
-- SCHÉMA SÉCURISÉ TOURNAL v2 — FINAL
-- À coller en une seule fois dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── NETTOYAGE : suppression des anciennes tables ────────────────────────
-- (CASCADE supprime aussi les policies, triggers et indexes associés)

drop table if exists export_import_log     cascade;
drop table if exists audit_log             cascade;
drop table if exists caisse_sessions       cascade;
drop table if exists charges               cascade;
drop table if exists invoice_lines         cascade;
drop table if exists invoices              cascade;
drop table if exists clients               cascade;
drop table if exists suppliers             cascade;
drop table if exists stock_entries         cascade;
drop table if exists products              cascade;
drop table if exists categories            cascade;
drop table if exists auth_settings         cascade;
drop table if exists boutique_assignments  cascade;
drop table if exists boutiques             cascade;
drop table if exists platform_users        cascade;

drop function if exists _set_updated_at()                          cascade;
drop function if exists auth_is_super_admin()                      cascade;
drop function if exists auth_is_assigned_to(text)                  cascade;
drop function if exists auth_has_write_access(text)                cascade;
drop function if exists auth_is_owner_of(text)                     cascade;
drop function if exists _recalc_client_total(text, bigint)         cascade;
drop function if exists _sync_boutique_owner()                     cascade;
drop function if exists _update_client_total()                     cascade;
drop function if exists create_boutique(text,text,text,text,text,text,text,text) cascade;


-- ─── 0. FONCTIONS UTILITAIRES ────────────────────────────────────────────

create or replace function _set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function auth_is_super_admin()
returns boolean language plpgsql security definer stable as $$
begin
  return coalesce(
    (select is_super_admin from platform_users where id = auth.uid()),
    false
  );
end;
$$;

create or replace function auth_is_assigned_to(p_boutique_id text)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from boutique_assignments
    where boutique_id = p_boutique_id and user_id = auth.uid()
  );
end;
$$;

create or replace function auth_has_write_access(p_boutique_id text)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from boutique_assignments
    where boutique_id = p_boutique_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
  );
end;
$$;

create or replace function auth_is_owner_of(p_boutique_id text)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from boutique_assignments
    where boutique_id = p_boutique_id
      and user_id = auth.uid()
      and role = 'owner'
  );
end;
$$;

create or replace function _recalc_client_total(p_boutique_id text, p_client_id bigint)
returns void language plpgsql security definer as $$
begin
  update clients set
    total = coalesce((
      select sum(montant) from invoices
      where boutique_id = p_boutique_id
        and client_id   = p_client_id
        and status      = 'payée'
    ), 0),
    last_invoice_at = (
      select invoice_date from invoices
      where boutique_id = p_boutique_id
        and client_id   = p_client_id
      order by invoice_date desc nulls last limit 1
    )
  where boutique_id = p_boutique_id and id = p_client_id;
end;
$$;


-- ─── 1. PLATFORM_USERS ───────────────────────────────────────────────────

create table if not exists platform_users (
  id             uuid        primary key references auth.users(id) on delete cascade,
  phone          text        not null unique,
  nom            text        not null,
  initials       text        not null,
  color          text        not null default '#888888',
  is_super_admin boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table platform_users enable row level security;

create policy "pu: select"
  on platform_users for select
  using (auth.uid() = id or auth_is_super_admin());

create policy "pu: insert"
  on platform_users for insert
  with check (auth.uid() = id or auth_is_super_admin());

create policy "pu: update"
  on platform_users for update
  using  (auth.uid() = id or auth_is_super_admin())
  with check (auth.uid() = id or auth_is_super_admin());

create policy "pu: delete"
  on platform_users for delete
  using (auth_is_super_admin());

create trigger trg_pu_updated_at
  before update on platform_users
  for each row execute function _set_updated_at();


-- ─── 2. BOUTIQUES ────────────────────────────────────────────────────────

create table if not exists boutiques (
  id         text        primary key,
  nom        text        not null,
  ville      text,
  adresse    text,
  tel        text,
  email      text,
  logo_url   text,
  devise     text        not null default 'FCFA',
  owner_id   uuid        references platform_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table boutiques enable row level security;

create policy "boutiques: select"
  on boutiques for select
  using (auth_is_assigned_to(id) or auth_is_super_admin());

-- INSERT bloqué en direct : passer par create_boutique() obligatoirement
create policy "boutiques: insert"
  on boutiques for insert
  with check (false);

create policy "boutiques: update"
  on boutiques for update
  using  (auth_is_owner_of(id) or auth_is_super_admin())
  with check (auth_is_owner_of(id) or auth_is_super_admin());

create policy "boutiques: delete"
  on boutiques for delete
  using (auth_is_owner_of(id) or auth_is_super_admin());

create trigger trg_boutiques_updated_at
  before update on boutiques
  for each row execute function _set_updated_at();


-- ─── 3. BOUTIQUE_ASSIGNMENTS ─────────────────────────────────────────────

create table if not exists boutique_assignments (
  id          bigint      generated always as identity primary key,
  boutique_id text        not null references boutiques(id) on delete cascade,
  user_id     uuid        not null references platform_users(id) on delete cascade,
  role        text        not null check (role in ('owner', 'manager', 'employee')),
  droits      jsonb       not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (boutique_id, user_id)
);

-- Un seul owner par boutique
create unique index idx_ba_one_owner
  on boutique_assignments(boutique_id)
  where role = 'owner';

alter table boutique_assignments enable row level security;

create policy "ba: select"
  on boutique_assignments for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "ba: insert"
  on boutique_assignments for insert
  with check (auth_is_owner_of(boutique_id) or auth_is_super_admin());

create policy "ba: update"
  on boutique_assignments for update
  using  (auth_is_owner_of(boutique_id) or auth_is_super_admin())
  with check (auth_is_owner_of(boutique_id) or auth_is_super_admin());

create policy "ba: delete"
  on boutique_assignments for delete
  using (auth_is_owner_of(boutique_id) or auth_is_super_admin());

create trigger trg_ba_updated_at
  before update on boutique_assignments
  for each row execute function _set_updated_at();

-- Synchronise boutiques.owner_id avec l'assignation 'owner'
create or replace function _sync_boutique_owner()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.role = 'owner' then
      update boutiques set owner_id = NEW.user_id where id = NEW.boutique_id;
    end if;

  elsif TG_OP = 'UPDATE' then
    if NEW.role = 'owner' then
      update boutiques set owner_id = NEW.user_id where id = NEW.boutique_id;
    elsif OLD.role = 'owner' and NEW.role <> 'owner' then
      update boutiques set owner_id = (
        select user_id from boutique_assignments
        where boutique_id = NEW.boutique_id and role = 'owner' and user_id <> OLD.user_id
        limit 1
      ) where id = NEW.boutique_id;
    end if;

  elsif TG_OP = 'DELETE' then
    if OLD.role = 'owner' then
      update boutiques set owner_id = null where id = OLD.boutique_id;
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_sync_owner
  after insert or update or delete on boutique_assignments
  for each row execute function _sync_boutique_owner();


-- ─── FONCTION : création atomique boutique + owner ────────────────────────
-- Seul point d'entrée autorisé pour créer une boutique.
-- Bypass RLS via security definer (INSERT boutiques + INSERT assignment en 1 tx).

create or replace function create_boutique(
  p_id       text,
  p_nom      text,
  p_ville    text    default null,
  p_adresse  text    default null,
  p_tel      text    default null,
  p_email    text    default null,
  p_logo_url text    default null,
  p_devise   text    default 'FCFA'
)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if exists (select 1 from boutiques where id = p_id) then
    raise exception 'Boutique % existe déjà', p_id;
  end if;

  insert into boutiques(id, nom, ville, adresse, tel, email, logo_url, devise, owner_id)
  values (p_id, p_nom, p_ville, p_adresse, p_tel, p_email, p_logo_url, p_devise, auth.uid());

  insert into boutique_assignments(boutique_id, user_id, role, droits)
  values (
    p_id, auth.uid(), 'owner',
    '{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,
      "factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true}'::jsonb
  );
end;
$$;

revoke execute on function create_boutique(text,text,text,text,text,text,text,text) from public;
grant  execute on function create_boutique(text,text,text,text,text,text,text,text) to authenticated;


-- ─── 4. AUTH_SETTINGS ────────────────────────────────────────────────────

create table if not exists auth_settings (
  boutique_id     text        primary key references boutiques(id) on delete cascade,
  lock_minutes    int         not null default 5,
  session_minutes int         not null default 480,
  updated_at      timestamptz not null default now()
);

alter table auth_settings enable row level security;

create policy "auth_settings: select"
  on auth_settings for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "auth_settings: insert"
  on auth_settings for insert
  with check (auth_is_owner_of(boutique_id) or auth_is_super_admin());

create policy "auth_settings: update"
  on auth_settings for update
  using  (auth_is_owner_of(boutique_id) or auth_is_super_admin())
  with check (auth_is_owner_of(boutique_id) or auth_is_super_admin());

create policy "auth_settings: delete"
  on auth_settings for delete
  using (auth_is_owner_of(boutique_id) or auth_is_super_admin());

create trigger trg_auth_settings_updated_at
  before update on auth_settings
  for each row execute function _set_updated_at();


-- ─── 5. CATEGORIES ───────────────────────────────────────────────────────

create table if not exists categories (
  id          text        not null,
  boutique_id text        not null references boutiques(id) on delete cascade,
  nom         text        not null,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (boutique_id, id)
);

alter table categories enable row level security;

create policy "categories: select"
  on categories for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "categories: insert"
  on categories for insert
  with check (auth_has_write_access(boutique_id) or auth_is_super_admin());

create policy "categories: update"
  on categories for update
  using  (auth_has_write_access(boutique_id) or auth_is_super_admin())
  with check (auth_has_write_access(boutique_id) or auth_is_super_admin());

create policy "categories: delete"
  on categories for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function _set_updated_at();


-- ─── 6. PRODUCTS ─────────────────────────────────────────────────────────

create table if not exists products (
  id                  bigint        not null,
  boutique_id         text          not null references boutiques(id) on delete cascade,
  nom                 text          not null,
  category_id         text,
  prix_achat          numeric(12,2) not null default 0,
  prix_vente          numeric(12,2) not null default 0,
  stock               numeric(12,3) not null default 0,
  unit                text          not null default 'unité',
  sell_unit           text,
  sell_qty            numeric(12,3),
  low_stock_threshold numeric(12,3),
  barcode             text,
  actif               boolean       not null default true,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  primary key (boutique_id, id),
  foreign key (boutique_id, category_id)
    references categories(boutique_id, id) on delete set null
);

alter table products enable row level security;

create policy "products: select"
  on products for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "products: insert"
  on products for insert
  with check (auth_has_write_access(boutique_id) or auth_is_super_admin());

create policy "products: update"
  on products for update
  using  (auth_has_write_access(boutique_id) or auth_is_super_admin())
  with check (auth_has_write_access(boutique_id) or auth_is_super_admin());

create policy "products: delete"
  on products for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());

create trigger trg_products_updated_at
  before update on products
  for each row execute function _set_updated_at();


-- ─── 7. STOCK_ENTRIES ────────────────────────────────────────────────────

create table if not exists stock_entries (
  id          bigint        not null,
  boutique_id text          not null references boutiques(id) on delete cascade,
  product_id  bigint        not null,
  type        text          not null check (type in ('achat','ajustement','retour','inventaire')),
  qty         numeric(12,3) not null,
  prix_unit   numeric(12,2),
  entry_date  timestamptz   not null default now(),
  operator_id uuid          references platform_users(id) on delete set null,
  note        text,
  created_at  timestamptz   not null default now(),
  primary key (boutique_id, id),
  foreign key (boutique_id, product_id)
    references products(boutique_id, id) on delete cascade
);

alter table stock_entries enable row level security;

create policy "stock_entries: select"
  on stock_entries for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "stock_entries: insert"
  on stock_entries for insert
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "stock_entries: update"
  on stock_entries for update
  using  (auth_has_write_access(boutique_id) or auth_is_super_admin())
  with check (auth_has_write_access(boutique_id) or auth_is_super_admin());

create policy "stock_entries: delete"
  on stock_entries for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());


-- ─── 8. SUPPLIERS ────────────────────────────────────────────────────────

create table if not exists suppliers (
  id               bigint      not null,
  boutique_id      text        not null references boutiques(id) on delete cascade,
  nom              text        not null,
  ville            text,
  tel              text,
  email            text,
  contact          text,
  initials         text,
  color            text,
  last_delivery_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (boutique_id, id)
);

alter table suppliers enable row level security;

create policy "suppliers: select"
  on suppliers for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "suppliers: insert"
  on suppliers for insert
  with check (auth_has_write_access(boutique_id) or auth_is_super_admin());

create policy "suppliers: update"
  on suppliers for update
  using  (auth_has_write_access(boutique_id) or auth_is_super_admin())
  with check (auth_has_write_access(boutique_id) or auth_is_super_admin());

create policy "suppliers: delete"
  on suppliers for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());

create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function _set_updated_at();


-- ─── 9. CLIENTS ──────────────────────────────────────────────────────────

create table if not exists clients (
  id              bigint        not null,
  boutique_id     text          not null references boutiques(id) on delete cascade,
  nom             text          not null,
  type            text          not null default 'B2C' check (type in ('B2B','B2C')),
  tel             text,
  email           text,
  adresse         text,
  ville           text,
  contact         text,
  total           numeric(12,2) not null default 0,
  last_invoice_at timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  primary key (boutique_id, id)
);

alter table clients enable row level security;

create policy "clients: select"
  on clients for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "clients: insert"
  on clients for insert
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "clients: update"
  on clients for update
  using  (auth_is_assigned_to(boutique_id) or auth_is_super_admin())
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "clients: delete"
  on clients for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function _set_updated_at();


-- ─── 10. INVOICES ────────────────────────────────────────────────────────

create table if not exists invoices (
  id             text          not null,
  boutique_id    text          not null references boutiques(id) on delete cascade,
  client_id      bigint,
  client_nom     text,
  client_tel     text,
  montant        numeric(12,2) not null default 0,
  acompte        numeric(12,2) not null default 0,
  invoice_date   timestamptz   not null default now(),
  status         text          not null default 'en_attente'
                   check (status in ('payée','en_attente','annulée','retour')),
  type           text          not null default 'vente'
                   check (type in ('vente','retour','devis','commande')),
  payment_method text,
  operator_id    uuid          references platform_users(id) on delete set null,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  primary key (boutique_id, id),
  foreign key (boutique_id, client_id)
    references clients(boutique_id, id) on delete set null
);

alter table invoices enable row level security;

create policy "invoices: select"
  on invoices for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "invoices: insert"
  on invoices for insert
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "invoices: update"
  on invoices for update
  using  (auth_is_assigned_to(boutique_id) or auth_is_super_admin())
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "invoices: delete"
  on invoices for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());

create trigger trg_invoices_updated_at
  before update on invoices
  for each row execute function _set_updated_at();


-- ─── 11. INVOICE_LINES ───────────────────────────────────────────────────

create table if not exists invoice_lines (
  id          bigint        generated always as identity primary key,
  boutique_id text          not null references boutiques(id) on delete cascade,
  invoice_id  text          not null,
  product_id  bigint,
  nom         text,
  qty         numeric(12,3) not null default 1,
  unit        text,
  prix_unit   numeric(12,2) not null default 0,
  sell_unit   text,
  sell_qty    numeric(12,3),
  created_at  timestamptz   not null default now(),
  foreign key (boutique_id, invoice_id)
    references invoices(boutique_id, id) on delete cascade,
  foreign key (boutique_id, product_id)
    references products(boutique_id, id) on delete set null
);

alter table invoice_lines enable row level security;

create policy "invoice_lines: select"
  on invoice_lines for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "invoice_lines: insert"
  on invoice_lines for insert
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "invoice_lines: update"
  on invoice_lines for update
  using  (auth_is_assigned_to(boutique_id) or auth_is_super_admin())
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "invoice_lines: delete"
  on invoice_lines for delete
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());


-- ─── 12. CHARGES ─────────────────────────────────────────────────────────

create table if not exists charges (
  id           bigint        not null,
  boutique_id  text          not null references boutiques(id) on delete cascade,
  label        text          not null,
  montant      numeric(12,2) not null,
  categorie    text,
  charge_date  timestamptz   not null default now(),
  operator_id  uuid          references platform_users(id) on delete set null,
  note         text,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  primary key (boutique_id, id)
);

alter table charges enable row level security;

create policy "charges: select"
  on charges for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "charges: insert"
  on charges for insert
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "charges: update"
  on charges for update
  using  (auth_is_assigned_to(boutique_id) or auth_is_super_admin())
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "charges: delete"
  on charges for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());

create trigger trg_charges_updated_at
  before update on charges
  for each row execute function _set_updated_at();


-- ─── 13. CAISSE_SESSIONS ─────────────────────────────────────────────────

create table if not exists caisse_sessions (
  id             text          not null,
  boutique_id    text          not null references boutiques(id) on delete cascade,
  opened_at      timestamptz   not null default now(),
  closed_at      timestamptz,
  fond_ouverture numeric(12,2) not null default 0,
  fond_fermeture numeric(12,2),
  total_ventes   numeric(12,2),
  total_charges  numeric(12,2),
  operator_id    uuid          references platform_users(id) on delete set null,
  note           text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  primary key (boutique_id, id)
);

alter table caisse_sessions enable row level security;

create policy "caisse_sessions: select"
  on caisse_sessions for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "caisse_sessions: insert"
  on caisse_sessions for insert
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "caisse_sessions: update"
  on caisse_sessions for update
  using  (auth_is_assigned_to(boutique_id) or auth_is_super_admin())
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "caisse_sessions: delete"
  on caisse_sessions for delete
  using (auth_has_write_access(boutique_id) or auth_is_super_admin());

create trigger trg_caisse_updated_at
  before update on caisse_sessions
  for each row execute function _set_updated_at();


-- ─── 14. AUDIT_LOG ───────────────────────────────────────────────────────
-- Immuable : INSERT uniquement.

create table if not exists audit_log (
  id          bigint      generated always as identity primary key,
  boutique_id text        not null references boutiques(id) on delete cascade,
  user_id     uuid        references platform_users(id) on delete set null,
  action      text        not null,
  detail      text,
  icon        text,
  created_at  timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy "audit_log: select"
  on audit_log for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "audit_log: insert"
  on audit_log for insert
  with check (auth_is_assigned_to(boutique_id) or auth_is_super_admin());


-- ─── 15. EXPORT_IMPORT_LOG ───────────────────────────────────────────────

create table if not exists export_import_log (
  id             bigint      generated always as identity primary key,
  boutique_id    text        not null references boutiques(id) on delete cascade,
  user_id        uuid        references platform_users(id) on delete set null,
  operation      text        not null check (operation in ('export','import')),
  status         text        not null default 'success'
                   check (status in ('success','partial','failed')),
  file_name      text,
  schema_version int         not null,
  manifest       jsonb       not null,
  duration_ms    int,
  error_detail   text,
  created_at     timestamptz not null default now(),
  constraint manifest_required_keys check (
    manifest ? 'schema_version'      and
    manifest ? 'created_at'          and
    manifest ? 'application_version' and
    manifest ? 'boutique_id'         and
    manifest ? 'tables'              and
    manifest ? 'checksum'
  )
);

alter table export_import_log enable row level security;

create policy "eil: select"
  on export_import_log for select
  using (auth_is_assigned_to(boutique_id) or auth_is_super_admin());

create policy "eil: insert"
  on export_import_log for insert
  with check (auth_is_owner_of(boutique_id) or auth_is_super_admin());


-- ─── TRIGGER : _update_client_total ──────────────────────────────────────

create or replace function _update_client_total()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.client_id is not null then
      perform _recalc_client_total(OLD.boutique_id, OLD.client_id);
    end if;
    return OLD;

  elsif TG_OP = 'INSERT' then
    if NEW.client_id is not null then
      perform _recalc_client_total(NEW.boutique_id, NEW.client_id);
    end if;
    return NEW;

  elsif TG_OP = 'UPDATE' then
    if OLD.client_id is distinct from NEW.client_id and OLD.client_id is not null then
      perform _recalc_client_total(OLD.boutique_id, OLD.client_id);
    end if;
    if NEW.client_id is not null then
      perform _recalc_client_total(NEW.boutique_id, NEW.client_id);
    end if;
    return NEW;
  end if;
  return null;
end;
$$;

create or replace trigger trg_invoice_client_total
  after insert or update or delete on invoices
  for each row execute function _update_client_total();


-- ─── INDEXES ─────────────────────────────────────────────────────────────

create index if not exists idx_ba_user          on boutique_assignments(user_id);
create index if not exists idx_ba_boutique      on boutique_assignments(boutique_id);
create index if not exists idx_products_b       on products(boutique_id);
create index if not exists idx_products_cat     on products(boutique_id, category_id);
create index if not exists idx_products_barcode on products(boutique_id, barcode);
create index if not exists idx_stock_bp         on stock_entries(boutique_id, product_id);
create index if not exists idx_stock_date       on stock_entries(boutique_id, entry_date desc);
create index if not exists idx_invoices_b       on invoices(boutique_id);
create index if not exists idx_invoices_date    on invoices(boutique_id, invoice_date desc);
create index if not exists idx_invoices_client  on invoices(boutique_id, client_id);
create index if not exists idx_invlines_bi      on invoice_lines(boutique_id, invoice_id);
create index if not exists idx_charges_date     on charges(boutique_id, charge_date desc);
create index if not exists idx_clients_tel      on clients(boutique_id, tel);
create index if not exists idx_audit_b_date     on audit_log(boutique_id, created_at desc);
create index if not exists idx_eil_b_date       on export_import_log(boutique_id, created_at desc);
