import { getCurrentAuthUser, opsDataRequest } from "./api";

export type OpsPriority = "low"|"normal"|"high"|"urgent";
export type OpsTaskStatus = "open"|"in_progress"|"waiting"|"done"|"cancelled";
export type OpsTicketStatus = "new"|"in_progress"|"waiting_customer"|"resolved"|"closed";
export type OpsTeam = "sales"|"service"|"support"|"success"|"management";

export type OpsTask = {
  id:number; boutique_id:string|null; title:string; description:string|null; team:OpsTeam;
  status:OpsTaskStatus; priority:OpsPriority; assignee_id:string|null; due_at:string|null;
  source:"manual"|"onboarding"|"support"|"system"|"handoff"; created_by:string|null;
  created_at:string; updated_at:string; completed_at:string|null;
};
export type OpsTicket = {
  id:number; boutique_id:string; subject:string; description:string|null; status:OpsTicketStatus;
  priority:OpsPriority; assignee_id:string|null; requester_name:string|null; requester_phone:string|null;
  created_by:string|null; created_at:string; updated_at:string; resolved_at:string|null; sla_due_at?:string|null; first_response_at?:string|null; escalated_at?:string|null;
};
export type OpsInteraction = {
  id:number; boutique_id:string|null; kind:"note"|"call"|"meeting"|"handoff"|"support"|"onboarding"|"system";
  team:OpsTeam|"system"|null; title:string; detail:string|null; actor_id:string|null;
  related_task_id:number|null; related_ticket_id:number|null; created_at:string;
};
export type OpsOnboarding = {
  boutique_id:string; owner_ready:boolean; users_ready:boolean; catalogue_ready:boolean;
  first_receipt_at:string|null; first_sale_at:string|null; training_done:boolean; training_done_at:string|null;
  service_owner_id:string|null; target_go_live_at:string|null; notes:string|null; created_at:string; updated_at:string;
};
export type OpsStaffProfile = { user_id:string; role:"sales"|"service"|"support"|"manager"; active:boolean; created_at:string; updated_at:string };
export type OpsAccessRequest = { id:number; boutique_id:string; requester_id:string; reason:string; status:"pending"|"approved"|"rejected"|"revoked"; requested_minutes:number; approved_by:string|null; approved_at:string|null; expires_at:string|null; decided_note:string|null; created_at:string; updated_at:string };
export type OpsSupportDiagnostic = { boutique_id:string; name:string; city:string|null; phone:string|null; email:string|null; user_count:number; product_count:number; last_sale_at:string|null; last_stock_activity_at:string|null; open_ticket_count:number; access_expires_at:string|null };
export type OpsAccount = { id:string; name:string; stage:"prospect"|"sales"|"onboarding"|"active"|"at_risk"|"inactive"; health_status:"unknown"|"healthy"|"watch"|"at_risk"; sales_owner_id:string|null; service_owner_id:string|null; support_owner_id:string|null; notes:string|null; created_at:string; updated_at:string };
export type OpsAccountBoutique = { account_id:string; boutique_id:string; created_at:string };
export type OpsContact = { id:number; account_id:string; boutique_id:string|null; name:string; phone:string|null; email:string|null; role_label:string|null; is_primary:boolean; notes:string|null; created_by:string|null; created_at:string; updated_at:string };
export type OpsManagerMetric = { user_id:string; role:string; open_tasks:number; overdue_tasks:number; open_tickets:number; sla_breached_tickets:number; completed_tasks_7d:number; resolved_tickets_7d:number };
export type OpsAttentionCounts = { open_tasks:number; overdue_tasks:number; open_tickets:number; sla_breached_tickets:number; urgent_items:number };
export type OpsBoutiqueOverview = {
  boutique_id:string; product_count:number; user_count:number; owner_count:number;
  first_sale_at:string|null; last_sale_at:string|null; first_receipt_at:string|null; last_stock_activity_at:string|null;
};

export type OpsWorkspace = {
  tasks:OpsTask[]; tickets:OpsTicket[]; interactions:OpsInteraction[]; accessRequests:OpsAccessRequest[];
  onboarding:OpsOnboarding[]; staff:OpsStaffProfile[]; overview:OpsBoutiqueOverview[]; accounts:OpsAccount[]; accountBoutiques:OpsAccountBoutique[]; contacts:OpsContact[]; managerMetrics:OpsManagerMetric[]; attentionCounts:OpsAttentionCounts|null;
};

export type MyOpsProfile = { user_id:string; role:"sales"|"service"|"support"|"manager"; active:boolean };
export type OpsShell = { boutiques:Array<Record<string,unknown>>; users:Array<Record<string,unknown>> };

export async function loadMyOpsStaffProfile():Promise<MyOpsProfile|null> {
  return opsDataRequest<MyOpsProfile|null>("rpc/get_my_ops_profile",{method:"POST",body:JSON.stringify({})});
}

