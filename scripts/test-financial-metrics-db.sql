\set ON_ERROR_STOP on
begin;

insert into public.platform_users(id,phone,nom,initials,is_super_admin,is_suspended,must_change_password)
values('fafafafa-1111-4111-8111-fafafafafafa','+221700000197','Financial Metrics CI','FM',true,false,false);
insert into public.boutiques(id,nom,ville,tel,directory_visible)
values('financial-metrics-ci','Financial Metrics CI','Dakar',null,true);
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
values(991970000001,'financial-metrics-ci','fafafafa-1111-4111-8111-fafafafafafa','owner','{"dashboard":true,"compta":true,"marges":true}'::jsonb);
select set_config('request.jwt.claims',json_build_object('sub','fafafafa-1111-4111-8111-fafafafafafa','role','authenticated')::text,true);

insert into public.products(id,boutique_id,nom,stock,low_stock_threshold,prix_achat,actif)
values(991970000001,'financial-metrics-ci','Canonical product',1,2,999,true);

insert into public.invoices(id,boutique_id,client_id,montant,invoice_date,status,type,stock_deducted_at)
values
('FM-SALE-1','financial-metrics-ci',null,100,now()-interval '2 days','payée','Vente',now()-interval '2 days'),
('FM-RETURN-1','financial-metrics-ci',null,20,now()-interval '1 day','payée','Retour',now()-interval '1 day');

insert into public.invoice_lines(id,boutique_id,invoice_id,product_id,nom,qty,sell_qty,prix_unit,prix_achat)
values(991970000001,'financial-metrics-ci','FM-SALE-1',991970000001,'Canonical product',1,1,100,999);

insert into public.stock_entries(id,boutique_id,product_id,qty,entry_date,type,prix_unit,note,reference)
values
(991970000001,'financial-metrics-ci',991970000001,2,now()-interval '3 days','achat',10,'Layer',null),
(991970000002,'financial-metrics-ci',991970000001,-1,now()-interval '2 days','vente',10,'Vente FM-SALE-1','FM-SALE-1');

insert into public.invoice_payments(id,boutique_id,invoice_id,amount,paid_at)
values(991970000001,'financial-metrics-ci','FM-SALE-1',70,now()-interval '1 day');

insert into public.client_credit_refunds(id,boutique_id,client_id,amount,payment_method,refunded_at,recorded_at,operator_id,operator_name,idempotency_key,note)
values(991970000001,'financial-metrics-ci',991970000001,5,'Espèces',now()-interval '12 hours',now()-interval '12 hours','fafafafa-1111-4111-8111-fafafafafafa','Financial Metrics CI','11111111-2222-4333-8444-555555555555','CI refund');

insert into public.charges(id,boutique_id,label,montant,categorie,charge_date,status,paid_amount,source)
values
(991970000001,'financial-metrics-ci','Loyer',10,'Loyer',now()-interval '1 day','paid',10,'manual'),
(991970000002,'financial-metrics-ci','Transfert payé',50,'Transport',now()-interval '1 day','paid',15,'transfer'),
(991970000003,'financial-metrics-ci','Réception fournisseur',40,'Achat stock',now()-interval '1 day','paid',0,'supplier_receipt'),
(991970000004,'financial-metrics-ci','Achat stock cash',4,'Achat stock',now()-interval '1 day','paid',4,'manual');

do $test$
declare
  m jsonb;
  fifo jsonb;
  from_at timestamptz := now()-interval '7 days';
  to_at timestamptz := now()+interval '1 second';
begin
  m := public.get_financial_metrics('financial-metrics-ci',from_at,to_at);
  fifo := public.get_fifo_realized_margin('financial-metrics-ci',from_at,to_at);

  if abs((m->>'invoiced_revenue')::numeric - 80) > 0.01 then raise exception 'CA facture mismatch: %',m; end if;
  if abs((m->>'collected_cash')::numeric - 65) > 0.01 then raise exception 'CA encaisse mismatch: %',m; end if;
  if (m->>'sales_count')::bigint <> 1 then raise exception 'sales_count mismatch: %',m; end if;
  if abs((m->>'average_basket')::numeric - 100) > 0.01 then raise exception 'average_basket mismatch: %',m; end if;
  if abs((m->>'customer_outstanding_global')::numeric - 30) > 0.01 then raise exception 'global outstanding mismatch: %',m; end if;
  if abs((m->>'period_outstanding')::numeric - 30) > 0.01 then raise exception 'period outstanding mismatch: %',m; end if;
  if abs((m->>'cash_expenses')::numeric - 29) > 0.01 then raise exception 'cash expenses mismatch: %',m; end if;
  if abs((m->>'operating_cash_expenses')::numeric - 25) > 0.01 then raise exception 'operating expenses mismatch: %',m; end if;
  if (m->>'low_stock_count')::bigint <> 1 then raise exception 'low stock mismatch: %',m; end if;

  if abs((m->>'realized_margin_fifo')::numeric - (fifo->>'realizedMargin')::numeric) > 0.01 then
    raise exception 'FIFO reconciliation mismatch metrics=% fifo=%',m,fifo;
  end if;
  if abs((m->>'margin_coverage_rate')::numeric - (fifo->>'coverageRate')::numeric) > 0.01 then
    raise exception 'FIFO coverage reconciliation mismatch metrics=% fifo=%',m,fifo;
  end if;
  if (m->>'margin_unmatched_lines')::bigint <> (fifo->>'unmatchedLines')::bigint then
    raise exception 'FIFO unmatched reconciliation mismatch metrics=% fifo=%',m,fifo;
  end if;
end
$test$;

rollback;
\echo financial_metrics_db_ok
