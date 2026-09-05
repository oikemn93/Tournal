alter table public.boutiques
  add column if not exists owner_id uuid references public.platform_users(id) on delete set null;
