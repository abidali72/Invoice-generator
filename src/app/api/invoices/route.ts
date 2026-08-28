import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, getEntity } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { createInvoice } from "@/lib/services/invoices";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return handle(async () => {
    const entity = await getEntity();
    const status = q.get("status");
    const clientId = q.get("clientId");
    const search = q.get("q");
    const take = Math.min(Number(q.get("take") ?? 100), 200);

    const invoices = await prisma.invoice.findMany({
      where: {
        entityId: entity.id,
        ...(status ? { status } : {}),
        ...(clientId ? { clientId } : {}),
        ...(search
          ? { invoiceNumber: { contains: search } }
          : {}),
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return ok(invoices);
  });
}

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.union([z.string(), z.number()]),
  taxRateId: z.string().optional().nullable(),
});

const createSchema = z.object({
  clientId: z.string().min(1),
  currency: z.string().default("USD"),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(itemSchema),
  discountType: z.enum(["PERCENT", "FIXED"]).optional().nullable(),
  discountValue: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
});

/** POST /v1/invoices (doc §8 sample request) */
export async function POST(req: NextRequest) {
  const body = await req.json();
  return handle(async () => {
    const d = createSchema.parse(body);
    const inv = await createInvoice(d);
    return ok(inv, 201);
  });
}
