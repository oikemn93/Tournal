create index if not exists transfer_charge_payments_transfer_idx on public.transfer_charge_payments(transfer_id);
create index if not exists transfer_charge_payments_operator_idx on public.transfer_charge_payments(operator_id);
create index if not exists transfer_charge_payments_charge_idx on public.transfer_charge_payments(boutique_id,charge_id);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='transfer_charge_payments_charge_fk') then
    alter table public.transfer_charge_payments
      add constraint transfer_charge_payments_charge_fk
      foreign key(boutique_id,charge_id)
      references public.charges(boutique_id,id) not valid;
  end if;
end $$;
