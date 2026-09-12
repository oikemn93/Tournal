// Business dates are Dakar dates (UTC year-round), independent of the device.
export type ReportingPeriod = "jour" | "semaine" | "mois" | "annee" | "30d" | "custom";
export type ReportingBounds = { from: string; to: string };
const DAY = 86_400_000;

export function reportingBounds(period: ReportingPeriod, customFrom = "", customTo = "", now = new Date()): ReportingBounds | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let from = today;
  let to = today + DAY;
  if (period === "semaine") from -= 6 * DAY;
  if (period === "30d") from -= 29 * DAY;
  if (period === "mois") from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  if (period === "annee") from = Date.UTC(now.getUTCFullYear(), 0, 1);
  if (period === "custom") {
    if (![customFrom, customTo].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) return null;
    from = Date.parse(`${customFrom}T00:00:00Z`);
    const end = Date.parse(`${customTo}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(end) || end < from
      || new Date(from).toISOString().slice(0, 10) !== customFrom
      || new Date(end).toISOString().slice(0, 10) !== customTo) return null;
    to = end + DAY;
  }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

export function withinReportingBounds(date: string | undefined, bounds: ReportingBounds | null) {
  if (!date || !bounds) return false;
  const time = Date.parse(date);
  return time >= Date.parse(bounds.from) && time < Date.parse(bounds.to);
}
