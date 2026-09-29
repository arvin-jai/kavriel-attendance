import type { Prisma } from '../../generated/prisma/client';
import type { AuditAction } from '../../generated/prisma/enums';

export type DbClient = Prisma.TransactionClient;

export interface AuditEntry {
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

/**
 * Append an audit row. Pass the transaction client so the audit commits (or rolls back)
 * together with the change it describes. Never put passwords or tokens in metadata.
 */
export async function recordAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
      ipAddress: entry.ipAddress?.slice(0, 45) ?? null,
    },
  });
}

/** Keys whose values differ between two objects: `{ key: { from, to } }`. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Prisma.InputJsonObject {
  const changes: Record<
    string,
    { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }
  > = {};
  for (const key of Object.keys(after)) {
    const from = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
    const to = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
    if (to !== undefined && JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key] = {
        from: (from ?? null) as Prisma.InputJsonValue | null,
        to: (to ?? null) as Prisma.InputJsonValue | null,
      };
    }
  }
  return changes;
}
