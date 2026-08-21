begin;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tournal_invoice_cleanup_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'tournal_invoice_cleanup_secret',
      'Authenticates the scheduled invoice PDF cleanup function.'
    );
  end if;
end;
$$;

create or replace function public.get_internal_invoice_cleanup_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cleanupSecret', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'tournal_invoice_cleanup_secret'
      limit 1
    )
  );
$$;

revoke all on function public.get_internal_invoice_cleanup_config() from public, anon, authenticated;
grant execute on function public.get_internal_invoice_cleanup_config() to service_role;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'cleanup-temporary-invoice-pdfs'),
  command := $cron$
    select net.http_post(
      url := 'https://cnxtylngddwmhugxkzju.supabase.co/functions/v1/cleanup-invoice-pdfs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-tournal-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'tournal_invoice_cleanup_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  $cron$
);

commit;
