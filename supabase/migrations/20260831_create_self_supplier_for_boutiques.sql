create or replace function private.ensure_boutique_self_supplier()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1
    from public.suppliers s
    where s.boutique_id = new.id
      and s.linked_boutique_id = new.id
  ) then
    insert into public.suppliers (
      id,
      boutique_id,
      nom,
      ville,
      tel,
      email,
      contact,
      initials,
      color,
      linked_boutique_id,
      notes,
      payment_terms_days
    ) values (
      nextval('private.supplier_id_seq'),
      new.id,
      new.nom,
      new.ville,
      new.tel,
      new.email,
      'Boutique elle-même',
      upper(left(trim(new.nom), 2)),
      coalesce(new.color, '#C9A227'),
      new.id,
      'Fournisseur interne créé automatiquement à l’ouverture de la boutique.',
      0
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boutique_self_supplier on public.boutiques;
create trigger trg_boutique_self_supplier
after insert on public.boutiques
for each row execute function private.ensure_boutique_self_supplier();

insert into public.suppliers (
  id,
  boutique_id,
  nom,
  ville,
  tel,
  email,
  contact,
  initials,
  color,
  linked_boutique_id,
  notes,
  payment_terms_days
)
select
  nextval('private.supplier_id_seq'),
  b.id,
  b.nom,
  b.ville,
  b.tel,
  b.email,
  'Boutique elle-même',
  upper(left(trim(b.nom), 2)),
  coalesce(b.color, '#C9A227'),
  b.id,
  'Fournisseur interne créé automatiquement pour cette boutique.',
  0
from public.boutiques b
where not exists (
  select 1
  from public.suppliers s
  where s.boutique_id = b.id
    and s.linked_boutique_id = b.id
);

create unique index if not exists suppliers_one_self_supplier_per_boutique_idx
  on public.suppliers (boutique_id)
  where linked_boutique_id = boutique_id;
