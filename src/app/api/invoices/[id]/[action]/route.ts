import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, readJson, type Ctx } from "@/lib/api";
import {
  markSent,
  markViewed,
  voidInvoice,
  remindNow,
  recordPayment,
  issueCreditNote,
  ApiError,
} from "@/lib/services/invoices";
import { renderInvoicePdf } from "@/lib/services/pdf";

/**
 * Consolidated lifecycle route covering doc §8 paths:
 *   POST /invoices/{id}/send          → 202 pipeline send
 *   POST /invoices/{id}/view          → client-opened tracking pixel/portal hook
 *   POST /invoices/{id}/void
 *   POST /invoices/{id}/remind        → ad-hoc reminder dispatch
 *   POST /invoices/{id}/payments      → record manual/gateway payment
 *   POST /invoices/{id}/credit-notes
 *   GET  /invoices/{id}/pdf           → download (§9)
 */

const paymentSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  method: z.string().default("BANK_TRANSFER"),
  paidAt: z.string().optional(),
  gatewayReference: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

const creditNoteSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  reason: z.string().optional().nullable(),
  issuedAt: z.string().optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, action } = await ctx.params;
  return handle(async () => {
    switch (action) {
      case "send":
        return ok(await markSent(id));
      case "view":
        return ok(await markViewed(id));
      case "void":
        return ok(await voidInvoice(id));
      case "remind":
        return ok(await remindNow(id));
      case "payments": {
        const d = paymentSchema.parse(await readJson(req));
        return ok(await recordPayment(id, d), 201);
      }
      case "credit-notes": {
        const d = creditNoteSchema.parse(await readJson(req));
        return ok(await issueCreditNote(id, d), 201);
      }
      default:
        throw new ApiError(404, `Unknown invoice action: ${action}`);
    }
  });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, action } = await ctx.params;
  if (action !== "pdf")
    return Response.json({ ok: false, error: `Unknown action ${action}` }, { status: 404 });
  return handle(async () => {
    const buffer = await renderInvoicePdf(id);
    const inv = await prisma.invoice.findUnique({ where: { id }, select: { invoiceNumber: true } });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${inv?.invoiceNumber ?? "invoice"}.pdf"`,
        "Cache-Control": "no-store",
      },
    }) as unknown as Response;
  });
}
