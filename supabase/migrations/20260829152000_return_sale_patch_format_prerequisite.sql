-- Audit-only compatibility shim.
-- Production migration 20260829144145 stored return_sale with spaced PL/pgSQL
-- assignments. The retained Git migration is semantically equivalent but compact,
-- while 20260829153940 intentionally patches pg_get_functiondef() by exact text.
-- Normalize formatting only so the historical guard can run as designed.

do $audit$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.return_sale(text,text,uuid,jsonb,text)'::regprocedure)
    into v_def;

  v_new := regexp_replace(v_def, '\s*:=\s*', ' := ', 'g');
  v_new := replace(
    v_new,
    'coalesce(nullif(btrim(p_refund_method),''''),nullif(btrim(v_original.payment_method),''''),''Autre'')',
    'coalesce(nullif(btrim(p_refund_method),''''), nullif(btrim(v_original.payment_method),''''), ''Autre'')'
  );

  if v_new <> v_def then
    execute v_new;
  end if;
end
$audit$;
