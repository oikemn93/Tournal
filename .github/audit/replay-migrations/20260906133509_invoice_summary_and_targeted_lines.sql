-- Invoice list optimization: keep the bounded list small and hydrate sale lines only on demand.
-- Registered-client invoices are kept compatible by the follow-up replay migration.

create or replace function private.read_bounded_invoice_summaries(
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
  if p_boutique_id is null or p_from is null then return; end if;
  if p_to is not null and p_to <= p_from then return; end if;
  if p_from < (current_date - 31)::timestamptz then
    raise exception 'bounded invoice summary read exceeds 31 days' using errcode = '22023';
  end if;

  v_can_read := private.auth_can_read_boutique(
    p_boutique_id,
    array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']::text[]
  );
  if not coalesce(v_can_read, false) then return; end if;
  v_can_view_margin := private.auth_can_read_boutique(p_boutique_id, array['marges']::text[]);

  if p_include_pending then
    return query
      with filtered as materialized (
        select i.* from public.invoices i
        where i.boutique_id = p_boutique_id
          and i.invoice_date >= p_from
          and (p_to is null or i.invoice_date < p_to)
        union all
        select i.* from public.invoices i
        where i.boutique_id = p_boutique_id
          and i.status = 'en_attente'
          and i.invoice_date < p_from
      ), line_counts as materialized (
        select l.invoice_id, count(*)::integer as line_count
        from public.invoice_lines l
        join filtered f on f.boutique_id = l.boutique_id and f.id = l.invoice_id
        group by l.invoice_id
      )
      select to_jsonb(i) || jsonb_build_object(
        'line_count', coalesce(lc.line_count, 0),
        'invoice_lines', case when lower(coalesce(i.type, '')) = 'retour' then
          coalesce((
            select jsonb_agg(jsonb_build_object(
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
            ) order by l.id)
            from public.invoice_lines l
            where l.boutique_id = i.boutique_id and l.invoice_id = i.id
          ), '[]'::jsonb)
        else '[]'::jsonb end
      )
      from filtered i
      left join line_counts lc on lc.invoice_id = i.id
      order by i.invoice_date desc;
  else
    return query
      with filtered as materialized (
        select i.* from public.invoices i
        where i.boutique_id = p_boutique_id
          and i.invoice_date >= p_from
          and (p_to is null or i.invoice_date < p_to)
      ), line_counts as materialized (
        select l.invoice_id, count(*)::integer as line_count
        from public.invoice_lines l
        join filtered f on f.boutique_id = l.boutique_id and f.id = l.invoice_id
        group by l.invoice_id
      )
      select to_jsonb(i) || jsonb_build_object(
        'line_count', coalesce(lc.line_count, 0),
        'invoice_lines', case when lower(coalesce(i.type, '')) = 'retour' then
          coalesce((
            select jsonb_agg(jsonb_build_object(
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
            ) order by l.id)
            from public.invoice_lines l
            where l.boutique_id = i.boutique_id and l.invoice_id = i.id
          ), '[]'::jsonb)
        else '[]'::jsonb end
      )
      from filtered i
      left join line_counts lc on lc.invoice_id = i.id
      order by i.invoice_date desc;
  end if;
end;
$$;
revoke all on function private.read_bounded_invoice_summaries(text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function private.read_bounded_invoice_summaries(text, timestamptz, timestamptz, boolean) to authenticated;

create or replace function public.read_bounded_invoice_summaries(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_include_pending boolean
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(r order by (r->>'invoice_date')::timestamptz desc, r->>'id'),
    '[]'::jsonb
  )
  from private.read_bounded_invoice_summaries(p_boutique_id, p_from, p_to, p_include_pending) r;
$$;
revoke all on function public.read_bounded_invoice_summaries(text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.read_bounded_invoice_summaries(text, timestamptz, timestamptz, boolean) to authenticated;

create or replace function private.read_invoice_lines(
  p_boutique_id text,
  p_invoice_ids text[]
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
  v_ids text[];
begin
  if p_boutique_id is null or p_invoice_ids is null or cardinality(p_invoice_ids) = 0 then return; end if;
  if cardinality(p_invoice_ids) > 50 then
    raise exception 'invoice line read exceeds 50 invoices' using errcode = '22023';
  end if;

  select array_agg(distinct x) into v_ids
  from unnest(p_invoice_ids) x
  where nullif(trim(x), '') is not null;
  if v_ids is null or cardinality(v_ids) = 0 then return; end if;

  v_can_read := private.auth_can_read_boutique(
    p_boutique_id,
    array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']::text[]
  );
  if not coalesce(v_can_read, false) then return; end if;
  v_can_view_margin := private.auth_can_read_boutique(p_boutique_id, array['marges']::text[]);

  return query
    select jsonb_build_object(
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
    )
    from public.invoice_lines l
    where l.boutique_id = p_boutique_id
      and l.invoice_id = any(v_ids)
    order by l.invoice_id, l.id;
end;
$$;
revoke all on function private.read_invoice_lines(text, text[]) from public, anon, authenticated;
grant execute on function private.read_invoice_lines(text, text[]) to authenticated;

create or replace function public.read_invoice_lines(
  p_boutique_id text,
  p_invoice_ids text[]
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(r order by r->>'invoice_id', (r->>'id')::bigint),
    '[]'::jsonb
  )
  from private.read_invoice_lines(p_boutique_id, p_invoice_ids) r;
$$;
revoke all on function public.read_invoice_lines(text, text[]) from public, anon;
grant execute on function public.read_invoice_lines(text, text[]) to authenticated;

comment on function public.read_bounded_invoice_summaries(text, timestamptz, timestamptz, boolean) is
  'Bounded invoice list read. Sales return headers plus line_count; return credit notes retain lines for return-integrity bookkeeping.';
comment on function public.read_invoice_lines(text, text[]) is
  'Targeted invoice-line hydration for up to 50 invoice IDs with authorization and margin masking evaluated once.';
