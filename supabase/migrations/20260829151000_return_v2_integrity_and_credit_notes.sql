-- Return v2: exact source-line identity, credit-note numbering, structured stock links,
-- safe settlement split, FIFO-cost restoration, and caisse enforcement for cash refunds.

create table if not exists private.credit_note_counters (
  boutique_id text primary key references public.boutiques(id) on delete cascade,
  next_num bigint not null check (next_num > 0),
  updated_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists credit_note_number bigint,
  add column if not exists return_refund_amount numeric(12,2) not null default 0,
  add column if not exists return_receivable_reduction numeric(12,2) not null default 0,
  add column if not exists return_credit_restore numeric(12,2) not null default 0;
alter table public.invoice_lines add column if not exists source_invoice_line_id bigint;
alter table public.stock_entries
  add column if not exists source_invoice_id text,
  add column if not exists source_invoice_line_id bigint,
  add column if not exists return_invoice_id text,
  add column if not exists return_invoice_line_id bigint;

create unique index if not exists invoices_credit_note_number_uidx on public.invoices(boutique_id,credit_note_number) where type='Retour' and credit_note_number is not null;
create index if not exists invoice_lines_source_line_idx on public.invoice_lines(source_invoice_line_id) where source_invoice_line_id is not null;
create index if not exists stock_entries_source_invoice_idx on public.stock_entries(boutique_id,source_invoice_id) where source_invoice_id is not null;
create index if not exists stock_entries_source_line_idx on public.stock_entries(source_invoice_line_id) where source_invoice_line_id is not null;
create index if not exists stock_entries_return_invoice_idx on public.stock_entries(boutique_id,return_invoice_id) where return_invoice_id is not null;

with ranked as (
  select boutique_id,id,row_number() over(partition by boutique_id order by invoice_date,created_at,id)::bigint rn
  from public.invoices where type='Retour'
)
update public.invoices i set credit_note_number=r.rn from ranked r
where i.boutique_id=r.boutique_id and i.id=r.id and i.credit_note_number is null;

insert into private.credit_note_counters(boutique_id,next_num,updated_at)
select b.id,coalesce(max(i.credit_note_number),0)+1,now()
from public.boutiques b left join public.invoices i on i.boutique_id=b.id and i.type='Retour'
group by b.id
on conflict (boutique_id) do update set next_num=greatest(private.credit_note_counters.next_num,excluded.next_num),updated_at=now();

create or replace function private.next_credit_note_number(p_boutique_id text)
returns bigint language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare v_num bigint;
begin
  perform pg_advisory_xact_lock(hashtext('credit:'||p_boutique_id));
  insert into private.credit_note_counters(boutique_id,next_num,updated_at)
  values(p_boutique_id,coalesce((select max(credit_note_number)+1 from public.invoices where boutique_id=p_boutique_id and type='Retour'),1),now())
  on conflict (boutique_id) do update set next_num=greatest(private.credit_note_counters.next_num,excluded.next_num),updated_at=now();
  update private.credit_note_counters set next_num=next_num+1,updated_at=now() where boutique_id=p_boutique_id returning next_num-1 into v_num;
  return v_num;
end $$;

with line_ranked as (
  select l.id line_id,l.boutique_id,l.invoice_id,l.product_id,row_number() over(partition by l.boutique_id,l.invoice_id,l.product_id order by l.id) rn
  from public.invoice_lines l join public.invoices i on i.boutique_id=l.boutique_id and i.id=l.invoice_id where i.type<>'Retour'
), entry_ranked as (
  select se.id entry_id,se.boutique_id,se.product_id,substring(se.note from 7) invoice_id,row_number() over(partition by se.boutique_id,substring(se.note from 7),se.product_id order by se.id) rn
  from public.stock_entries se where se.qty<0 and se.note like 'Vente %'
), matched as (
  select e.entry_id,e.boutique_id,l.invoice_id,l.line_id from entry_ranked e join line_ranked l on l.boutique_id=e.boutique_id and l.invoice_id=e.invoice_id and l.product_id=e.product_id and l.rn=e.rn
)
update public.stock_entries se set source_invoice_id=m.invoice_id,source_invoice_line_id=m.line_id from matched m
where se.boutique_id=m.boutique_id and se.id=m.entry_id and (se.source_invoice_id is null or se.source_invoice_line_id is null);

with returns as (
  select r.boutique_id,r.id return_id,r.return_of_invoice_id source_id from public.invoices r where r.type='Retour' and r.return_of_invoice_id is not null
), ret_lines as (
  select l.id return_line_id,l.boutique_id,l.invoice_id,l.product_id,row_number() over(partition by l.boutique_id,l.invoice_id,l.product_id order by l.id) rn
  from public.invoice_lines l join returns r on r.boutique_id=l.boutique_id and r.return_id=l.invoice_id
), src_lines as (
  select r.return_id,l.id source_line_id,l.boutique_id,l.product_id,row_number() over(partition by r.return_id,l.product_id order by l.id) rn
  from returns r join public.invoice_lines l on l.boutique_id=r.boutique_id and l.invoice_id=r.source_id
)
update public.invoice_lines rl set source_invoice_line_id=sl.source_line_id
from ret_lines rr join src_lines sl on sl.return_id=rr.invoice_id and sl.boutique_id=rr.boutique_id and sl.product_id=rr.product_id and sl.rn=rr.rn
where rl.id=rr.return_line_id and rl.source_invoice_line_id is null;

with ret as (
  select r.boutique_id,r.id return_id,r.return_of_invoice_id source_id,rl.id return_line_id,rl.source_invoice_line_id,rl.product_id,
    row_number() over(partition by r.boutique_id,r.return_of_invoice_id,rl.product_id order by r.invoice_date,r.id,rl.id) rn
  from public.invoices r join public.invoice_lines rl on rl.boutique_id=r.boutique_id and rl.invoice_id=r.id
  where r.type='Retour' and r.return_of_invoice_id is not null
), se_ranked as (
  select se.id entry_id,se.boutique_id,substring(se.note from 8) source_id,se.product_id,row_number() over(partition by se.boutique_id,substring(se.note from 8),se.product_id order by se.entry_date,se.id) rn
  from public.stock_entries se where se.type='retour' and se.note like 'Retour %'
)
update public.stock_entries se set source_invoice_id=r.source_id,source_invoice_line_id=r.source_invoice_line_id,return_invoice_id=r.return_id,return_invoice_line_id=r.return_line_id
from se_ranked sr join ret r on r.boutique_id=sr.boutique_id and r.source_id=sr.source_id and r.product_id=sr.product_id and r.rn=sr.rn
where se.boutique_id=sr.boutique_id and se.id=sr.entry_id;

with candidates as (
  select rse.boutique_id,rse.id return_entry_id,sse.id sale_entry_id,sse.product_id,sse.qty sale_qty,
    private.fifo_outflow_cost(sse.boutique_id,sse.product_id,sse.id) fifo_cost
  from public.stock_entries rse join public.stock_entries sse on sse.boutique_id=rse.boutique_id and sse.source_invoice_line_id=rse.source_invoice_line_id and sse.qty<0
  where rse.type='retour' and coalesce(rse.prix_unit,0)=0 and rse.source_invoice_line_id is not null
), fixed as (
  select *,case when abs(sale_qty)>0 then fifo_cost/abs(sale_qty) else 0 end unit_cost from candidates
)
update public.stock_entries se set prix_unit=round(f.unit_cost,2) from fixed f
where se.boutique_id=f.boutique_id and se.id=f.return_entry_id and f.unit_cost>0;
update public.invoice_lines rl set prix_achat=se.prix_unit from public.stock_entries se
where se.return_invoice_line_id=rl.id and se.type='retour' and se.prix_unit>0 and coalesce(rl.prix_achat,0)=0;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='invoices_return_of_fk') then alter table public.invoices add constraint invoices_return_of_fk foreign key (boutique_id,return_of_invoice_id) references public.invoices(boutique_id,id) on delete restrict not valid; end if;
  if not exists(select 1 from pg_constraint where conname='invoices_return_shape_check') then alter table public.invoices add constraint invoices_return_shape_check check ((type='Retour' and return_of_invoice_id is not null) or (type<>'Retour' and return_of_invoice_id is null)) not valid; end if;
  if not exists(select 1 from pg_constraint where conname='invoice_lines_source_line_fk') then alter table public.invoice_lines add constraint invoice_lines_source_line_fk foreign key (source_invoice_line_id) references public.invoice_lines(id) on delete restrict not valid; end if;
  if not exists(select 1 from pg_constraint where conname='stock_entries_source_invoice_fk') then alter table public.stock_entries add constraint stock_entries_source_invoice_fk foreign key (boutique_id,source_invoice_id) references public.invoices(boutique_id,id) on delete restrict not valid; end if;
  if not exists(select 1 from pg_constraint where conname='stock_entries_return_invoice_fk') then alter table public.stock_entries add constraint stock_entries_return_invoice_fk foreign key (boutique_id,return_invoice_id) references public.invoices(boutique_id,id) on delete restrict not valid; end if;
  if not exists(select 1 from pg_constraint where conname='stock_entries_source_line_fk') then alter table public.stock_entries add constraint stock_entries_source_line_fk foreign key (source_invoice_line_id) references public.invoice_lines(id) on delete restrict not valid; end if;
  if not exists(select 1 from pg_constraint where conname='stock_entries_return_line_fk') then alter table public.stock_entries add constraint stock_entries_return_line_fk foreign key (return_invoice_line_id) references public.invoice_lines(id) on delete restrict not valid; end if;
