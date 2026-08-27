-- Invoice PDFs currently render the active boutique logo, not the historical
-- boutique_logo_snapshot. Keeping a base64 image on every invoice duplicated
-- ~346 KB per row and made routine sync snapshots tens of megabytes.

update public.invoices
set boutique_logo_snapshot = null
where boutique_logo_snapshot is not null;

create or replace function public.snapshot_invoice_identity()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  c public.clients%rowtype;
  b public.boutiques%rowtype;
  op_name text;
begin
  if new.client_id is not null then
    select * into c
    from public.clients
    where boutique_id = new.boutique_id and id = new.client_id;

    if found then
      new.client_nom := coalesce(c.nom, new.client_nom);
      new.client_tel := coalesce(c.tel, new.client_tel);
      new.client_email_snapshot := c.email;
      new.client_adresse_snapshot := c.adresse;
      new.client_ville_snapshot := c.ville;
      new.client_type_snapshot := c.type;
    end if;
  end if;

  select * into b from public.boutiques where id = new.boutique_id;
  if found then
    new.boutique_nom_snapshot := b.nom;
    new.boutique_ville_snapshot := b.ville;
    new.boutique_adresse_snapshot := b.adresse;
    new.boutique_tel_snapshot := b.tel;
    new.boutique_email_snapshot := b.email;
    -- Do not duplicate base64 logo data into each invoice.
    new.boutique_logo_snapshot := null;
  end if;

  if new.operator_id is not null then
    select nom into op_name from public.platform_users where id = new.operator_id;
    new.operator_nom_snapshot := op_name;
  end if;

  return new;
end;
$function$;

comment on column public.invoices.boutique_logo_snapshot is
  'Deprecated: kept for schema compatibility. Logos are not duplicated per invoice; PDF rendering uses the boutique logo.';
