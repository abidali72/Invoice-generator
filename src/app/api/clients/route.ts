import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, getEntity } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { audit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  shippingAddress: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  currency: z.string().default("USD"),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  return handle(async () => {
    const entity = await getEntity();
    const clients = await prisma.client.findMany({
      where: { entityId: entity.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { invoices: true } } },
    });
    return ok(clients);
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return handle(async () => {
    const entity = await getEntity();
    const data = createSchema.parse(body);
    const client = await prisma.client.create({
      data: { ...data, currency: data.currency.toUpperCase(), entityId: entity.id },
    });
    await audit({
      entityType: "CLIENT",
      entityId: client.id,
      action: "CREATE",
      summary: `Client “${client.name}” created`,
    });
    return ok(client, 201);
  });
}
