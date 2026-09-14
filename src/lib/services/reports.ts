import { prisma } from "@/lib/prisma";
import type { Invoice } from "@prisma/client";
import { daysBetween } from "@/lib/dateMath";

const OPEN_FOR_AGG = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] as const;

/** Base-currency conversion uses each invoice's LOCKED rate snapshot (§12). */
function toBase(cents: number, inv: Pick<Invoice, "exchangeRate">) {
  return Math.round(cents * inv.exchangeRate);
}

function balance(inv: Pick<Invoice, "grandTotalCents" | "amountPaidCents" | "creditedCents">) {
  return Math.max(0, inv.grandTotalCents - inv.amountPaidCents - inv.creditedCents);
}

export interface AgingRow {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  currency: string;
  balanceLocalCents: number;
  balanceBaseCents: number;
  daysPastDue: number;
  bucket: "NOT_DUE" | "0-30" | "31-60" | "61-90" | "90+";
}

/** §14 Accounts-Receivable aging across open invoices. */
export async function getAging(now = new Date()): Promise<AgingRow[]> {
  // Optimization: Select only required fields to avoid reading heavy unused columns (notes, terms, customFields)
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: [...OPEN_FOR_AGG] } },
    select: {
      id: true,
      invoiceNumber: true,
      currency: true,
      dueDate: true,
      grandTotalCents: true,
      amountPaidCents: true,
      creditedCents: true,
      exchangeRate: true,
      client: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  return invoices
    .map((inv) => {
      const bal = balance(inv);
      const dpd = daysBetween(inv.dueDate, now);
      const bucket: AgingRow["bucket"] =
        dpd <= 0 ? "NOT_DUE" : dpd <= 30 ? "0-30" : dpd <= 60 ? "31-60" : dpd <= 90 ? "61-90" : "90+";
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.client.name,
        currency: inv.currency,
        balanceLocalCents: bal,
        balanceBaseCents: toBase(bal, inv),
        daysPastDue: Math.max(0, dpd),
        bucket,
      };
    })
    .filter((r) => r.balanceLocalCents > 0);
}

export interface Summary {
  invoicedBaseCents: number;
  collectedBaseCents: number;
  creditedBaseCents: number;
  outstandingBaseCents: number;
  overdueCount: number;
  overdueBaseCents: number;
  countsByStatus: Record<string, number>;
  cashflowForecast: Array<{ withinDays: string; baseCents: number }>;
}

/** Dashboard KPIs — all figures in base currency via locked FX snapshots. */
export async function getSummary(now = new Date()): Promise<Summary> {
  // Optimization: Select only status, monetary totals, dates, and exchange rate for dashboard KPI aggregation
  const allInvoices = await prisma.invoice.findMany({
    select: {
      status: true,
      grandTotalCents: true,
      amountPaidCents: true,
      creditedCents: true,
      dueDate: true,
      exchangeRate: true,
    },
  });

  let invoiced = 0;
  let paid = 0;
  let creditedTotal = 0;
  let overdueCount = 0;
  let overdueVal = 0;
  const counts: Record<string, number> = {};
  const forecast = { d30: 0, d60: 0, d90: 0 };

  for (const inv of allInvoices) {
    counts[inv.status] = (counts[inv.status] ?? 0) + 1;
    if (inv.status === "DRAFT" || inv.status === "VOID") continue;

    invoiced += toBase(inv.grandTotalCents, inv);
    paid += toBase(inv.amountPaidCents, inv);
    creditedTotal += toBase(inv.creditedCents, inv);

    const bal = balance(inv);
    if (bal > 0) {
      const balBase = toBase(bal, inv);
      const dpd = daysBetween(inv.dueDate, now);
      if (dpd > 0) {
        overdueCount += 1;
        overdueVal += balBase;
      }
      const daysToDue = -dpd;
      if (daysToDue <= 30) forecast.d30 += balBase;
      else if (daysToDue <= 60) forecast.d60 += balBase;
      else if (daysToDue <= 90) forecast.d90 += balBase;
    }
  }

  return {
    invoicedBaseCents: invoiced,
    collectedBaseCents: paid,
    creditedBaseCents: creditedTotal,
    outstandingBaseCents: Math.max(0, invoiced - paid - creditedTotal),
    overdueCount,
    overdueBaseCents: overdueVal,
    countsByStatus: counts,
    cashflowForecast: [
      { withinDays: "Next 30 days", baseCents: forecast.d30 },
      { withinDays: "Days 31–60", baseCents: forecast.d60 },
      { withinDays: "Days 61–90", baseCents: forecast.d90 },
    ],
  };
}

export interface MonthlyRevenuePoint {
  ym: string; // YYYY-MM
  invoicedBaseCents: number;
  collectedBaseCents: number;
}

