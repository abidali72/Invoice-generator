import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, type Ctx } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/services/invoices";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  shippingAddress: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  currency: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  const body = await req.json();
  const { id } = await ctx.params;
  return handle(async () => {
    const data = updateSchema.parse(body);
    const before = await prisma.client.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Client not found.");
    const client = await prisma.client.update({
      where: { id },
      data: {
        ...data,
        ...(data.currency ? { currency: data.currency.toUpperCase() } : {}),
      },
    });
    await audit({
      entityType: "CLIENT",
      entityId: id,
      action: "UPDATE",
      summary: `Client “${client.name}” updated`,
      changes: { email: [before.email, client.email], currency: [before.currency, client.currency] },
    });
    return ok(client);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    const count = await prisma.invoice.count({ where: { clientId: id } });
    if (count > 0)
      throw new ApiError(409, `Client has ${count} invoice(s); archive instead of deleting.`);
    const client = await prisma.client.delete({ where: { id } });
    await audit({
      entityType: "CLIENT",
      entityId: id,
      action: "DELETE",
      summary: `Client “${client.name}” deleted`,
    });
    return ok({ deleted: true });
  });
}
