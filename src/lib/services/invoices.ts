import { prisma, getEntity } from "@/lib/prisma";
import type { Invoice, Entity, Client, TaxRate } from "@prisma/client";
import { computeInvoice, toCents } from "@/lib/money";
import type { TaxTypeT, DiscountType } from "@/lib/types";
import { resolveExchangeRate } from "@/lib/services/currency";
import { nextInvoiceNumber, nextCreditNoteNumber } from "@/lib/services/sequence";
import {
  ensureScheduleForSentInvoice,
  cancelPendingReminders,
  adHocContent,
} from "@/lib/services/reminders";
import { audit, diff } from "@/lib/audit";

const DAY = 86_400_000;

/** Typed HTTP-style error mapped to status codes in route handlers. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* ────────────────────────────── input types ─────────────────────────────── */

export interface ItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: string | number;
  taxRateId?: string | null;
}

export interface InvoiceInput {
  clientId: string;
  currency: string;
  issueDate?: string | Date;
  dueDate?: string | Date;
  items: ItemInput[];
  discountType?: DiscountType | null;
  discountValue?: number | null;
  notes?: string | null;
  terms?: string | null;
  poNumber?: string | null;
  recurringProfileId?: string | null;
}

export interface CreateInvoiceOptions {
  entity?: Entity;
  client?: Client;
  taxRatesMap?: Map<string, TaxRate>;
  exchangeRatesMap?: Map<string, number>;
}

/* ────────────────────────────── internal plumbing ───────────────────────── */

async function resolveItems(
  entityId: string,
  inputs: ItemInput[],
  taxRatesMap?: Map<string, TaxRate>
) {
  if (!inputs.length) throw new ApiError(400, "At least one line item is required.");
  const rateIds = [...new Set(inputs.map((i) => i.taxRateId).filter(Boolean))] as string[];
  let taxRates: TaxRate[];
  if (taxRatesMap && rateIds.every((id) => taxRatesMap.has(id))) {
    taxRates = rateIds.map((id) => taxRatesMap.get(id)!);
  } else {
    taxRates = rateIds.length
      ? await prisma.taxRate.findMany({ where: { id: { in: rateIds }, entityId } })
      : [];
  }
  const rateMap = new Map(taxRates.map((t) => [t.id, t]));

  return inputs.map((it) => {
    const description = it.description?.trim();
    if (!description) throw new ApiError(400, "Every line item needs a description.");
    const qty = Number(it.quantity);
    if (!isFinite(qty) || qty <= 0) throw new ApiError(400, "Quantity must be positive.");
    const unitPriceCents = toCents(it.unitPrice);
    if (unitPriceCents < 0) throw new ApiError(400, "Unit price cannot be negative.");

    const tr = it.taxRateId ? rateMap.get(it.taxRateId) : undefined;
    return {
      productId: it.productId ?? null,
      description,
      quantity: qty,
      unitPriceCents,
      taxRateId: tr?.id ?? null,
      taxRateName: tr ? `${tr.name} (${tr.ratePercent}%)` : null,
      taxRatePercent: tr?.ratePercent ?? 0,
      taxType: (tr?.type ?? "EXCLUSIVE") as TaxTypeT,
    };
  });
}

function calcFromResolved(
  resolved: Awaited<ReturnType<typeof resolveItems>>,
  discountType?: DiscountType | null,
  discountValue?: number | null
) {
  return computeInvoice(resolved, { type: discountType ?? null, value: discountValue ?? null });
}

function itemRows(invoiceId: string, resolved: ResolvedItem[], calc: ReturnType<typeof computeInvoice>) {
  return resolved.map((r, i) => ({
    invoiceId,
    productId: r.productId,
    description: r.description,
    quantity: r.quantity,
    unitPriceCents: r.unitPriceCents,
    taxRateId: r.taxRateId,
    taxRateName: r.taxRateName,
    taxRatePercent: r.taxRatePercent,
    taxType: r.taxType,
    discountShareCents: calc.items[i].discountShareCents,
    netCents: calc.items[i].netCents,
    taxCents: calc.items[i].taxCents,
    lineTotalCents: calc.items[i].lineTotalCents,
  }));
}

type ResolvedItem = Awaited<ReturnType<typeof resolveItems>>[number];

/* ────────────────────────────── lifecycle ops ───────────────────────────── */

