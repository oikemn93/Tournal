# Database security exceptions

## Masked application views

`public.products_app`, `public.stock_entries_app`, and `public.invoices_app` are
intentionally owner-evaluated views. They expose rows only for boutiques returned
by `private.auth_read_boutique_ids(...)` and mask purchase-cost columns unless the
caller has the `marges` permission.

Converting these views directly to `security_invoker` is unsafe with the current
schema. `authenticated` does not have raw `SELECT` access to `products` or
`stock_entries`; granting that access would let callers bypass the column masks
and read purchase costs directly.

Compensating controls:

- `anon` and `public` have no access to the views.
- `authenticated` receives `SELECT` on the views only.
- Every view uses `security_barrier=true` and an explicit boutique scope.
- Sensitive cost fields are returned only after a separate `marges` check.
- The underlying permission helper is in the non-exposed `private` schema.

Exit plan: move cost data behind a private relation or a narrowly scoped private
RPC, then convert the three facades to `security_invoker` and verify that direct
base-table grants cannot expose masked columns. Until that redesign is complete,
the Supabase `security_definer_view` advisor findings are tracked exceptions, not
safe one-line fixes.
