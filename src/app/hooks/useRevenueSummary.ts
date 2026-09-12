import { useCallback, useEffect, useState } from "react";
import { loadRevenueSummary, type RevenueSummary } from "../../lib/api";
import { reportingBounds, type ReportingPeriod } from "../utils/reportingPeriod";

// No bootstrap fallback and no persistent cache. Both screens refresh on the
// same business revisions, reconnect/focus and Dakar midnight.
export function useRevenueSummary(boutiqueId: string, period: ReportingPeriod, customFrom: string, customTo: string, revision: unknown) {
  const [refresh, setRefresh] = useState(0);
  const retry = useCallback(() => setRefresh(value => value + 1), []);
  const bounds = reportingBounds(period, customFrom, customTo);
  const from = bounds?.from;
  const to = bounds?.to;
  const key = `${boutiqueId}:${from}:${to}`;
  const [state, setState] = useState<{ key: string; revision: unknown; refresh: number; summary: RevenueSummary | null; error: string }>({ key: "", revision: null, refresh: -1, summary: null, error: "" });

  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") retry(); };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", visible);
    const nextMidnight = reportingBounds("jour")!.to;
    const timer = window.setTimeout(retry, Math.max(1, Date.parse(nextMidnight) - Date.now() + 50));
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retry, refresh]);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    void loadRevenueSummary({ boutiqueId, from, to })
      .then(summary => { if (!cancelled) setState({ key, revision, refresh, summary, error: "" }); })
      .catch(error => { if (!cancelled) setState({ key, revision, refresh, summary: null, error: error instanceof Error ? error.message : "CA indisponible" }); });
    return () => { cancelled = true; };
  }, [boutiqueId, from, to, key, revision, refresh]);

  const current = state.key === key && state.revision === revision && state.refresh === refresh;
  return { bounds, summary: current ? state.summary : null, error: current ? state.error : "", loading: !!bounds && (!current || (!state.summary && !state.error)), retry };
}
