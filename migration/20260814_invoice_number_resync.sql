do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'private'
      and table_name = 'invoice_counters'
  ) then
    create table private.invoice_counters (
      boutique_id text primary key,
      next_num bigint not null,
      updated_at timestamptz not null default now()
    );
  end if;
end;
$$;

insert into private.invoice_counters (boutique_id, next_num, updated_at)
select
  i.boutique_id,
  coalesce(max(i.numero), 0) + 1,
  now()
from public.invoices i
group by i.boutique_id
on conflict (boutique_id) do update
  set next_num = greatest(private.invoice_counters.next_num, excluded.next_num),
      updated_at = now();

create or replace function private.next_invoice_number(p_boutique_id text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_numero bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_boutique_id));

  insert into private.invoice_counters (boutique_id, next_num, updated_at)
  values (
    p_boutique_id,
    coalesce((select max(numero) + 1 from public.invoices where boutique_id = p_boutique_id), 1),
    now()
  )
  on conflict (boutique_id) do update
    set next_num = greatest(private.invoice_counters.next_num, excluded.next_num),
        updated_at = now();

  update private.invoice_counters
  set next_num = next_num + 1,
      updated_at = now()
  where boutique_id = p_boutique_id
  returning next_num - 1 into v_numero;

  return v_numero;
end;
$$;

