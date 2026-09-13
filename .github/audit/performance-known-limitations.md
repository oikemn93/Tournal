# Performance and transactional integrity — known validation limit

Status as of 2026-09-13: **GO for the current Tournal usage profile** (11 boutiques, typically a few concurrent employees per boutique), including POS offline Phase 1 with the cold-start limitation documented below.

## Evidence already validated

- Multi-tenant read load was exercised with concurrent sessions distributed across several boutiques.
- 10 concurrent sessions: p95 about 227 ms, 0 errors.
- 25 concurrent sessions: p95 about 423–487 ms, 0 errors.
- 32 concurrent sessions across 10 boutiques: p95 about 748 ms, p99 about 752 ms, 0 errors. This was the concurrency ceiling of the internal PostgreSQL test generator.
- Transactional retry/integrity scenarios were validated sequentially at 10, 25, 50 and 100 iterations with 0 double sale, 0 double payment, and 0 invoice/payment/stock divergence.
- POS offline Phase 1 preserves the original sale idempotency key across queue/replay and validates the "server committed but response was lost" retry path repeatedly before release.
- The normal online `create_sale` path is exercised through the service-worker interception layer to ensure a healthy server response is passed through unchanged and does not create an `OFF-*` invoice.

## Known limit — real simultaneous write concurrency

**Real simultaneous write concurrency was not executed.** The transactional integrity campaign above proves retry/idempotency and invoice/payment/stock consistency sequentially, but it does not prove those invariants under many genuinely concurrent writers.

This is **not considered blocking for the current operating volume**, because the observed production pattern is a small number of concurrent employees per boutique and the multi-tenant read path remains comfortably within the current commercial-cash-register latency target.

The concurrent-write test must be rerun before a significant growth step, for example **50+ boutiques active at the same time**, materially higher numbers of concurrent cashiers per boutique, a major change to payment/sale transaction code, or a database/pooling architecture change.

Future acceptance criteria remain strict:

- 0 duplicate sale after retry using the same idempotency key.
- 0 duplicate payment after retry using the same idempotency key.
- 0 divergence between invoice, payment ledger and stock movements under simultaneous writes.

Until that future campaign is completed, do not claim that high-concurrency writes have been fully proven; the current readiness score applies to the present Tournal usage profile only.

## Known limit — POS cold start fully offline

Offline Phase 1 is designed for a **running or already-loaded Tournal session that loses Internet access**. It persists the transaction outbox required to protect queued sales, but it does not yet persist a complete canonical snapshot of catalogue, stock, clients, permissions and application-session state for a fresh startup.

Consequently, if the app/PWA is fully closed or terminated and then reopened while Internet access is still unavailable, Tournal must **not claim a fully supported offline cold start**. The PWA shell can be cached, but business data required to operate the POS may be incomplete or unavailable. This is intentional: Supabase remains the canonical business-data source, and Phase 1 avoids introducing an unvalidated second local business database.

This limitation is **not blocking Phase 1** because the primary incident being covered is an Internet outage during an active trading session. Merchants should restore connectivity before reopening a fully terminated session if they need guaranteed access to current catalogue/client/stock data.

Treat offline cold start as a separate project only when at least one of the following becomes true:

- real production incidents show that device/browser/PWA termination during Internet outages is materially preventing sales;
- merchants routinely power-cycle or restart POS devices while connectivity is unavailable;
- the product requirement changes from "survive a connection loss" to "start and operate from zero network connectivity";
- the local-hub/multi-device phase requires a durable local snapshot as part of its recovery model.

Before enabling cold start in production, require all of these acceptance criteria:

- encrypted or otherwise appropriately protected durable local storage for the minimum POS snapshot, with no privileged Supabase credentials stored client-side;
- explicit snapshot version/schema migration and expiry rules;
- a visible "last synchronized" timestamp and stale-data warning for catalogue, stock and clients;
- deterministic reconciliation between the persisted snapshot, queued `OFF-*` sales and the canonical Supabase state after reconnect;
- tests covering browser/PWA termination, device restart, reopening with no Internet, multiple queued sales, reconnect, idempotent replay, deleted/changed products and stale permissions;
- a documented storage-retention/cleanup policy and recovery behavior when IndexedDB is unavailable, corrupted or cleared.

Until those criteria are met, the supported Phase 1 contract remains: **active session survives Internet loss; fresh fully-offline startup is a known limitation.**
