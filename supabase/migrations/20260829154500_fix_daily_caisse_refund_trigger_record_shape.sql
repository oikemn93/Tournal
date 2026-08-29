-- The same trigger is attached to invoice_payments and client_credit_refunds.
-- Only invoice_payments has a `source` column, so inspect it only in that branch.
create or replace function private.enforce_daily_caisse_on_receipt()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_enabled boolean:=false;
  v_open_today boolean:=false;
begin
  if auth.uid() is null then return new; end if;

  select coalesce(s.caisse_daily_control_enabled,false)
  into v_enabled
  from public.auth_settings s
  where s.boutique_id=new.boutique_id;

  if not coalesce(v_enabled,false) then return new; end if;

  if tg_table_name='invoice_payments' then
    if coalesce(new.amount,0)<=0 or coalesce(new.source,'') in ('client_advance','legacy_backfill') then
      return new;
    end if;
  end if;

  select exists(
    select 1
    from public.caisse_sessions cs
    where cs.boutique_id=new.boutique_id
      and cs.closed_at is null
      and (cs.opened_at at time zone 'Africa/Dakar')::date=(now() at time zone 'Africa/Dakar')::date
  ) into v_open_today;

  if not v_open_today then
    raise exception 'caisse_opening_required'
      using hint='Ouvrez la caisse du jour avant tout encaissement ou remboursement.';
  end if;

  return new;
end $$;
