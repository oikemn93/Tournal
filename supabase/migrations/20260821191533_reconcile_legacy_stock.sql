-- Reconcile the stock ledger with the verified legacy KV source.
--
-- Scope: only the nine legacy movements that are absent from the relational
-- project. Their original IDs are preserved so the import is idempotent and
-- future writes cannot silently create a duplicate movement.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- Match the normal stock-write order: product first, then movement ledger.
-- Reads remain available; stock writes wait briefly rather than interleaving
-- with the reconciliation snapshot.
lock table public.products in share row exclusive mode;
lock table public.stock_entries in share row exclusive mode;

create temporary table _legacy_stock_reconciliation (
  boutique_id text not null,
  id bigint not null,
  product_id bigint not null,
  type text not null check (type in ('achat', 'ajustement', 'retour', 'inventaire')),
  qty numeric not null check (qty <> 0),
  entry_date timestamptz not null,
  note text not null,
  primary key (boutique_id, id)
) on commit drop;

insert into _legacy_stock_reconciliation (
  boutique_id, id, product_id, type, qty, entry_date, note
) values
  (
    'b1785168316757', 1786672015717, 1785531554523, 'ajustement', -1,
    to_timestamp(1786672015717 / 1000.0),
    'Réconciliation historique KV | mouvement 1786672015717 | Vente → YASD | montant dû source: 0'
  ),
  (
    'b1785168316757', 1786672015719, 1785531554523, 'ajustement', -1,
    to_timestamp(1786672015719 / 1000.0),
    'Réconciliation historique KV | mouvement 1786672015719 | Vente → YASD | montant dû source: 0'
  ),
  (
    'b1785168316757', 1786672128919, 1785531554523, 'ajustement', -1,
    to_timestamp(1786672128919 / 1000.0),
    'Réconciliation historique KV | mouvement 1786672128919 | Vente → YASD | montant dû source: 0'
  ),
  (
    'b1785168316757', 1786672128921, 1785531554523, 'ajustement', -1,
    to_timestamp(1786672128921 / 1000.0),
    'Réconciliation historique KV | mouvement 1786672128921 | Vente → YASD | montant dû source: 0'
  ),
  (
    'b1785168316757', 1786675275014, 1785241249771, 'achat', 11111,
    to_timestamp(1786675275014 / 1000.0),
    'Réconciliation historique KV | mouvement 1786675275014 | Saliou Gaye | montant dû source: 122221'
  ),
  (
    'b1785168316757', 1787167062162, 1787167062161, 'achat', 300,
    to_timestamp(1787167062162 / 1000.0),
    'Réconciliation historique KV | mouvement 1787167062162 | Saliou Gaye | montant dû source: 4500000'
  ),
  (
    'b1785182214663', 1786652697622, 1785237057781, 'ajustement', -200,
    to_timestamp(1786652697622 / 1000.0),
    'Réconciliation historique KV | mouvement 1786652697622 | Vente → BINTA NIANG | montant dû source: 0'
  ),
  (
    'b1785182214663', 1786979905089, 1785236396780, 'achat', 150,
    to_timestamp(1786979905089 / 1000.0),
    'Réconciliation historique KV | mouvement 1786979905089 | SUNNY | montant dû source: 165450'
  ),
  (
    'b1786128930569', 1786889812840, 1786131798520, 'ajustement', -30,
    to_timestamp(1786889812840 / 1000.0),
    'Réconciliation historique KV | mouvement 1786889812840 | Vente → Client comptoir | montant dû source: 0'
  );

-- Refuse a same-ID collision unless it is exactly the historic movement being
-- restored. This makes an interrupted/retried deployment safe.
do $$
begin
  if exists (
    select 1
    from _legacy_stock_reconciliation expected
    join public.stock_entries current
      on current.boutique_id = expected.boutique_id
     and current.id = expected.id
    where current.product_id <> expected.product_id
       or current.qty <> expected.qty
  ) then
    raise exception 'legacy stock reconciliation found a conflicting movement ID';
  end if;
end;
$$;

-- The legacy product was never imported. Its historic source has a name,
-- unit, category, and supplier but no purchase or sale price, so zero is used
-- as the explicit unknown value rather than deriving a price from debt data.
insert into public.products (
  boutique_id, id, nom, category_id, prix_achat, prix_vente, stock, unit,
  actif, created_at, updated_at, supplier_name
)
select
  'b1785168316757',
  1787167062161,
  'brf',
  (
    select c.id
    from public.categories c
    where c.boutique_id = 'b1785168316757'
      and c.nom = 'BazinS'
    order by c.id
    limit 1
  ),
  0,
  0,
  0,
  'mètres',
  true,
  to_timestamp(1787167062161 / 1000.0),
  to_timestamp(1787167062161 / 1000.0),
  'Saliou Gaye'
where not exists (
  select 1
  from public.products p
  where p.boutique_id = 'b1785168316757'
    and p.id = 1787167062161
);

do $$
begin
  if exists (
    select 1
    from _legacy_stock_reconciliation expected
    left join public.products p
      on p.boutique_id = expected.boutique_id
     and p.id = expected.product_id
    where p.id is null
  ) then
    raise exception 'legacy stock reconciliation refers to a missing product';
  end if;
end;
$$;

insert into public.stock_entries (
  id, boutique_id, product_id, type, qty, prix_unit, entry_date, operator_id, note, created_at
)
select
  expected.id,
  expected.boutique_id,
  expected.product_id,
  expected.type,
  expected.qty,
  null,
  expected.entry_date,
  null,
  expected.note,
  expected.entry_date
from _legacy_stock_reconciliation expected
on conflict (boutique_id, id) do nothing;

do $$
begin
  if exists (
    select 1
    from _legacy_stock_reconciliation expected
    left join public.stock_entries current
      on current.boutique_id = expected.boutique_id
     and current.id = expected.id
     and current.product_id = expected.product_id
     and current.qty = expected.qty
    where current.id is null
  ) then
    raise exception 'legacy stock reconciliation did not restore every expected movement';
  end if;
end;
$$;

-- `products.stock` is the transaction guard used by the stock RPC; the UI
-- reads the ledger. Rebuild the guard from that ledger so both sources agree.
with ledger as (
  select
    p.boutique_id,
    p.id as product_id,
    coalesce(sum(entry.qty), 0) as stock
  from public.products p
  left join public.stock_entries entry
    on entry.boutique_id = p.boutique_id
   and entry.product_id = p.id
  group by p.boutique_id, p.id
)
update public.products p
set stock = ledger.stock,
    updated_at = now()
from ledger
where p.boutique_id = ledger.boutique_id
  and p.id = ledger.product_id
  and p.stock is distinct from ledger.stock;

-- The normal RPC obtains IDs from this sequence. Preserve the legacy source
-- IDs and advance the sequence so a future write cannot collide with them.
select setval(
  'private.stock_entry_id_seq',
  greatest(
    (select last_value from private.stock_entry_id_seq),
    (select max(id) from public.stock_entries)
  ),
  true
);

commit;
