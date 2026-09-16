do $$
declare v_def text;
begin
 select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace='private'::regnamespace and p.proname='fifo_realized_margin_core' limit 1;
 if position('case when v.invoice_type=''retour'' then v.return_entry_count>0 else v.sale_entry_count>0 end matched' in v_def)=0 then raise exception 'fifo matched signature changed'; end if;
 execute replace(v_def,'case when v.invoice_type=''retour'' then v.return_entry_count>0 else v.sale_entry_count>0 end matched','case when v.invoice_type=''retour'' then v.return_entry_count>0 and v.return_fifo_cost>0 else v.sale_entry_count>0 and v.sale_fifo_cost>0 end matched');
end $$;