-- AUDIT ONLY: restore current production RLS enablement state.
-- Policies were reconciled separately; this changes only relrowsecurity metadata locally.

alter table public.auth_settings enable row level security;
alter table public.boutique_assignments enable row level security;
alter table public.boutique_state enable row level security;
alter table public.boutiques enable row level security;
alter table public.export_import_log enable row level security;
alter table public.groupes enable row level security;
alter table public.platform_users enable row level security;
