begin;

-- Materialize every permission key. Existing true/false values win; missing keys become false.
update public.boutique_assignments
set droits = jsonb_build_object(
  'dashboard',false,'stock',false,'fournisseurs',false,'clients',false,'factures',false,
  'remboursement',false,'charges',false,'compta',false,'vente',false,
  'encaissement_vente',false,'inventaire',false,'marges',false,
  'annulation_commande',false,'decaissement',false,'transferts',false
) || coalesce(droits,'{}'::jsonb);

create or replace function public.update_boutique_assignment_permissions(
  p_boutique_id text, p_user_id uuid, p_role text, p_droits jsonb
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_caller uuid := auth.uid();
  v_is_super boolean := private.auth_is_super_admin();
  v_target_super boolean := false;
  v_target_suspended boolean := false;
  v_rights jsonb;
begin
  if v_caller is null then raise exception 'forbidden'; end if;
  if p_role not in ('owner','manager','employee') then raise exception 'invalid role'; end if;
  if not v_is_super and not private.auth_is_owner_of(p_boutique_id) then raise exception 'forbidden'; end if;
  select coalesce(is_super_admin,false),coalesce(is_suspended,false) into v_target_super,v_target_suspended
  from public.platform_users where id=p_user_id;
  if not found then raise exception 'user not found'; end if;
  if v_target_suspended then raise exception 'suspended user'; end if;
  if not v_is_super and (v_target_super or p_role='owner') then raise exception 'forbidden'; end if;

  v_rights := jsonb_build_object(
    'dashboard',coalesce((p_droits->>'dashboard')::boolean,false),
    'stock',coalesce((p_droits->>'stock')::boolean,false),
    'fournisseurs',coalesce((p_droits->>'fournisseurs')::boolean,false),
    'clients',coalesce((p_droits->>'clients')::boolean,false),
    'factures',coalesce((p_droits->>'factures')::boolean,false),
    'remboursement',coalesce((p_droits->>'remboursement')::boolean,false),
    'charges',coalesce((p_droits->>'charges')::boolean,false),
    'compta',coalesce((p_droits->>'compta')::boolean,false),
    'vente',coalesce((p_droits->>'vente')::boolean,false),
    'encaissement_vente',coalesce((p_droits->>'encaissement_vente')::boolean,false),
    'inventaire',coalesce((p_droits->>'inventaire')::boolean,false),
    'marges',coalesce((p_droits->>'marges')::boolean,false),
    'annulation_commande',coalesce((p_droits->>'annulation_commande')::boolean,false),
    'decaissement',coalesce((p_droits->>'decaissement')::boolean,false),
    'transferts',coalesce((p_droits->>'transferts')::boolean,false)
  );

  insert into public.boutique_assignments(boutique_id,user_id,role,droits)
  values(p_boutique_id,p_user_id,p_role,v_rights)
  on conflict(boutique_id,user_id) do update set role=excluded.role,droits=excluded.droits;
  if p_role='owner' then update public.boutiques set owner_id=p_user_id where id=p_boutique_id; end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.update_boutique_assignment_permissions(text,uuid,text,jsonb) from public,anon;
grant execute on function public.update_boutique_assignment_permissions(text,uuid,text,jsonb) to authenticated;

-- Any authenticated supplier payment is a real cash outflow and must require decaissement.
create or replace function private.guard_supplier_payment_disbursement() returns trigger
language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
begin
  if auth.uid() is not null and new.source='supplier_payment'
     and not private.auth_has_permission(new.boutique_id,'decaissement') then
    raise exception 'disbursement access denied';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_supplier_payment_disbursement on public.charges;
create trigger trg_guard_supplier_payment_disbursement
before insert on public.charges for each row
when (new.source='supplier_payment') execute function private.guard_supplier_payment_disbursement();

commit;
