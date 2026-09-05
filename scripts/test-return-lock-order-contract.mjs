import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260905175824_order_return_product_locks.sql",
  "utf8",
);

for (const token of [
  "pg_get_functiondef('public.return_sale(text,text,uuid,jsonb,text)'::regprocedure)",
  "join public.invoice_lines source_line",
  "source_line.boutique_id = p_boutique_id",
  "source_line.invoice_id = p_invoice_id",
  "order by source_line.product_id, (x->>'sourceLineId')::bigint",
  "return_sale product-lock loop marker not found",
]) {
  if (!migration.includes(token)) throw new Error(`missing return lock-order contract: ${token}`);
}

if (!migration.includes("revoke all on function public.return_sale") || !migration.includes("to authenticated, service_role")) {
  throw new Error("return_sale execute privileges must remain least-privilege");
}

console.log("return_lock_order_contract_ok");
