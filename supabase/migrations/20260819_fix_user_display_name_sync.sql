create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  is_first_admin boolean;
  display_name text;
  supplied_phone text;
begin
  perform pg_advisory_xact_lock(20260813);
  select not exists (select 1 from public.platform_users where is_super_admin) into is_first_admin;

  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'nom'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, new.id::text), '@', 1)
  );
  supplied_phone := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    new.id::text
  );

  insert into public.platform_users (id, phone, nom, initials, color, is_super_admin)
  values (
    new.id,
    supplied_phone,
    display_name,
    upper(left(regexp_replace(display_name, '[^[:alnum:]]', '', 'g'), 2)),
    '#C9A227',
    is_first_admin
  )
  on conflict (id) do update
  set phone = excluded.phone,
      nom = excluded.nom,
      initials = excluded.initials;

  return new;
end;
$function$;

create or replace function private.sync_user_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  display_name text;
  supplied_phone text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'nom'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, new.id::text), '@', 1)
  );
  supplied_phone := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    (select phone from public.platform_users where id = new.id),
    new.id::text
  );

  update public.platform_users
  set nom = display_name,
      phone = supplied_phone,
      initials = upper(left(regexp_replace(display_name, '[^[:alnum:]]', '', 'g'), 2))
  where id = new.id;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_profile_updated on auth.users;
create trigger on_auth_user_profile_updated
after update of raw_user_meta_data, email on auth.users
for each row
when (old.raw_user_meta_data is distinct from new.raw_user_meta_data or old.email is distinct from new.email)
execute function private.sync_user_profile_from_auth();