import type { Entity } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Sequential, non-editable numbering (doc §11 compliance note).
 * Format template supports {YEAR} and {SEQ}; sequences are scoped per year.
 */
export function formatNumber(
  prefixTemplate: string,
  seq: number,
  year: number,
  pad: number
): string {
  return prefixTemplate
    .replace("{YEAR}", String(year))
    .replace("{SEQ}", String(seq).padStart(pad, "0"));
}

export async function nextInvoiceNumber(
  entity: Entity,
  issueYear: number
): Promise<{ invoiceNumber: string; sequence: number }> {
  const agg = await prisma.invoice.aggregate({
    _max: { sequence: true },
    where: {
      entityId: entity.id,
      issueDate: {
        gte: new Date(issueYear, 0, 1),
        lt: new Date(issueYear + 1, 0, 1),
      },
    },
  });
  const sequence = (agg._max.sequence ?? 0) + 1;
  return {
    sequence,
    invoiceNumber: formatNumber(entity.invoicePrefix, sequence, issueYear, entity.seqPad),
  };
}

export async function nextCreditNoteNumber(year: number): Promise<string> {
  const agg = await prisma.creditNote.aggregate({
    _count: true,
    where: {
      issuedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
    },
  });
  const seq = agg._count + 1;
  return `CR-${year}-${String(seq).padStart(4, "0")}`;
}
