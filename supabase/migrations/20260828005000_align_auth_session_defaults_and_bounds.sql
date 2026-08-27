alter table public.auth_settings alter column lock_minutes set default 10;
alter table public.auth_settings alter column session_minutes set default 720;

alter table public.auth_settings drop constraint if exists auth_settings_lock_minutes_check;
alter table public.auth_settings add constraint auth_settings_lock_minutes_check check (lock_minutes between 1 and 120);

alter table public.auth_settings drop constraint if exists auth_settings_session_minutes_check;
alter table public.auth_settings add constraint auth_settings_session_minutes_check check (session_minutes between 5 and 10080 and session_minutes >= lock_minutes);

comment on column public.auth_settings.lock_minutes is 'Idle minutes before PIN screen lock. Default 10 minutes.';
comment on column public.auth_settings.session_minutes is 'Sliding idle-session lifetime in minutes before full re-authentication. Must be >= lock_minutes. Default 720 minutes.';
