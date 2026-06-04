import type { AuditEventV2Input, AuditEventV2WriteResult } from './audit-events-v2';
import { recordAuditEventV2 } from './audit-events-v2';
import { registrarAuditoria } from '../../utils/auditoria';

type LegacyAuditoriaInput = Parameters<typeof registrarAuditoria>[0];

export interface RecordLegacyAndCanonicalAuditInput {
  db: D1Database;
  legacyAuditoria?: Omit<LegacyAuditoriaInput, 'db'>;
  canonicalEvent?: AuditEventV2Input;
}

export interface RecordLegacyAndCanonicalAuditResult {
  canonicalResult?: AuditEventV2WriteResult;
}

export async function recordLegacyAndCanonicalAudit(
  input: RecordLegacyAndCanonicalAuditInput,
): Promise<RecordLegacyAndCanonicalAuditResult> {
  if (input.legacyAuditoria) {
    await registrarAuditoria({
      db: input.db,
      ...input.legacyAuditoria,
    });
  }

  if (!input.canonicalEvent) {
    return {};
  }

  const canonicalResult = await recordAuditEventV2(input.db, input.canonicalEvent);
  return { canonicalResult };
}
