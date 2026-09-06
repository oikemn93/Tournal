# Performance and transactional integrity — known validation limit

Status as of 2026-09-06: **GO for the current Tournal usage profile** (11 boutiques, typically a few concurrent employees per boutique).

## Evidence already validated

- Multi-tenant read load was exercised with concurrent sessions distributed across several boutiques.
- 10 concurrent sessions: p95 about 227 ms, 0 errors.
- 25 concurrent sessions: p95 about 423–487 ms, 0 errors.
- 32 concurrent sessions across 10 boutiques: p95 about 748 ms, p99 about 752 ms, 0 errors. This was the concurrency ceiling of the internal PostgreSQL test generator.
- Transactional retry/integrity scenarios were validated sequentially at 10, 25, 50 and 100 iterations with 0 double sale, 0 double payment, and 0 invoice/payment/stock divergence.

## Known limit — not blocking at current scale

**Real simultaneous write concurrency was not executed.** The transactional integrity campaign above proves retry/idempotency and invoice/payment/stock consistency sequentially, but it does not prove those invariants under many genuinely concurrent writers.

This is **not considered blocking for the current operating volume**, because the observed production pattern is a small number of concurrent employees per boutique and the multi-tenant read path remains comfortably within the current commercial-cash-register latency target.

The concurrent-write test must be rerun before a significant growth step, for example **50+ boutiques active at the same time**, materially higher numbers of concurrent cashiers per boutique, a major change to payment/sale transaction code, or a database/pooling architecture change.

Future acceptance criteria remain strict:

- 0 duplicate sale after retry using the same idempotency key.
- 0 duplicate payment after retry using the same idempotency key.
- 0 divergence between invoice, payment ledger and stock movements under simultaneous writes.

Until that future campaign is completed, do not claim that high-concurrency writes have been fully proven; the current readiness score applies to the present Tournal usage profile only.
