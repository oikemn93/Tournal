-- Preserve explicit transfer permissions; for legacy/admin payloads that omit the key,
-- inherit the existing stock permission so old role editors remain backward-compatible.
create or replace function private.default_transfer_permission() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role<>'owner' and not (coalesce(new.droits,'{}'::jsonb) ? 'transferts') then
    new.droits:=jsonb_set(coalesce(new.droits,'{}'::jsonb),'{transferts}',to_jsonb(coalesce((new.droits->>'stock')::boolean,false)),true);
  end if;
  return new;
end $$;

drop trigger if exists boutique_assignment_transfer_permission_default on public.boutique_assignments;
create trigger boutique_assignment_transfer_permission_default
before insert or update on public.boutique_assignments
for each row execute function private.default_transfer_permission();
