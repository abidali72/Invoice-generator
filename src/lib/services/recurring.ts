import { prisma } from "@/lib/prisma";
import type { RecurringProfile } from "@prisma/client";
import { addInterval } from "@/lib/dateMath";
import type { RecurringFrequency } from "@/lib/types";
import { createInvoice, markSent } from "@/lib/services/invoices";
import { auditMany, type AuditEntry } from "@/lib/audit";

/**
 * Recurring Engine (doc §3.1 / §13).
 * - Generates invoices for every profile whose nextRunDate has arrived,
 *   catching up (bounded) if the scheduler was idle.
 * - Honors end conditions: cycle count or absolute end date.
 * - Auto-sent generation flows through the normal send pipeline so that
 *   reminders + audit trail behave identically to manual sending.
 */

interface ProfileItemDef {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRateId?: string | null;
}

export async function runDueProfiles(now = new Date()) {
  const profiles = await prisma.recurringProfile.findMany({
    where: { active: true, nextRunDate: { lte: now } },
    include: { client: true },
    orderBy: { nextRunDate: "asc" },
  });

  const results: Array<{ profile: string; generated: number; deactivated?: boolean }> = [];

  for (const profile of profiles) {
    let generated = 0;
    let cursor = new Date(profile.nextRunDate);
    let guard = 0;
    // Batch audit entries to minimize DB queries across catch-up runs
    const auditEntries: AuditEntry[] = [];

    while (
      cursor <= now &&
      guard < 24 && // bounded catch-up
      endConditionOpen(profile, cursor)
    ) {
      await generateForRun(profile, cursor);
      generated += 1;

      cursor = addInterval(
        cursor,
        profile.frequency as RecurringFrequency,
        profile.intervalDays
      );
      const cyclesRun = profile.cyclesRun + generated;
      const exhausted =
        profile.endCycles != null && cyclesRun >= profile.endCycles ? true : undefined;

      await prisma.recurringProfile.update({
        where: { id: profile.id },
        data: {
          nextRunDate: cursor,
          cyclesRun,
          lastGeneratedAt: new Date(),
          ...(exhausted ? { active: false } : {}),
        },
      });

      auditEntries.push({
        entityType: "RECURRING_PROFILE",
        entityId: profile.id,
        action: "GENERATE",
        summary: `Recurring run #${cyclesRun}: ${profile.title} → invoice generated${
          profile.autoSend ? " & sent automatically" : ""
        }`,
      });

      if (exhausted || cursor > now) break;
      guard += 1;
    }

    // Write all audit logs for this profile's run loop in a single batch query
    await auditMany(auditEntries);

    // endDate passed without explicit exhaustion ⇒ auto-deactivate
    if (profile.endDate && profile.endDate < now) {
      await prisma.recurringProfile.update({
        where: { id: profile.id },
        data: { active: false },
      });
      results.push({ profile: profile.title, generated, deactivated: true });
      continue;
    }
    results.push({ profile: profile.title, generated });
  }
  return results;
}

function endConditionOpen(profile: RecurringProfile, runDate: Date): boolean {
  if (profile.endCycles != null && profile.cyclesRun >= profile.endCycles) return false;
  if (profile.endDate && runDate > profile.endDate) return false;
  return true;
}

async function generateForRun(profile: RecurringProfile, runDate: Date) {
  const stored = JSON.parse(profile.itemsJson || "[]") as ProfileItemDef[];
  const items = stored.map((it) => ({
    productId: it.productId ?? null,
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPriceCents / 100, // stored int-cents → decimal contract
    taxRateId: it.taxRateId ?? null,
  }));
  const invoice = await createInvoice({
    clientId: profile.clientId,
    currency: profile.currency,
    issueDate: runDate,
    dueDate: new Date(runDate.getTime() + 30 * 86_400_000), // Net-30
    items,
    notes: `Generated from recurring profile “${profile.title}”.`,
    terms: undefined,
    discountType: null,
    discountValue: null,
    poNumber: null,
    recurringProfileId: profile.id,
  });
  if (profile.autoSend) {
    await markSent(invoice.id);
  }
}
