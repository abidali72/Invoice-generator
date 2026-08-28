import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  return handle(async () => {
    const reminders = await prisma.reminder.findMany({
      where: status ? { status } : {},
      include: { invoice: { select: { invoiceNumber: true, status: true, currency: true, grandTotalCents: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 300,
    });
    return ok(reminders);
  });
}
