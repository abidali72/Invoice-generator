import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, getEntity } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    const entity = await getEntity();
    return ok(entity);
  });
}

const schema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  defaultCurrency: z.string().optional(),
  bankDetails: z.string().optional().nullable(),
  invoicePrefix: z.string().min(1).optional(),
  seqPad: z.number().int().min(2).max(8).optional(),
  footerText: z.string().optional().nullable(),
  defaultTerms: z.string().optional().nullable(),
  defaultNotes: z.string().optional().nullable(),
});

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return handle(async () => {
    const entity = await getEntity();
    const d = schema.parse(body);
    const updated = await prisma.entity.update({
      where: { id: entity.id },
      data: {
        ...d,
        ...(d.defaultCurrency ? { defaultCurrency: d.defaultCurrency.toUpperCase() } : {}),
      },
    });
    await audit({
      entityType: "SETTINGS",
      entityId: entity.id,
      action: "UPDATE",
      summary: "Company settings updated",
      changes: d,
    });
    return ok(updated);
  });
}
