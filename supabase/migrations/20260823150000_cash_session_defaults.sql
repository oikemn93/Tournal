-- Boutique-owned defaults for the cash desk.  These values only provide a
-- suggested opening float and visible reminders; closing a cash session
-- remains an explicit, audited cashier action.
alter table public.auth_settings
  add column if not exists caisse_daily_control_enabled boolean not null default false,
  add column if not exists caisse_default_opening_float numeric not null default 0,
  add column if not exists caisse_opening_reminder_time time without time zone,
  add column if not exists caisse_closing_reminder_time time without time zone;

alter table public.auth_settings
  drop constraint if exists auth_settings_caisse_default_opening_float_nonnegative,
  add constraint auth_settings_caisse_default_opening_float_nonnegative
    check (caisse_default_opening_float >= 0);

comment on column public.auth_settings.caisse_daily_control_enabled is
  'Enables visible opening/closing cash desk reminders for the boutique.';
comment on column public.auth_settings.caisse_default_opening_float is
  'Suggested opening float; the cashier can change it before opening.';
