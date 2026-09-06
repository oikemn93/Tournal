# Supplier ledger consistency correction

Migration `20260906161544_supplier_ledger_single_source_of_truth` makes `supplier_receipt.montant - paid_amount` the single source of truth for supplier debt.

It also aligns dashboard cash-charge accounting, preserves stable payment idempotency keys in the frontend, prevents receipt corrections from driving stock negative, and normalizes legacy paid/manual and zero-value receipt status fields.

Historical `supplier_payment` rows are retained as accounting evidence; they are not retroactively reallocated to receipt documents because doing so would invent allocations that were not recorded at transaction time.