export async function getMonthlyRevenue(monthsBack = 12, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { issueDate: { gte: start }, status: { notIn: ["DRAFT", "VOID"] } },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: start } },
      include: { invoice: { select: { exchangeRate: true } } },
    }),
  ]);

  const map = new Map<string, MonthlyRevenuePoint>();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(ym, { ym, invoicedBaseCents: 0, collectedBaseCents: 0 });
  }
  for (const inv of invoices) {
    const pt = map.get(ymOf(inv.issueDate));
    if (pt) pt.invoicedBaseCents += toBase(inv.grandTotalCents, inv);
  }
  for (const p of payments) {
    const pt = map.get(ymOf(p.paidAt));
    if (pt) pt.collectedBaseCents += Math.round(p.amountCents * (p.invoice?.exchangeRate ?? 1));
  }
  return [...map.values()];
}

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getTopClients(limit = 5) {
  // Optimization: Select only clientId, totals, FX rate, and client name
  const invoices = await prisma.invoice.findMany({
    where: { status: { notIn: ["DRAFT", "VOID"] } },
    select: {
      clientId: true,
      grandTotalCents: true,
      exchangeRate: true,
      client: { select: { name: true } },
    },
  });
  const agg = new Map<string, { clientId: string; name: string; baseCents: number; count: number }>();
  for (const inv of invoices) {
    const cur =
      agg.get(inv.clientId) ?? { clientId: inv.clientId, name: inv.client.name, baseCents: 0, count: 0 };
    cur.baseCents += toBase(inv.grandTotalCents, inv);
    cur.count += 1;
    agg.set(inv.clientId, cur);
  }
  return [...agg.values()].sort((a, b) => b.baseCents - a.baseCents).slice(0, limit);
}

export async function getCurrencyExposure() {
  // Optimization: Select only currency, totals, and FX rate for exposure report
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: [...OPEN_FOR_AGG] } },
    select: {
      currency: true,
      grandTotalCents: true,
      amountPaidCents: true,
      creditedCents: true,
      exchangeRate: true,
    },
  });
  const map = new Map<string, { currency: string; localBalanceCents: number; baseBalanceCents: number }>();
  for (const inv of invoices) {
    const bal = balance(inv);
    if (bal <= 0) continue;
    const cur = map.get(inv.currency) ?? {
      currency: inv.currency,
      localBalanceCents: 0,
      baseBalanceCents: 0,
    };
    cur.localBalanceCents += bal;
    cur.baseBalanceCents += toBase(bal, inv);
    map.set(inv.currency, cur);
  }
  return [...map.values()].sort((a, b) => b.baseBalanceCents - a.baseBalanceCents);
}

export async function getMethodBreakdown() {
  const payments = await prisma.payment.findMany({
    where: { invoice: { status: { notIn: ["VOID"] } } },
    include: { invoice: { select: { exchangeRate: true } } },
  });
  const map = new Map<string, { method: string; baseCents: number; count: number }>();
  for (const p of payments) {
    const cur = map.get(p.method) ?? { method: p.method, baseCents: 0, count: 0 };
    cur.baseCents += Math.round(p.amountCents * (p.invoice?.exchangeRate ?? 1));
    cur.count += 1;
    map.set(p.method, cur);
  }
  return [...map.values()].sort((a, b) => b.baseCents - a.baseCents);
}

/* ────────────────────────────── CSV exports ─────────────────────────────── */

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n");
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function exportCsv(kind: string): Promise<string> {
  switch (kind) {
    case "aging": {
      const rows = await getAging();
      return toCsv(
        ["Invoice", "Client", "Currency", "Balance", "Balance (base)", "Days past due", "Bucket"],
        rows.map((r) => [
          r.invoiceNumber,
          r.clientName,
          r.currency,
          money(r.balanceLocalCents),
          money(r.balanceBaseCents),
          r.daysPastDue,
          r.bucket,
        ])
      );
    }
    case "revenue-by-month": {
      const pts = await getMonthlyRevenue();
      return toCsv(
        ["Month", "Invoiced (base)", "Collected (base)"],
        pts.map((p) => [p.ym, money(p.invoicedBaseCents), money(p.collectedBaseCents)])
      );
    }
    case "revenue-by-client": {
      const rows = await getTopClients(100);
      return toCsv(
        ["Client", "Invoices", "Invoiced (base)"],
        rows.map((c) => [c.name, c.count, money(c.baseCents)])
      );
    }
    case "currency-exposure": {
      const rows = await getCurrencyExposure();
      return toCsv(
        ["Currency", "Outstanding (local)", "Outstanding (base)"],
        rows.map((r) => [r.currency, money(r.localBalanceCents), money(r.baseBalanceCents)])
      );
    }
    default:
      throw new Error(`Unknown report: ${kind}`);
  }
}

