-- Fix Web Push Vault reads: use decrypted_secret, never the encrypted secret column.

create or replace function public.get_push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'tournal_vapid_public_key'
  limit 1;
$$;
revoke execute on function public.get_push_public_key() from public, anon;
grant execute on function public.get_push_public_key() to authenticated;

create or replace function public.get_internal_push_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'publicKey',(select decrypted_secret from vault.decrypted_secrets where name='tournal_vapid_public_key' limit 1),
    'privateKey',(select decrypted_secret from vault.decrypted_secrets where name='tournal_vapid_private_key' limit 1),
    'dispatchSecret',(select decrypted_secret from vault.decrypted_secrets where name='tournal_push_dispatch_secret' limit 1)
  );
$$;
revoke execute on function public.get_internal_push_config() from public, anon, authenticated;
grant execute on function public.get_internal_push_config() to service_role;

create or replace function private.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_secret text;
begin
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
revoke execute on function private.dispatch_notification_push() from public, anon, authenticated;