export async function loadOpsShell():Promise<OpsShell> {
  return opsDataRequest<OpsShell>("rpc/get_ops_shell",{method:"POST",body:JSON.stringify({})});
}

export async function loadOpsWorkspace():Promise<OpsWorkspace> {
  const [tasks,tickets,interactions,accessRequests,onboarding,staff,overview,accounts,accountBoutiques,contacts,managerMetrics,attentionCounts] = await Promise.all([
    opsDataRequest<OpsTask[]>("ops_tasks?select=*&order=created_at.desc&limit=300"),
    opsDataRequest<OpsTicket[]>("ops_tickets?select=*&order=created_at.desc&limit=300"),
    opsDataRequest<OpsInteraction[]>("ops_interactions?select=*&order=created_at.desc&limit=300"),
    opsDataRequest<OpsAccessRequest[]>("ops_access_requests?select=*&order=created_at.desc&limit=200"),
    opsDataRequest<OpsOnboarding[]>("ops_onboarding?select=*&order=updated_at.desc&limit=500"),
    opsDataRequest<OpsStaffProfile[]>("ops_staff_profiles?select=*&order=created_at.asc&limit=200"),
    opsDataRequest<OpsBoutiqueOverview[]>("rpc/get_ops_boutique_overview",{method:"POST",body:JSON.stringify({})}),
    opsDataRequest<OpsAccount[]>("ops_accounts?select=*&order=updated_at.desc&limit=500"),
    opsDataRequest<OpsAccountBoutique[]>("ops_account_boutiques?select=*&limit=1000"),
    opsDataRequest<OpsContact[]>("ops_contacts?select=*&order=is_primary.desc,updated_at.desc&limit=1000"),
    opsDataRequest<OpsManagerMetric[]>("rpc/get_ops_manager_metrics",{method:"POST",body:JSON.stringify({})}),
    opsDataRequest<OpsAttentionCounts>("rpc/get_ops_attention_counts",{method:"POST",body:JSON.stringify({})}),
  ]);
  return { tasks,tickets,interactions,accessRequests,onboarding,staff,overview,accounts,accountBoutiques,contacts,managerMetrics,attentionCounts };
}

export async function createOpsTask(input:{boutiqueId?:string|null;title:string;description?:string;team?:OpsTeam;priority?:OpsPriority;assigneeId?:string|null;dueAt?:string|null;source?:OpsTask["source"]}) {
  const rows = await opsDataRequest<OpsTask[]>("ops_tasks?select=*",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
    boutique_id:input.boutiqueId??null,title:input.title.trim(),description:input.description?.trim()||null,
    team:input.team??"service",priority:input.priority??"normal",assignee_id:input.assigneeId??null,
    due_at:input.dueAt??null,source:input.source??"manual",created_by:getCurrentAuthUser()?.id??null,
  })});
  if (!rows[0]) throw new Error("Tâche non créée");
  return rows[0];
}

export async function updateOpsTask(id:number,patch:Partial<Pick<OpsTask,"status"|"priority"|"assignee_id"|"due_at"|"title"|"description"|"team">>) {
  const payload:any={...patch,updated_at:new Date().toISOString()};
  if (patch.status==="done") payload.completed_at=new Date().toISOString();
  const rows=await opsDataRequest<OpsTask[]>(`ops_tasks?id=eq.${id}&select=*`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)});
  if (!rows[0]) throw new Error("Tâche non modifiée");
  return rows[0];
}

export async function createOpsTicket(input:{boutiqueId:string;subject:string;description?:string;priority?:OpsPriority;requesterName?:string;requesterPhone?:string;assigneeId?:string|null}) {
  const rows=await opsDataRequest<OpsTicket[]>("ops_tickets?select=*",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
    boutique_id:input.boutiqueId,subject:input.subject.trim(),description:input.description?.trim()||null,
    priority:input.priority??"normal",requester_name:input.requesterName?.trim()||null,requester_phone:input.requesterPhone?.trim()||null,
    assignee_id:input.assigneeId??null,created_by:getCurrentAuthUser()?.id??null,
  })});
  if (!rows[0]) throw new Error("Ticket non créé");
  await createOpsInteraction({boutiqueId:input.boutiqueId,kind:"support",team:"support",title:`Ticket #${rows[0].id} ouvert · ${rows[0].subject}`,relatedTicketId:rows[0].id});
  return rows[0];
}

export async function updateOpsTicket(id:number,patch:Partial<Pick<OpsTicket,"status"|"priority"|"assignee_id"|"subject"|"description">>) {
  const payload:any={...patch,updated_at:new Date().toISOString()};
  if (patch.status==="resolved"||patch.status==="closed") payload.resolved_at=new Date().toISOString();
  const rows=await opsDataRequest<OpsTicket[]>(`ops_tickets?id=eq.${id}&select=*`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)});
  if (!rows[0]) throw new Error("Ticket non modifié");
  return rows[0];
}

