-- Keep bounded reads lossless even when a 30-day slice exceeds PostgREST's
-- row cap: expose one JSON array value instead of a set-returning public RPC.

drop function if exists public.read_bounded_invoices(text, timestamptz, timestamptz, boolean);
create function public.read_bounded_invoices(
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
  from private.read_bounded_invoices(p_boutique_id, p_from, p_to, p_include_pending) r;
$$;
revoke all on function public.read_bounded_invoices(text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.read_bounded_invoices(text, timestamptz, timestamptz, boolean) to authenticated;

drop function if exists public.read_bounded_stock_entries(text, timestamptz, timestamptz);
create function public.read_bounded_stock_entries(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(r order by (r->>'entry_date')::timestamptz desc, (r->>'id')::bigint desc),
    '[]'::jsonb
  )
  from private.read_bounded_stock_entries(p_boutique_id, p_from, p_to) r;
$$;
revoke all on function public.read_bounded_stock_entries(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.read_bounded_stock_entries(text, timestamptz, timestamptz) to authenticated;

drop function if exists public.read_bounded_invoice_payments(text, timestamptz, timestamptz);
create function public.read_bounded_invoice_payments(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(r order by (r->>'paid_at')::timestamptz asc, (r->>'id')::bigint asc),
    '[]'::jsonb
  )
  from private.read_bounded_invoice_payments(p_boutique_id, p_from, p_to) r;
$$;
revoke all on function public.read_bounded_invoice_payments(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.read_bounded_invoice_payments(text, timestamptz, timestamptz) to authenticated;