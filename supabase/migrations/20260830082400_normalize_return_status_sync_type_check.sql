-- Keep source-sale status synchronization aligned with the normalized return type checks
-- used by the rest of the return hardening. This is prospective only: no historical rows
-- are rewritten by this migration.

create or replace function private.sync_source_invoice_return_status()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if lower(trim(coalesce(new.type, ''))) = 'retour' and new.return_of_invoice_id is not null then
    update public.invoices s
    set status = case
      when s.status = 'annulée' then s.status
      when private.invoice_net_due(s.boutique_id, s.id) <= 0.01 then 'payée'
      else 'en_attente'
    end,
    updated_at = now()
    where s.boutique_id = new.boutique_id
      and s.id = new.return_of_invoice_id
      and lower(trim(coalesce(s.type, ''))) <> 'retour';
  end if;
  return new;
end
$function$;

drop trigger if exists trg_sync_source_invoice_return_status on public.invoices;
create trigger trg_sync_source_invoice_return_status
after insert or update of return_receivable_reduction on public.invoices
for each row
when (lower(trim(coalesce(new.type, ''))) = 'retour' and new.return_of_invoice_id is not null)
execute function private.sync_source_invoice_return_status();

revoke all on function private.sync_source_invoice_return_status() from public, anon, authenticated;
grant execute on function private.sync_source_invoice_return_status() to postgres;
