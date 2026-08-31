create or replace function private.track_ops_ticket_response()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status = 'new' and new.status <> 'new' and new.first_response_at is null then
    new.first_response_at := now();
  end if;
  if new.status in ('resolved','closed') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  if new.status not in ('resolved','closed') and new.sla_due_at is not null and now() > new.sla_due_at and new.escalated_at is null then
    new.escalated_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ops_ticket_response on public.ops_tickets;
create trigger trg_ops_ticket_response
before update on public.ops_tickets
for each row execute function private.track_ops_ticket_response();

create or replace function public.get_ops_manager_metrics()
returns table (
  user_id uuid,
  role text,
  open_tasks bigint,
  overdue_tasks bigint,
  open_tickets bigint,
  sla_breached_tickets bigint,
  completed_tasks_7d bigint,
  resolved_tickets_7d bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) then
    raise exception 'Ops access required' using errcode = '42501';
  end if;

  return query
  select p.user_id,
         p.role,
         count(distinct t.id) filter (where t.status not in ('done','cancelled'))::bigint,
         count(distinct t.id) filter (where t.status not in ('done','cancelled') and t.due_at is not null and t.due_at < now())::bigint,
         count(distinct k.id) filter (where k.status not in ('resolved','closed'))::bigint,
         count(distinct k.id) filter (where k.status not in ('resolved','closed') and k.sla_due_at is not null and k.sla_due_at < now())::bigint,
         count(distinct t.id) filter (where t.status = 'done' and t.completed_at >= now() - interval '7 days')::bigint,
         count(distinct k.id) filter (where k.status in ('resolved','closed') and k.resolved_at >= now() - interval '7 days')::bigint
  from public.ops_staff_profiles p
  left join public.ops_tasks t on t.assignee_id = p.user_id
  left join public.ops_tickets k on k.assignee_id = p.user_id
  where p.active
  group by p.user_id, p.role
  order by p.role, p.user_id;
end;
$$;

revoke all on function public.get_ops_manager_metrics() from public;
grant execute on function public.get_ops_manager_metrics() to authenticated;

create or replace function public.get_ops_attention_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  if not ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) then
    raise exception 'Ops access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'open_tasks', count(*) filter (where kind = 'task'),
    'overdue_tasks', count(*) filter (where kind = 'task' and overdue),
    'open_tickets', count(*) filter (where kind = 'ticket'),
    'sla_breached_tickets', count(*) filter (where kind = 'ticket' and overdue),
    'urgent_items', count(*) filter (where priority = 'urgent')
  ) into v_result
  from (
    select 'task'::text kind, t.priority, (t.due_at is not null and t.due_at < now()) overdue
    from public.ops_tasks t where t.status not in ('done','cancelled')
    union all
    select 'ticket'::text kind, k.priority, (k.sla_due_at is not null and k.sla_due_at < now()) overdue
    from public.ops_tickets k where k.status not in ('resolved','closed')
  ) q;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_ops_attention_counts() from public;
grant execute on function public.get_ops_attention_counts() to authenticated;
