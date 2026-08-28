import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, type Ctx } from "@/lib/api";
import { toCents } from "@/lib/money";
import { ApiError } from "@/lib/services/invoices";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  unitPrice: z.union([z.string(), z.number()]).optional(),
  taxRateId: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  const body = await req.json();
  const { id } = await ctx.params;
  return handle(async () => {
    const d = schema.parse(body);
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.unitPrice !== undefined ? { unitPriceCents: toCents(d.unitPrice) } : {}),
        ...(d.taxRateId !== undefined ? { taxRateId: d.taxRateId || null } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      },
    });
    await audit({
      entityType: "PRODUCT",
      entityId: id,
      action: "UPDATE",
      summary: `Product “${product.name}” updated`,
    });
    return ok(product);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    const used = await prisma.invoiceItem.count({ where: { productId: id } });
    if (used > 0) {
      // Soft-deactivate when referenced by historical invoices (§19 integrity)
      const p = await prisma.product.update({ where: { id }, data: { active: false } });
      await audit({
        entityType: "PRODUCT",
        entityId: id,
        action: "UPDATE",
        summary: `Product “${p.name}” deactivated (referenced by ${used} line item(s))`,
      });
      return ok({ deactivated: true, references: used });
    }
    const p = await prisma.product.delete({ where: { id } });
    await audit({
      entityType: "PRODUCT",
      entityId: id,
      action: "DELETE",
      summary: `Product “${p.name}” deleted`,
    });
    return ok({ deleted: true });
  });
}
