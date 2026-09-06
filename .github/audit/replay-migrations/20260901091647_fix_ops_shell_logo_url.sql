create or replace function public.get_ops_shell()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_boutiques jsonb;
  v_users jsonb;
begin
  if not ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) then
    raise exception 'Ops access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'nom', b.nom,
    'ville', b.ville,
    'color', b.color,
    'initials', b.initials,
    'logo', b.logo_url,
    'tel', b.tel,
    'email', b.email,
    'created_at', b.created_at
  ) order by b.nom), '[]'::jsonb)
  into v_boutiques
  from public.boutiques b;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'phone', u.phone,
    'nom', u.nom,
    'initials', u.initials,
    'color', u.color,
    'isSuperAdmin', u.is_super_admin,
    'isSuspended', u.is_suspended,
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'boutiqueId', a.boutique_id,
        'role', case a.role when 'owner' then 'Propriétaire' when 'manager' then 'Manager' else 'Employé' end,
        'droits', '{}'::jsonb
      ) order by a.boutique_id)
      from public.boutique_assignments a
      where a.user_id = u.id
    ), '[]'::jsonb)
  ) order by u.nom), '[]'::jsonb)
  into v_users
  from public.platform_users u
  where not u.is_suspended;

  return jsonb_build_object('boutiques', v_boutiques, 'users', v_users);
end;
$function$;

revoke all on function public.get_ops_shell() from public, anon;
grant execute on function public.get_ops_shell() to authenticated;
