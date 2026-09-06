-- Bounded transactional read paths for bootstrap/history.
-- Keep sensitive purchase costs behind a private SECURITY DEFINER helper while
-- exposing only SECURITY INVOKER RPC wrappers through the public API schema.

create or replace function private.auth_can_read_boutique(
  p_boutique_id text,
  p_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_users u
    where u.id = auth.uid()
      and coalesce(u.is_suspended, false) = false
      and coalesce(u.must_change_password, false) = false
      and (
        u.is_super_admin = true
        or exists (
          select 1
          from public.boutique_assignments ba
          where ba.boutique_id = p_boutique_id
            and ba.user_id = u.id
            and (
              ba.role = 'owner'
              or exists (
                select 1
                from unnest(p_permissions) p(permission)
                where coalesce((ba.droits ->> p.permission)::boolean, false)
              )
            )
        )
      )
  );
$$;
revoke all on function private.auth_can_read_boutique(text, text[]) from public, anon, authenticated;

create index if not exists invoices_pending_boutique_date_idx
  on public.invoices (boutique_id, invoice_date desc, id)
  where status = 'en_attente';

create or replace function private.read_bounded_invoices(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_include_pending boolean
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_read boolean;
  v_can_view_margin boolean;
begin
  if p_boutique_id is null or p_from is null then
    return;
  end if;
  if p_to is not null and p_to <= p_from then
    return;
  end if;
  if p_from < (current_date - 31)::timestamptz then
    raise exception 'bounded invoice read exceeds 31 days' using errcode = '22023';
  end if;

  v_can_read := private.auth_can_read_boutique(
    p_boutique_id,
    array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']::text[]
  );
  if not coalesce(v_can_read, false) then
    return;
  end if;

  v_can_view_margin := private.auth_can_read_boutique(p_boutique_id, array['marges']::text[]);

  if p_include_pending then
    return query
      with filtered as materialized (
        select i.*
        from public.invoices i
        where i.boutique_id = p_boutique_id
          and i.invoice_date >= p_from
          and (p_to is null or i.invoice_date < p_to)
        union all
        select i.*
        from public.invoices i
        where i.boutique_id = p_boutique_id
          and i.status = 'en_attente'
          and i.invoice_date < p_from
      )
      select to_jsonb(i) || jsonb_build_object(
        'invoice_lines',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', l.id,
              'boutique_id', l.boutique_id,
              'invoice_id', l.invoice_id,
              'product_id', l.product_id,
              'nom', l.nom,
              'qty', l.qty,
              'unit', l.unit,
              'prix_unit', l.prix_unit,
              'sell_unit', l.sell_unit,
              'sell_qty', l.sell_qty,
              'created_at', l.created_at,
              'prix_achat', case when v_can_view_margin then l.prix_achat else null::numeric end,
              'source_invoice_line_id', l.source_invoice_line_id
            ) order by l.id
          )
          from public.invoice_lines l
          where l.boutique_id = i.boutique_id
            and l.invoice_id = i.id
        ), '[]'::jsonb)
      )
      from filtered i
      order by i.invoice_date desc;
  else
    return query
      with filtered as materialized (
        select i.*
        from public.invoices i
        where i.boutique_id = p_boutique_id
          and i.invoice_date >= p_from
          and (p_to is null or i.invoice_date < p_to)
      )
      select to_jsonb(i) || jsonb_build_object(
        'invoice_lines',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', l.id,
              'boutique_id', l.boutique_id,
              'invoice_id', l.invoice_id,
              'product_id', l.product_id,
              'nom', l.nom,
              'qty', l.qty,
              'unit', l.unit,
              'prix_unit', l.prix_unit,
              'sell_unit', l.sell_unit,
              'sell_qty', l.sell_qty,
              'created_at', l.created_at,
              'prix_achat', case when v_can_view_margin then l.prix_achat else null::numeric end,
              'source_invoice_line_id', l.source_invoice_line_id
            ) order by l.id
          )
          from public.invoice_lines l
          where l.boutique_id = i.boutique_id
            and l.invoice_id = i.id
        ), '[]'::jsonb)
      )
      from filtered i
      order by i.invoice_date desc;
  end if;
