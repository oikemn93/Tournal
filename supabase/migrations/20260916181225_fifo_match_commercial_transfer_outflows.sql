do $$
declare v_def text; v_old text; v_new text;
begin
 select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.pronamespace='private'::regnamespace and p.proname='fifo_realized_margin_core' limit 1;
 v_old := '          se.source_invoice_id=w.invoice_id
          or se.note=''Vente ''||w.invoice_id
          or se.note like ''%| ''||w.invoice_id
          or se.reference=w.invoice_id
        )';
 v_new := '          se.source_invoice_id=w.invoice_id
          or se.note=''Vente ''||w.invoice_id
          or se.note like ''%| ''||w.invoice_id
          or se.reference=w.invoice_id
          or exists (
            select 1 from public.stock_transfers st
            where st.id=se.transfer_id
              and st.from_boutique_id=p_boutique_id
              and st.invoice_id=w.invoice_id
          )
        )';
 if position(v_old in v_def)=0 then raise exception 'fifo core signature changed; migration aborted'; end if;
 execute replace(v_def,v_old,v_new);
end $$;
