import { opsDataRequest } from "./api"
export type AccessStatus = "nouvelle" | "vue" | "acceptee" | "refusee" | "complement_demande"
export type AccessSummary = {
  id: string
  created_at: string
  nom: string | null
  societe: string | null
  type_activite: string | null
  statut: AccessStatus
  boutique_id: string | null
  traite_le: string | null
  anonymized_at: string | null
}
export type AccessDetail = AccessSummary & {
  telephone: string | null
  message: string | null
  note_interne: string | null
}
export type AccessNotification = {
  id: number
  title: string
  body: string
  action_filter: { request_id: string }
  read_at: string | null
}
const rpc = <T>(name: string, args: object) =>
  opsDataRequest<T>(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  })
export const listRequests = (
  scope: string | null,
  status: string | null,
  offset: number,
) =>
  rpc<AccessSummary[]>("list_access_requests", {
    p_boutique_id: scope,
    p_statut: status,
    p_limit: 50,
    p_offset: offset,
  })
export const requestDetail = (id: string) =>
  rpc<AccessDetail>("get_access_request", { p_id: id })
export const requestCount = (scope: string | null) =>
  rpc<number>("count_new_access_requests", { p_boutique_id: scope })
export const requestNotifications = (scope: string | null) =>
  rpc<AccessNotification[]>("get_access_request_notifications", {
    p_boutique_id: scope,
  })
export const readRequestNotification = (id: number) =>
  rpc<void>("mark_access_request_notification_read", { p_id: id })
export const decideRequest = (
  id: string,
  status: Exclude<AccessStatus, "nouvelle">,
  note: string,
) =>
  rpc<AccessDetail>("decide_access_request", {
    p_id: id,
    p_statut: status,
    p_note_interne: note,
  })
export const routeRequest = (id: string, scope: string | null) =>
  rpc<AccessDetail>("route_access_request", { p_id: id, p_boutique_id: scope })
