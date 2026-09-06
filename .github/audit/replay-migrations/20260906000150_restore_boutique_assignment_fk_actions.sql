-- AUDIT ONLY: align the two foundational boutique-assignment FK actions with production.

alter table public.boutique_assignments drop constraint if exists boutique_assignments_boutique_id_fkey;
alter table public.boutique_assignments add constraint boutique_assignments_boutique_id_fkey
  foreign key (boutique_id) references public.boutiques(id) on delete cascade;

alter table public.boutique_assignments drop constraint if exists boutique_assignments_user_id_fkey;
alter table public.boutique_assignments add constraint boutique_assignments_user_id_fkey
  foreign key (user_id) references public.platform_users(id) on delete cascade;
