import { prisma, getEntity } from "@/lib/prisma";
import type { RecurringProfile, Client, TaxRate } from "@prisma/client";
import { addInterval } from "@/lib/dateMath";
import type { RecurringFrequency } from "@/lib/types";
import { createInvoice, markSent, type CreateInvoiceOptions } from "@/lib/services/invoices";
import { audit, auditMany } from "@/lib/audit";

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

  if (profiles.length === 0) return [];

  // Pre-fetch shared context to eliminate N+1 queries across profiles and runs
  const entity = await getEntity();
  const taxRates = await prisma.taxRate.findMany({ where: { entityId: entity.id } });
  const taxRatesMap = new Map<string, TaxRate>(taxRates.map((t) => [t.id, t]));

  const currencyRates = await prisma.currencyRate.findMany();
  const exchangeRatesMap = new Map<string, number>(currencyRates.map((r) => [r.code, r.rateToBase]));
  exchangeRatesMap.set("USD", 1);

  const results: Array<{ profile: string; generated: number; deactivated?: boolean }> = [];
  const profileAuditEntries: Array<{
    entityType: string;
    entityId: string;
    action: "GENERATE";
    summary: string;
  }> = [];

  for (const profile of profiles) {
    let generated = 0;
    let cursor = new Date(profile.nextRunDate);
    let guard = 0;
    let cyclesRun = profile.cyclesRun;
    let exhausted = false;

    const invoiceOptions: CreateInvoiceOptions = {
      entity,
      client: profile.client,
      taxRatesMap,
      exchangeRatesMap,
    };

    while (
      cursor <= now &&
      guard < 24 && // bounded catch-up
      endConditionOpen(profile, cursor, cyclesRun)
    ) {
      await generateForRun(profile, cursor, invoiceOptions);
      generated += 1;
      cyclesRun += 1;

      cursor = addInterval(
        cursor,
        profile.frequency as RecurringFrequency,
        profile.intervalDays
      );

      exhausted = profile.endCycles != null && cyclesRun >= profile.endCycles;

      profileAuditEntries.push({
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

    if (generated > 0) {
      await prisma.recurringProfile.update({
        where: { id: profile.id },
        data: {
          nextRunDate: cursor,
          cyclesRun,
          lastGeneratedAt: new Date(),
          ...(exhausted ? { active: false } : {}),
        },
      });
    }

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

  if (profileAuditEntries.length > 0) {
    await auditMany(profileAuditEntries);
  }

  return results;
}

function endConditionOpen(profile: RecurringProfile, runDate: Date, cyclesRun: number = profile.cyclesRun): boolean {
  if (profile.endCycles != null && cyclesRun >= profile.endCycles) return false;
  if (profile.endDate && runDate > profile.endDate) return false;
  return true;
}

async function generateForRun(
  profile: RecurringProfile & { client: Client },
  runDate: Date,
  options?: CreateInvoiceOptions
) {
  const stored = JSON.parse(profile.itemsJson || "[]") as ProfileItemDef[];
  const items = stored.map((it) => ({
    productId: it.productId ?? null,
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPriceCents / 100, // stored int-cents → decimal contract
    taxRateId: it.taxRateId ?? null,
  }));
  const invoice = await createInvoice(
    {
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
    },
    options
  );
  if (profile.autoSend) {
    await markSent(invoice);
  }
}
