-- Per-boutique notification preferences, with independent in-app and Push channels.

create table if not exists public.notification_preferences (
  boutique_id text not null references public.boutiques(id) on delete cascade,
  category text not null check (category in ('sale','payment','refund','stock','transfer','charge','client','supplier','security','caisse','general')),
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  updated_by uuid references public.platform_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (boutique_id, category)
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;
grant select on public.notification_preferences to authenticated;

create policy notification_preferences_read
on public.notification_preferences
for select
to authenticated
using (
  private.auth_is_super_admin()
  or (
    private.auth_is_active_user()
    and exists (
      select 1 from public.boutique_assignments ba
      where ba.boutique_id = notification_preferences.boutique_id
        and ba.user_id = auth.uid()
    )
  )
);

alter table public.notifications
  add column if not exists in_app_enabled boolean not null default true,
  add column if not exists push_enabled boolean not null default true;

create or replace function private.notification_channel_enabled(p_boutique_id text, p_category text, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_channel
    when 'push' then coalesce((
      select np.push_enabled
      from public.notification_preferences np
      where np.boutique_id = p_boutique_id and np.category = p_category
    ), true)
    else coalesce((
      select np.in_app_enabled
      from public.notification_preferences np
      where np.boutique_id = p_boutique_id and np.category = p_category
    ), true)
  end;
$$;
revoke all on function private.notification_channel_enabled(text,text,text) from public, anon, authenticated;

create or replace function public.set_notification_preference(
  p_boutique_id text,
  p_category text,
  p_in_app_enabled boolean,
  p_push_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_category not in ('sale','payment','refund','stock','transfer','charge','client','supplier','security','caisse','general') then
    raise exception 'Catégorie de notification invalide';
  end if;
  if not private.auth_is_owner_of(p_boutique_id) then
    raise exception 'Réservé au propriétaire de la boutique';
  end if;

  insert into public.notification_preferences(boutique_id,category,in_app_enabled,push_enabled,updated_by,updated_at)
  values(p_boutique_id,p_category,coalesce(p_in_app_enabled,true),coalesce(p_push_enabled,true),auth.uid(),now())
  on conflict (boutique_id,category) do update set
    in_app_enabled=excluded.in_app_enabled,
    push_enabled=excluded.push_enabled,
    updated_by=excluded.updated_by,
    updated_at=now();
end;
$$;
revoke all on function public.set_notification_preference(text,text,boolean,boolean) from public, anon;
grant execute on function public.set_notification_preference(text,text,boolean,boolean) to authenticated;

create or replace function private.emit_audit_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_in_app boolean;
  v_push boolean;
begin
  v_category := private.notification_category(new.action);
  v_in_app := private.notification_channel_enabled(new.boutique_id,v_category,'in_app');
  v_push := private.notification_channel_enabled(new.boutique_id,v_category,'push');
  if not v_in_app and not v_push then return new; end if;

  insert into public.notifications(user_id,boutique_id,category,title,body,icon,action_tab,source_audit_id,in_app_enabled,push_enabled)
  select r.user_id,new.boutique_id,v_category,new.action,coalesce(new.detail,''),coalesce(nullif(new.icon,''),'🔔'),private.notification_tab(v_category),new.id,v_in_app,v_push
  from (
    select distinct a.user_id
    from public.boutique_assignments a
    join public.platform_users u on u.id=a.user_id and not coalesce(u.is_suspended,false)
    where a.boutique_id=new.boutique_id
      and (
        a.role='owner'
        or v_category='general'
        or (v_category='sale' and (coalesce((a.droits->>'factures')::boolean,false) or coalesce((a.droits->>'vente')::boolean,false)))
        or (v_category='payment' and (coalesce((a.droits->>'factures')::boolean,false) or coalesce((a.droits->>'encaissement_vente')::boolean,false)))
        or (v_category='refund' and (coalesce((a.droits->>'factures')::boolean,false) or coalesce((a.droits->>'remboursement')::boolean,false)))
        or (v_category in ('stock','transfer') and (coalesce((a.droits->>'stock')::boolean,false) or coalesce((a.droits->>'inventaire')::boolean,false)))
        or (v_category='charge' and coalesce((a.droits->>'charges')::boolean,false))
        or (v_category='client' and coalesce((a.droits->>'clients')::boolean,false))
        or (v_category='supplier' and coalesce((a.droits->>'fournisseurs')::boolean,false))
        or (v_category='caisse' and (coalesce((a.droits->>'vente')::boolean,false) or coalesce((a.droits->>'encaissement_vente')::boolean,false)))
        or v_category='security'
      )
    union
    select u.id from public.platform_users u
    where u.is_super_admin=true and not coalesce(u.is_suspended,false)
  ) r
  on conflict (source_audit_id,user_id) do nothing;
  return new;
end;
$$;

create or replace function private.emit_invoice_sale_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_in_app boolean;
  v_push boolean;
begin
  if new.type is distinct from 'vente' then return new; end if;
  v_in_app := private.notification_channel_enabled(new.boutique_id,'sale','in_app');
  v_push := private.notification_channel_enabled(new.boutique_id,'sale','push');
  if not v_in_app and not v_push then return new; end if;

  v_title := case when new.status='payée' then 'Vente encaissée' else 'Nouvelle vente' end;
  v_body := 'Facture ' || new.id || ' · ' || trim(to_char(coalesce(new.montant,0),'FM999G999G999G990D00')) || ' F';
  if nullif(trim(coalesce(new.client_nom,'')),'') is not null then v_body := v_body || ' · ' || trim(new.client_nom); end if;

  insert into public.notifications(user_id,boutique_id,category,title,body,icon,action_tab,action_filter,source_invoice_id,in_app_enabled,push_enabled)
  select r.user_id,new.boutique_id,'sale',v_title,v_body,'🧾','factures',jsonb_build_object('invoiceId',new.id),new.id,v_in_app,v_push
  from (
    select distinct a.user_id
    from public.boutique_assignments a
    join public.platform_users u on u.id=a.user_id and not coalesce(u.is_suspended,false)
    where a.boutique_id=new.boutique_id
      and (a.role='owner' or coalesce((a.droits->>'factures')::boolean,false) or coalesce((a.droits->>'vente')::boolean,false))
    union
    select u.id from public.platform_users u
    where u.is_super_admin=true and not coalesce(u.is_suspended,false)
  ) r
  on conflict do nothing;
  return new;
end;
$$;

create or replace function private.emit_low_stock_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_app boolean;
  v_push boolean;
begin
  if new.low_stock_threshold is not null
     and new.low_stock_threshold>0
     and new.stock<=new.low_stock_threshold
     and (old.stock>old.low_stock_threshold or old.low_stock_threshold is null or old.low_stock_threshold<=0) then
    v_in_app := private.notification_channel_enabled(new.boutique_id,'stock','in_app');
    v_push := private.notification_channel_enabled(new.boutique_id,'stock','push');
    if v_in_app or v_push then
      insert into public.notifications(user_id,boutique_id,category,title,body,icon,action_tab,in_app_enabled,push_enabled)
      select distinct a.user_id,new.boutique_id,'stock','Stock faible',new.nom||' : '||new.stock||' '||coalesce(new.unit,''),'⚠️','stock',v_in_app,v_push
      from public.boutique_assignments a
      join public.platform_users u on u.id=a.user_id and not coalesce(u.is_suspended,false)
      where a.boutique_id=new.boutique_id
        and (a.role='owner' or coalesce((a.droits->>'stock')::boolean,false) or coalesce((a.droits->>'inventaire')::boolean,false));
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_secret text;
begin
  if not new.push_enabled then return new; end if;
  if not exists(
    select 1 from public.push_subscriptions s
    where s.user_id=new.user_id and s.enabled=true
  ) then return new; end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='tournal_push_dispatch_secret'
  limit 1;
  if v_secret is null then return new; end if;

  begin
    perform net.http_post(
      url:='https://cnxtylngddwmhugxkzju.supabase.co/functions/v1/web-push-dispatch',
      headers:=jsonb_build_object('Content-Type','application/json','x-tournal-push-secret',v_secret),
      body:=jsonb_build_object('notificationId',new.id),
      timeout_milliseconds:=5000
    );
  exception when others then null;
  end;
  return new;
end;
$$;
