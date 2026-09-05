-- Audit-only compatibility shim.
-- Production migration 20260829144145 stored return_sale with spaced PL/pgSQL
-- assignments and one settlement assignment per line. The retained Git migration
-- is semantically equivalent but compact, while 20260829153940 intentionally
-- patches pg_get_functiondef() by exact text. Normalize formatting only so the
-- historical guard can run as designed. This file must not be merged to main.

do $audit$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.return_sale(text,text,uuid,jsonb,text)'::regprocedure)
    into v_def;

  -- Normalize assignment spacing first.
  v_new := regexp_replace(v_def, '\s*:=\s*', ' := ', 'g');
  v_new := replace(
    v_new,
    'coalesce(nullif(btrim(p_refund_method),''''),nullif(btrim(v_original.payment_method),''''),''Autre'')',
    'coalesce(nullif(btrim(p_refund_method),''''), nullif(btrim(v_original.payment_method),''''), ''Autre'')'
  );

  -- The retained definition packs the first four settlement assignments onto
  -- one line. Split them to the exact formatting of the historical production
  -- definition; SQL semantics are unchanged.
  v_new := replace(
    v_new,
    '  v_remaining_unpaid := greatest(0,v_original.montant-v_paid_total-v_prior_receivable); v_remaining_advance := greatest(0,v_advance_paid-v_prior_credit); v_remaining_external := greatest(0,v_external_paid-v_prior_refund); v_remaining_value := v_total;',
    '  v_remaining_unpaid := greatest(0,v_original.montant-v_paid_total-v_prior_receivable);' || E'\n' ||
    '  v_remaining_advance := greatest(0,v_advance_paid-v_prior_credit);' || E'\n' ||
    '  v_remaining_external := greatest(0,v_external_paid-v_prior_refund);' || E'\n' ||
    '  v_remaining_value := v_total;'
  );

  -- The next three settlement stages are also paired on compact lines.
  v_new := replace(
    v_new,
    '  v_receivable_reduction := least(v_remaining_value,v_remaining_unpaid); v_remaining_value := round(v_remaining_value-v_receivable_reduction,2);',
    '  v_receivable_reduction := least(v_remaining_value,v_remaining_unpaid);' || E'\n' ||
    '  v_remaining_value := round(v_remaining_value-v_receivable_reduction,2);'
  );
  v_new := replace(
    v_new,
    '  v_credit_restore := least(v_remaining_value,v_remaining_advance); v_remaining_value := round(v_remaining_value-v_credit_restore,2);',
    '  v_credit_restore := least(v_remaining_value,v_remaining_advance);' || E'\n' ||
    '  v_remaining_value := round(v_remaining_value-v_credit_restore,2);'
  );
  v_new := replace(
    v_new,
    '  v_refund_amount := least(v_remaining_value,v_remaining_external); v_remaining_value := round(v_remaining_value-v_refund_amount,2);',
    '  v_refund_amount := least(v_remaining_value,v_remaining_external);' || E'\n' ||
    '  v_remaining_value := round(v_remaining_value-v_refund_amount,2);'
  );

  if v_new <> v_def then
    execute v_new;
  end if;
end
$audit$;
