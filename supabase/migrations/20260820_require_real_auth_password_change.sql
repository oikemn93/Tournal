-- Require a real Supabase Auth password hash change before clearing the
-- temporary-password gate, and remove the legacy one-argument PIN verifier.

create or replace function private.confirm_password_changed_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password then
    update public.platform_users
    set must_change_password=false,
        updated_at=now()
    where id=new.id
      and must_change_password=true;
  end if;
  return new;
end;
$$;
revoke all on function private.confirm_password_changed_from_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_password_changed on auth.users;
create trigger on_auth_user_password_changed
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function private.confirm_password_changed_from_auth();

create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required boolean;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;

  select must_change_password into v_required
  from public.platform_users
  where id=auth.uid();

  if not found then raise exception 'Profil utilisateur introuvable'; end if;
  if coalesce(v_required,false) then
    raise exception 'Le mot de passe Auth doit d’abord être réellement modifié';
  end if;
end;
$$;
revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;

-- The two-argument function is the only supported verifier because it also
-- unlocks the application session bound to the current Auth session_id.
drop function if exists public.verify_quick_pin(text);
