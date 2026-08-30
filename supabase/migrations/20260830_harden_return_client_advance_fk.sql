-- Harden future return-generated client credits without rewriting uncertain history.
-- The foreign key is intentionally NOT VALID: existing legacy rows are left untouched,
-- while new/updated rows must reference an invoice in the same boutique.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_advances_return_invoice_fk'
      and conrelid = 'public.client_advances'::regclass
  ) then
    alter table public.client_advances
      add constraint client_advances_return_invoice_fk
      foreign key (boutique_id, return_invoice_id)
      references public.invoices (boutique_id, id)
      on delete restrict
      not valid;
  end if;
end
$$;

create index if not exists client_advances_return_invoice_idx
  on public.client_advances (boutique_id, return_invoice_id)
  where return_invoice_id is not null;
