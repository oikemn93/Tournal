-- External destinations must be discovered by phone and explicitly added.
drop function if exists public.add_boutique_partner(text,text);
create function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text, p_phone text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','private' as $function$
declare v_partner public.boutiques%rowtype; v_digits text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'); v_partner_digits text;
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  if p_boutique_id=p_partner_boutique_id then raise exception 'invalid partner'; end if;
  if length(v_digits)<9 then raise exception 'partner phone required'; end if;
  select * into v_partner from public.boutiques where id=p_partner_boutique_id and directory_visible=true;
  if not found then raise exception 'partner not found'; end if;
  v_partner_digits:=regexp_replace(coalesce(v_partner.tel,''),'[^0-9]','','g');
  if length(v_partner_digits)<9 or right(v_partner_digits,9)<>right(v_digits,9) then raise exception 'partner phone mismatch'; end if;
  insert into public.boutique_partners(boutique_id,partner_boutique_id,created_by) values(p_boutique_id,p_partner_boutique_id,auth.uid()) on conflict do nothing;
  return jsonb_build_object('boutique_id',v_partner.id,'nom',v_partner.nom,'ville',v_partner.ville,'tel',v_partner.tel);
end $function$;

create or replace function public.get_boutique_partners(p_boutique_id text)
returns table(boutique_id text, nom text, ville text, tel text, transfer_count bigint)
language plpgsql security definer set search_path to 'pg_catalog','public','private' as $function$
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  return query select b.id,b.nom,coalesce(b.ville,''),coalesce(b.tel,''),(select count(*) from public.stock_transfers st where (st.from_boutique_id=p_boutique_id and st.to_boutique_id=b.id) or (st.to_boutique_id=p_boutique_id and st.from_boutique_id=b.id)) from public.boutique_partners bp join public.boutiques b on b.id=bp.partner_boutique_id where bp.boutique_id=p_boutique_id order by 5 desc,b.nom asc;
end $function$;