export async function createOpsInteraction(input:{boutiqueId?:string|null;kind:OpsInteraction["kind"];team?:OpsInteraction["team"];title:string;detail?:string;relatedTaskId?:number|null;relatedTicketId?:number|null}) {
  const rows=await opsDataRequest<OpsInteraction[]>("ops_interactions?select=*",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
    boutique_id:input.boutiqueId??null,kind:input.kind,team:input.team??null,title:input.title.trim(),detail:input.detail?.trim()||null,
    actor_id:getCurrentAuthUser()?.id??null,related_task_id:input.relatedTaskId??null,related_ticket_id:input.relatedTicketId??null,
  })});
  if (!rows[0]) throw new Error("Interaction non créée");
  return rows[0];
}

export async function updateOpsOnboarding(boutiqueId:string,patch:Partial<Pick<OpsOnboarding,"training_done"|"training_done_at"|"service_owner_id"|"target_go_live_at"|"notes"|"owner_ready"|"users_ready"|"catalogue_ready"|"first_receipt_at"|"first_sale_at">>) {
  const rows=await opsDataRequest<OpsOnboarding[]>(`ops_onboarding?boutique_id=eq.${encodeURIComponent(boutiqueId)}&select=*`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
  if (!rows[0]) throw new Error("Onboarding non modifié");
  return rows[0];
}

export async function upsertOpsStaffProfile(userId:string,role:OpsStaffProfile["role"],active=true) {
  const rows=await opsDataRequest<OpsStaffProfile[]>("ops_staff_profiles?on_conflict=user_id&select=*",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({user_id:userId,role,active,updated_at:new Date().toISOString()})});
  if (!rows[0]) throw new Error("Profil équipe non enregistré");
  return rows[0];
}


export async function requestOpsBoutiqueAccess(boutiqueId:string,reason:string,requestedMinutes=30) {
  return opsDataRequest<OpsAccessRequest>("rpc/request_ops_boutique_access",{method:"POST",body:JSON.stringify({p_boutique_id:boutiqueId,p_reason:reason,p_requested_minutes:requestedMinutes})});
}

export async function decideOpsAccessRequest(requestId:number,approve:boolean,note?:string) {
  return opsDataRequest<OpsAccessRequest>("rpc/decide_ops_access_request",{method:"POST",body:JSON.stringify({p_request_id:requestId,p_approve:approve,p_note:note??null})});
}

export async function loadOpsSupportDiagnostic(boutiqueId:string) {
  return opsDataRequest<OpsSupportDiagnostic>("rpc/get_ops_support_diagnostic",{method:"POST",body:JSON.stringify({p_boutique_id:boutiqueId})});
}

export async function updateOpsAccount(id:string,patch:Partial<Pick<OpsAccount,"name"|"stage"|"health_status"|"sales_owner_id"|"service_owner_id"|"support_owner_id"|"notes">>) {
  const rows=await opsDataRequest<OpsAccount[]>(`ops_accounts?id=eq.${encodeURIComponent(id)}&select=*`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
  if(!rows[0]) throw new Error("Compte client non modifié");
  return rows[0];
}

export async function createOpsContact(input:{accountId:string;boutiqueId?:string|null;name:string;phone?:string;email?:string;roleLabel?:string;isPrimary?:boolean}) {
  const rows=await opsDataRequest<OpsContact[]>("ops_contacts?select=*",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({account_id:input.accountId,boutique_id:input.boutiqueId??null,name:input.name.trim(),phone:input.phone?.trim()||null,email:input.email?.trim()||null,role_label:input.roleLabel?.trim()||null,is_primary:Boolean(input.isPrimary),created_by:getCurrentAuthUser()?.id??null})});
  if(!rows[0]) throw new Error("Contact non créé");
  return rows[0];
}

export async function updateOpsContact(id:number,patch:Partial<Pick<OpsContact,"name"|"phone"|"email"|"role_label"|"is_primary"|"notes">>) {
  const rows=await opsDataRequest<OpsContact[]>(`ops_contacts?id=eq.${id}&select=*`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
  if(!rows[0]) throw new Error("Contact non modifié"); return rows[0];
}

export async function createOpsAccount(name:string) {
  const rows=await opsDataRequest<OpsAccount[]>("ops_accounts?select=*",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({name:name.trim(),stage:"prospect",health_status:"unknown"})});
  if(!rows[0]) throw new Error("Compte client non créé"); return rows[0];
}

export async function linkOpsBoutiqueToAccount(boutiqueId:string,accountId:string) {
  const rows=await opsDataRequest<OpsAccountBoutique[]>("ops_account_boutiques?on_conflict=boutique_id&select=*",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({boutique_id:boutiqueId,account_id:accountId})});
  if(!rows[0]) throw new Error("Liaison boutique-compte non modifiée"); return rows[0];
}
