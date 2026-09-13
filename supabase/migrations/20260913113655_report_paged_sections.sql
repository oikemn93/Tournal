create or replace function public.get_report_section_page(
 p_boutique_id text,p_from timestamptz,p_to timestamptz,p_section text,
 p_filters jsonb default '{}'::jsonb,p_offset integer default 0,p_limit integer default 50,
 p_sort text default 'revenue',p_direction text default 'desc',p_dormant_days integer default 60
) returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
set statement_timeout to '15s'
as $fn$
declare
 v_rows jsonb; v_base jsonb; v_columns jsonb; v_summary jsonb; v_chart jsonb; v_page jsonb;
 v_margin boolean; v_category text:=nullif(p_filters->>'categoryId','');
 v_operator uuid:=nullif(p_filters->>'operatorId','')::uuid; v_payment text:=nullif(p_filters->>'paymentMethod','');
 v_client text:=nullif(p_filters->>'clientType',''); v_entity text:=p_filters->>'entityKind'; v_id text:=p_filters->>'entityId';
 v_limit integer:=greatest(1,least(coalesce(p_limit,50),100)); v_offset integer:=greatest(0,coalesce(p_offset,0));
 v_sort text:=coalesce(p_sort,'revenue'); v_dir text:=case when p_direction='asc' then 'asc' else 'desc' end;
 v_format text; v_scope text; v_payments jsonb:='[]'; v_variances jsonb:='[]';
