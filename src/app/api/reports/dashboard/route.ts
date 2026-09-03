import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import {
  getSummary,
  getAging,
  getMonthlyRevenue,
  getTopClients,
  getCurrencyExposure,
  getMethodBreakdown,
} from "@/lib/services/reports";

const OPEN_FOR_AGG = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] as const;

/** One-shot dashboard payload (KPIs + aging buckets + charts + recent). */
export async function GET() {
  return handle(async () => {
    // Bolt ⚡ Optimization: Pre-fetch open invoices once using DB index filters
    // and reuse it across getAging and getCurrencyExposure to avoid duplicate DB queries.
    const openInvoicesPromise = prisma.invoice.findMany({
      where: { status: { in: [...OPEN_FOR_AGG] } },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    });

    const [summary, openInvoices, revenue, topClients, methods, recent] = await Promise.all([
      getSummary(),
      openInvoicesPromise,
      getMonthlyRevenue(),
      getTopClients(5),
      getMethodBreakdown(),
      prisma.invoice.findMany({
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const now = new Date();

    const [aging, exposure] = await Promise.all([
      getAging(now, openInvoices),
      getCurrencyExposure(openInvoices),
    ]);

    const bucketTotals: Record<string, number> = {};
    for (const r of aging) bucketTotals[r.bucket] = (bucketTotals[r.bucket] ?? 0) + r.balanceBaseCents;

    return ok({
      summary,
      buckets: ["NOT_DUE", "0-30", "31-60", "61-90", "90+"].map((b) => ({
        bucket: b,
        baseCents: bucketTotals[b] ?? 0,
        count: aging.filter((r) => r.bucket === b).length,
      })),
      revenue,
      topClients,
      exposure,
      methods,
      recent,
      dueSoon: aging
        .filter((r) => r.daysPastDue <= 7)
        .slice(0, 6),
    });
  });
}