end;
$$;
revoke all on function private.read_bounded_invoices(text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function private.read_bounded_invoices(text, timestamptz, timestamptz, boolean) to authenticated;

create or replace function public.read_bounded_invoices(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_include_pending boolean
)
returns setof jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select r
  from private.read_bounded_invoices(p_boutique_id, p_from, p_to, p_include_pending) r;
$$;
revoke all on function public.read_bounded_invoices(text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.read_bounded_invoices(text, timestamptz, timestamptz, boolean) to authenticated;

create or replace function private.read_bounded_stock_entries(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_read boolean;
  v_can_view_margin boolean;
begin
  if p_boutique_id is null or p_from is null then
    return;
  end if;
  if p_to is not null and p_to <= p_from then
    return;
  end if;
  if p_from < (current_date - 31)::timestamptz then
    raise exception 'bounded stock read exceeds 31 days' using errcode = '22023';
  end if;

  v_can_read := private.auth_can_read_boutique(
    p_boutique_id,
    array['stock','inventaire','transferts','fournisseurs']::text[]
  );
  if not coalesce(v_can_read, false) then
    return;
  end if;

  v_can_view_margin := private.auth_can_read_boutique(p_boutique_id, array['marges']::text[]);

  return query
    select to_jsonb(s) || jsonb_build_object(
      'prix_unit', case when v_can_view_margin then s.prix_unit else null::numeric end
    )
    from public.stock_entries s
    where s.boutique_id = p_boutique_id
      and s.entry_date >= p_from
      and (p_to is null or s.entry_date < p_to)
    order by s.entry_date desc, s.id desc;
end;
$$;
revoke all on function private.read_bounded_stock_entries(text, timestamptz, timestamptz) from public, anon;
grant execute on function private.read_bounded_stock_entries(text, timestamptz, timestamptz) to authenticated;

create or replace function public.read_bounded_stock_entries(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns setof jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select r
  from private.read_bounded_stock_entries(p_boutique_id, p_from, p_to) r;
$$;
revoke all on function public.read_bounded_stock_entries(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.read_bounded_stock_entries(text, timestamptz, timestamptz) to authenticated;

create or replace function private.read_bounded_invoice_payments(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_read boolean;
begin
  if p_boutique_id is null or p_from is null then
    return;
  end if;
  if p_to is not null and p_to <= p_from then
    return;
  end if;
  if p_from < (current_date - 31)::timestamptz then
    raise exception 'bounded payment read exceeds 31 days' using errcode = '22023';
  end if;

  v_can_read := private.auth_can_read_boutique(
    p_boutique_id,
    array['factures','clients','compta','encaissement_vente','remboursement','transferts']::text[]
  );
  if not coalesce(v_can_read, false) then
    return;
  end if;

  return query
    select jsonb_build_object(
      'id', p.id,
      'boutique_id', p.boutique_id,
      'invoice_id', p.invoice_id,
      'amount', p.amount,
      'payment_method', p.payment_method,
      'paid_at', p.paid_at,
      'recorded_at', p.recorded_at,
      'operator_id', p.operator_id,
      'operator_name', p.operator_name,
      'batch_id', p.batch_id,
      'source', p.source
    )
    from public.invoice_payments p
    where p.boutique_id = p_boutique_id
      and p.paid_at >= p_from
      and (p_to is null or p.paid_at < p_to)
    order by p.paid_at asc, p.id asc;
end;
$$;
revoke all on function private.read_bounded_invoice_payments(text, timestamptz, timestamptz) from public, anon;
grant execute on function private.read_bounded_invoice_payments(text, timestamptz, timestamptz) to authenticated;

create or replace function public.read_bounded_invoice_payments(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns setof jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select r
  from private.read_bounded_invoice_payments(p_boutique_id, p_from, p_to) r;
$$;
revoke all on function public.read_bounded_invoice_payments(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.read_bounded_invoice_payments(text, timestamptz, timestamptz) to authenticated;

comment on function public.read_bounded_invoices(text, timestamptz, timestamptz, boolean) is
  'Bounded invoice read: authorization and margin masking are evaluated once before date-filtered line aggregation.';
comment on function public.read_bounded_stock_entries(text, timestamptz, timestamptz) is
  'Bounded stock read: authorization and margin masking are evaluated once before indexed date filtering.';
comment on function public.read_bounded_invoice_payments(text, timestamptz, timestamptz) is
  'Bounded payment read: preserves invoice-payment read permission before indexed date filtering.';