begin
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '366 days' then raise exception 'La période doit être comprise entre 1 instant et 366 jours'; end if;
 if not coalesce(private.auth_has_read_permission(p_boutique_id,'compta') or private.auth_has_read_permission(p_boutique_id,'dashboard'),false) then raise exception 'forbidden'; end if;
 if p_section not in ('sales','team','stock','clients') then raise exception 'invalid section'; end if;
 if jsonb_typeof(p_filters)<>'object' or length(p_filters::text)>2000 then raise exception 'invalid filters'; end if;
 if v_entity is not null and (v_entity not in ('product','client','employee') or coalesce(v_id,'')='') then raise exception 'invalid entity'; end if;
 v_margin:=coalesce(private.auth_has_read_permission(p_boutique_id,'marges'),false);
 if p_section='team' and not v_margin then raise exception 'forbidden'; end if;
 if p_section='clients' and not coalesce(private.auth_has_read_permission(p_boutique_id,'clients') or private.auth_has_read_permission(p_boutique_id,'compta'),false) then raise exception 'forbidden'; end if;
 -- Allocate invoice revenue before narrowing to a product. The canonical KPI function is never replaced or called here.
 with events as materialized (
  select e.* from private.report_filtered_sales_events(p_boutique_id,p_from,p_to,case when v_category='__uncategorized__' then '' else v_category end,v_operator,v_payment,v_client) e
  where v_entity is null or (v_entity='product' and e.product_id::text=v_id) or (v_entity='client' and e.client_id::text=v_id) or (v_entity='employee' and coalesce(e.operator_id::text,'__unassigned__')=v_id)
 ), grouped as (
  select case p_section when 'team' then coalesce(operator_id::text,'__unassigned__') when 'clients' then client_id::text else product_id::text end id,
   max(case p_section when 'team' then operator_name when 'clients' then client_name else product_name end) name,
   max(case when p_section='clients' then client_type else category_name end) category,
   sum(allocated_revenue) revenue,sum(signed_qty) quantity,
   case when v_margin then sum(allocated_revenue-signed_fifo_cost) filter(where matched) else null end margin,
   count(distinct invoice_id) filter(where invoice_type='vente') sales,
   count(distinct invoice_id) filter(where invoice_type='retour') returns,
   coalesce(sum(allocated_revenue) filter(where invoice_type='vente'),0) sale_revenue
  from events where p_section<>'clients' or client_id is not null group by 1
 ) select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('basket',case when sales>0 then sale_revenue/sales else 0 end,'return_rate',case when sales>0 then returns::numeric/sales*100 else null end)),'[]'::jsonb) into v_rows from grouped g;
 v_scope:='Activité nette sur la période et les filtres sélectionnés. Les KPI fixes restent globaux. Montants exprimés en FCFA.';
 v_columns:='[{"key":"name","label":"Produit","format":"text"},{"key":"category","label":"Catégorie","format":"text"},{"key":"quantity","label":"Unités nettes","format":"number"},{"key":"revenue","label":"CA net","format":"money"}]';
 if p_section='sales' and v_category is null and v_entity is null then
  v_base:=public.get_sales_product_report_filtered(p_boutique_id,p_from,p_to,null,v_operator,v_payment,v_client);
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_payments from (select x from jsonb_array_elements(v_base->'payment_methods') x limit 50) p;
 end if;
 if p_section='team' then
  v_columns:='[{"key":"name","label":"Employé","format":"text"},{"key":"revenue","label":"CA net","format":"money"},{"key":"sales","label":"Ventes","format":"number"},{"key":"basket","label":"Panier moyen","format":"money"},{"key":"returns","label":"Retours","format":"number"},{"key":"return_rate","label":"Retours %","format":"number"}]';
 elsif p_section='clients' then
  v_base:=public.get_client_report_filtered(p_boutique_id,p_from,p_to,case when v_category='__uncategorized__' then '' else v_category end,v_operator,v_payment,v_client);
  select coalesce(jsonb_agg(e||jsonb_build_object('outstanding',c->'outstanding_global','overdue',c->'overdue_global','credit',c->'credit_available')),'[]'::jsonb) into v_rows
   from jsonb_array_elements(v_rows) e left join jsonb_array_elements(v_base->'clients') c on c->>'client_id'=e->>'id';
  v_scope:='Activité des clients de la sélection. Encours, retards et avoirs : positions actuelles complètes de ces clients, sans allocation artificielle aux produits.';
  v_columns:='[{"key":"name","label":"Client","format":"text"},{"key":"category","label":"Type","format":"text"},{"key":"revenue","label":"CA net","format":"money"},{"key":"sales","label":"Ventes","format":"number"},{"key":"outstanding","label":"Encours actuel","format":"money"},{"key":"overdue","label":"Retard actuel","format":"money"},{"key":"credit","label":"Avoir actuel","format":"money"}]';
 elsif p_section='stock' then
  v_base:=public.get_stock_inventory_report(p_boutique_id,p_from,p_to,greatest(1,least(coalesce(p_dormant_days,60),3650)));
  select coalesce(jsonb_agg(jsonb_build_object('id',p->>'product_id','name',p->>'product_name','category',p->>'category_name','stock',p->'current_stock','quantity',coalesce(e->'quantity','0'::jsonb),'value',p->'fifo_stock_value','rotation',p->>'rotation_class','dormant',p->'dormant')),'[]'::jsonb) into v_rows
   from jsonb_array_elements(v_base->'products') p left join jsonb_array_elements(v_rows) e on e->>'id'=p->>'product_id'
   where (v_category is null or coalesce(p->>'category_id','')=case when v_category='__uncategorized__' then '' else v_category end)
     and (v_entity is distinct from 'product' or p->>'product_id'=v_id)
     and ((v_operator is null and v_payment is null and v_client is null and v_entity is distinct from 'client' and v_entity is distinct from 'employee') or e is not null);
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_variances from (select x from jsonb_array_elements(v_base->'inventory_variances') x limit 50) i;
  v_columns:='[{"key":"name","label":"Produit","format":"text"},{"key":"category","label":"Catégorie","format":"text"},{"key":"stock","label":"Stock actuel","format":"number"},{"key":"quantity","label":"Unités nettes filtrées","format":"number"},{"key":"rotation","label":"Rotation globale","format":"text"}]';
  if v_margin then v_columns:=v_columns||'[{"key":"value","label":"Valeur FIFO actuelle","format":"money"}]'::jsonb; end if;
  v_scope:='Stock, dormance et rotation : état actuel global des produits sélectionnés. Les unités vendues suivent tous les filtres et la période. Les filtres client, employé et paiement limitent le stock aux produits concernés par leur activité.';
 end if;
 if v_margin and p_section in ('sales','team','clients') then v_columns:=v_columns||'[{"key":"margin","label":"Marge FIFO couverte","format":"money"}]'::jsonb; end if;
 select c->>'format' into v_format from jsonb_array_elements(v_columns) c where c->>'key'=v_sort;
 if v_format is null then v_sort:=case when p_section='stock' then 'quantity' else 'revenue' end; v_format:='number'; end if;
 select jsonb_build_array(jsonb_build_object('label','Résultats','value',jsonb_array_length(v_rows),'format','number'),
  jsonb_build_object('label',case when p_section='stock' then 'Stock actuel' else 'CA net sélectionné' end,'value',coalesce(sum((x->>case when p_section='stock' then 'stock' else 'revenue' end)::numeric),0),'format',case when p_section='stock' then 'number' else 'money' end),
  jsonb_build_object('label','Unités nettes sur la période','value',coalesce(sum((x->>'quantity')::numeric),0),'format','number')) into v_summary from jsonb_array_elements(v_rows) x;
 if v_margin then
  select v_summary||jsonb_build_array(jsonb_build_object('label',case when p_section='stock' then 'Valeur FIFO actuelle' else 'Marge FIFO couverte' end,'value',sum((x->>case when p_section='stock' then 'value' else 'margin' end)::numeric),'format','money')) into v_summary from jsonb_array_elements(v_rows) x;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('label',x->>'name','value',coalesce((x->>case when p_section='stock' then 'quantity' else 'revenue' end)::numeric,0)) order by rank),'[]'::jsonb) into v_chart from
  (select x,row_number() over(order by coalesce((x->>case when p_section='stock' then 'quantity' else 'revenue' end)::numeric,0) desc,x->>'id') rank from jsonb_array_elements(v_rows) x order by rank limit 5) top_rows;
 select coalesce(jsonb_agg(x order by rank),'[]'::jsonb) into v_page from (
  select x,row_number() over(order by
    case when v_format='text' and v_dir='asc' then x->>v_sort end asc nulls last,
    case when v_format='text' and v_dir='desc' then x->>v_sort end desc nulls last,
    case when v_format<>'text' and v_dir='asc' then (x->>v_sort)::numeric end asc nulls last,
    case when v_format<>'text' and v_dir='desc' then (x->>v_sort)::numeric end desc nulls last,x->>'id') rank
  from jsonb_array_elements(v_rows) x order by rank limit v_limit offset v_offset) page_rows;
 return jsonb_build_object('page',jsonb_build_object('rows',v_page,'total',jsonb_array_length(v_rows),'offset',v_offset,'limit',v_limit,'sort',v_sort,'direction',v_dir,'columns',v_columns,'summary',v_summary,'chart',v_chart,'scope',v_scope,'payment_methods',v_payments,'inventory_variances',v_variances));
