# Tournal

React + Vite + Tailwind CSS application backed by Supabase.

## Development Server

When running inside Figma Make, a Vite development server may already be available on `$PORT` (default 8443). Do not start a second server unless needed.

## Canonical Project Structure

The repository contains an old scaffold at `src/App.tsx`; it is **not** the application entrypoint. Use the paths below as the source of truth.

- `src/main.tsx` - React entrypoint; imports `src/styles/index.css` and mounts `src/app/App.tsx` into `#root`.
- `src/app/App.tsx` - Current application shell/orchestration. It is still a large migration-era file; prefer the relational modules under `src/app/screens/` for new feature work.
- `src/app/screens/` - Relational feature screens such as Stock, POS, Factures, Clients, Fournisseurs, Charges, Rapport, Transfers, Inventory, and Administration.
- `src/app/types.ts` - Shared application domain types used by modular screens.
- `src/app/utils/` - Shared formatting, invoice, inventory, payment, and sales helpers.
- `src/lib/api.ts` - Browser Supabase client and canonical REST/RPC/Realtime data access.
- `src/lib/notifications.ts` - Notification and Web Push data access.
- `src/styles/index.css` - Global CSS/Tailwind entrypoint.
- `supabase/migrations/` - Database schema, RLS, RPC, Realtime, and operational migrations. Production changes must be represented here after being applied.
- `supabase/functions/` - Supabase Edge Functions.
- `public/service-worker.js` - PWA shell caching and Web Push handler.
- `.github/workflows/ci.yml` - Build/security checks.
- `scripts/check-no-network-polling.mjs` - Guard against fixed-interval network polling.

## Data Ownership Rules

- Supabase relational tables/RPCs are the source of truth. Do not introduce browser-only business persistence for stock, invoices, payments, clients, suppliers, charges, inventory, or transfers.
- UI `onUpdate(...)` callbacks are for immediate local reconciliation after a successful server mutation; they are not persistence APIs.
- Realtime Sync v2 carries identifiers/revisions only. Fetch canonical changed rows through `src/lib/api.ts`; do not reintroduce full-state polling or global JSON blobs.
- Avoid `select=*` for growing/heavy records when a narrow projection is practical, especially invoices.
- Do not store large base64 assets per business record. Boutique logos must have one canonical reference; invoice rows must not duplicate image payloads.
- Privileged Supabase credentials must never reach browser source. Browser access uses the publishable key plus RLS/RPC authorization.

## Code Quality

- Run the production build before delivery.
- Keep `scripts/check-no-network-polling.mjs` passing.
- Preserve session storage hardening in `src/lib/api.ts`; auth tokens must not be moved to `localStorage`.
- For new or migrated screens, prefer the modular component under `src/app/screens/` rather than adding more embedded feature logic to `src/app/App.tsx`.
- Every success toast for a business mutation should be shown only after the server mutation has succeeded.
