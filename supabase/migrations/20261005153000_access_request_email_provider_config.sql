create or replace function public.access_email_provider_config()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'resend_key', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'tournal_resend_api_key'
      limit 1
    ),
    'email_to', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'tournal_access_request_email_to'
      limit 1
    ),
    'email_from', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'tournal_access_request_email_from'
      limit 1
    ),
    'ops_url', coalesce((
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'tournal_access_request_ops_url'
      limit 1
    ), 'https://ops.tournal.org')
  );
$$;

revoke execute on function public.access_email_provider_config() from public, anon, authenticated;
grant execute on function public.access_email_provider_config() to service_role;
