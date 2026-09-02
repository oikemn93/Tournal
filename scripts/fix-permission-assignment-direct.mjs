import fs from 'node:fs';
const path='src/lib/api.ts';
let s=fs.readFileSync(path,'utf8');
const before=`export async function assignUserToBoutique(\n  boutiqueId: string,\n  userId: string,\n  role: "owner" | "manager" | "employee",\n  droits: Record<string, boolean>,\n) {\n  return adminProvision<{ ok: true }>("assign_user", { boutiqueId, userId, role, droits });\n}`;
const after=`export async function assignUserToBoutique(\n  boutiqueId: string,\n  userId: string,\n  role: "owner" | "manager" | "employee",\n  droits: Record<string, boolean>,\n) {\n  return dataRequest<{ ok: true }>("rpc/update_boutique_assignment_permissions", {\n    method: "POST",\n    body: JSON.stringify({ p_boutique_id:boutiqueId, p_user_id:userId, p_role:role, p_droits:droits }),\n  });\n}`;
if(!s.includes(after)) {
  if(!s.includes(before)) throw new Error('assignUserToBoutique shape changed');
  s=s.replace(before,after);
  fs.writeFileSync(path,s);
}
const test='scripts/test-permission-contract.mjs';
let t=fs.readFileSync(test,'utf8');
if(!t.includes("adminProvision<{ ok: true }>(\"assign_user\"")) {
  t=t.replace("assert.ok(api.includes('rpc/update_boutique_assignment_permissions'), 'canonical assignment RPC not used');", "assert.ok((api.match(/rpc\\/update_boutique_assignment_permissions/g)||[]).length >= 2, 'all assignment writes must use canonical RPC');\nassert.ok(!api.includes('adminProvision<{ ok: true }>(\\\"assign_user\\\"'), 'lossy assignment fallback still exposed');");
  fs.writeFileSync(test,t);
}
