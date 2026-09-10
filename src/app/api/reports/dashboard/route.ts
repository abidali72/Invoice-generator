import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { getDashboardData } from "@/lib/services/reports";

/** One-shot dashboard payload (KPIs + aging buckets + charts + recent). */
export async function GET() {
  return handle(async () => {
    const [dashData, recent] = await Promise.all([
      getDashboardData(12, 5),
      prisma.invoice.findMany({
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const { summary, aging, revenue, topClients, exposure, methods } = dashData;

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
