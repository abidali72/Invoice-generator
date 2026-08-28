import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { dispatchDueReminders } from "@/lib/services/reminders";

const schema = z.object({ nowIso: z.string().optional() });

/** Scheduler endpoint — dispatches every PENDING reminder whose time has come. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(async () => {
    const { nowIso } = schema.parse(body ?? {});
    const now = nowIso ? new Date(nowIso) : new Date();
    const sent = await dispatchDueReminders(now);
    const pendingLeft = await prisma.reminder.count({ where: { status: "PENDING" } });
    return ok({ dispatched: sent, pendingLeft });
  });
}
