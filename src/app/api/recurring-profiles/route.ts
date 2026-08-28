import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, getEntity } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { RECURRING_FREQUENCIES } from "@/lib/types";
import type { RecurringFrequency } from "@/lib/types";
import { ApiError } from "@/lib/services/invoices";
import { audit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    const entity = await getEntity();
    const profiles = await prisma.recurringProfile.findMany({
      where: { entityId: entity.id },
      include: {
        client: { select: { name: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: [{ active: "desc" }, { nextRunDate: "asc" }],
    });
    return ok(profiles);
  });
}

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  taxRateId: z.string().optional().nullable(),
});

const createSchema = z.object({
  clientId: z.string(),
  title: z.string().min(1),
  frequency: z.enum(RECURRING_FREQUENCIES as [RecurringFrequency, ...RecurringFrequency[]]),
  intervalDays: z.number().int().positive().optional().nullable(),
  nextRunDate: z.string(), // ISO date
  autoSend: z.boolean().default(true),
  endCycles: z.number().int().positive().optional().nullable(),
  endDate: z.string().optional().nullable(),
  currency: z.string().default("USD"),
  items: z.array(itemSchema).min(1),
  basisInvoiceId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  return handle(async () => {
    const entity = await getEntity();
    const d = createSchema.parse(body);
    const client = await prisma.client.findFirst({
      where: { id: d.clientId, entityId: entity.id },
    });
    if (!client) throw new ApiError(404, "Client not found.");

    const profile = await prisma.recurringProfile.create({
      data: {
        entityId: entity.id,
        clientId: d.clientId,
        title: d.title,
        basisInvoiceId: d.basisInvoiceId ?? null,
        frequency: d.frequency,
        intervalDays: d.intervalDays ?? null,
        nextRunDate: new Date(d.nextRunDate),
        autoSend: d.autoSend,
        endCycles: d.endCycles ?? null,
        endDate: d.endDate ? new Date(d.endDate) : null,
        currency: d.currency.toUpperCase(),
        itemsJson: JSON.stringify(d.items),
      },
    });
    await audit({
      entityType: "RECURRING_PROFILE",
      entityId: profile.id,
      action: "CREATE",
      summary: `Recurring profile “${profile.title}” (${profile.frequency.toLowerCase()}) created for ${client.name}`,
    });
    return ok(profile, 201);
  });
}
