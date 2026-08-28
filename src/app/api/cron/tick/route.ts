import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { sweepOverdue } from "@/lib/services/invoices";
import { runDueProfiles } from "@/lib/services/recurring";
import { dispatchDueReminders } from "@/lib/services/reminders";

/**
 * Unified scheduler tick (doc §13). In production wire this to cron /
 * BullMQ repeatable jobs; in the demo the Dashboard button and a client-side
 * interval both call it. Body accepts optional `nowIso` for time-travel testing.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { nowIso?: string };
  return handle(async () => {
    const parsed = z.object({ nowIso: z.string().optional() }).parse(body);
    const now = parsed.nowIso ? new Date(parsed.nowIso) : new Date();

    const [markedOverdue, recurringResults, remindersSent] = await Promise.all([
      sweepOverdue(now),
      runDueProfiles(now),
      dispatchDueReminders(now),
    ]);

    return ok({
      ranAt: now.toISOString(),
      markedOverdue,
      recurringGenerated: recurringResults.reduce((a, r) => a + r.generated, 0),
      recurringDetails: recurringResults,
      remindersSent,
    });
  });
}
