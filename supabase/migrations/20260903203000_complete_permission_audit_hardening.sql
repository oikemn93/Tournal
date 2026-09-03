-- Complete the permission hardening identified by the exhaustive rights audit.
-- Read policies must not depend on the active app lock/session; write RPCs keep
-- using private.auth_has_permission and therefore retain the active-session gate.

-- Remaining client financial reads.
drop policy if exists "client_advances: select permitted" on public.client_advances;
create policy "client_advances: select permitted"
on public.client_advances for select to authenticated
using (private.auth_has_any_read_permission(boutique_id, array['clients','encaissement_vente','remboursement','compta']));

drop policy if exists "client_credit_refunds: select permitted" on public.client_credit_refunds;
create policy "client_credit_refunds: select permitted"
on public.client_credit_refunds for select to authenticated
using (private.auth_has_any_read_permission(boutique_id, array['clients','remboursement','compta']));

drop policy if exists "client_credit_refund_allocations: select permitted" on public.client_credit_refund_allocations;
create policy "client_credit_refund_allocations: select permitted"
on public.client_credit_refund_allocations for select to authenticated
using (
  exists (
    select 1
    from public.client_credit_refunds refund
    where refund.id = client_credit_refund_allocations.refund_id
      and private.auth_has_any_read_permission(refund.boutique_id, array['clients','remboursement','compta'])
  )
);

-- Remaining supplier / transfer reads.
drop policy if exists "suppliers: select permitted" on public.suppliers;
create policy "suppliers: select permitted"
on public.suppliers for select to authenticated
using (private.auth_has_any_read_permission(boutique_id, array['fournisseurs','stock','charges','transferts']));

drop policy if exists "partners_read_authorized" on public.boutique_partners;
create policy "partners_read_authorized"
on public.boutique_partners for select to authenticated
using (private.auth_has_read_permission(boutique_id, 'transferts'));

drop policy if exists "stock_transfers: select permitted" on public.stock_transfers;
create policy "stock_transfers: select permitted"
on public.stock_transfers for select to authenticated
using (
  private.auth_has_read_permission(from_boutique_id, 'transferts')
  or private.auth_has_read_permission(to_boutique_id, 'transferts')
);

drop policy if exists "stock_transfer_lines: select permitted" on public.stock_transfer_lines;
create policy "stock_transfer_lines: select permitted"
on public.stock_transfer_lines for select to authenticated
using (
  exists (
    select 1
    from public.stock_transfers t
    where t.id = stock_transfer_lines.transfer_id
      and (
        private.auth_has_read_permission(t.from_boutique_id, 'transferts')
        or private.auth_has_read_permission(t.to_boutique_id, 'transferts')
      )
  )
);

drop policy if exists "transfer_charge_payments: select" on public.transfer_charge_payments;
create policy "transfer_charge_payments: select"
on public.transfer_charge_payments for select to authenticated
using (private.auth_has_any_read_permission(boutique_id, array['charges','transferts']));

-- Direct charge-table access is reserved for the Charges / Accounting domains.
-- Stock and Suppliers consume the filtered charges_app projection below.
drop policy if exists "charges: select permitted" on public.charges;
create policy "charges: select permitted"
on public.charges for select to authenticated
using (private.auth_has_any_read_permission(boutique_id, array['charges','compta']));

-- SECURITY DEFINER view owned by the migration owner. The WHERE clause is the
-- authorization boundary: Charges/Accounting receive the complete ledger;
-- Stock/Suppliers receive only supplier-payable and transfer records required
-- by their screens. No unrelated rent/salary/marketing charge is exposed.
drop view if exists public.charges_app;
create view public.charges_app
with (security_barrier = true)
as
select c.*
from public.charges c
where
  private.auth_has_any_read_permission(c.boutique_id, array['charges','compta'])
  or (
    private.auth_has_any_read_permission(c.boutique_id, array['stock','fournisseurs'])
    and c.source in ('supplier_receipt','supplier_payment','transfer')
  );

revoke all on public.charges_app from public, anon;
grant select on public.charges_app to authenticated;

-- Inventory internally stores valuation snapshots so finalization remains
-- deterministic. Public responses, however, must not expose purchase/FIFO cost
-- fields unless the same caller also has the Marges permission.
alter function public.get_inventory_session(uuid)
  rename to get_inventory_session_internal_unmasked;
revoke all on function public.get_inventory_session_internal_unmasked(uuid) from public, anon, authenticated;

create function public.get_inventory_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  v_boutique text;
  v_payload jsonb;
  v_lines jsonb;
begin
  select boutique_id into v_boutique
  from public.inventory_sessions
  where id = p_session_id;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_boutique,'inventaire') then raise exception 'forbidden'; end if;

  v_payload := public.get_inventory_session_internal_unmasked(p_session_id);
  if private.auth_has_permission(v_boutique,'marges') then
    return v_payload;
  end if;

  v_payload := jsonb_set(
    v_payload,
    '{report}',
    coalesce(v_payload->'report','{}'::jsonb) || jsonb_build_object(
      'theoreticalCost', null,
      'countedCost', null,
      'theoreticalSales', null,
      'countedSales', null,
      'potentialMargin', null,
      'varianceCost', null,
      'varianceSales', null
    ),
    true
  );

  select coalesce(
    jsonb_agg(
      (item - 'purchasePrice' - 'fifoTheoreticalCost' - 'fifoCountedCost' - 'fifoUnitCost')
      || jsonb_build_object(
        'purchasePrice', null,
        'fifoTheoreticalCost', null,
        'fifoCountedCost', null,
        'fifoUnitCost', null
      )
      order by ordinality
    ),
    '[]'::jsonb
  ) into v_lines
  from jsonb_array_elements(coalesce(v_payload->'lines','[]'::jsonb)) with ordinality as line(item, ordinality);

  return jsonb_set(v_payload,'{lines}',v_lines,true);
end;
$$;

revoke all on function public.get_inventory_session(uuid) from public, anon;
grant execute on function public.get_inventory_session(uuid) to authenticated;

alter function public.list_inventory_sessions(text,integer)
  rename to list_inventory_sessions_internal_unmasked;
revoke all on function public.list_inventory_sessions_internal_unmasked(text,integer) from public, anon, authenticated;

create function public.list_inventory_sessions(p_boutique_id text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  v_payload jsonb;
  v_masked jsonb;
begin
  if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  v_payload := public.list_inventory_sessions_internal_unmasked(p_boutique_id,p_limit);
  if private.auth_has_permission(p_boutique_id,'marges') then
    return v_payload;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_set(
        item,
        '{report}',
        coalesce(item->'report','{}'::jsonb) || jsonb_build_object(
          'theoreticalCost', null,
          'countedCost', null,
          'theoreticalSales', null,
          'countedSales', null,
          'potentialMargin', null,
          'varianceCost', null,
          'varianceSales', null
        ),
        true
      )
      order by ordinality
    ),
    '[]'::jsonb
  ) into v_masked
  from jsonb_array_elements(coalesce(v_payload,'[]'::jsonb)) with ordinality as session(item, ordinality);
  return v_masked;
end;
$$;

revoke all on function public.list_inventory_sessions(text,integer) from public, anon;
grant execute on function public.list_inventory_sessions(text,integer) to authenticated;
