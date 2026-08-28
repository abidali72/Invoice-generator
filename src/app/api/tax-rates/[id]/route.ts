import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, type Ctx } from "@/lib/api";
import { ApiError } from "@/lib/services/invoices";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).optional(),
  ratePercent: z.number().min(0).max(100).optional(),
  region: z.string().optional().nullable(),
  type: z.enum(["INCLUSIVE", "EXCLUSIVE"]).optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  const body = await req.json();
  const { id } = await ctx.params;
  return handle(async () => {
    const d = schema.parse(body);
    const before = await prisma.taxRate.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Tax rate not found.");
    const rate = await prisma.taxRate.update({ where: { id }, data: d });
    await audit({
      entityType: "TAX_RATE",
      entityId: id,
      action: "UPDATE",
      summary: `Tax rate “${rate.name}” updated`,
      changes: { ratePercent: [before.ratePercent, rate.ratePercent], type: [before.type, rate.type] },
    });
    return ok(rate);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    const used = (await prisma.invoiceItem.count({ where: { taxRateId: id } })) +
      (await prisma.product.count({ where: { taxRateId: id } }));
    if (used > 0)
      throw new ApiError(409, `Tax rate is referenced by ${used} record(s) and cannot be deleted.`);
    const r = await prisma.taxRate.delete({ where: { id } });
    await audit({
      entityType: "TAX_RATE",
      entityId: id,
      action: "DELETE",
      summary: `Tax rate “${r.name}” deleted`,
    });
    return ok({ deleted: true });
  });
}
