import { prisma } from "@/lib/prisma";
import type { Invoice } from "@prisma/client";
import { audit, auditMany } from "@/lib/audit";
import { formatMoney } from "@/lib/money";

const DAY = 86_400_000;

/**
 * Reminder schedule applied when an invoice is SENT (doc §3.9):
 *   due−3d, on-due, +7, +14 and +30 days overdue — escalating tone.
 * Slots already in the past at send time are skipped.
 */
export async function ensureScheduleForSentInvoice(invoice: Invoice) {
  const now = new Date();
  const due = invoice.dueDate.getTime();
  const slots: Array<{ type: string; at: number; subject: string; body: string }> = [
    {
      type: "BEFORE_DUE_3",
      at: due - 3 * DAY,
      subject: `Friendly reminder: invoice ${invoice.invoiceNumber} due soon`,
      body: `Hi, a gentle nudge that invoice ${invoice.invoiceNumber} (${formatMoney(invoice.grandTotalCents, invoice.currency)}) is due on ${invoice.dueDate.toDateString()}. Thank you!`,
    },
    {
      type: "ON_DUE",
      at: due,
      subject: `Invoice ${invoice.invoiceNumber} is due today`,
      body: `Invoice ${invoice.invoiceNumber} (${formatMoney(invoice.grandTotalCents, invoice.currency)}) is due today. Please arrange settlement at your earliest convenience.`,
    },
    {
      type: "OVERDUE_7",
      at: due + 7 * DAY,
      subject: `Action required: invoice ${invoice.invoiceNumber} is overdue`,
      body: `Our records show invoice ${invoice.invoiceNumber} became overdue on ${invoice.dueDate.toDateString()}. Kindly settle ${formatMoney(invoice.grandTotalCents - invoice.amountPaidCents - invoice.creditedCents, invoice.currency)} outstanding.`,
    },
    {
      type: "OVERDUE_14",
      at: due + 14 * DAY,
      subject: `Second notice: overdue invoice ${invoice.invoiceNumber}`,
      body: `Invoice ${invoice.invoiceNumber} remains unpaid 14 days past its due date. This is a second formal notice. Please remit payment immediately to avoid service interruption.`,
    },
    {
      type: "OVERDUE_30",
      at: due + 30 * DAY,
      subject: `FINAL notice: invoice ${invoice.invoiceNumber} severely overdue`,
      body: `Despite previous reminders, invoice ${invoice.invoiceNumber} is now 30 days overdue. This is a final demand prior to escalating collection measures. Immediate payment of ${formatMoney(invoice.grandTotalCents - invoice.amountPaidCents - invoice.creditedCents, invoice.currency)} is requested.`,
    },
  ];

  const rows = slots
    .filter((s) => s.at >= now.getTime())
    .map((s) => ({
      invoiceId: invoice.id,
      type: s.type,
      channel: "EMAIL",
      subject: s.subject,
      body: s.body,
      scheduledAt: new Date(s.at),
    }));
  if (rows.length) await prisma.reminder.createMany({ data: rows });
}

/** Content for a manual/ad-hoc reminder about an open invoice. */
export function adHocContent(invoice: Invoice) {
  return {
    subject: `Payment reminder: invoice ${invoice.invoiceNumber}`,
    body: `Please note the current balance of ${formatMoney(
      Math.max(0, invoice.grandTotalCents - invoice.amountPaidCents - invoice.creditedCents),
      invoice.currency
    )} for invoice ${invoice.invoiceNumber}. We appreciate your prompt attention.`,
  };
}

const OPEN_STATUSES = ["SENT", "VIEWED", "OVERDUE", "PARTIALLY_PAID"];

/**
 * Scheduler tick (doc §13 Reminder Engine). Returns number dispatched.
 * Performance Optimization: Batches status updates and audit writes into O(1) bulk
 * operations (`updateMany` and `auditMany`) instead of O(N) sequential database roundtrips.
 */
export async function dispatchDueReminders(now = new Date()) {
  const pending = await prisma.reminder.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    include: { invoice: true },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });

  const cancelledIds: string[] = [];
  const sentReminders: typeof pending = [];

  for (const r of pending) {
    if (!OPEN_STATUSES.includes(r.invoice.status)) {
      cancelledIds.push(r.id);
    } else {
      sentReminders.push(r);
    }
  }

  // Batch cancel reminders for paid/void invoices
  if (cancelledIds.length > 0) {
    await prisma.reminder.updateMany({
      where: { id: { in: cancelledIds } },
      data: { status: "CANCELLED" },
    });
  }

  // Batch mark reminders as sent and create audit log entries in a single query each
  if (sentReminders.length > 0) {
    const sentIds = sentReminders.map((r) => r.id);
    await prisma.reminder.updateMany({
      where: { id: { in: sentIds } },
      data: { status: "SENT", sentAt: now },
    });

    await auditMany(
      sentReminders.map((r) => ({
        entityType: "REMINDER",
        entityId: r.id,
        action: "DISPATCH",
        summary: `${r.type} reminder "${r.subject}" e-mailed for ${r.invoice.invoiceNumber}`,
      }))
    );
  }

  return sentReminders.length;
}

export async function cancelPendingReminders(invoiceId: string) {
  await prisma.reminder.updateMany({
    where: { invoiceId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}
