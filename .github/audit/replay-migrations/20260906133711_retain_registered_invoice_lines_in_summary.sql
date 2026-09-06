-- Preserve existing registered-client workflows while keeping the high-volume
-- counter-sale list summary-only.

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
        'invoice_lines',
        case when lower(coalesce(i.type, '')) = 'retour' or i.client_id is not null then
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
        'invoice_lines',
        case when lower(coalesce(i.type, '')) = 'retour' or i.client_id is not null then
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

comment on function public.read_bounded_invoice_summaries(text, timestamptz, timestamptz, boolean) is
  'Bounded invoice list read. Counter sales return headers plus line_count; registered-client invoices and return credit notes retain lines for existing client and return workflows.';