end
$fn$;
revoke all on function public.get_report_section_page(text,timestamptz,timestamptz,text,jsonb,integer,integer,text,text,integer) from public,anon;
grant execute on function public.get_report_section_page(text,timestamptz,timestamptz,text,jsonb,integer,integer,text,text,integer) to authenticated;

create or replace function public.search_report_entities_v2(
  p_boutique_id text,p_from timestamptz,p_to timestamptz,p_query text,
  p_category_id text default null,p_operator_id uuid default null,p_payment_method text default null,p_client_type text default null,p_limit integer default 8
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_can_margin boolean; v_q text; v_limit integer;
begin
  if not (private.auth_has_read_permission(p_boutique_id,'dashboard') or private.auth_has_read_permission(p_boutique_id,'compta')) then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '366 days' or length(coalesce(p_query,''))>100 then raise exception 'invalid search scope'; end if;
  v_can_margin:=private.auth_has_read_permission(p_boutique_id,'marges'); v_q:='%'||lower(trim(coalesce(p_query,'')))||'%'; v_limit:=greatest(1,least(coalesce(p_limit,8),20));
  if length(trim(coalesce(p_query,'')))<2 then return jsonb_build_object('hits','[]'::jsonb); end if;
  return (with events as (
    select * from private.report_filtered_sales_events(p_boutique_id,p_from,p_to,p_category_id,p_operator_id,p_payment_method,p_client_type)
  ), product_hits as (
    select 'product' kind,product_id::text id,max(product_name) label,max(category_name) subtitle,'sales' section,
      sum(allocated_revenue) invoiced_revenue,sum(signed_qty) quantity,
      case when v_can_margin then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0) else null end realized_margin_fifo
    from events where lower(product_name) like v_q group by product_id order by abs(sum(allocated_revenue)) desc limit v_limit
  ), employee_hits as (
    select 'employee' kind,coalesce(operator_id::text,'') id,max(operator_name) label,'Équipe' subtitle,'team' section,
      sum(allocated_revenue) invoiced_revenue,sum(signed_qty) quantity,
      case when v_can_margin then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0) else null end realized_margin_fifo
    from events where v_can_margin and lower(operator_name) like v_q group by operator_id order by abs(sum(allocated_revenue)) desc limit v_limit
  ), client_hits as (
    select 'client' kind,client_id::text id,max(client_name) label,max(client_type) subtitle,'clients' section,
      sum(allocated_revenue) invoiced_revenue,sum(signed_qty) quantity,
      case when v_can_margin then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0) else null end realized_margin_fifo
    from events where client_id is not null and lower(client_name) like v_q group by client_id order by abs(sum(allocated_revenue)) desc limit v_limit
  ), hits as (select * from product_hits union all select * from employee_hits union all select * from client_hits)
  select jsonb_build_object('hits',coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'label',label,'subtitle',subtitle,'section',section,
    'invoiced_revenue',invoiced_revenue,'quantity',quantity,'realized_margin_fifo',realized_margin_fifo) order by abs(invoiced_revenue) desc),'[]'::jsonb)) from hits);
end
$function$;
revoke all on function public.search_report_entities_v2(text,timestamptz,timestamptz,text,text,uuid,text,text,integer) from public,anon;
grant execute on function public.search_report_entities_v2(text,timestamptz,timestamptz,text,text,uuid,text,text,integer) to authenticated;