end $$;

with paid as (
  select i.boutique_id,i.id,i.montant,i.acompte,coalesce(sum(p.amount),0) payment_total
  from public.invoices i left join public.invoice_payments p on p.boutique_id=i.boutique_id and p.invoice_id=i.id
  where i.type='Retour' and i.return_of_invoice_id is not null group by i.boutique_id,i.id,i.montant,i.acompte
)
update public.invoices i set return_refund_amount=least(i.montant,case when p.payment_total>0 then p.payment_total else coalesce(p.acompte,0) end),return_receivable_reduction=0,return_credit_restore=0
from paid p where i.boutique_id=p.boutique_id and i.id=p.id and coalesce(i.return_refund_amount,0)=0 and coalesce(i.return_receivable_reduction,0)=0 and coalesce(i.return_credit_restore,0)=0;

create or replace function public.return_sale(p_boutique_id text,p_invoice_id text,p_idempotency_key uuid,p_lines jsonb,p_refund_method text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare
  v_epsilon constant numeric:=0.01; v_user uuid:=auth.uid(); v_operator_name text; v_existing jsonb; v_original public.invoices%rowtype;
  v_line jsonb; v_source public.invoice_lines%rowtype; v_qty numeric; v_match_count integer; v_resolved jsonb:='[]'::jsonb;
  v_already_returned numeric; v_available numeric; v_base_refund_unit numeric; v_return_sell_qty numeric; v_return_id text; v_credit_num bigint;
  v_total numeric:=0; v_response jsonb; v_returned_at timestamptz:=now(); v_refund_method text; v_payment_id bigint; v_return_line_id bigint;
  v_sale_entry_id bigint; v_sale_entry_qty numeric; v_fifo_cost numeric; v_actual_unit_cost numeric; v_paid_total numeric; v_external_paid numeric; v_advance_paid numeric;
  v_prior_refund numeric; v_prior_receivable numeric; v_prior_credit numeric; v_remaining_unpaid numeric; v_remaining_external numeric; v_remaining_advance numeric; v_remaining_value numeric;
  v_refund_amount numeric:=0; v_receivable_reduction numeric:=0; v_credit_restore numeric:=0; v_advance_id bigint; v_advance_key uuid;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id,'remboursement') then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='return_sale' and key=p_idempotency_key; if v_existing is not null then return v_existing; end if;
  select * into v_original from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_original.type,''))='retour' then raise exception 'cannot return a return'; end if;
  if v_original.status='annulée' then raise exception 'cannot return a cancelled invoice'; end if;
  if v_original.stock_deducted_at is null then raise exception 'sale stock was not committed'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'lines required'; end if;
  v_refund_method:=coalesce(nullif(btrim(p_refund_method),''),nullif(btrim(v_original.payment_method),''),'Autre');
  if v_refund_method not in ('Espèces','Wave','Orange Money','Autre') then raise exception 'invalid refund payment method'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty:=round(coalesce((v_line->>'qty')::numeric,0),3); if v_qty<=0 then raise exception 'invalid return quantity'; end if;
    if nullif(v_line->>'sourceLineId','') is not null then
      select * into v_source from public.invoice_lines where id=(v_line->>'sourceLineId')::bigint and boutique_id=p_boutique_id and invoice_id=p_invoice_id;
      if not found then raise exception 'source invoice line not found'; end if;
    else
      select count(*) into v_match_count from public.invoice_lines where boutique_id=p_boutique_id and invoice_id=p_invoice_id and product_id=(v_line->>'productId')::bigint;
      if v_match_count<>1 then raise exception 'sourceLineId required for duplicate product lines'; end if;
      select * into v_source from public.invoice_lines where boutique_id=p_boutique_id and invoice_id=p_invoice_id and product_id=(v_line->>'productId')::bigint limit 1;
    end if;
    v_resolved:=v_resolved||jsonb_build_array(jsonb_build_object('sourceLineId',v_source.id,'qty',v_qty));
  end loop;

  for v_line in select jsonb_build_object('sourceLineId',(x->>'sourceLineId')::bigint,'qty',sum((x->>'qty')::numeric)) from jsonb_array_elements(v_resolved) x group by (x->>'sourceLineId')::bigint loop
    select * into v_source from public.invoice_lines where id=(v_line->>'sourceLineId')::bigint and boutique_id=p_boutique_id and invoice_id=p_invoice_id;
    v_qty:=round((v_line->>'qty')::numeric,3);
    select coalesce(sum(rl.qty),0) into v_already_returned from public.invoice_lines rl join public.invoices ri on ri.boutique_id=rl.boutique_id and ri.id=rl.invoice_id
    where ri.boutique_id=p_boutique_id and ri.type='Retour' and ri.return_of_invoice_id=p_invoice_id and rl.source_invoice_line_id=v_source.id;
    v_available:=greatest(0,v_source.qty-v_already_returned); if v_qty>v_available+0.0005 then raise exception 'return quantity exceeds remaining quantity for source line %',v_source.id; end if;
    v_base_refund_unit:=case when v_source.qty>0 then ((coalesce(v_source.sell_qty,v_source.qty)*v_source.prix_unit)/v_source.qty) else 0 end; v_total:=v_total+v_qty*v_base_refund_unit;
  end loop;
  v_total:=round(v_total,2); if v_total<=0 then raise exception 'return amount must be positive'; end if;

  select coalesce(sum(p.amount),0),coalesce(sum(p.amount) filter(where p.source='client_advance'),0) into v_paid_total,v_advance_paid from public.invoice_payments p where p.boutique_id=p_boutique_id and p.invoice_id=p_invoice_id;
  if v_paid_total=0 and coalesce(v_original.acompte,0)>0 then v_paid_total:=v_original.acompte; end if; v_external_paid:=greatest(0,v_paid_total-v_advance_paid);
  select coalesce(sum(return_refund_amount),0),coalesce(sum(return_receivable_reduction),0),coalesce(sum(return_credit_restore),0) into v_prior_refund,v_prior_receivable,v_prior_credit from public.invoices where boutique_id=p_boutique_id and type='Retour' and return_of_invoice_id=p_invoice_id;
  v_remaining_unpaid:=greatest(0,v_original.montant-v_paid_total-v_prior_receivable); v_remaining_advance:=greatest(0,v_advance_paid-v_prior_credit); v_remaining_external:=greatest(0,v_external_paid-v_prior_refund); v_remaining_value:=v_total;
  v_receivable_reduction:=least(v_remaining_value,v_remaining_unpaid); v_remaining_value:=round(v_remaining_value-v_receivable_reduction,2);
  v_credit_restore:=least(v_remaining_value,v_remaining_advance); v_remaining_value:=round(v_remaining_value-v_credit_restore,2);
  v_refund_amount:=least(v_remaining_value,v_remaining_external); v_remaining_value:=round(v_remaining_value-v_refund_amount,2);
  if v_remaining_value>v_epsilon then raise exception 'return amount exceeds remaining financial basis'; end if;

  v_credit_num:=private.next_credit_note_number(p_boutique_id); v_return_id:='A'||to_char(v_returned_at,'YYMMDD')||'-'||lpad(v_credit_num::text,6,'0');
  select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name:=coalesce(v_operator_name,'Utilisateur');
  insert into public.invoices(id,boutique_id,numero,credit_note_number,client_id,client_nom,client_tel,montant,acompte,invoice_date,status,type,payment_method,operator_id,stock_deducted_at,return_of_invoice_id,return_refund_amount,return_receivable_reduction,return_credit_restore,client_email_snapshot,client_adresse_snapshot,client_ville_snapshot,client_type_snapshot,boutique_nom_snapshot,boutique_ville_snapshot,boutique_adresse_snapshot,boutique_tel_snapshot,boutique_email_snapshot,boutique_logo_snapshot,operator_nom_snapshot,origin)
  values(v_return_id,p_boutique_id,-v_credit_num,v_credit_num,v_original.client_id,v_original.client_nom,v_original.client_tel,v_total,v_refund_amount,v_returned_at,'retour','Retour',case when v_refund_amount>0 then v_refund_method else null end,v_user,v_returned_at,p_invoice_id,v_refund_amount,v_receivable_reduction,v_credit_restore,v_original.client_email_snapshot,v_original.client_adresse_snapshot,v_original.client_ville_snapshot,v_original.client_type_snapshot,v_original.boutique_nom_snapshot,v_original.boutique_ville_snapshot,v_original.boutique_adresse_snapshot,v_original.boutique_tel_snapshot,v_original.boutique_email_snapshot,v_original.boutique_logo_snapshot,v_operator_name,v_original.origin);
  if v_refund_amount>0 then insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source) values(p_boutique_id,v_return_id,v_refund_amount,v_refund_method,v_returned_at,v_user,v_operator_name,p_idempotency_key,'invoice') returning id into v_payment_id; end if;
  if v_credit_restore>0 then
    if v_original.client_id is null then raise exception 'cannot restore client credit without registered client'; end if;
    v_advance_key:=md5(p_idempotency_key::text||':return-credit')::uuid;
    insert into public.client_advances(boutique_id,client_id,amount,payment_method,paid_at,recorded_at,operator_id,operator_name,idempotency_key,note,allocated_amount)
    values(p_boutique_id,v_original.client_id,v_credit_restore,'Autre',v_returned_at,v_returned_at,v_user,v_operator_name,v_advance_key,'Avoir restauré par '||v_return_id||' sur '||p_invoice_id,0) returning id into v_advance_id;
  end if;
  for v_line in select jsonb_build_object('sourceLineId',(x->>'sourceLineId')::bigint,'qty',sum((x->>'qty')::numeric)) from jsonb_array_elements(v_resolved) x group by (x->>'sourceLineId')::bigint loop
    select * into v_source from public.invoice_lines where id=(v_line->>'sourceLineId')::bigint; v_qty:=round((v_line->>'qty')::numeric,3);
    v_return_sell_qty:=case when v_source.sell_unit is null or v_source.sell_qty is null or v_source.qty<=0 then null else v_source.sell_qty*v_qty/v_source.qty end;
    select se.id,se.qty into v_sale_entry_id,v_sale_entry_qty from public.stock_entries se where se.boutique_id=p_boutique_id and se.source_invoice_line_id=v_source.id and se.qty<0 order by se.entry_date,se.id limit 1;
    v_actual_unit_cost:=coalesce(v_source.prix_achat,0); if v_sale_entry_id is not null and abs(coalesce(v_sale_entry_qty,0))>0 then v_fifo_cost:=private.fifo_outflow_cost(p_boutique_id,v_source.product_id,v_sale_entry_id); if v_fifo_cost>0 then v_actual_unit_cost:=v_fifo_cost/abs(v_sale_entry_qty); end if; end if;
    insert into public.invoice_lines(boutique_id,invoice_id,product_id,nom,qty,unit,prix_unit,sell_unit,sell_qty,prix_achat,source_invoice_line_id)
    values(p_boutique_id,v_return_id,v_source.product_id,v_source.nom,v_qty,v_source.unit,v_source.prix_unit,v_source.sell_unit,v_return_sell_qty,case when v_actual_unit_cost>0 then round(v_actual_unit_cost,4) else null end,v_source.id) returning id into v_return_line_id;
    update public.products set stock=stock+v_qty where boutique_id=p_boutique_id and id=v_source.product_id; if not found then raise exception 'product not found for return line %',v_source.product_id; end if;
    insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,source_invoice_id,source_invoice_line_id,return_invoice_id,return_invoice_line_id)
    values(nextval('private.stock_entry_id_seq'),p_boutique_id,v_source.product_id,'retour',v_qty,round(coalesce(v_actual_unit_cost,0),2),v_returned_at,v_user,'Retour '||p_invoice_id,p_invoice_id,v_source.id,v_return_id,v_return_line_id);
  end loop;
  v_response:=jsonb_build_object('return_invoice_id',v_return_id,'credit_note_number',v_credit_num,'source_invoice_id',p_invoice_id,'total',v_total,'returned_at',v_returned_at,'refund_method',case when v_refund_amount>0 then v_refund_method else null end,'refund_amount',v_refund_amount,'receivable_reduction',v_receivable_reduction,'credit_restore',v_credit_restore,'restored_advance_id',v_advance_id,'payment',case when v_payment_id is null then null else jsonb_build_object('id',v_payment_id,'amount',v_refund_amount,'payment_method',v_refund_method,'paid_at',v_returned_at,'operator_id',v_user,'operator_name',v_operator_name,'batch_id',p_idempotency_key,'source','invoice') end);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'return_sale',p_idempotency_key,v_response); return v_response;
