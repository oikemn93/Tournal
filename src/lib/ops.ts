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
  created_by:string|null; created_at:string; updated_at:string; resolved_at:string|null;
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

export type OpsWorkspace = {
  tasks:OpsTask[]; tickets:OpsTicket[]; interactions:OpsInteraction[];
  onboarding:OpsOnboarding[]; staff:OpsStaffProfile[];
};

export async function loadOpsWorkspace():Promise<OpsWorkspace> {
  const [tasks,tickets,interactions,onboarding,staff] = await Promise.all([
    opsDataRequest<OpsTask[]>("ops_tasks?select=*&order=created_at.desc&limit=300"),
    opsDataRequest<OpsTicket[]>("ops_tickets?select=*&order=created_at.desc&limit=300"),
    opsDataRequest<OpsInteraction[]>("ops_interactions?select=*&order=created_at.desc&limit=300"),
    opsDataRequest<OpsOnboarding[]>("ops_onboarding?select=*&order=updated_at.desc&limit=500"),
    opsDataRequest<OpsStaffProfile[]>("ops_staff_profiles?select=*&order=created_at.asc&limit=200"),
  ]);
  return { tasks,tickets,interactions,onboarding,staff };
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
