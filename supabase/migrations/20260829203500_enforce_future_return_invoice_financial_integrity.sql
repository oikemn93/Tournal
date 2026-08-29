-- Future-only return hardening. Historical returns are intentionally left untouched.
-- New credit notes must remain tied to a valid source sale and their settlement
-- split must be internally consistent. Registered-client returns cannot create
-- an immediate cash/mobile-money refund; cash refunds remain a separate action.

create or replace function private.guard_future_return_invoice_integrity()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_source public.invoices%rowtype;
  v_refund numeric := coalesce(new.return_refund_amount, 0);
  v_receivable numeric := coalesce(new.return_receivable_reduction, 0);
  v_credit numeric := coalesce(new.return_credit_restore, 0);
begin
  if lower(coalesce(new.type, '')) <> 'retour' then
    return new;
  end if;

  if new.return_of_invoice_id is null then
    raise exception 'return source invoice required';
  end if;

  select * into v_source
  from public.invoices
  where boutique_id = new.boutique_id
    and id = new.return_of_invoice_id;

  if not found then
    raise exception 'return source invoice not found';
  end if;
  if lower(coalesce(v_source.type, '')) = 'retour' then
    raise exception 'cannot return a return';
  end if;
  if v_source.status = 'annulée' then
    raise exception 'cannot return a cancelled invoice';
  end if;
  if new.client_id is distinct from v_source.client_id then
    raise exception 'return client must match source invoice';
  end if;
  if coalesce(new.montant, 0) <= 0 then
    raise exception 'return amount must be positive';
  end if;
  if v_refund < 0 or v_receivable < 0 or v_credit < 0 then
    raise exception 'return settlement components must be non-negative';
  end if;
  if abs((v_refund + v_receivable + v_credit) - new.montant) > 0.01 then
    raise exception 'return settlement split must equal return amount';
  end if;

  -- Registered clients always receive a receivable reduction and/or client
  -- credit first. Any actual cash refund is a separate, explicit operation.
  if v_source.client_id is not null and v_refund > 0.01 then
    raise exception 'registered client return cannot refund immediately';
  end if;
  if v_source.client_id is null and v_credit > 0.01 then
    raise exception 'counter sale return cannot create registered client credit';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_future_return_invoice_integrity() from public, anon, authenticated;

drop trigger if exists trg_guard_future_return_invoice_integrity on public.invoices;
create trigger trg_guard_future_return_invoice_integrity
before insert on public.invoices
for each row
execute function private.guard_future_return_invoice_integrity();
