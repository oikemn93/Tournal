alter table public.platform_users
  add column if not exists must_change_password boolean not null default false;

comment on column public.platform_users.must_change_password is
  'Requires the user to replace an administrator-issued temporary password.';

create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  update public.platform_users
  set must_change_password = false,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'Profil utilisateur introuvable';
  end if;
end;
$$;

revoke all on function public.complete_password_change() from public;
revoke all on function public.complete_password_change() from anon;
grant execute on function public.complete_password_change() to authenticated;
