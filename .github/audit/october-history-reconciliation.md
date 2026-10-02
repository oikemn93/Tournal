# Reconcile the October 1 production migration history

The canonical replay on UI PR #107 failed its production comparison because two already-applied production migrations were absent from Git:

- `20261001172144|client_approved_ops_access`
- `20261001175022|exclude_uncommitted_sales_from_fifo_margin`

Both files were recovered from the `statements` column of `supabase_migrations.schema_migrations` on project `cnxtylngddwmhugxkzju`, using a read-only query. Each ledger entry contains one statement string. The SQL is preserved, with only a final file newline added. Their original production versions are retained and added to the remote migration manifest.

This is history reconciliation, not a new deployment. Do not rerun these migrations against production or alter the production migration ledger. The first migration already requires boutique-owner consent for normal Ops access, and the second already excludes uncommitted sales from FIFO realized margin.

The Stage A access-request SQL was also compared to its production ledger entry and matches apart from a trailing blank line. No change to Stage A or the fail-closed comparison is needed. The full canonical replay and production comparison must pass before merging this reconciliation.

Evidence: https://github.com/oikemn93/Tournal/actions/runs/36987155721
