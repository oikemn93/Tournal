create table if not exists private.notification_session_context (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id text not null references public.boutiques(id) on delete cascade,
  updated_at timestamptz not null default now()
);

revoke all on private.notification_session_context from public, anon, authenticated;

create or replace function private.auth_notification_context_matches(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.notification_session_context c
    where c.session_id = nullif(auth.jwt() ->> 'session_id','')::uuid
      and c.user_id = auth.uid()
      and c.boutique_id = p_boutique_id
  );
$$;
revoke all on function private.auth_notification_context_matches(text) from public, anon, authenticated;

insert into private.notification_session_context(session_id,user_id,boutique_id,updated_at)
select distinct on (s.session_id)
  s.session_id,s.user_id,s.boutique_id,coalesce(s.last_seen_at,now())
from private.app_sessions s
where s.session_id is not null and s.expires_at > now()
order by s.session_id,coalesce(s.last_seen_at,s.expires_at) desc
on conflict (session_id) do update
set user_id=excluded.user_id,boutique_id=excluded.boutique_id,updated_at=excluded.updated_at;

create or replace function public.start_app_session(p_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id','')::uuid;
  v_minutes int;
  v_expires timestamptz;
begin
  if v_user is null or v_sid is null or not private.auth_has_boutique_access(p_boutique_id) then raise exception 'forbidden'; end if;
  select coalesce(session_minutes,720) into v_minutes from public.auth_settings where boutique_id=p_boutique_id;
  v_expires := now()+make_interval(mins=>coalesce(v_minutes,720));
  insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id,locked_at)
  values(v_user,p_boutique_id,v_expires,now(),v_sid,null)
  on conflict(user_id,boutique_id) do update
  set expires_at=excluded.expires_at,last_seen_at=excluded.last_seen_at,
      locked_at=case when private.app_sessions.session_id is distinct from excluded.session_id then null else private.app_sessions.locked_at end,
      session_id=excluded.session_id;
  insert into private.notification_session_context(session_id,user_id,boutique_id,updated_at)
  values(v_sid,v_user,p_boutique_id,now())
  on conflict(session_id) do update set user_id=excluded.user_id,boutique_id=excluded.boutique_id,updated_at=now();
  return jsonb_build_object('expires_at',v_expires,'locked',coalesce((select locked_at is not null from private.app_sessions where user_id=v_user and boutique_id=p_boutique_id),false));
end;
$$;
revoke all on function public.start_app_session(text) from public, anon;
grant execute on function public.start_app_session(text) to authenticated;

alter table public.notifications enable row level security;
drop policy if exists "notifications: own select" on public.notifications;
drop policy if exists notifications_own_select on public.notifications;
create policy "notifications: active boutique select" on public.notifications for select to authenticated
using (user_id=auth.uid() and boutique_id is not null and private.auth_notification_context_matches(boutique_id));

create or replace function public.mark_notification_read(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update public.notifications set read_at=coalesce(read_at,now())
  where id=p_id and user_id=auth.uid() and dismissed_at is null and boutique_id is not null and private.auth_notification_context_matches(boutique_id);
end; $$;
revoke all on function public.mark_notification_read(bigint) from public, anon;
grant execute on function public.mark_notification_read(bigint) to authenticated;

create or replace function public.mark_all_notifications_read() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update public.notifications set read_at=coalesce(read_at,now())
  where user_id=auth.uid() and dismissed_at is null and boutique_id is not null and private.auth_notification_context_matches(boutique_id);
end; $$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.dismiss_all_notifications() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update public.notifications set dismissed_at=coalesce(dismissed_at,now()),read_at=coalesce(read_at,now())
  where user_id=auth.uid() and dismissed_at is null and boutique_id is not null and private.auth_notification_context_matches(boutique_id);
end; $$;
revoke all on function public.dismiss_all_notifications() from public, anon;
grant execute on function public.dismiss_all_notifications() to authenticated;

alter table public.push_subscriptions add column if not exists boutique_id text references public.boutiques(id) on delete cascade;
update public.push_subscriptions s set boutique_id=c.boutique_id from private.notification_session_context c where s.user_id=c.user_id and s.boutique_id is null;
delete from public.push_subscriptions where boutique_id is null;
alter table public.push_subscriptions alter column boutique_id set not null;
create index if not exists push_subscriptions_user_boutique_enabled_idx on public.push_subscriptions(user_id,boutique_id,enabled);

create or replace function public.claim_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null,p_device_label text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; v_boutique text; v_id uuid;
begin
  if v_uid is null or v_sid is null then raise exception 'Connexion requise'; end if;
  if not exists(select 1 from public.platform_users u where u.id=v_uid and not coalesce(u.is_suspended,false)) then raise exception 'Compte inactif'; end if;
  select c.boutique_id into v_boutique from private.notification_session_context c where c.session_id=v_sid and c.user_id=v_uid;
  if v_boutique is null or not private.auth_has_boutique_access(v_boutique) then raise exception 'Boutique active requise'; end if;
  if p_endpoint is null or length(p_endpoint)<20 or length(p_endpoint)>4096 then raise exception 'Abonnement Push invalide'; end if;
  if p_p256dh is null or length(p_p256dh)<20 or p_auth is null or length(p_auth)<8 then raise exception 'Clés Push invalides'; end if;
  insert into public.push_subscriptions(user_id,boutique_id,endpoint,p256dh,auth,user_agent,device_label,enabled,last_seen_at)
  values(v_uid,v_boutique,p_endpoint,p_p256dh,p_auth,left(p_user_agent,1000),left(p_device_label,200),true,now())
  on conflict(endpoint) do update set user_id=excluded.user_id,boutique_id=excluded.boutique_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,device_label=excluded.device_label,enabled=true,last_seen_at=now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.claim_push_subscription(text,text,text,text,text) from public, anon;
grant execute on function public.claim_push_subscription(text,text,text,text,text) to authenticated;

create or replace function public.sync_push_subscription_context(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; v_boutique text;
begin
  if v_uid is null or v_sid is null then raise exception 'Connexion requise'; end if;
  select c.boutique_id into v_boutique from private.notification_session_context c where c.session_id=v_sid and c.user_id=v_uid;
  if v_boutique is null or not private.auth_has_boutique_access(v_boutique) then raise exception 'Boutique active requise'; end if;
  update public.push_subscriptions set boutique_id=v_boutique,enabled=true,last_seen_at=now() where endpoint=p_endpoint and user_id=v_uid;
end; $$;
revoke all on function public.sync_push_subscription_context(text) from public, anon;
grant execute on function public.sync_push_subscription_context(text) to authenticated;

create or replace function private.dispatch_notification_push() returns trigger language plpgsql security definer set search_path='' as $$
declare v_secret text;
begin
  if not new.push_enabled or new.boutique_id is null then return new; end if;
  if not exists(select 1 from public.push_subscriptions s where s.user_id=new.user_id and s.boutique_id=new.boutique_id and s.enabled=true) then return new; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='tournal_push_dispatch_secret' limit 1;
  if v_secret is null then return new; end if;
  begin
    perform net.http_post(url:='https://cnxtylngddwmhugxkzju.supabase.co/functions/v1/web-push-dispatch',headers:=jsonb_build_object('Content-Type','application/json','x-tournal-push-secret',v_secret),body:=jsonb_build_object('notificationId',new.id),timeout_milliseconds:=5000);
  exception when others then null;
  end;
  return new;
end; $$;
revoke all on function private.dispatch_notification_push() from public, anon, authenticated;
