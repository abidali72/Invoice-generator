import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "SEND"
  | "VIEW"
  | "VOID"
  | "PAYMENT_RECORDED"
  | "GENERATE"
  | "DISPATCH";

/**
 * Immutable audit trail writer (doc §3.16 / §15).
 * Never throws into caller flow — auditing must not break business ops.
 */
export interface AuditEntry {
  entityType: string;
  entityId: string;
  actor?: string;
  action: AuditAction;
  summary: string;
  changes?: unknown;
}

export async function audit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        actor: entry.actor ?? "admin@acme.studio",
        action: entry.action,
        summary: entry.summary,
        changesJson: entry.changes != null ? JSON.stringify(entry.changes) : null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write log", err);
  }
}

/**
 * Batch audit trail writer.
 * Optimizes performance by inserting multiple audit entries in a single query (O(1) database roundtrips instead of O(N)).
 * Never throws into caller flow.
 */
export async function auditMany(entries: AuditEntry[]) {
  if (!entries.length) return;
  try {
    await prisma.auditLog.createMany({
      data: entries.map((entry) => ({
        entityType: entry.entityType,
        entityId: entry.entityId,
        actor: entry.actor ?? "admin@acme.studio",
        action: entry.action,
        summary: entry.summary,
        changesJson: entry.changes != null ? JSON.stringify(entry.changes) : null,
      })),
    });
  } catch (err) {
    console.error("[auditMany] failed to write batch logs", err);
  }
}

/** Shallow JSON-diff of before/after objects for UPDATE entries. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = (before as Record<string, unknown>)[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return out;
}
