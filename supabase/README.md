# Supabase

The production project is managed through the Supabase CLI / dashboard and has
the following applied migrations:

- `tournal_additive_relational_schema`
- `tournal_harden_internal_functions_and_auth_profile`
- `tournal_secure_compatibility_state`
- `restrict_profile_writes_to_super_admins`
- `optimize_profile_select_policy`
- `index_fk_columns_for_growth`

The former one-shot SQL file was removed because it began by dropping every
application table. Before any future database change, link the CLI to the
project, run `supabase db pull`, then create and apply a new additive migration.

`admin-provision` is the only application Edge Function. It requires a valid
JWT and authorizes each operation against `platform_users.is_super_admin`.
