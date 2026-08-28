import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return handle(async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(q.get("entityType") ? { entityType: q.get("entityType") as string } : {}),
        ...(q.get("entityId") ? { entityId: q.get("entityId") as string } : {}),
      },
      orderBy: { timestamp: "desc" },
      take: Math.min(Number(q.get("take") ?? 150), 500),
    });
    return ok(logs);
  });
}
