select
  i.boutique_id,
  max(i.numero) as max_invoice_numero,
  c.next_num as counter_next_numero,
  case
    when c.next_num = coalesce(max(i.numero), 0) + 1 then 'ok'
    else 'mismatch'
  end as status
from public.invoices i
full join private.invoice_counters c
  on c.boutique_id = i.boutique_id
group by i.boutique_id, c.next_num
order by i.boutique_id;

select
  boutique_id,
  next_num,
  updated_at
from private.invoice_counters
order by boutique_id;

