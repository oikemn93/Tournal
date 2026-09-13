import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./app/App";
import { refreshSessionIfNeeded } from "./lib/api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";
const OFFLINE_CONFIRM_MS = 20_000;
const PROBE_TIMEOUT_MS = 8_000;
const OFFLINE_WARNING_MS = 12 * 60 * 60 * 1000;
const OFFLINE_SINCE_KEY = "tournal.offline.since";
const SYNC_SUMMARY_KEY = "tournal.offline.lastSyncSummary";

type NetworkMode = "online" | "suspect" | "offline";
type QueueRecord = {
  id: string;
  kind: "create_sale" | "record_payment";
  createdAt: number;
  url: string;
  body: Record<string, unknown>;
  tempInvoiceId?: string;
  lastError?: string;
};

type WorkerMessage =
  | { type: "TOURNAL_NETWORK_HEALTH"; status: "online" | "suspect"; latencyMs?: number; reason?: string }
  | { type: "TOURNAL_OFFLINE_QUEUED"; queueCount: number; oldestCreatedAt?: number }
  | { type: "TOURNAL_OFFLINE_QUEUE"; records: QueueRecord[]; invoiceMap?: Record<string, string> }
  | { type: "TOURNAL_OFFLINE_QUEUE_STATUS"; queueCount: number; oldestCreatedAt?: number };

function workerPost(message: Record<string, unknown>) {
  navigator.serviceWorker?.controller?.postMessage(message);
}

function formatAge(timestamp: number | null, now: number) {
  if (!timestamp) return "inconnue";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `il y a ${hours} h ${rest} min` : `il y a ${hours} h`;
}

