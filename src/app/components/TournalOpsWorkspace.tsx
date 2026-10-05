import "./tournal-ops.css"

import * as Dialog from "@radix-ui/react-dialog"

import React, { useEffect, useMemo, useRef, useState } from "react"

import {
  listRequests,
  requestDetail,
  decideRequest,
  routeRequest,
  type AccessSummary,
  type AccessDetail,
} from "../../lib/access-requests"

import {
  createBoutique,
  createBoutiqueWithNewOwner,
  getAccessRequestEmailRecipients,
  sendWhatsAppOnboarding,
  setAccessRequestEmailRecipients,
} from "../../lib/api"

import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Headphones,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react"

import {
  createOpsInteraction,
  createOpsTask,
  createOpsTicket,
  loadOpsWorkspace,
  updateOpsOnboarding,
  updateOpsTask,
  updateOpsTicket,
  upsertOpsStaffProfile,
  type OpsPriority,
  type OpsStaffProfile,
  type OpsTask,
  type OpsTicket,
  type OpsWorkspace,
} from "../../lib/ops"

type BoutiqueLike = {
  id: string
  nom: string
  ville?: string
  tel?: string
  email?: string
  products?: unknown[]
  entries?: Array<{
    qty?: number
    recordedAt?: string
    date?: string
    movementType?: string
  }>
  invoices?: Array<{ dateRaw?: string; date?: string }>
}

type UserLike = {
  id: string
  nom: string
  phone?: string
  isSuperAdmin?: boolean
  assignments?: Array<{ boutiqueId: string; role?: string }>
}

type View = "home" | "clients" | "support" | "activity" | "team" | "system"

const fmtDate = (value?: string | null) => {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  } catch {
    return d.toLocaleString("fr-FR")
  }
}

const requestStatus: Record<string, string> = {
  nouvelle: "Nouvelle",
  vue: "À étudier",
  complement_demande: "En attente de complément",
  acceptee: "Acceptée",
  refusee: "Refusée",
}

const priorityRank: Record<OpsPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

const priorityLabel: Record<OpsPriority, string> = {
  urgent: "Urgent",
  high: "Haute",
  normal: "Normale",
  low: "Basse",
}

