import fs from "node:fs";

const migrationPath = "supabase/migrations/20260905104156_optimize_ops_rls_and_foreign_keys.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

const indexes = {
  ops_access_requests_approved_by_idx: ["ops_access_requests", "approved_by"],
  ops_accounts_sales_owner_idx: ["ops_accounts", "sales_owner_id"],
  ops_accounts_service_owner_idx: ["ops_accounts", "service_owner_id"],
  ops_accounts_support_owner_idx: ["ops_accounts", "support_owner_id"],
  ops_contacts_boutique_idx: ["ops_contacts", "boutique_id"],
  ops_contacts_created_by_idx: ["ops_contacts", "created_by"],
  ops_interactions_actor_idx: ["ops_interactions", "actor_id"],
  ops_interactions_related_task_idx: ["ops_interactions", "related_task_id"],
  ops_interactions_related_ticket_idx: ["ops_interactions", "related_ticket_id"],
  ops_onboarding_service_owner_idx: ["ops_onboarding", "service_owner_id"],
  ops_tasks_created_by_idx: ["ops_tasks", "created_by"],
  ops_tickets_assignee_idx: ["ops_tickets", "assignee_id"],
  ops_tickets_created_by_idx: ["ops_tickets", "created_by"],
};

for (const [name, [table, column]] of Object.entries(indexes)) {
  const pattern = new RegExp(`create\\s+index\\s+if\\s+not\\s+exists\\s+${name}\\s+on\\s+public\\.${table}\\s*\\(\\s*${column}\\s*\\)`, "i");
  if (!pattern.test(sql)) throw new Error(`missing covering index ${name}`);
}

const policies = [
  "ops_access_requests_read",
  "ops_access_requests_create",
  "ops_interactions_insert",
  "ops_interactions_update",
  "ops_interactions_delete",
  "ops_tasks_insert",
  "ops_tasks_update",
  "ops_tickets_insert",
  "ops_tickets_update",
];
for (const policy of policies) {
  if (!new RegExp(`alter\\s+policy\\s+${policy}\\s+on\\s+public\\.`, "i").test(sql)) {
    throw new Error(`missing optimized policy ${policy}`);
  }
}

const wrappedUidCalls = sql.match(/\(select\s+auth\.uid\(\)\)/gi) ?? [];
if (wrappedUidCalls.length !== 12) throw new Error(`expected 12 cached auth.uid() calls, found ${wrappedUidCalls.length}`);
if (/=\s*auth\.uid\(\)|auth\.uid\(\)\s*=/.test(sql)) throw new Error("found a per-row auth.uid() comparison");
if (/drop\s+index/i.test(sql)) throw new Error("this additive migration must not drop indexes");

console.log("ops_rls_index_contract_ok");
