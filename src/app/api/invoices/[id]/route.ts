import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, type Ctx } from "@/lib/api";
import { updateInvoice, ApiError, balanceCents } from "@/lib/services/invoices";
import { audit } from "@/lib/audit";

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.union([z.string(), z.number()]),
  taxRateId: z.string().optional().nullable(),
});

const schema = z.object({
  clientId: z.string().min(1),
  // present for contract parity with POST; never applied — FX snapshot is immutable (§12)
  currency: z.string().default("USD"),
  items: z.array(itemSchema),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  discountType: z.enum(["PERCENT", "FIXED"]).optional().nullable(),
  discountValue: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    const inv = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        entity: true,
        items: true,
        payments: { orderBy: { paidAt: "desc" } },
        creditNotes: { orderBy: { issuedAt: "desc" } },
        reminders: { orderBy: { scheduledAt: "asc" } },
      },
    });
    if (!inv) throw new ApiError(404, "Invoice not found.");
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "INVOICE", entityId: id },
          // settlement & reminder events are logged under their own entity
          { summary: { contains: inv.invoiceNumber } },
        ],
      },
      orderBy: { timestamp: "desc" },
      take: 30,
    });
    return ok({ ...inv, balanceCents: balanceCents(inv), auditLogs: logs });
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const body = await req.json();
  const { id } = await ctx.params;
  return handle(async () => {
    const d = schema.parse(body);
    return ok(await updateInvoice(id, d));
  });
}

/** Drafts may be deleted outright; anything else must go through /void. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    const inv = await prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new ApiError(404, "Invoice not found.");
    if (inv.status !== "DRAFT")
      throw new ApiError(409, "Only drafts can be deleted; void finalized invoices instead.");
    await prisma.invoice.delete({ where: { id } }); // cascade items/reminders
    await audit({
      entityType: "INVOICE",
      entityId: inv.id,
      action: "DELETE",
      summary: `Draft ${inv.invoiceNumber} deleted`,
    });
    return ok({ deleted: true });
  });
}
