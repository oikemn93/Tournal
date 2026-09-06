insert into public.charges (
  id, boutique_id, label, montant, categorie, charge_date, operator_id,
  note, created_at, updated_at, fournisseur, status, paid_amount,
  source, supplier_id, due_date, stock_entry_id
)
select
  nextval('private.charge_id_seq'),
  se.boutique_id,
  'Réception stock · ' || s.nom,
  se.qty * coalesce(se.prix_unit, 0),
  'Achat stock',
  se.entry_date,
  se.operator_id,
  coalesce(nullif(trim(se.note), ''), 'Régularisation automatique d’une réception historique'),
  now(),
  now(),
  s.nom,
  case when se.qty * coalesce(se.prix_unit, 0) = 0 then 'paid' else 'pending' end,
  0,
  'supplier_receipt',
  s.id,
  (se.entry_date at time zone 'Africa/Dakar')::date
    + coalesce(s.payment_terms_days, aset.supplier_payment_terms_days, 30),
  se.id
from public.stock_entries se
join public.suppliers s
  on s.boutique_id = se.boutique_id and s.id = se.supplier_id
left join public.auth_settings aset
  on aset.boutique_id = se.boutique_id
where se.type = 'achat'
  and se.qty > 0
  and se.supplier_id is not null
  and s.linked_boutique_id is null
  and not exists (
    select 1
    from public.charges c
    where c.boutique_id = se.boutique_id
      and c.stock_entry_id = se.id
      and c.source = 'supplier_receipt'
  );

create unique index if not exists charges_supplier_receipt_stock_entry_uidx
  on public.charges (boutique_id, stock_entry_id)
  where source = 'supplier_receipt' and stock_entry_id is not null;
