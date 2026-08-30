import type { DashPeriod, Invoice, InvoicePayment, PaymentMethod } from "../types";
import { filterByPeriod } from "./inventory";

export type PaymentEvent = InvoicePayment & {
  invoiceId: string;
  client: string;
  invoiceType: string;
  signedAmount: number;
  dateRaw: string;
};

// Amounts travel through user inputs and JSON before reaching Postgres. Keep
// display and client-side guards in a stable currency precision instead of
// comparing binary floating-point values directly.
export const MONEY_EPSILON = 0.01;

export function roundMoney(value: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : 0;
}

export function moneyExceeds(value: number, limit: number, epsilon = MONEY_EPSILON): boolean {
  return roundMoney(value) > roundMoney(limit) + epsilon;
}

export function invoicePaidAmount(invoice: Invoice): number {
  const eventTotal=invoice.payments?.length?invoice.payments.reduce((sum,payment)=>sum+payment.amount,0):0;
  return roundMoney(Math.max(Number(invoice.acompte??0),eventTotal));
}

export function invoiceRemainingAmount(invoice: Invoice): number {
  if (invoice.status === "annulée" || invoice.type.toLowerCase() === "retour") return 0;
  return roundMoney(Math.max(0, roundMoney(invoice.montant) - invoicePaidAmount(invoice)));
}

export function invoicePaymentEvents(invoices: Invoice[]): PaymentEvent[] {
  return invoices.flatMap((invoice) => {
    // A cancelled invoice is retained for audit purposes, but its historical
    // payments are no longer active sales settlements. Any available money is
    // represented separately by a client advance.
    if (invoice.status === "annulée") return [];
    const sign = invoice.type.toLowerCase() === "retour" ? -1 : 1;
    const payments = invoice.payments?.length
      ? invoice.payments
      : invoice.acompte > 0
        ? [{
            id: -1,
            amount: invoice.acompte,
            paymentMethod: (invoice.paymentMethod ?? "Autre") as PaymentMethod,
            paidAt: invoice.dateRaw ?? invoice.date,
            operatorName: invoice.operatorNom ?? "Historique",
            batchId: `legacy:${invoice.id}`,
            source: "legacy_backfill" as const,
          }]
        : [];

    return payments.map((payment) => ({
      ...payment,
      invoiceId: invoice.id,
      client: invoice.client,
      invoiceType: invoice.type,
      signedAmount: sign * payment.amount,
      dateRaw: payment.paidAt,
    }));
  });
}

export function filterPaymentEventsByPeriod(
  invoices: Invoice[],
  period: DashPeriod,
  customFrom: string,
  customTo: string,
): PaymentEvent[] {
  return filterByPeriod(invoicePaymentEvents(invoices), period, customFrom, customTo);
}

export function formatPreciseDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
