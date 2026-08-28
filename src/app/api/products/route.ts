import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, getEntity } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { toCents } from "@/lib/money";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  unitPrice: z.union([z.string(), z.number()]), // decimal → cents server-side
  taxRateId: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export async function GET() {
  return handle(async () => {
    const entity = await getEntity();
    const products = await prisma.product.findMany({
      where: { entityId: entity.id },
      orderBy: { name: "asc" },
      include: { taxRate: true },
    });
    return ok(products);
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return handle(async () => {
    const entity = await getEntity();
    const d = schema.parse(body);
    const product = await prisma.product.create({
      data: {
        entityId: entity.id,
        name: d.name,
        description: d.description ?? null,
        unitPriceCents: toCents(d.unitPrice),
        taxRateId: d.taxRateId || null,
        active: d.active,
      },
    });
    await audit({
      entityType: "PRODUCT",
      entityId: product.id,
      action: "CREATE",
      summary: `Product “${product.name}” created`,
    });
    return ok(product, 201);
  });
}
