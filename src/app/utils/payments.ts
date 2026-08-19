import type { DashPeriod, Invoice, InvoicePayment, PaymentMethod } from "../types";
import { filterByPeriod } from "./inventory";

export type PaymentEvent = InvoicePayment & {
  invoiceId: string;
  client: string;
  invoiceType: string;
  signedAmount: number;
  dateRaw: string;
};

export function invoicePaidAmount(invoice: Invoice): number {
  if (invoice.payments?.length) {
    return invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  }
  return invoice.acompte;
}

export function invoiceRemainingAmount(invoice: Invoice): number {
  return Math.max(0, invoice.montant - invoicePaidAmount(invoice));
}

export function invoicePaymentEvents(invoices: Invoice[]): PaymentEvent[] {
  return invoices.flatMap((invoice) => {
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