create or replace function public.search_boutique_directory(p_source_boutique_id text,p_query text default null)
returns table(boutique_id text,nom text,ville text,tel text,is_partner boolean,transfer_count bigint)
language plpgsql security definer set search_path to 'pg_catalog','public','private' as $function$
declare v_digits text:=regexp_replace(coalesce(p_query,''),'[^0-9]','','g'); v_last9 text;
begin
  if auth.uid() is null or not private.auth_has_permission(p_source_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  if length(v_digits)<9 then return; end if; v_last9:=right(v_digits,9);
  return query select b.id,b.nom,coalesce(b.ville,''),coalesce(b.tel,''),exists(select 1 from public.boutique_partners bp where bp.boutique_id=p_source_boutique_id and bp.partner_boutique_id=b.id),(select count(*) from public.stock_transfers st where (st.from_boutique_id=p_source_boutique_id and st.to_boutique_id=b.id) or (st.to_boutique_id=p_source_boutique_id and st.from_boutique_id=b.id)) from public.boutiques b where b.id<>p_source_boutique_id and b.directory_visible=true and length(regexp_replace(coalesce(b.tel,''),'[^0-9]','','g'))>=9 and right(regexp_replace(coalesce(b.tel,''),'[^0-9]','','g'),9)=v_last9 order by 5 desc,6 desc,b.nom asc limit 10;
end $function$;

drop function if exists public.remove_boutique_partner(text,text);
create function public.remove_boutique_partner(p_boutique_id text,p_partner_boutique_id text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $function$
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  delete from public.boutique_partners where boutique_id=p_boutique_id and partner_boutique_id=p_partner_boutique_id;
end $function$;

-- Same product may appear several times with different conditioning; protect the combined base quantity.
create or replace function private.enforce_transfer_line_total_stock() returns trigger language plpgsql set search_path to 'pg_catalog','public','private' as $function$
declare v_stock numeric; v_other numeric;
begin
  select stock into v_stock from public.products where boutique_id=new.source_boutique_id and id=new.source_product_id;
  if v_stock is null then raise exception 'source product not found'; end if;
  select coalesce(sum(qty),0) into v_other from public.stock_transfer_lines where transfer_id=new.transfer_id and source_product_id=new.source_product_id and id is distinct from new.id;
  if v_other+new.qty>v_stock then raise exception 'insufficient aggregate stock'; end if;
  return new;
end $function$;
drop trigger if exists stock_transfer_lines_total_stock_guard on public.stock_transfer_lines;
create trigger stock_transfer_lines_total_stock_guard before insert or update of qty,source_product_id on public.stock_transfer_lines for each row execute function private.enforce_transfer_line_total_stock();

create or replace function private.emit_transfer_notification(p_boutique_id text,p_title text,p_body text,p_event_key text,p_transfer_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_in_app boolean; v_push boolean;
begin
  v_in_app:=private.notification_channel_enabled(p_boutique_id,'transfer','in_app');
  v_push:=private.notification_channel_enabled(p_boutique_id,'transfer','push');
  if not v_in_app and not v_push then return; end if;
  insert into public.notifications(user_id,boutique_id,category,title,body,icon,action_tab,action_filter,source_event_key,in_app_enabled,push_enabled)
  select r.user_id,p_boutique_id,'transfer',p_title,p_body,'↔️','transferts',jsonb_build_object('transferId',p_transfer_id::text),p_event_key,v_in_app,v_push
  from (
    select distinct a.user_id from public.boutique_assignments a join public.platform_users u on u.id=a.user_id and not coalesce(u.is_suspended,false)
    where a.boutique_id=p_boutique_id and (a.role='owner' or coalesce((a.droits->>'transferts')::boolean,false))
    union select u.id from public.platform_users u where u.is_super_admin=true and not coalesce(u.is_suspended,false)
  ) r
  on conflict (source_event_key,user_id) where source_event_key is not null do nothing;
end $function$;

create or replace function private.emit_stock_transfer_notification() returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_from_name text; v_to_name text; v_lines integer; v_body text;
begin
  select nom into v_from_name from public.boutiques where id=new.from_boutique_id;
  select nom into v_to_name from public.boutiques where id=new.to_boutique_id;
  select count(*) into v_lines from public.stock_transfer_lines where transfer_id=new.id;

  if tg_op='UPDATE' and new.status='pending' and old.status='pending' and new.total_amount is distinct from old.total_amount then
    v_body:=coalesce(v_from_name,'Boutique')||' · '||v_lines||' ligne'||case when v_lines>1 then 's' else '' end||' · '||trim(to_char(coalesce(new.total_amount,0),'FM999G999G999G990D00'))||' F';
    perform private.emit_transfer_notification(new.to_boutique_id,'Nouveau transfert reçu',v_body,'transfer-arrived:'||new.id::text,new.id);
    return new;
  end if;

  if tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status='accepted' then
      perform private.emit_transfer_notification(new.from_boutique_id,'Transfert accepté',coalesce(v_to_name,'Boutique')||' a réceptionné le transfert.','transfer-accepted-source:'||new.id::text,new.id);
      perform private.emit_transfer_notification(new.to_boutique_id,'Réception de transfert enregistrée',coalesce(v_from_name,'Boutique')||' · stock réceptionné et affecté.','transfer-accepted-destination:'||new.id::text,new.id);
    elsif new.status='rejected' then
      perform private.emit_transfer_notification(new.from_boutique_id,'Transfert refusé',coalesce(v_to_name,'Boutique')||' a refusé le transfert.','transfer-rejected:'||new.id::text,new.id);
    elsif new.status='cancelled' then
      perform private.emit_transfer_notification(new.to_boutique_id,'Transfert annulé',coalesce(v_from_name,'Boutique')||' a annulé le transfert.','transfer-cancelled:'||new.id::text,new.id);
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists stock_transfers_notify on public.stock_transfers;
create trigger stock_transfers_notify after insert or update of status,total_amount on public.stock_transfers for each row execute function private.emit_stock_transfer_notification();

grant execute on function public.add_boutique_partner(text,text,text), public.get_boutique_partners(text), public.search_boutique_directory(text,text), public.remove_boutique_partner(text,text) to authenticated,service_role;
revoke all on function public.add_boutique_partner(text,text,text), public.get_boutique_partners(text), public.search_boutique_directory(text,text), public.remove_boutique_partner(text,text) from anon,public;