export async function createInvoice(
  input: InvoiceInput,
  options?: CreateInvoiceOptions
): Promise<Invoice> {
  const entity = options?.entity ?? (await getEntity());
  let client: Client | null | undefined = options?.client;
  if (!client || client.id !== input.clientId) {
    client = await prisma.client.findFirst({
      where: { id: input.clientId, entityId: entity.id },
    });
  }
  if (!client) throw new ApiError(404, "Client not found.");

  const currency = (input.currency || entity.defaultCurrency).toUpperCase();
  // doc §12: FX snapshot locked at creation, immutable afterwards
  const exchangeRate = await resolveExchangeRate(currency, options?.exchangeRatesMap);

  const resolved = await resolveItems(entity.id, input.items, options?.taxRatesMap);
  const calc = calcFromResolved(resolved, input.discountType, input.discountValue);

  const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
  const dueDate = input.dueDate
    ? new Date(input.dueDate)
    : new Date(issueDate.getTime() + 30 * DAY);

  let created!: Invoice;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { sequence, invoiceNumber } = await nextInvoiceNumber(entity, issueDate.getFullYear());
      created = await prisma.invoice.create({
        data: {
          entityId: entity.id,
          clientId: client.id,
          invoiceNumber,
          sequence,
          status: "DRAFT",
          issueDate,
          dueDate,
          currency,
          exchangeRate,
          discountType: input.discountType ?? null,
          discountValue: input.discountValue ?? null,
          subtotalCents: calc.subtotalCents,
          discountTotalCents: calc.discountTotalCents,
          taxTotalCents: calc.taxTotalCents,
          grandTotalCents: calc.grandTotalCents,
          notes: input.notes ?? entity.defaultNotes,
          terms: input.terms ?? entity.defaultTerms,
          poNumber: input.poNumber ?? null,
          recurringProfileId: input.recurringProfileId ?? null,
        },
      });
      break;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (!msg.includes("Unique constraint")) throw e;
      if (attempt === 3) throw new ApiError(500, "Could not allocate invoice number.");
    }
  }

  await prisma.invoiceItem.createMany({ data: itemRows(created.id, resolved, calc) });

  await audit({
    entityType: "INVOICE",
    entityId: created.id,
    action: "CREATE",
    summary: `Draft ${created.invoiceNumber} created for ${client.name}`,
    changes: { grandTotalCents: created.grandTotalCents, currency },
  });
  return created;
}

export async function updateInvoice(id: string, input: InvoiceInput) {
  const existing = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw new ApiError(404, "Invoice not found.");
  if (existing.status !== "DRAFT")
    throw new ApiError(409, "Only DRAFT invoices are editable (doc §8: PUT /invoices/{id}).");

  const entity = await getEntity();
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, entityId: entity.id },
  });
  if (!client) throw new ApiError(404, "Client not found.");

  const resolved = await resolveItems(entity.id, input.items);
  const calc = calcFromResolved(resolved, input.discountType, input.discountValue);
  const issueDate = input.issueDate ? new Date(input.issueDate) : existing.issueDate;
  const dueDate = input.dueDate ? new Date(input.dueDate) : existing.dueDate;

  const before = {
    clientId: existing.clientId,
    grandTotalCents: existing.grandTotalCents,
  };

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoiceItem.createMany({ data: itemRows(id, resolved, calc) });
    return tx.invoice.update({
      where: { id },
      data: {
        clientId: client.id,
        issueDate,
        dueDate,
        discountType: input.discountType ?? null,
        discountValue: input.discountValue ?? null,
        subtotalCents: calc.subtotalCents,
        discountTotalCents: calc.discountTotalCents,
        taxTotalCents: calc.taxTotalCents,
        grandTotalCents: calc.grandTotalCents,
        notes: input.notes ?? undefined,
        terms: input.terms ?? undefined,
        poNumber: input.poNumber ?? null,
      },
      include: { items: true },
    });
  });

  await audit({
    entityType: "INVOICE",
    entityId: id,
    action: "UPDATE",
    summary: `Draft ${updated.invoiceNumber} edited`,
    changes: diff(before, { clientId: client.id, grandTotalCents: updated.grandTotalCents }),
  });
  return updated;
}

const OUTBOX = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"];

export async function requireInvoice(id: string): Promise<Invoice> {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw new ApiError(404, "Invoice not found.");
  return inv;
}

export async function markSent(idOrInvoice: string | Invoice) {
  const inv = typeof idOrInvoice === "string" ? await requireInvoice(idOrInvoice) : idOrInvoice;
  if (inv.status !== "DRAFT")
    throw new ApiError(409, `Cannot send an invoice already ${inv.status}.`);
  const updated = await prisma.invoice.update({
    where: { id: inv.id },
    data: { status: "SENT", sentAt: new Date() },
  });
  await ensureScheduleForSentInvoice(updated); // doc §3.9 schedule engine
  await audit({
    entityType: "INVOICE",
    entityId: inv.id,
    action: "SEND",
    summary: `${updated.invoiceNumber} e-mailed to client`,
  });
  return updated;
}

export async function markViewed(id: string) {
  const inv = await requireInvoice(id);
  if (inv.status !== "SENT" && inv.status !== "OVERDUE")
    throw new ApiError(409, `Status ${inv.status} cannot transition to VIEWED.`);
  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: "VIEWED", viewedAt: new Date() },
  });
  await audit({ entityType: "INVOICE", entityId: id, action: "VIEW", summary: `${inv.invoiceNumber} opened by client` });
  return updated;
}

export async function voidInvoice(id: string) {
  const inv = await requireInvoice(id);
  if (inv.status === "VOID") throw new ApiError(409, "Already void.");
  if (inv.amountPaidCents > 0)
    throw new ApiError(409, "Refund recorded payments before voiding (doc §19 integrity).");
  if (inv.creditedCents > 0)
    throw new ApiError(409, "Reverse credit notes before voiding.");
  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: "VOID", voidedAt: new Date() },
  });
  await cancelPendingReminders(id);
  await audit({ entityType: "INVOICE", entityId: id, action: "VOID", summary: `${inv.invoiceNumber} voided` });
  return updated;
}