end $$;

create or replace function private.enforce_daily_caisse_on_receipt()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_enabled boolean:=false; v_open_today boolean:=false;
begin
  if auth.uid() is null then return new; end if;
  select coalesce(s.caisse_daily_control_enabled,false) into v_enabled from public.auth_settings s where s.boutique_id=new.boutique_id;
  if not coalesce(v_enabled,false) then return new; end if;
  if tg_table_name='invoice_payments' and (coalesce(new.amount,0)<=0 or coalesce(new.source,'') in ('client_advance','legacy_backfill')) then return new; end if;
  select exists(select 1 from public.caisse_sessions cs where cs.boutique_id=new.boutique_id and cs.closed_at is null and (cs.opened_at at time zone 'Africa/Dakar')::date=(now() at time zone 'Africa/Dakar')::date) into v_open_today;
  if not v_open_today then raise exception 'caisse_opening_required' using hint='Ouvrez la caisse du jour avant tout encaissement ou remboursement.'; end if; return new;
end $$;

revoke all on function public.return_sale(text,text,uuid,jsonb,text) from public,anon;
grant execute on function public.return_sale(text,text,uuid,jsonb,text) to authenticated,service_role;
revoke all on function private.next_credit_note_number(text) from public,anon,authenticated;
grant execute on function private.next_credit_note_number(text) to service_role;
