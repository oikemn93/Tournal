alter table public.boutiques
  alter column id set default ('b' || replace(gen_random_uuid()::text, '-', ''));
