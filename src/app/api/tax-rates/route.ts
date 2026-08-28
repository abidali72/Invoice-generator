import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, getEntity } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1),
  ratePercent: z.number().min(0).max(100),
  region: z.string().optional().nullable(),
  type: z.enum(["INCLUSIVE", "EXCLUSIVE"]).default("EXCLUSIVE"),
});

export async function GET() {
  return handle(async () => {
    const entity = await getEntity();
    const rates = await prisma.taxRate.findMany({
      where: { entityId: entity.id },
      orderBy: [{ type: "asc" }, { ratePercent: "desc" }],
    });
    return ok(rates);
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return handle(async () => {
    const entity = await getEntity();
    const d = schema.parse(body);
    const rate = await prisma.taxRate.create({
      data: { ...d, entityId: entity.id },
    });
    await audit({
      entityType: "TAX_RATE",
      entityId: rate.id,
      action: "CREATE",
      summary: `Tax rate “${rate.name}” (${rate.ratePercent}% ${rate.type.toLowerCase()}) created`,
    });
    return ok(rate, 201);
  });
}