async function probeBackend() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings?tournal_probe=${Date.now()}`, {
      headers: { apikey: PUBLISHABLE_KEY },
      cache: "no-store",
      signal: controller.signal,
    });
    return { ok: response.ok, latencyMs: performance.now() - startedAt };
  } catch {
    return { ok: false, latencyMs: performance.now() - startedAt };
  } finally {
    window.clearTimeout(timeout);
  }
}

function OfflineCoordinator({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<NetworkMode>(() => navigator.onLine ? "online" : "suspect");
  const [suspectSince, setSuspectSince] = React.useState<number | null>(() => navigator.onLine ? null : Date.now());
  const [offlineSince, setOfflineSince] = React.useState<number | null>(() => {
    const stored = sessionStorage.getItem(OFFLINE_SINCE_KEY);
    return stored ? Number(stored) || null : null;
  });
  const [lastHealthyAt, setLastHealthyAt] = React.useState<number>(() => Date.now());
  const [queueCount, setQueueCount] = React.useState(0);
  const [queueOldestAt, setQueueOldestAt] = React.useState<number | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncSummary, setSyncSummary] = React.useState<string | null>(() => sessionStorage.getItem(SYNC_SUMMARY_KEY));
  const [clock, setClock] = React.useState(() => Date.now());
  const syncInFlight = React.useRef(false);
  const reloadWhenQueueEmpty = React.useRef(false);

  React.useEffect(() => {
    if (syncSummary) sessionStorage.removeItem(SYNC_SUMMARY_KEY);
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const markHealthy = React.useCallback(() => {
    setMode("online");
    setSuspectSince(null);
    setLastHealthyAt(Date.now());
    setOfflineSince(null);
    sessionStorage.removeItem(OFFLINE_SINCE_KEY);
  }, []);

  const markSuspect = React.useCallback(() => {
    setMode(current => current === "offline" ? current : "suspect");
    setSuspectSince(current => current ?? Date.now());
  }, []);

  React.useEffect(() => {
    const onOffline = () => markSuspect();
    const onOnline = async () => {
      const probe = await probeBackend();
      if (probe.ok && probe.latencyMs < PROBE_TIMEOUT_MS) markHealthy();
      else markSuspect();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [markHealthy, markSuspect]);

  React.useEffect(() => {
    if (mode !== "suspect" || suspectSince == null) return;
    const elapsed = Date.now() - suspectSince;
    const delay = Math.max(0, OFFLINE_CONFIRM_MS - elapsed);
    const timer = window.setTimeout(async () => {
      const probe = await probeBackend();
      if (probe.ok && probe.latencyMs < PROBE_TIMEOUT_MS) {
        markHealthy();
        return;
      }
      const since = offlineSince ?? suspectSince;
      setMode("offline");
      setOfflineSince(since);
      sessionStorage.setItem(OFFLINE_SINCE_KEY, String(since));
      workerPost({ type: "TOURNAL_GET_QUEUE_STATUS" });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [mode, suspectSince, offlineSince, markHealthy]);

  const synchronizeQueue = React.useCallback(async (records: QueueRecord[], initialMap: Record<string, string> = {}) => {
    if (!records.length || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    const invoiceMap = new Map(Object.entries(initialMap));
    const errorMessages: string[] = [];
    let success = 0;
    let errors = 0;
    let networkInterrupted = false;

    try {
      const session = await refreshSessionIfNeeded();
      for (const record of [...records].sort((a, b) => a.createdAt - b.createdAt)) {
        const body = { ...record.body };
        if (record.kind === "record_payment" && typeof body.p_invoice_id === "string" && body.p_invoice_id.startsWith("OFF-")) {
          const officialId = invoiceMap.get(body.p_invoice_id);
          if (!officialId) {
            const message = "La vente temporaire liée n’a pas encore de numéro officiel.";
            errors += 1;
            errorMessages.push(message);
            workerPost({ type: "TOURNAL_MARK_OFFLINE_ERROR", id: record.id, error: message });
            continue;
          }
          body.p_invoice_id = officialId;
        }

        try {
          const response = await fetch(record.url, {
            method: "POST",
            headers: {
              apikey: PUBLISHABLE_KEY,
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
              "x-client-info": `tournal-offline-replay/${record.id}`,
            },
            body: JSON.stringify(body),
          });
          const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
          if (!response.ok) {
            const message = typeof payload?.message === "string"
              ? payload.message
              : typeof payload?.error === "string"
                ? payload.error
                : `Synchronisation refusée (${response.status})`;
            errors += 1;
            errorMessages.push(message);
            workerPost({ type: "TOURNAL_MARK_OFFLINE_ERROR", id: record.id, error: message });
            continue;
          }
          if (record.kind === "create_sale") {
            const officialId = typeof payload?.invoice_id === "string" ? payload.invoice_id : null;
            if (!officialId) {
              const duplicate = typeof payload?.duplicate_invoice_id === "string" ? ` Vente similaire détectée: ${payload.duplicate_invoice_id}.` : "";
              const message = `Aucun numéro de facture officiel attribué.${duplicate}`;
              errors += 1;
              errorMessages.push(message);
              workerPost({ type: "TOURNAL_MARK_OFFLINE_ERROR", id: record.id, error: message });
              continue;
            }
            if (record.tempInvoiceId) invoiceMap.set(record.tempInvoiceId, officialId);
            workerPost({ type: "TOURNAL_MARK_OFFLINE_SYNCED", id: record.id, tempInvoiceId: record.tempInvoiceId, officialInvoiceId: officialId });
          } else {
            workerPost({ type: "TOURNAL_MARK_OFFLINE_SYNCED", id: record.id });
          }
          success += 1;
        } catch {
          networkInterrupted = true;
          markSuspect();
          break;
        }
      }
    } catch {
      networkInterrupted = true;
      markSuspect();
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }

    const pending = Math.max(0, records.length - success);
    const firstError = errorMessages[0] ? ` Première erreur : ${errorMessages[0]}` : "";
    const summary = `${success} vente${success > 1 ? "s" : ""}/opération${success > 1 ? "s" : ""} synchronisée${success > 1 ? "s" : ""} avec succès, ${errors} erreur${errors > 1 ? "s" : ""}${pending ? `, ${pending} en attente` : ""}.${firstError}`;
    setSyncSummary(summary);

    if (!networkInterrupted && pending === 0 && success > 0) {
      sessionStorage.setItem(SYNC_SUMMARY_KEY, summary);
      reloadWhenQueueEmpty.current = true;
    }
    workerPost({ type: "TOURNAL_GET_QUEUE_STATUS" });
  }, [markSuspect]);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object" || !("type" in message)) return;
      if (message.type === "TOURNAL_NETWORK_HEALTH") {
        if (message.status === "online" && (message.latencyMs ?? 0) < PROBE_TIMEOUT_MS) markHealthy();
        else markSuspect();
        return;
      }
      if (message.type === "TOURNAL_OFFLINE_QUEUED") {
        setQueueCount(message.queueCount);
        setQueueOldestAt(message.oldestCreatedAt ?? null);
        markSuspect();
        return;
      }
      if (message.type === "TOURNAL_OFFLINE_QUEUE_STATUS") {
        setQueueCount(message.queueCount);
        setQueueOldestAt(message.oldestCreatedAt ?? null);
        if (message.queueCount === 0 && reloadWhenQueueEmpty.current) {
          reloadWhenQueueEmpty.current = false;
          window.location.reload();
        }
        return;
      }
      if (message.type === "TOURNAL_OFFLINE_QUEUE") {
        setQueueCount(message.records.length);
        setQueueOldestAt(message.records[0]?.createdAt ?? null);
        if (mode === "online" && message.records.length) void synchronizeQueue(message.records, message.invoiceMap ?? {});
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    workerPost({ type: "TOURNAL_GET_QUEUE_STATUS" });
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [mode, markHealthy, markSuspect, synchronizeQueue]);

  React.useEffect(() => {
    if (mode === "online" && queueCount > 0 && !syncing) workerPost({ type: "TOURNAL_GET_OFFLINE_QUEUE" });
  }, [mode, queueCount, syncing]);

  React.useEffect(() => {
    if (!syncSummary) return;
    const timer = window.setTimeout(() => setSyncSummary(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [syncSummary]);

  const effectiveOfflineSince = offlineSince ?? (mode === "offline" ? queueOldestAt : null);
  const prolonged = effectiveOfflineSince != null && clock - effectiveOfflineSince >= OFFLINE_WARNING_MS;

  return <>
    {(mode === "offline" || mode === "suspect") && (
      <div className={`fixed inset-x-0 top-0 z-[9999] border-b px-3 py-2 text-center text-xs font-bold shadow-sm ${mode === "offline" ? "border-amber-300 bg-amber-100 text-amber-950" : "border-orange-200 bg-orange-50 text-orange-900"}`}>
        {mode === "offline"
          ? <>Mode hors-ligne — les ventes sont enregistrées localement et seront synchronisées au retour de connexion. Données consultées: dernière connexion saine {formatAge(lastHealthyAt, clock)}. {queueCount > 0 ? `${queueCount} opération${queueCount > 1 ? "s" : ""} en attente.` : ""}</>
          : <>Connexion instable — vérification en cours. Une vente qui ne peut pas atteindre le serveur sera mise en file locale avec la même clé d’idempotence.</>}
        {prolonged && <div className="mt-1 font-black text-red-700">Hors-ligne depuis plus de 12 h : trouvez une connexion dès que possible pour limiter les conflits de stock et de données.</div>}
      </div>
    )}
    <div className={mode === "offline" || mode === "suspect" ? "pt-14" : ""}>{children}</div>
    {syncSummary && (
      <div className="fixed bottom-4 left-1/2 z-[9999] w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-xl">
        Synchronisation hors-ligne : {syncSummary}
      </div>
    )}
    {syncing && (
      <div className="fixed bottom-4 right-4 z-[9998] rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white shadow-lg">Synchronisation des ventes hors-ligne…</div>
    )}
  </>;
}

createRoot(document.getElementById("root")!).render(<OfflineCoordinator><App /></OfflineCoordinator>);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").then(registration => registration.update()).catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}