export async function remindNow(id: string) {
  const inv = await requireInvoice(id);
  if (!OUTBOX.includes(inv.status))
    throw new ApiError(409, "Reminders apply to outbox invoices only.");
  const c = adHocContent(inv);
  await prisma.reminder.create({
    data: {
      invoiceId: id,
      type: "AD_HOC",
      subject: c.subject,
      body: c.body,
      scheduledAt: new Date(),
      status: "SENT",
      sentAt: new Date(),
    },
  });
  await audit({
    entityType: "REMINDER",
    entityId: id,
    action: "DISPATCH",
    summary: `Manual reminder dispatched for ${inv.invoiceNumber}`,
  });
  return { ok: true };
}

/* ────────────────────────────── settlement ──────────────────────────────── */

export function balanceCents(inv: Invoice): number {
  return Math.max(0, inv.grandTotalCents - inv.amountPaidCents - inv.creditedCents);
}

/** Re-derive lifecycle status from settlement state (§7 / §3.6). */
async function refreshSettlementStatus(id: string) {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv || inv.status === "VOID" || inv.status === "DRAFT") return inv;
  const settled = inv.amountPaidCents + inv.creditedCents;
  let status = inv.status;
  if (inv.grandTotalCents > 0 && settled >= inv.grandTotalCents) {
    status = "PAID";
    await cancelPendingReminders(id);
  } else if (settled > 0) {
    status = "PARTIALLY_PAID";
  }
  if (status !== inv.status) {
    return prisma.invoice.update({ where: { id }, data: { status } });
  }
  return inv;
}

export async function recordPayment(
  invoiceId: string,
  input: {
    amount: string | number; // decimal in invoice currency
    method?: string;
    paidAt?: string | Date;
    gatewayReference?: string | null;
    note?: string | null;
  }
) {
  const inv = await requireInvoice(invoiceId);
  if (inv.status === "DRAFT")
    throw new ApiError(409, "Send the invoice before recording payments.");
  if (inv.status === "VOID") throw new ApiError(409, "Cannot pay a voided invoice.");

  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new ApiError(400, "Payment amount must be positive.");
  const remaining = balanceCents(inv);
  if (amountCents > remaining)
    throw new ApiError(
      400,
      `Payment exceeds outstanding balance of ${(remaining / 100).toFixed(2)} ${inv.currency}.`
    );

  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      amountCents,
      currency: inv.currency,
      method: input.method ?? "BANK_TRANSFER",
      gatewayReference: input.gatewayReference ?? null,
      note: input.note ?? null,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
    },
  });
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { amountPaidCents: { increment: amountCents } },
  });
  await refreshSettlementStatus(invoiceId);
  // Auto-reconciliation convenience matching §10: fully-paid invoices stop dunning.
  await audit({
    entityType: "PAYMENT",
    entityId: payment.id,
    action: "PAYMENT_RECORDED",
    summary: `${(amountCents / 100).toFixed(2)} ${inv.currency} (${payment.method}) received on ${inv.invoiceNumber}`,
  });
  return payment;
}

export async function issueCreditNote(
  invoiceId: string,
  input: { amount: string | number; reason?: string | null; issuedAt?: string | Date }
) {
  const inv = await requireInvoice(invoiceId);
  if (["VOID", "DRAFT"].includes(inv.status))
    throw new ApiError(409, `Credit notes cannot be issued against ${inv.status} invoices.`);
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new ApiError(400, "Credit amount must be positive.");
  const remaining = balanceCents(inv);
  if (amountCents > remaining)
    throw new ApiError(400, `Credit exceeds outstanding balance of ${(remaining / 100).toFixed(2)}.`);

  const year = new Date().getFullYear();
  const creditNumber = await nextCreditNoteNumber(year);
  const note = await prisma.creditNote.create({
    data: {
      invoiceId,
      creditNumber,
      amountCents,
      reason: input.reason ?? null,
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : new Date(),
    },
  });
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { creditedCents: { increment: amountCents } },
  });
  await refreshSettlementStatus(invoiceId); // §3.7 auto-adjust balances
  await audit({
    entityType: "CREDIT_NOTE",
    entityId: note.id,
    action: "CREATE",
    summary: `${creditNumber} for ${(amountCents / 100).toFixed(2)} ${inv.currency} against ${inv.invoiceNumber}`,
    changes: { reason: input.reason ?? null },
  });
  return note;
}

/** §13 daily sweep: unpaid + past-due outbox invoices become OVERDUE. */
export async function sweepOverdue(now = new Date()) {
  const res = await prisma.invoice.updateMany({
    where: {
      status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] },
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });
  if (res.count > 0) {
    await audit({
      entityType: "INVOICE",
      entityId: "*",
      actor: "scheduler",
      action: "UPDATE",
      summary: `Overdue sweep marked ${res.count} invoice(s) OVERDUE`,
    });
  }
  return res.count;
}