const teamLabel: Record<string, string> = {
  sales: "Commercial",
  service: "Accompagnement",
  support: "Support",
  success: "Suivi client",
  management: "Direction",
  manager: "Responsable",
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus.current?.focus()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="font-semibold text-lg">
              {title}
            </Dialog.Title>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 rounded-lg hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"

export function TournalOpsWorkspace({
  boutiques,
  users,
  onOpenBoutique,
  onSystem,
  onLogout,
  canSystemAdmin = true,
  canEnterBoutique = true,
  opsRole,
}: {
  boutiques: BoutiqueLike[]
  users: UserLike[]
  onOpenBoutique: (id: string) => void
  onSystem: () => void
  onLogout: () => void
  canSystemAdmin?: boolean
  canEnterBoutique?: boolean
  opsRole?: string
}) {
  const [view, setView] = useState<View>("home")

  const [clientTab, setClientTab] = useState<"requests" | "shops">("requests")

  const [supportTab, setSupportTab] = useState<"tickets" | "tasks">("tickets")

  const [publicRequests, setPublicRequests] = useState<AccessSummary[]>([])

  const [publicRequestsLoading, setPublicRequestsLoading] = useState(false)

  const [publicRequestDetail, setPublicRequestDetail] =
    useState<AccessDetail | null>(null)

  const [publicRequestBusy, setPublicRequestBusy] = useState(false)

  const [publicRequestNote, setPublicRequestNote] = useState("")

  const [provisionModal, setProvisionModal] = useState(false)

  const [manualProvision, setManualProvision] = useState(false)

  const [provisionName, setProvisionName] = useState("")

  const [provisionCity, setProvisionCity] = useState("")

  const [provisionOwner, setProvisionOwner] = useState("")

  const [provisionOwnerMode, setProvisionOwnerMode] =
    useState<"existing" | "new">("new")

  const [newOwnerName, setNewOwnerName] = useState("")

  const [newOwnerPhone, setNewOwnerPhone] = useState("")

  const [provisionSaving, setProvisionSaving] = useState(false)

  const [onboardingCredentials, setOnboardingCredentials] = useState<{
    boutiqueId: string
    fullName: string
    phone: string
    temporaryPassword: string
    boutiqueName: string
  } | null>(null)

  const [whatsappSending, setWhatsappSending] = useState(false)

  const [whatsappSent, setWhatsappSent] = useState(false)

  const [query, setQuery] = useState("")

  const [filter, setFilter] = useState("all")

  const [busyAction, setBusyAction] = useState("")

  const [staffCandidate, setStaffCandidate] = useState("")

  const [requestError, setRequestError] = useState("")

  const [requestOffset, setRequestOffset] = useState(0)

  const [moreRequests, setMoreRequests] = useState(false)

  const [accessEmailDraft, setAccessEmailDraft] = useState("")
  const [accessEmailLoading, setAccessEmailLoading] = useState(false)
  const [accessEmailSaving, setAccessEmailSaving] = useState(false)
  const [accessEmailSaved, setAccessEmailSaved] = useState(false)

  const actionLock = useRef(false)

  function navigate(next: View, tab?: "requests" | "shops") {
    setView(next)
    if (tab) setClientTab(tab)
    setQuery("")
    setFilter("all")
  }

  async function runAction(key: string, action: () => Promise<void>) {
    if (actionLock.current) return
    actionLock.current = true
    setBusyAction(key)
    setError("")
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible. Réessayez.")
    } finally {
      actionLock.current = false
      setBusyAction("")
    }
  }

  async function changeStaff(id: string, role: string) {
    await runAction("staff-" + id, async () => {
      const old = workspace?.staff.find((s) => s.user_id === id)
      if (!role && !old) return
      const saved = await upsertOpsStaffProfile(
        id,
        (role || old!.role) as OpsStaffProfile["role"],
        Boolean(role),
      )
      setWorkspace((w) =>
        w
          ? { ...w, staff: [...w.staff.filter((s) => s.user_id !== id), saved] }
          : w,
      )
      setStaffCandidate("")
    })
  }

  async function refreshRequests(offset = 0) {
    setPublicRequestsLoading(true)
    setRequestError("")
    try {
      const items = await listRequests(null, null, offset)
      setPublicRequests((old) =>
        offset
          ? [...old, ...items.filter((i) => !old.some((o) => o.id === i.id))]
          : items,
      )
      setRequestOffset(offset)
      setMoreRequests(items.length === 50)
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : "Demandes indisponibles")
    } finally {
      setPublicRequestsLoading(false)
    }
  }

  async function loadAccessEmailRecipients() {
    if (!canSystemAdmin) return
    setAccessEmailLoading(true)
    try {
      const emails = await getAccessRequestEmailRecipients()
      setAccessEmailDraft(emails.join("\n"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Destinataires email indisponibles")
    } finally {
      setAccessEmailLoading(false)
    }
  }

  async function saveAccessEmailRecipients() {
    const emails = accessEmailDraft
      .split(/[\n,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
    setAccessEmailSaving(true)
    setAccessEmailSaved(false)
    setError("")
    try {
      const saved = await setAccessRequestEmailRecipients(emails)
      setAccessEmailDraft(saved.join("\n"))
      setAccessEmailSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement des destinataires impossible")
    } finally {
      setAccessEmailSaving(false)
    }
  }

  const [opsBoutiques, setOpsBoutiques] = useState<BoutiqueLike[]>(boutiques)

  const [workspace, setWorkspace] = useState<OpsWorkspace | null>(null)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [taskModal, setTaskModal] = useState(false)

  const [ticketModal, setTicketModal] = useState(false)

  const [taskTitle, setTaskTitle] = useState("")
  const [taskBoutique, setTaskBoutique] = useState("")
  const [taskTeam, setTaskTeam] =
    useState<"sales" | "service" | "support" | "success" | "management">(
      "service",
    )
  const [taskPriority, setTaskPriority] = useState<OpsPriority>("normal")
  const [taskDue, setTaskDue] = useState("")
  const [taskAssignee, setTaskAssignee] = useState("")

  const [ticketSubject, setTicketSubject] = useState("")
  const [ticketBoutique, setTicketBoutique] = useState("")
  const [ticketPriority, setTicketPriority] = useState<OpsPriority>("normal")
  const [ticketRequester, setTicketRequester] = useState("")
  const [ticketPhone, setTicketPhone] = useState("")
  const [ticketAssignee, setTicketAssignee] = useState("")

  const [saving, setSaving] = useState(false)

  const [interactionTitle, setInteractionTitle] = useState("")

  const [interactionDetail, setInteractionDetail] = useState("")

  const [interactionSaving, setInteractionSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    setError("")
    try {
      setWorkspace(await loadOpsWorkspace())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement Ops impossible")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    setOpsBoutiques(boutiques)
  }, [boutiques])

  useEffect(() => {
    if (canSystemAdmin) {
      void refreshRequests()
      void loadAccessEmailRecipients()
    }
  }, [canSystemAdmin])

  const rows = useMemo(
    () =>
      opsBoutiques.map((b) => {
        const members = users.filter((u) =>
          u.assignments?.some((a) => a.boutiqueId === b.id),
        )

        const overview = workspace?.overview.find(
          (item) => item.boutique_id === b.id,
        )

        const lastSale =
          overview?.last_sale_at ??
          (b.invoices ?? [])
            .map((i) => i.dateRaw ?? i.date ?? "")
            .filter(Boolean)
            .sort()
            .at(-1) ??
          null

        const firstSale =
          overview?.first_sale_at ??
          (b.invoices ?? [])
            .map((i) => i.dateRaw ?? i.date ?? "")
            .filter(Boolean)
            .sort()
            .at(0) ??
          null

        const receipts = (b.entries ?? []).filter(
          (e) => (e.qty ?? 0) > 0 && e.movementType === "achat",
        )

        const firstReceipt =
          overview?.first_receipt_at ??
          receipts
            .map((e) => e.recordedAt ?? e.date ?? "")
            .filter(Boolean)
            .sort()
            .at(0) ??
          null

        const setup = (overview?.product_count ?? b.products?.length ?? 0) > 0

        const onboarding = workspace?.onboarding.find(
          (o) => o.boutique_id === b.id,
        )

        const openTasks =
          workspace?.tasks.filter(
            (t) =>
              t.boutique_id === b.id &&
              !["done", "cancelled"].includes(t.status),
          ) ?? []

        const openTickets =
          workspace?.tickets.filter(
            (t) =>
              t.boutique_id === b.id &&
              !["resolved", "closed"].includes(t.status),
          ) ?? []

        const ownerReady =
          (overview?.owner_count ?? 0) > 0 ||
          members.some((m) =>
            m.assignments?.some(
              (a) =>
                a.boutiqueId === b.id &&
                (a.role === "Propriétaire" || a.role === "owner"),
            ),
          )

        const usersReady = (overview?.user_count ?? members.length) > 0
        const checks = [
          ownerReady,
          usersReady,
          setup,
          Boolean(firstReceipt || onboarding?.first_receipt_at),
          Boolean(firstSale || onboarding?.first_sale_at),
          Boolean(onboarding?.training_done),
        ]

        const progress = Math.round(
          (checks.filter(Boolean).length / checks.length) * 100,
        )

        return {
          ...b,
          members,
          lastSale,
          firstSale,
          firstReceipt,
          setup,
          onboarding,
          openTasks,
          openTickets,
          ownerReady,
          usersReady,
          progress,
        }
      }),
    [opsBoutiques, users, workspace],
  )

  const normalizedQuery = query.trim().toLowerCase()

  const filtered = rows.filter((b) => {
    const link = workspace?.accountBoutiques.find((x) => x.boutique_id === b.id)

    const account = link
      ? workspace?.accounts.find((a) => a.id === link.account_id)
      : null

    const memberText = (b.members ?? [])
      .map((m) => (m?.nom ?? "") + " " + (m?.phone ?? ""))
      .join(" ")

    const searchable = [b.nom, b.ville, b.tel, account?.name, memberText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    return !normalizedQuery || searchable.includes(normalizedQuery)
  })

  const attention = rows
    .filter(
      (b) =>
        b.progress < 100 || b.openTickets.length > 0 || b.openTasks.length > 0,
    )
    .sort((a, b) => a.progress - b.progress)

  const selected = rows.find((b) => b.id === selectedId) ?? null

  const activeTasks = (workspace?.tasks ?? [])
    .filter((t) => !["done", "cancelled"].includes(t.status))
    .sort(
      (a, b) =>
        priorityRank[a.priority] - priorityRank[b.priority] ||
        String(a.due_at ?? "9999").localeCompare(String(b.due_at ?? "9999")),
    )

  const activeTickets = (workspace?.tickets ?? [])
    .filter((t) => !["resolved", "closed"].includes(t.status))
    .sort(
      (a, b) =>
        priorityRank[a.priority] - priorityRank[b.priority] || b.id - a.id,
    )

  const opsUsers = users.filter((user) =>
    workspace?.staff.some(
      (profile) => profile.user_id === user.id && profile.active,
    ),
  )

  const userName = (id: string | null) =>
    id
      ? (users.find((user) => user.id === id)?.nom ?? "Non assigné")
      : "Non assigné"

  const canManageOnboarding =
    canSystemAdmin || opsRole === "service" || opsRole === "manager"

  const canManageContacts =
    canSystemAdmin ||
    ["sales", "service", "support", "manager"].includes(opsRole ?? "")

  const selectedAccountLink = selected
    ? workspace?.accountBoutiques.find(
        (link) => link.boutique_id === selected.id,
      )
    : null

  const selectedAccount = selectedAccountLink
    ? workspace?.accounts.find(
        (account) => account.id === selectedAccountLink.account_id,
      )
    : null

  const selectedContacts = selectedAccount
    ? (workspace?.contacts ?? []).filter(
        (contact) => contact.account_id === selectedAccount.id,
      )
    : []

  const canManageTickets =
    canSystemAdmin || opsRole === "support" || opsRole === "manager"

  const canManageTask = (task: OpsTask) =>
    canSystemAdmin ||
    opsRole === "manager" ||
    (opsRole === "sales" && task.team === "sales") ||
    (opsRole === "service" &&
      (task.team === "service" || task.team === "success")) ||
    (opsRole === "support" && task.team === "support")

  const pendingAccess = (workspace?.accessRequests ?? []).filter(
    (r) => r.status === "pending",
  )

  async function openPublicRequest(id: string) {
    setPublicRequestBusy(true)
    setError("")
    try {
      let d = await requestDetail(id)
      if (d.statut === "nouvelle") {
        try {
          d = await decideRequest(d.id, "vue", d.note_interne || "")
        } catch {}
      }
      setPublicRequestDetail(d)
      setPublicRequests((items) => items.map((r) => (r.id === d.id ? d : r)))
      setPublicRequestNote(d.note_interne || "")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demande inaccessible")
    } finally {
      setPublicRequestBusy(false)
    }
  }

  async function mutatePublicRequest(action: () => Promise<AccessDetail>) {
    if (publicRequestBusy) return
    setPublicRequestBusy(true)
    setError("")
    try {
      const d = await action()
      setPublicRequestDetail(d)
      setPublicRequestNote(d.note_interne || "")
      setPublicRequests((items) => items.map((r) => (r.id === d.id ? d : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible")
    } finally {
      setPublicRequestBusy(false)
    }
  }

  function startProvisionFromRequest() {
    if (!publicRequestDetail) return
    setManualProvision(false)
    setProvisionName(
      publicRequestDetail.societe || publicRequestDetail.nom || "",
    )
    setProvisionCity("")
    const digits = (value?: string | null) =>
      (value || "").replace(/\D/g, "").replace(/^00/, "")
    const requestPhone = digits(publicRequestDetail.telephone)
    const owner = users.find(
      (user) => requestPhone && digits(user.phone) === requestPhone,
    )
    setProvisionOwner(owner?.id || "")
    setProvisionOwnerMode(owner ? "existing" : "new")
    setNewOwnerName(publicRequestDetail.nom || "")
    setNewOwnerPhone(publicRequestDetail.telephone || "")
    setWhatsappSent(false)
    setProvisionModal(true)
  }

  function startManualProvision() {
    setManualProvision(true)
    setProvisionName("")
    setProvisionCity("")
    setProvisionOwner("")
    setProvisionOwnerMode("new")
    setNewOwnerName("")
    setNewOwnerPhone("")
    setWhatsappSent(false)
    setProvisionModal(true)
  }

  async function provisionBoutique() {
    const useNewOwner = provisionOwnerMode === "new"
    if (
      !provisionName.trim() ||
      !provisionCity.trim() ||
      provisionSaving ||
      (!manualProvision && !publicRequestDetail) ||
      (useNewOwner
        ? !newOwnerName.trim() || !newOwnerPhone.trim()
        : !provisionOwner)
    )
      return
    setProvisionSaving(true)
    setError("")
    try {
      const name = provisionName.trim()
      const city = provisionCity.trim()
      let boutiqueId = ""
      if (useNewOwner) {
        const created = await createBoutiqueWithNewOwner({
          nom: name,
          ville: city,
          ownerName: newOwnerName.trim(),
          ownerPhone: newOwnerPhone.trim(),
        })
        boutiqueId = created.boutiqueId
        setOnboardingCredentials({
          boutiqueId: created.boutiqueId,
          fullName: created.ownerName,
          phone: created.ownerPhone,
          temporaryPassword: created.temporaryPassword,
          boutiqueName: name,
        })
        setWhatsappSent(false)
      } else {
        const created = await createBoutique(name, city, provisionOwner)
        boutiqueId = created.boutiqueId
        setOnboardingCredentials(null)
      }
      setOpsBoutiques((items) => [
        ...items.filter((b) => b.id !== boutiqueId),
        { id: boutiqueId, nom: name, ville: city },
      ])
      if (!manualProvision && publicRequestDetail) {
        const routed = await routeRequest(publicRequestDetail.id, boutiqueId)
        const accepted = await decideRequest(
          routed.id,
          "acceptee",
          publicRequestNote,
        )
        setPublicRequestDetail(null)
        setPublicRequests((items) =>
          items.map((r) => (r.id === accepted.id ? accepted : r)),
        )
      }
      setProvisionModal(false)
      setManualProvision(false)
      await refresh()
      setView("clients")
      setClientTab("shops")
      setSelectedId(boutiqueId)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Création de la boutique impossible",
      )
    } finally {
      setProvisionSaving(false)
    }
  }

  async function sendCredentialsViaWhatsApp() {
    if (!onboardingCredentials || whatsappSending) return
    setWhatsappSending(true)
    setError("")
    try {
      const sent = await sendWhatsAppOnboarding({
        phone: onboardingCredentials.phone,
        fullName: onboardingCredentials.fullName,
        boutiqueName: onboardingCredentials.boutiqueName,
        temporaryPassword: onboardingCredentials.temporaryPassword,
      })
      if (
        sent.temporaryPassword &&
        sent.temporaryPassword !== onboardingCredentials.temporaryPassword
      )
        setOnboardingCredentials({
          ...onboardingCredentials,
          temporaryPassword: sent.temporaryPassword,
        })
      setWhatsappSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi WhatsApp impossible")
    } finally {
      setWhatsappSending(false)
    }
  }

  async function submitTask() {
    if (!taskTitle.trim() || saving) return
    setSaving(true)
    setError("")
    try {
      const item = await createOpsTask({
        boutiqueId: taskBoutique || null,
        title: taskTitle,
        team: taskTeam,
        priority: taskPriority,
        dueAt: taskDue ? new Date(taskDue).toISOString() : null,
        assigneeId: taskAssignee || null,
      })
      setWorkspace((w) => (w ? { ...w, tasks: [item, ...w.tasks] } : w))
      setTaskTitle("")
      setTaskBoutique("")
      setTaskDue("")
      setTaskAssignee("")
      setTaskModal(false)
      navigate("support")
      setSupportTab("tasks")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible")
    } finally {
      setSaving(false)
    }
  }

  async function submitTicket() {
    if (!ticketSubject.trim() || !ticketBoutique || saving) return
    setSaving(true)
    setError("")
    try {
      const item = await createOpsTicket({
        boutiqueId: ticketBoutique,
        subject: ticketSubject,
        priority: ticketPriority,
        requesterName: ticketRequester,
        requesterPhone: ticketPhone,
        assigneeId: ticketAssignee || null,
      })
      setWorkspace((w) => (w ? { ...w, tickets: [item, ...w.tickets] } : w))
      setTicketSubject("")
      setTicketBoutique("")
      setTicketRequester("")
      setTicketPhone("")
      setTicketAssignee("")
      setTicketModal(false)
      navigate("support")
      setSupportTab("tickets")
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible")
    } finally {
      setSaving(false)
    }
  }

  async function completeTask(task: OpsTask) {
    await runAction("task-" + task.id, async () => {
      const updated = await updateOpsTask(task.id, { status: "done" })
      setWorkspace((w) =>
        w
          ? {
              ...w,
              tasks: w.tasks.map((t) => (t.id === updated.id ? updated : t)),
            }
          : w,
      )
    })
  }

  async function resolveTicket(ticket: OpsTicket) {
    await runAction("ticket-" + ticket.id, async () => {
      const updated = await updateOpsTicket(ticket.id, { status: "resolved" })
      setWorkspace((w) =>
        w
          ? {
              ...w,
              tickets: w.tickets.map((t) =>
                t.id === updated.id ? updated : t,
              ),
            }
          : w,
      )
      await createOpsInteraction({
        boutiqueId: ticket.boutique_id,
        kind: "support",
        team: "support",
        title: `Ticket #${ticket.id} résolu · ${ticket.subject}`,
        relatedTicketId: ticket.id,
      })
    })
  }

  async function saveClientInteraction(boutiqueId: string) {
    if (!interactionTitle.trim() || interactionSaving) return

    setInteractionSaving(true)
    setError("")

    try {
      const interaction = await createOpsInteraction({
        boutiqueId,
        kind: "note",
        team:
          opsRole === "sales"
            ? "sales"
            : opsRole === "support"
              ? "support"
              : "service",
        title: interactionTitle,
        detail: interactionDetail,
      })
      setWorkspace((w) =>
        w ? { ...w, interactions: [interaction, ...w.interactions] } : w,
      )
      setInteractionTitle("")
      setInteractionDetail("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Note non enregistrée")
    } finally {
      setInteractionSaving(false)
    }
  }

  if (provisionModal) {
    const requestOwner =
      publicRequestDetail && provisionOwner
        ? users.find((user) => user.id === provisionOwner)
        : null

    return (
      <div
        className="ops-detail min-h-screen bg-slate-100 text-slate-900"
        data-screen-source="tournal-ops-boutique-create"
      >
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              disabled={provisionSaving}
              onClick={() => setProvisionModal(false)}
              className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center disabled:opacity-50"
              aria-label="Retour"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Créer la boutique</p>
              <p className="text-[11px] text-slate-500">
                {manualProvision
                  ? "Création manuelle Ops"
                  : `Depuis la demande de ${publicRequestDetail?.nom || "ce contact"}`}
              </p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 text-red-700 px-3 py-2 text-sm font-medium">
              {error}
            </div>
          )}
          <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
            {!manualProvision && publicRequestDetail && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="font-semibold">
                  {publicRequestDetail.nom || "Demande"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {publicRequestDetail.telephone || "Téléphone non renseigné"} ·{" "}
                  {publicRequestDetail.type_activite ||
                    "Activité non renseignée"}
                </p>
              </div>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Nom de la boutique
              <input
                autoFocus
                value={provisionName}
                onChange={(e) => setProvisionName(e.target.value)}
                className={`${input} mt-1`}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Ville
              <input
                value={provisionCity}
                onChange={(e) => setProvisionCity(e.target.value)}
                placeholder="Ville"
                className={`${input} mt-1`}
              />
            </label>
            <div>
              <p className="text-sm font-medium text-slate-700">Propriétaire</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvisionOwnerMode("new")}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                    provisionOwnerMode === "new"
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  Nouveau propriétaire
                </button>
                <button
                  type="button"
                  onClick={() => setProvisionOwnerMode("existing")}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                    provisionOwnerMode === "existing"
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  Utilisateur existant
                </button>
              </div>
            </div>
            {provisionOwnerMode === "existing" ? (
              <label className="block text-sm font-medium text-slate-700">
                Utilisateur
                <select
                  value={provisionOwner}
                  onChange={(e) => setProvisionOwner(e.target.value)}
                  className={`${input} mt-1`}
                >
                  <option value="">Sélectionner un utilisateur existant</option>
                  {users
                    .filter((u) => !u.isSuperAdmin)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nom}
                        {u.phone ? ` · ${u.phone}` : ""}
                      </option>
                    ))}
                </select>
                {requestOwner && (
                  <span className="mt-1 block text-xs text-emerald-700">
                    Correspondance trouvée avec le téléphone de la demande :{" "}
                    {requestOwner.nom}.
                  </span>
                )}
              </label>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Nom du propriétaire
                  <input
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    placeholder="Nom complet"
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Téléphone WhatsApp
                  <input
                    value={newOwnerPhone}
                    onChange={(e) => setNewOwnerPhone(e.target.value)}
                    placeholder="+221..."
                    className={`${input} mt-1`}
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Un mot de passe temporaire sécurisé sera généré
                    automatiquement.
                  </span>
                </label>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t pt-4">
              <button
                disabled={provisionSaving}
                onClick={() => setProvisionModal(false)}
                className="rounded-xl border px-4 py-3 text-sm font-medium disabled:opacity-50"
              >
                Retour
              </button>
              <button
                disabled={
                  provisionSaving ||
                  !provisionName.trim() ||
                  !provisionCity.trim() ||
                  (provisionOwnerMode === "new"
                    ? !newOwnerName.trim() || !newOwnerPhone.trim()
                    : !provisionOwner)
                }
                onClick={() => void provisionBoutique()}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {provisionSaving
                  ? "Création…"
                  : manualProvision
                    ? "Créer la boutique"
                    : "Créer & accepter"}
              </button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (publicRequestDetail) {
    const terminal =
      publicRequestDetail.statut === "acceptee" ||
      publicRequestDetail.statut === "refusee"

    return (
      <div
        className="ops-detail min-h-screen bg-slate-100 text-slate-900"
        data-screen-source="tournal-ops-access-request-detail"
      >
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              disabled={publicRequestBusy}
              onClick={() => setPublicRequestDetail(null)}
              className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center disabled:opacity-50"
              aria-label="Retour aux demandes"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Demande de création</p>
              <p className="text-[11px] text-slate-500">
                {fmtDate(publicRequestDetail.created_at)}
              </p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl p-4 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 text-red-700 px-3 py-2 text-sm font-medium">
              {error}
            </div>
          )}
          <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div>
                <h1 className="text-xl font-semibold">
                  {publicRequestDetail.nom || "Demande anonymisée"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {publicRequestDetail.societe ||
                    publicRequestDetail.type_activite ||
                    "—"}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                {requestStatus[publicRequestDetail.statut]}
              </span>
            </div>
            <dl className="mt-5 grid sm:grid-cols-[140px_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-slate-500">Téléphone</dt>
              <dd className="font-medium">
                {publicRequestDetail.telephone || "—"}
              </dd>
              <dt className="text-slate-500">Activité</dt>
              <dd>{publicRequestDetail.type_activite || "—"}</dd>
              <dt className="text-slate-500">Message</dt>
              <dd className="whitespace-pre-wrap">
                {publicRequestDetail.message || "—"}
              </dd>
            </dl>
            {!terminal && (
              <div className="mt-6 border-t pt-5 space-y-4">
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-slate-600">
                    Note interne (enregistrée avec la décision)
                  </summary>
                  <textarea
                    aria-label="Note interne"
                    value={publicRequestNote}
                    onChange={(e) => setPublicRequestNote(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className={`${input} mt-2`}
                  />
                </details>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    disabled={publicRequestBusy}
                    onClick={() =>
                      void mutatePublicRequest(() =>
                        decideRequest(
                          publicRequestDetail.id,
                          "complement_demande",
                          publicRequestNote,
                        ),
                      )
                    }
                    className="rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    Mettre en attente de complément
                  </button>
                  <button
                    disabled={publicRequestBusy}
                    onClick={() =>
                      void mutatePublicRequest(() =>
                        decideRequest(
                          publicRequestDetail.id,
                          "refusee",
                          publicRequestNote,
                        ),
                      )
                    }
                    className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    Refuser
                  </button>
                  <button
                    disabled={publicRequestBusy}
                    onClick={startProvisionFromRequest}
                    className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Accepter & créer
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    )
  }

  if (selected) {
    const linkedWork = selected.openTasks.length + selected.openTickets.length

    const checks: [string, boolean][] = [
      ["Propriétaire affecté", selected.ownerReady],
      ["Utilisateurs créés", selected.usersReady],
      ["Catalogue configuré", selected.setup],
      [
        "Première réception",
        Boolean(selected.firstReceipt || selected.onboarding?.first_receipt_at),
      ],
      [
        "Première vente",
        Boolean(selected.firstSale || selected.onboarding?.first_sale_at),
      ],
      ["Formation terminée", Boolean(selected.onboarding?.training_done)],
    ]

    return (
      <div
        className="ops-workspace ops-detail-workspace"
        data-screen-source="tournal-ops-boutique-detail"
      >
        <main className="ops-main">
          <button
            className="ops-button ops-back"
            onClick={() => {
              setSelectedId(null)
              navigate("clients", "shops")
            }}
          >
            <ArrowLeft size={17} />
            Retour aux boutiques
          </button>
          <header className="ops-page-heading">
            <div>
              <p className="ops-eyebrow">FICHE BOUTIQUE</p>
              <h1>{selected.nom}</h1>
              <p>
                {selected.ville || "Ville non renseignée"}
                {selectedAccount ? ` · ${selectedAccount.name}` : ""}
              </p>
            </div>
            {canEnterBoutique && (
              <button
                className="ops-button primary"
                onClick={() => onOpenBoutique(selected.id)}
              >
                Ouvrir la boutique
                <ChevronRight size={17} />
              </button>
            )}
          </header>
          {error && (
            <div className="ops-error" role="alert">
              {error}
            </div>
          )}
          {onboardingCredentials?.boutiqueId === selected.id && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-emerald-900">
                    Accès du nouveau propriétaire créé
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    {onboardingCredentials.fullName} ·{" "}
                    {onboardingCredentials.phone}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Mot de passe temporaire :{" "}
                    <span className="font-mono font-semibold">
                      {onboardingCredentials.temporaryPassword}
                    </span>{" "}
                    · changement obligatoire à la première connexion.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={whatsappSending || whatsappSent}
                  onClick={() => void sendCredentialsViaWhatsApp()}
                  className="shrink-0 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {whatsappSending
                    ? "Envoi…"
                    : whatsappSent
                      ? "Envoyé sur WhatsApp"
                      : "Envoyer sur WhatsApp"}
                </button>
              </div>
            </section>
          )}
          <div className="ops-home-grid">
            <div>
              <section className="ops-card">
                <div className="ops-section-title">
                  <div>
                    <h2>Mise en route</h2>
                    <p>
                      {checks.filter(([, ok]) => ok).length} étapes terminées
                      sur {checks.length}
                    </p>
                  </div>
                </div>
                {checks.map(([label, ok]) => (
                  <div className="ops-row" key={label}>
                    <CheckCircle2
                      size={19}
                      className={ok ? "text-emerald-700" : "text-slate-300"}
                    />
                    <span className="ops-row-content">{label}</span>
                    <span className="ops-muted">
                      {ok ? "Terminé" : "À faire"}
                    </span>
                  </div>
                ))}
                {canManageOnboarding &&
                  selected.onboarding &&
                  !selected.onboarding.training_done && (
                    <div className="ops-section-title">
                      <button
                        disabled={!!busyAction}
                        className="ops-button"
                        onClick={() =>
                          void runAction("training", async () => {
                            const saved = await updateOpsOnboarding(
                              selected.id,
                              {
                                training_done: true,
                                training_done_at: new Date().toISOString(),
                              },
                            )
                            setWorkspace((w) =>
                              w
                                ? {
                                    ...w,
                                    onboarding: w.onboarding.map((o) =>
                                      o.boutique_id === saved.boutique_id
                                        ? saved
                                        : o,
                                    ),
                                  }
                                : w,
                            )
                          })
                        }
                      >
                        Marquer la formation terminée
                      </button>
                    </div>
                  )}
              </section>
              <section className="ops-card">
                <div className="ops-section-title">
                  <div>
                    <h2>Tickets et tâches</h2>
                    <p>
                      {linkedWork
                        ? `${linkedWork} élément(s) en cours`
                        : "Aucune action en cours"}
                    </p>
                  </div>
                  {linkedWork > 0 && (
                    <button
                      className="ops-button"
                      onClick={() => {
                        setSelectedId(null)
                        navigate("support")
                        setSupportTab(
                          selected.openTickets.length ? "tickets" : "tasks",
                        )
                        setQuery(selected.nom)
                      }}
                    >
                      Voir le suivi
                      <ChevronRight size={17} />
                    </button>
                  )}
                </div>
                {selected.openTickets.map((t) => (
                  <div className="ops-row" key={"ticket-" + t.id}>
                    <Headphones size={18} />
                    <div className="ops-row-content">
                      <strong>{t.subject}</strong>
                      <p>
                        Ticket #{t.id} · {priorityLabel[t.priority]}
                      </p>
                    </div>
                    {canManageTickets && (
                      <button
                        disabled={!!busyAction}
                        className="ops-button"
                        onClick={() => void resolveTicket(t)}
                      >
                        Résoudre
                      </button>
                    )}
                  </div>
                ))}
                {selected.openTasks.map((t) => (
                  <div className="ops-row" key={"task-" + t.id}>
                    <ClipboardCheck size={18} />
                    <div className="ops-row-content">
                      <strong>{t.title}</strong>
                      <p>
                        {teamLabel[t.team]} ·{" "}
                        {t.due_at ? fmtDate(t.due_at) : "Sans échéance"}
                      </p>
                    </div>
                    {canManageTask(t) && (
                      <button
                        disabled={!!busyAction}
                        className="ops-button"
                        onClick={() => void completeTask(t)}
                      >
                        Terminer
                      </button>
                    )}
                  </div>
                ))}
              </section>
            </div>
            <div>
              <section className="ops-card">
                <div className="ops-section-title">
                  <h2>Contacts et utilisateurs</h2>
                </div>
                {selected.tel && (
                  <div className="ops-row">
                    <div className="ops-row-content">
                      <p>Téléphone de la boutique</p>
                      <a href={`tel:${selected.tel}`}>{selected.tel}</a>
                    </div>
                  </div>
                )}
                {selected.members.map((u) => (
                  <div className="ops-row" key={u.id}>
                    <span className="ops-avatar">{u.nom.slice(0, 1)}</span>
                    <div className="ops-row-content">
                      <strong>{u.nom}</strong>
                      <p>
                        {u.assignments?.find(
                          (a) => a.boutiqueId === selected.id,
                        )?.role ?? "Utilisateur"}
                        {u.phone ? ` · ${u.phone}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
                {selectedContacts.map((c) => (
                  <div className="ops-row" key={c.id}>
                    <div className="ops-row-content">
                      <strong>{c.name}</strong>
                      <p>
                        {[c.role_label, c.phone, c.email]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                ))}
                {!selected.members.length &&
                  !selectedContacts.length &&
                  !selected.tel && (
                    <p className="ops-notice">Aucun contact renseigné.</p>
                  )}
              </section>
              <section className="ops-card">
                <div className="ops-section-title">
                  <div>
                    <h2>Suivi client</h2>
                    <p>Dernière vente : {fmtDate(selected.lastSale)}</p>
                  </div>
                </div>
                {(workspace?.interactions ?? [])
                  .filter((i) => i.boutique_id === selected.id)
                  .slice(0, 5)
                  .map((i) => (
                    <div className="ops-row" key={i.id}>
                      <div className="ops-row-content">
                        <strong>{i.title}</strong>
                        <p>{fmtDate(i.created_at)}</p>
                        {i.detail && <p>{i.detail}</p>}
                      </div>
                    </div>
                  ))}
                {canManageContacts && (
                  <form
                    className="ops-note-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveClientInteraction(selected.id)
                    }}
                  >
                    <label>
                      Ajouter une note
                      <input
                        className={input}
                        value={interactionTitle}
                        onChange={(e) => setInteractionTitle(e.target.value)}
                        placeholder="Objet du suivi"
                        required
                      />
                    </label>
                    <label>
                      Détails
                      <textarea
                        className={input}
                        value={interactionDetail}
                        onChange={(e) => setInteractionDetail(e.target.value)}
                        rows={3}
                      />
                    </label>
                    <button
                      className="ops-button"
                      disabled={interactionSaving || !interactionTitle.trim()}
                    >
                      {interactionSaving
                        ? "Enregistrement…"
                        : "Enregistrer la note"}
                    </button>
                  </form>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const matches = (...values: (string | null | undefined)[]) =>
    !normalizedQuery ||
    values.join(" ").toLocaleLowerCase("fr").includes(normalizedQuery)

  const shopName = (id: string | null) =>
    rows.find((b) => b.id === id)?.nom ?? "Sans boutique"

  const requests = publicRequests.filter(
    (r) =>
      matches(r.nom, r.societe, r.type_activite) &&
      (filter !== "open" || !["acceptee", "refusee"].includes(r.statut)),
  )

  const shops = filtered.filter((b) => filter !== "setup" || b.progress < 100)

  const tickets = (
    filter === "closed"
      ? (workspace?.tickets ?? []).filter((t) =>
          ["resolved", "closed"].includes(t.status),
        )
      : activeTickets
  ).filter(
    (t) =>
      matches(t.subject, shopName(t.boutique_id), userName(t.assignee_id)) &&
      (filter !== "urgent" || t.priority === "urgent"),
  )

  const tasks = (
    filter === "closed"
      ? (workspace?.tasks ?? []).filter((t) =>
          ["done", "cancelled"].includes(t.status),
        )
      : activeTasks
  ).filter(
    (t) =>
      matches(t.title, shopName(t.boutique_id), userName(t.assignee_id)) &&
      (filter !== "urgent" || t.priority === "urgent"),
  )

  const activity = (workspace?.interactions ?? []).filter((i) =>
    matches(i.title, i.detail, shopName(i.boutique_id)),
  )

  const navItems: [string, string, React.ElementType, () => void, boolean][] = [
    ["home", "À traiter", LayoutDashboard, () => navigate("home"), true],

    [
      "requests",
      "Demandes",
      ClipboardCheck,
      () => navigate("clients", "requests"),
      canSystemAdmin,
    ],

    ["shops", "Boutiques", Store, () => navigate("clients", "shops"), true],

    [
      "support",
      "Tickets & tâches",
      Headphones,
      () => navigate("support"),
      true,
    ],

    ["activity", "Historique", Activity, () => navigate("activity"), true],

    ["team", "Équipe", Users, () => navigate("team"), true],

    [
      "system",
      "Administration",
      Settings,
      () => navigate("system"),
      canSystemAdmin,
    ],
  ]

  const page = view === "clients" ? clientTab : view

  const descriptions: Record<string, string> = {
    home: "Les priorités de votre équipe, au même endroit.",
    requests: "Étudiez les demandes et accompagnez les nouveaux clients.",
    shops: "Un point d’entrée pour chaque boutique et son suivi.",
    support: "Résolvez les incidents et organisez les prochaines actions.",
    activity: "Retrouvez les échanges et les actions de l’équipe.",
    team: "Les collaborateurs qui ont accès à Tournal Ops.",
    system: "Paramètres et autorisations d’accès temporaires.",
  }

  const empty = (message: string) => (
    <div className="ops-empty">
      <CheckCircle2 size={28} />
      <h3>{message}</h3>
      <p>
        {query
          ? "Essayez un autre terme ou effacez la recherche."
          : "Les nouveaux éléments apparaîtront ici."}
      </p>
    </div>
  )

  const ticketRow = (t: OpsTicket) => (
    <article className="ops-row" key={"ticket-" + t.id}>
      <span className={`ops-dot ${t.priority === "urgent" ? "danger" : ""}`}>
        <Headphones size={18} />
      </span>
      <div className="ops-row-content">
        <strong>{t.subject}</strong>
        <p>
          Ticket #{t.id} · {shopName(t.boutique_id)} · {userName(t.assignee_id)}
        </p>
        {t.description && <p>{t.description}</p>}
      </div>
      <span className={`ops-tag ${t.priority === "urgent" ? "danger" : ""}`}>
        {priorityLabel[t.priority]}
      </span>
      {canManageTickets && !["resolved", "closed"].includes(t.status) && (
        <button
          disabled={!!busyAction}
          className="ops-button"
          onClick={() => void resolveTicket(t)}
        >
          {busyAction === "ticket-" + t.id ? "Résolution…" : "Résoudre"}
        </button>
      )}
    </article>
  )

  const taskRow = (t: OpsTask) => (
    <article className="ops-row" key={"task-" + t.id}>
      <span className="ops-dot">
        <ClipboardCheck size={18} />
      </span>
      <div className="ops-row-content">
        <strong>{t.title}</strong>
        <p>
          {shopName(t.boutique_id)} · {userName(t.assignee_id)}
          {t.due_at ? ` · Échéance : ${fmtDate(t.due_at)}` : ""}
        </p>
      </div>
      <span className={`ops-tag ${t.priority === "urgent" ? "danger" : ""}`}>
        {priorityLabel[t.priority]}
      </span>
      {canManageTask(t) && !["done", "cancelled"].includes(t.status) && (
        <button
          disabled={!!busyAction}
          className="ops-button"
          onClick={() => void completeTask(t)}
        >
          {busyAction === "task-" + t.id ? "Enregistrement…" : "Terminer"}
        </button>
      )}
    </article>
  )

  return (
    <div className="ops-workspace" data-screen-source="tournal-ops-workspace">
      <a className="ops-skip" href="#ops-main">
        Aller au contenu
      </a>
      <aside className="ops-sidebar">
        <div className="ops-brand">
          <span>T</span>
          <div>
            Tournal <b>Ops</b>
            <small>Espace équipe</small>
          </div>
        </div>
        <nav aria-label="Navigation principale">
          {navItems
            .filter((item) => item[4])
            .map(([id, label, Icon, action]) => (
              <button
                key={id}
                aria-current={page === id ? "page" : undefined}
                onClick={action}
              >
                <Icon size={19} />
                {label}
                {id === "support" && activeTickets.length > 0 && (
                  <span className="ops-nav-count">{activeTickets.length}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="ops-sidebar-footer">
          <ShieldCheck size={17} />
          <span>
            {canSystemAdmin
              ? "Administrateur"
              : (teamLabel[opsRole ?? ""] ?? opsRole ?? "Équipe Ops")}
          </span>
          <button onClick={onLogout} aria-label="Se déconnecter">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main id="ops-main" className="ops-main">
        <header className="ops-page-heading">
          <div>
            <p className="ops-eyebrow">ESPACE OPÉRATIONS</p>
            <h1>{navItems.find((item) => item[0] === page)?.[1]}</h1>
            <p>{descriptions[page]}</p>
          </div>
          <div className="ops-actions">
            <button
              className="ops-button"
              disabled={loading || publicRequestsLoading}
              onClick={() => {
                void refresh()
                if (canSystemAdmin) void refreshRequests()
              }}
            >
              <RefreshCw size={16} />
              Actualiser
            </button>
            {page === "shops" && canSystemAdmin && (
              <button
                className="ops-button primary"
                onClick={startManualProvision}
              >
                <Plus size={17} />
                Créer une boutique
              </button>
            )}
            {view === "support" && (
              <>
                <button
                  className="ops-button"
                  onClick={() => {
                    setTaskTeam(
                      opsRole === "sales"
                        ? "sales"
                        : opsRole === "support"
                          ? "support"
                          : "service",
                    )
                    setError("")
                    setTaskModal(true)
                  }}
                >
                  <Plus size={17} />
                  Tâche
                </button>
                {canManageTickets && (
                  <button
                    className="ops-button primary"
                    onClick={() => {setError("");setTicketModal(true)}}
                  >
                    <Plus size={17} />
                    Ticket
                  </button>
                )}
              </>
            )}
          </div>
        </header>
        {error && (
          <div className="ops-error" role="alert">
            {error}
          </div>
        )}
        {loading && !workspace ? (
          <div className="ops-empty" role="status">
            Chargement de votre espace…
          </div>
        ) : !workspace ? (
          <div className="ops-empty">
            <h3>L’espace n’a pas pu être chargé.</h3>
            <button className="ops-button" onClick={() => void refresh()}>
              Réessayer
            </button>
          </div>
        ) : (
          <>
            {view === "home" ? (
              <>
                <section className="ops-metrics" aria-label="Aperçu">
                  <button
                    onClick={() => {
                      navigate("support")
                      setSupportTab("tickets")
                    }}
                  >
                    <span>Tickets ouverts</span>
                    <strong>{activeTickets.length}</strong>
                    <small>
                      Voir les incidents <ChevronRight size={14} />
                    </small>
                  </button>
                  <button
                    onClick={() => {
                      navigate("support")
                      setSupportTab("tasks")
                    }}
                  >
                    <span>Tâches en cours</span>
                    <strong>{activeTasks.length}</strong>
                    <small>
                      Organiser le travail <ChevronRight size={14} />
                    </small>
                  </button>
                  <button
                    onClick={() => {
                      navigate("clients", "shops")
                      setFilter("setup")
                    }}
                  >
                    <span>Boutiques à accompagner</span>
                    <strong>
                      {rows.filter((b) => b.progress < 100).length}
                    </strong>
                    <small>
                      Suivre la mise en route <ChevronRight size={14} />
                    </small>
                  </button>
                </section>
                <div className="ops-home-grid">
                  <section className="ops-card">
                    <div className="ops-section-title">
                      <div>
                        <h2>Les prochaines actions</h2>
                        <p>Incidents urgents et tâches arrivées à échéance.</p>
                      </div>
                      <span className="ops-tag">Priorités</span>
                    </div>
                    {activeTickets
                      .filter(
                        (t) =>
                          t.priority === "urgent" ||
                          (t.sla_due_at && new Date(t.sla_due_at) < new Date()),
                      )
                      .map(ticketRow)}
                    {activeTasks
                      .filter(
                        (t) =>
                          t.priority === "urgent" ||
                          (t.due_at && new Date(t.due_at) < new Date()),
                      )
                      .map(taskRow)}
                    {!activeTickets.some(
                      (t) =>
                        t.priority === "urgent" ||
                        (t.sla_due_at && new Date(t.sla_due_at) < new Date()),
                    ) &&
                      !activeTasks.some(
                        (t) =>
                          t.priority === "urgent" ||
                          (t.due_at && new Date(t.due_at) < new Date()),
                      ) &&
                      empty("Aucune urgence en cours")}
                  </section>
                  <section className="ops-card">
                    <div className="ops-section-title">
                      <div>
                        <h2>Accompagner les boutiques</h2>
                        <p>La prochaine étape pour bien démarrer.</p>
                      </div>
                    </div>
                    {attention
                      .filter((b) => b.progress < 100)
                      .slice(0, 6)
                      .map((b) => (
                        <button
                          className="ops-row ops-row-link"
                          key={b.id}
                          onClick={() => setSelectedId(b.id)}
                        >
                          <span className="ops-avatar">
                            {b.nom.slice(0, 1)}
                          </span>
                          <div className="ops-row-content">
                            <strong>{b.nom}</strong>
                            <p>
                              {!b.ownerReady
                                ? "Affecter un propriétaire"
                                : !b.setup
                                  ? "Configurer le catalogue"
                                  : !b.firstReceipt
                                    ? "Enregistrer une réception"
                                    : !b.firstSale
                                      ? "Réaliser la première vente"
                                      : "Terminer la formation"}
                            </p>
                          </div>
                          <ChevronRight size={17} />
                        </button>
                      ))}
                    {!rows.some((b) => b.progress < 100) &&
                      empty("Toutes les boutiques sont prêtes")}
                  </section>
                </div>
              </>
            ) : (
              <>
                {view !== "system" && (
                  <div className="ops-toolbar">
                    <label className="ops-search">
                      <Search size={18} />
                      <input
                        aria-label="Rechercher dans cette page"
                        placeholder={
                          page === "shops"
                            ? "Rechercher une boutique, un contact…"
                            : "Rechercher dans cette page…"
                        }
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {query && (
                        <button
                          aria-label="Effacer la recherche"
                          onClick={() => setQuery("")}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </label>
                    {view === "support" && (
                      <div className="ops-tabs" aria-label="Type de travail">
                        <button
                          aria-pressed={supportTab === "tickets"}
                          onClick={() => setSupportTab("tickets")}
                        >
                          Tickets
                        </button>
                        <button
                          aria-pressed={supportTab === "tasks"}
                          onClick={() => setSupportTab("tasks")}
                        >
                          Tâches
                        </button>
                      </div>
                    )}
                    {["shops", "requests", "support"].includes(page) && (
                      <select
                        aria-label="Filtrer les résultats"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">
                          {view === "support" ? "En cours" : "Tous"}
                        </option>
                        {page === "shops" ? (
                          <option value="setup">Mise en route</option>
                        ) : page === "requests" ? (
                          <option value="open">À traiter</option>
                        ) : (
                          <>
                            <option value="urgent">Urgents</option>
                            <option value="closed">Terminés</option>
                          </>
                        )}
                      </select>
                    )}
                  </div>
                )}
                {page === "requests" && canSystemAdmin && (
                  <section className="ops-card">
                    <div className="ops-section-title">
                      <h2>
                        {requests.length} demande
                        {requests.length !== 1 ? "s" : ""}
                      </h2>
                    </div>
                    {requestError && (
                      <div role="alert" className="ops-error">
                        {requestError}
                        <button
                          className="ops-button"
                          onClick={() => void refreshRequests()}
                        >
                          Réessayer
                        </button>
                      </div>
                    )}
                    {publicRequestsLoading && (
                      <p className="ops-notice" role="status">
                        Chargement…
                      </p>
                    )}
                    {requests.map((r) => (
                      <button
                        className="ops-row ops-row-link"
                        key={r.id}
                        disabled={publicRequestBusy}
                        onClick={() => void openPublicRequest(r.id)}
                      >
                        <span className="ops-avatar">
                          {(r.nom || "?").slice(0, 1)}
                        </span>
                        <div className="ops-row-content">
                          <strong>
                            {r.societe || r.nom || "Demande anonymisée"}
                          </strong>
                          <p>
                            {r.societe ? r.nom + " · " : ""}
                            {r.type_activite || "Activité non renseignée"} ·{" "}
                            {fmtDate(r.created_at)}
                          </p>
                        </div>
                        <span
                          className={`ops-tag ${
                            r.statut === "nouvelle" ? "warning" : ""
                          }`}
                        >
                          {requestStatus[r.statut]}
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    {!publicRequestsLoading &&
                      !requestError &&
                      requests.length === 0 &&
                      empty("Aucune demande à afficher")}
                    {moreRequests && (
                      <button
                        className="ops-button ops-load-more"
                        disabled={publicRequestsLoading}
                        onClick={() => void refreshRequests(requestOffset + 50)}
                      >
                        Charger les demandes suivantes
                      </button>
                    )}
                  </section>
                )}
                {page === "shops" && (
                  <section className="ops-card">
                    <div className="ops-section-title">
                      <h2>
                        {shops.length} boutique{shops.length !== 1 ? "s" : ""}
                      </h2>
                      <span className="ops-muted">
                        Ouvrez une fiche pour agir
                      </span>
                    </div>
                    {shops.map((b) => (
                      <button
                        className="ops-row ops-row-link"
                        key={b.id}
                        onClick={() => setSelectedId(b.id)}
                      >
                        <span className="ops-avatar">{b.nom.slice(0, 1)}</span>
                        <div className="ops-row-content">
                          <strong>{b.nom}</strong>
                          <p>
                            {b.ville || "Ville non renseignée"}
                            {b.tel ? ` · ${b.tel}` : ""}
                          </p>
                        </div>
                        <span
                          className={`ops-tag ${
                            b.openTickets.length ? "warning" : ""
                          }`}
                        >
                          {b.openTickets.length
                            ? `${b.openTickets.length} ticket(s)`
                            : b.progress === 100
                              ? "Opérationnelle"
                              : "Mise en route"}
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    {shops.length === 0 && empty("Aucune boutique à afficher")}
                  </section>
                )}
                {view === "support" && (
                  <section className="ops-card">
                    <div className="ops-section-title">
                      <h2>
                        {supportTab === "tickets"
                          ? `${tickets.length} ticket(s)`
                          : `${tasks.length} tâche(s)`}
                      </h2>
                      <span className="ops-muted">
                        {filter === "closed"
                          ? "Terminés"
                          : "Par ordre de priorité"}
                      </span>
                    </div>
                    {supportTab === "tickets"
                      ? tickets.map(ticketRow)
                      : tasks.map(taskRow)}
                    {(supportTab === "tickets" ? tickets : tasks).length ===
                      0 && empty("Aucun élément à afficher")}
                  </section>
                )}
                {view === "activity" && (
                  <section className="ops-card">
                    {activity.map((i) => (
                      <article className="ops-row" key={i.id}>
                        <span className="ops-dot">
                          <Activity size={17} />
                        </span>
                        <div className="ops-row-content">
                          <strong>{i.title}</strong>
                          <p>
                            {shopName(i.boutique_id)} ·{" "}
                            {teamLabel[i.team ?? ""] ?? "Équipe"} ·{" "}
                            {fmtDate(i.created_at)}
                          </p>
                          {i.detail && <p>{i.detail}</p>}
                        </div>
                      </article>
                    ))}
                    {activity.length === 0 &&
                      empty("Aucune activité à afficher")}
                  </section>
                )}
                {view === "team" && (
                  <section className="ops-card">
                    <div className="ops-section-title">
                      <div>
                        <h2>Collaborateurs Ops</h2>
                        <p>
                          Les comptes clients restent dans les fiches boutiques.
                        </p>
                      </div>
                    </div>
                    {opsUsers
                      .filter((u) => matches(u.nom, u.phone))
                      .map((u) => {
                        const profile = workspace.staff.find(
                          (s) => s.user_id === u.id,
                        )!
                        return (
                          <div className="ops-row" key={u.id}>
                            <span className="ops-avatar">
                              {u.nom.slice(0, 1)}
                            </span>
                            <div className="ops-row-content">
                              <strong>{u.nom}</strong>
                              <p>{u.phone || "Téléphone non renseigné"}</p>
                            </div>
                            {canSystemAdmin ? (
                              <select
                                aria-label={`Rôle de ${u.nom}`}
                                disabled={!!busyAction}
                                value={profile.role}
                                onChange={(e) =>
                                  void changeStaff(u.id, e.target.value)
                                }
                              >
                                <option value="">Retirer l’accès Ops</option>
                                <option value="sales">Commercial</option>
                                <option value="service">Accompagnement</option>
                                <option value="support">Support</option>
                                <option value="manager">Responsable</option>
                              </select>
                            ) : (
                              <span className="ops-tag">
                                {teamLabel[profile.role] ?? profile.role}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    {!opsUsers.some((u) => matches(u.nom, u.phone)) && empty("Aucun collaborateur à afficher")}
                    {canSystemAdmin && (
                      <div className="ops-staff-add">
                        <label htmlFor="ops-candidate">
                          Ajouter un collaborateur existant
                        </label>
                        <div>
                          <select
                            id="ops-candidate"
                            value={staffCandidate}
                            onChange={(e) => setStaffCandidate(e.target.value)}
                          >
                            <option value="">
                              Sélectionner un utilisateur
                            </option>
                            {users
                              .filter(
                                (u) =>
                                  !u.isSuperAdmin &&
                                  !opsUsers.some((o) => o.id === u.id),
                              )
                              .map((u) => (
                                <option value={u.id} key={u.id}>
                                  {u.nom} {u.phone}
                                </option>
                              ))}
                          </select>
                          <select
                            aria-label="Attribuer un rôle au nouveau collaborateur"
                            value=""
                            disabled={!staffCandidate || !!busyAction}
                            onChange={(e) =>
                              void changeStaff(staffCandidate, e.target.value)
                            }
                          >
                            <option value="">Choisir le rôle…</option>
                            <option value="sales">Commercial</option>
                            <option value="service">Accompagnement</option>
                            <option value="support">Support</option>
                            <option value="manager">Responsable</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </section>
                )}
                {view === "system" && canSystemAdmin && (
                  <>
                    <section className="ops-card">
                      <div className="ops-section-title">
                        <div>
                          <h2>Administration générale</h2>
                          <p>
                            Gérer les comptes, les groupes et les paramètres.
                          </p>
                        </div>
                        <button className="ops-button" onClick={onSystem}>
                          Ouvrir l’administration
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </section>
                    <section className="ops-card">
                      <div className="ops-section-title">
                        <div>
                          <h2>Notifications des nouvelles demandes</h2>
                          <p>
                            Ces adresses reçoivent un email à chaque nouvelle demande d’accès.
                          </p>
                        </div>
                      </div>
                      <div className="ops-form">
                        <label>
                          Adresses email
                          <textarea
                            rows={5}
                            value={accessEmailDraft}
                            disabled={accessEmailLoading || accessEmailSaving}
                            onChange={(e) => {
                              setAccessEmailDraft(e.target.value)
                              setAccessEmailSaved(false)
                            }}
                            className={input}
                            placeholder={"ops@tournal.org\nresponsable@tournal.org"}
                          />
                          <small>Une adresse par ligne. 20 destinataires maximum.</small>
                        </label>
                        <div>
                          <button
                            type="button"
                            className="ops-button primary"
                            disabled={accessEmailLoading || accessEmailSaving || !accessEmailDraft.trim()}
                            onClick={() => void saveAccessEmailRecipients()}
                          >
                            {accessEmailSaving ? "Enregistrement…" : "Enregistrer les destinataires"}
                          </button>
                          {accessEmailSaved && (
                            <span className="ops-tag">Enregistré</span>
                          )}
                        </div>
                      </div>
                    </section>
                    <section className="ops-card">
                      <div className="ops-section-title">
                        <div>
                          <h2>Accès temporaires aux boutiques</h2>
                          <p>
                            Le propriétaire valide ces demandes depuis sa boutique.
                          </p>
                        </div>
                      </div>
                      {pendingAccess.map((r) => (
                        <div className="ops-row" key={r.id}>
                          <div className="ops-row-content">
                            <strong>{shopName(r.boutique_id)}</strong>
                            <p>
                              {userName(r.requester_id)} · {r.requested_minutes}{" "}
                              minutes
                            </p>
                            <p>{r.reason}</p>
                          </div>
                          <span className="ops-tag warning">Accord du propriétaire attendu</span>
                        </div>
                      ))}
                      {pendingAccess.length === 0 &&
                        empty("Aucun accès en attente")}
                    </section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      {taskModal && (
        <Modal
          title="Nouvelle tâche"
          onClose={() => {
            if (!saving) setTaskModal(false)
          }}
        >
          <form
            className="ops-form"
            onSubmit={(e) => {
              e.preventDefault()
              void submitTask()
            }}
          >
            {error && (
              <p role="alert" className="ops-error">
                {error}
              </p>
            )}
            <label>
              Action à réaliser
              <input
                autoFocus
                required
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className={input}
              />
            </label>
            <label>
              Boutique
              <select
                value={taskBoutique}
                onChange={(e) => setTaskBoutique(e.target.value)}
                className={input}
              >
                <option value="">Tâche globale</option>
                {rows.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Équipe responsable
              <select
                value={taskTeam}
                onChange={(e) => setTaskTeam(e.target.value as typeof taskTeam)}
                className={input}
              >
                {Object.entries(teamLabel)
                  .filter(([key]) => key !== "manager")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Priorité
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as OpsPriority)}
                className={input}
              >
                {Object.entries(priorityLabel).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Échéance (facultative)
              <input
                type="datetime-local"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className={input}
              />
            </label>
            <label>
              Responsable
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className={input}
              >
                <option value="">Non assignée</option>
                {opsUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nom}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={saving || !taskTitle.trim()}
              className="rounded-lg bg-emerald-800 text-white py-3 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Création…" : "Créer la tâche"}
            </button>
          </form>
        </Modal>
      )}
      {ticketModal && (
        <Modal
          title="Nouveau ticket"
          onClose={() => {
            if (!saving) setTicketModal(false)
          }}
        >
          <form
            className="ops-form"
            onSubmit={(e) => {
              e.preventDefault()
              void submitTicket()
            }}
          >
            {error && (
              <p role="alert" className="ops-error">
                {error}
              </p>
            )}
            <label>
              Boutique
              <select
                required
                value={ticketBoutique}
                onChange={(e) => setTicketBoutique(e.target.value)}
                className={input}
              >
                <option value="">Choisir la boutique</option>
                {rows.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sujet du problème
              <input
                required
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                className={input}
              />
            </label>
            <label>
              Priorité
              <select
                value={ticketPriority}
                onChange={(e) =>
                  setTicketPriority(e.target.value as OpsPriority)
                }
                className={input}
              >
                {Object.entries(priorityLabel).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Demandeur (facultatif)
              <input
                value={ticketRequester}
                onChange={(e) => setTicketRequester(e.target.value)}
                className={input}
              />
            </label>
            <label>
              Téléphone (facultatif)
              <input
                type="tel"
                value={ticketPhone}
                onChange={(e) => setTicketPhone(e.target.value)}
                className={input}
              />
            </label>
            <label>
              Responsable
              <select
                value={ticketAssignee}
                onChange={(e) => setTicketAssignee(e.target.value)}
                className={input}
              >
                <option value="">Non assigné</option>
                {opsUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nom}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={saving || !ticketBoutique || !ticketSubject.trim()}
              className="rounded-lg bg-emerald-800 text-white py-3 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Création…" : "Créer le ticket"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
