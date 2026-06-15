import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalizeJson } from '../../../lib/regulated-records/canonical';
import {
  GovernanceEvidenceChainConflictError,
  GovernanceEvidenceRecordService,
  governanceEvidenceRecordConstants,
  type GovernanceEvidenceLogicalExport,
  type GovernanceEvidencePayload,
  type RegulatedRecordsLocalDatabase,
  type RegulatedSqlValue,
} from '../../../lib/regulated-records/governance-evidence-service';
import { hashCanonicalPayload, sha256Hex } from '../../../lib/regulated-records/hash';

type SqliteRow = Record<string, string | number | null>;

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../migrations_experimental/0410_experimental_regulated_records_core.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');
const tempDirs: string[] = [];

function sqlValue(value: RegulatedSqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function interpolate(sql: string, params: readonly RegulatedSqlValue[] = []) {
  let index = 0;
  const interpolated = sql.replaceAll('?', () => {
    const value = params[index];
    index += 1;
    return sqlValue(value);
  });

  expect(index).toBe(params.length);
  return interpolated;
}

function createDb() {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-governance-evidence-'));
  const databasePath = join(tempDir, 'slice.sqlite');
  tempDirs.push(tempDir);

  function run(sql: string) {
    return spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });
  }

  const migration = run(migrationSql);
  expect(migration.status, migration.stderr).toBe(0);

  const db: RegulatedRecordsLocalDatabase = {
    async execute(sql, params = []) {
      const result = run(`${interpolate(sql, params)};\nSELECT changes();`);
      if (result.status !== 0) {
        throw new Error(result.stderr);
      }
      const lines = result.stdout.trim().split('\n').filter(Boolean);
      return { changes: Number(lines.at(-1) ?? 0) };
    },
    async query<T>(sql: string, params: readonly RegulatedSqlValue[] = []) {
      const result = spawnSync('sqlite3', ['-json', databasePath, interpolate(sql, params)], {
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
    },
  };

  function executeResult(sql: string) {
    return run(sql);
  }

  return { databasePath, db, executeResult };
}

function createService(db: RegulatedRecordsLocalDatabase, options: ConstructorParameters<typeof GovernanceEvidenceRecordService>[1] = {}) {
  let idCounter = 0;
  return new GovernanceEvidenceRecordService(db, {
    nextId: (prefix) => `${prefix}-${String(++idCounter).padStart(4, '0')}`,
    ...options,
  });
}

function basePayload(overrides: Partial<GovernanceEvidencePayload> = {}): GovernanceEvidencePayload {
  return {
    evidence_type: 'internal_readiness_note',
    related_module: 'governance',
    document_reference: 'GOV-LOCAL-001',
    description: 'Internal evidence that a local Records Core control was reviewed.',
    internal_author: {
      user_id: 101,
      name: 'Internal Reviewer',
      role: 'governance_reviewer',
    },
    evidence_date: '2026-06-14T12:00:00.000Z',
    status: 'CAPTURED',
    observations: 'Local-only non-regulated evidence.',
    ...overrides,
  };
}

async function buildEventHash(previousEventHash: string | null, payload: string) {
  return sha256Hex(`${previousEventHash ?? 'GENESIS'}:${payload}`);
}

async function buildTenantChainHash(previousTenantChainHash: string | null, eventHash: string) {
  return sha256Hex(`${previousTenantChainHash ?? 'GENESIS'}:${eventHash}`);
}

async function expectSqlFailure(action: () => Promise<unknown>, message: string) {
  await expect(action()).rejects.toThrow(message);
}

async function insertConflictingAuditEvent(db: RegulatedRecordsLocalDatabase, empresaId: number, nextSequence: number) {
  const rows = await db.query<{
    last_event_hash: string | null;
    last_tenant_chain_hash: string | null;
  }>(
    `SELECT last_event_hash, last_tenant_chain_hash
     FROM regulated_chain_heads
     WHERE empresa_id = ? AND chain_scope = ?`,
    [empresaId, governanceEvidenceRecordConstants.chainScope],
  );
  const head = rows[0];
  expect(head).toBeDefined();

  const eventPayload = canonicalizeJson({
    event: 'SIMULATED_CONCURRENT_APPEND',
    sequence: nextSequence,
  });
  const eventHash = await buildEventHash(head.last_event_hash, eventPayload);
  const tenantChainHash = await buildTenantChainHash(head.last_tenant_chain_hash, eventHash);

  await db.execute(
    `INSERT INTO regulated_audit_events (
      id, empresa_id, event_type, event_category, actor_type, event_payload_json,
      previous_event_hash, event_hash, tenant_chain_hash, chain_scope, chain_sequence,
      canonical_schema_version
    ) VALUES (?, ?, 'SIMULATED_CONCURRENT_APPEND', 'GOVERNANCE_EVIDENCE_RECORD', 'system',
      ?, ?, ?, ?, ?, ?, ?)`,
    [
      `simulated-conflict-${nextSequence}`,
      empresaId,
      eventPayload,
      head.last_event_hash,
      eventHash,
      tenantChainHash,
      governanceEvidenceRecordConstants.chainScope,
      nextSequence,
      governanceEvidenceRecordConstants.canonicalSchemaVersion,
    ],
  );
}

function tamperExportPayload(logicalExport: GovernanceEvidenceLogicalExport, nextPayload: GovernanceEvidencePayload) {
  const copy = JSON.parse(JSON.stringify(logicalExport)) as GovernanceEvidenceLogicalExport;
  const tampered = hashCanonicalPayload({
    canonicalSchemaVersion: governanceEvidenceRecordConstants.canonicalSchemaVersion,
    canonicalizationVersion: governanceEvidenceRecordConstants.canonicalizationVersion,
    payload: nextPayload,
  });

  return tampered.then(({ canonicalJson }) => {
    copy.regulated_record_versions[0].canonical_payload_json = canonicalJson;
    copy.regulated_record_versions[0].canonical_payload_size = canonicalJson.length;
    return copy;
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('governance evidence record local vertical slice', () => {
  it('creates a sealed local evidence record with version, hash, audit event and chain head', async () => {
    const { db } = createDb();
    const service = createService(db);

    const record = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-create',
      payload: basePayload(),
      createdBy: 101,
      requestId: 'req-create',
      nowIso: '2026-06-14T12:00:00.000Z',
    });

    expect(record.status).toBe('SEALED');
    expect(record.latestVersion.versionNumber).toBe(1);
    expect(record.latestVersion.payload.evidence_type).toBe('internal_readiness_note');
    expect(record.chainHead?.lastChainSequence).toBe(1);

    const counts = await db.query<{ table_name: string; count: number }>(
      `SELECT 'regulated_records' AS table_name, COUNT(*) AS count FROM regulated_records
       UNION ALL SELECT 'regulated_record_versions', COUNT(*) FROM regulated_record_versions
       UNION ALL SELECT 'regulated_record_hashes', COUNT(*) FROM regulated_record_hashes
       UNION ALL SELECT 'regulated_audit_events', COUNT(*) FROM regulated_audit_events
       UNION ALL SELECT 'regulated_chain_heads', COUNT(*) FROM regulated_chain_heads`,
    );
    expect(Object.fromEntries(counts.map((row) => [row.table_name, row.count]))).toEqual({
      regulated_records: 1,
      regulated_record_versions: 1,
      regulated_record_hashes: 1,
      regulated_audit_events: 1,
      regulated_chain_heads: 1,
    });
  });

  it('keeps sealed data immutable and represents corrections as addendum versions', async () => {
    const { db } = createDb();
    const service = createService(db);
    const created = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-addendum',
      payload: basePayload({ description: 'Original local evidence.' }),
      createdBy: 101,
      nowIso: '2026-06-14T12:00:00.000Z',
    });

    await expectSqlFailure(
      () =>
        db.execute(`UPDATE regulated_record_versions SET canonical_payload_json = ? WHERE id = ?`, [
          '{"payload":{"description":"destructive edit"}}',
          created.latestVersion.id,
        ]),
      'regulated_record_versions: sealed versions are immutable',
    );

    const withAddendum = await service.addAddendum({
      empresaId: 10,
      recordId: created.id,
      changes: {
        description: 'Corrected by local addendum.',
        observations: 'Correction appended without editing version 1.',
        status: 'REVIEWED',
      },
      addendumReason: 'GOVERNANCE_EVIDENCE_CORRECTION',
      createdBy: 102,
      nowIso: '2026-06-14T12:05:00.000Z',
    });

    expect(withAddendum.versions).toHaveLength(2);
    expect(withAddendum.versions[0].payload.description).toBe('Original local evidence.');
    expect(withAddendum.latestVersion.versionNumber).toBe(2);
    expect(withAddendum.latestVersion.baseVersionId).toBe(created.latestVersion.id);
    expect(withAddendum.latestVersion.payload.description).toBe('Corrected by local addendum.');
  });

  it('uses deterministic canonical payload hashes and records schema/canonicalizer versions', async () => {
    const { db } = createDb();
    const service = createService(db);
    const firstPayload = {
      ...basePayload({ document_reference: 'GOV-HASH-001' }),
      request_id: 'volatile-a',
    } as GovernanceEvidencePayload;
    const secondPayload = {
      ...basePayload({ document_reference: 'GOV-HASH-001' }),
      request_id: 'volatile-b',
    } as GovernanceEvidencePayload;

    const first = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-hash-a',
      payload: firstPayload,
      createdBy: 101,
      nowIso: '2026-06-14T12:00:00.000Z',
    });
    const second = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-hash-b',
      payload: secondPayload,
      createdBy: 101,
      nowIso: '2026-06-14T12:01:00.000Z',
    });
    const changed = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-hash-c',
      payload: basePayload({
        document_reference: 'GOV-HASH-001',
        description: 'Real content change.',
      }),
      createdBy: 101,
      nowIso: '2026-06-14T12:02:00.000Z',
    });

    expect(first.latestVersion.payloadHash).toBe(second.latestVersion.payloadHash);
    expect(first.latestVersion.payloadHash).not.toBe(changed.latestVersion.payloadHash);
    expect(first.latestVersion.canonicalPayloadJson).toContain(
      `"canonical_schema_version":"${governanceEvidenceRecordConstants.canonicalSchemaVersion}"`,
    );
    expect(first.latestVersion.canonicalPayloadJson).toContain(
      `"canonicalization_version":"${governanceEvidenceRecordConstants.canonicalizationVersion}"`,
    );
    await expect(sha256Hex(first.latestVersion.canonicalPayloadJson)).resolves.toBe(first.latestVersion.payloadHash);
  });

  it('chains events, advances the chain head and detects sequence conflicts', async () => {
    const { db } = createDb();
    const service = createService(db);
    const created = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-chain',
      payload: basePayload(),
      createdBy: 101,
      nowIso: '2026-06-14T12:00:00.000Z',
    });
    await service.addAddendum({
      empresaId: 10,
      recordId: created.id,
      changes: { observations: 'Reviewed after local chain test.', status: 'REVIEWED' },
      addendumReason: 'GOVERNANCE_EVIDENCE_REVIEW',
      createdBy: 102,
      nowIso: '2026-06-14T12:03:00.000Z',
    });

    const head = await db.query<{ last_chain_sequence: number; last_event_hash: string; last_tenant_chain_hash: string }>(
      `SELECT last_chain_sequence, last_event_hash, last_tenant_chain_hash
       FROM regulated_chain_heads
       WHERE empresa_id = ? AND chain_scope = ?`,
      [10, governanceEvidenceRecordConstants.chainScope],
    );
    const lastEvent = await db.query<{ chain_sequence: number; event_hash: string; tenant_chain_hash: string }>(
      `SELECT chain_sequence, event_hash, tenant_chain_hash
       FROM regulated_audit_events
       WHERE empresa_id = ? AND chain_scope = ?
       ORDER BY chain_sequence DESC
       LIMIT 1`,
      [10, governanceEvidenceRecordConstants.chainScope],
    );

    expect(head[0]).toEqual({
      last_chain_sequence: lastEvent[0].chain_sequence,
      last_event_hash: lastEvent[0].event_hash,
      last_tenant_chain_hash: lastEvent[0].tenant_chain_hash,
    });
    await expect(service.recomputeIntegrity(10)).resolves.toBe(true);

    const conflictingService = createService(db, {
      beforeAuditInsert: async ({ empresaId, nextSequence }) => {
        await insertConflictingAuditEvent(db, empresaId, nextSequence);
      },
    });
    await expect(
      conflictingService.addAddendum({
        empresaId: 10,
        recordId: created.id,
        changes: { observations: 'This write should lose the sequence race.' },
        addendumReason: 'SIMULATED_SEQUENCE_CONFLICT',
        createdBy: 103,
        nowIso: '2026-06-14T12:04:00.000Z',
      }),
    ).rejects.toBeInstanceOf(GovernanceEvidenceChainConflictError);
  });

  it('keeps records and chain heads isolated by empresa_id and blocks cross-tenant references', async () => {
    const { db } = createDb();
    const service = createService(db);
    const companyA = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-tenant-a',
      payload: basePayload({ document_reference: 'GOV-TENANT-A' }),
      createdBy: 101,
      nowIso: '2026-06-14T12:00:00.000Z',
    });
    const companyB = await service.createRecord({
      empresaId: 11,
      sourceEntityId: 'governance-evidence-tenant-b',
      payload: basePayload({ document_reference: 'GOV-TENANT-B' }),
      createdBy: 201,
      nowIso: '2026-06-14T12:01:00.000Z',
    });

    const heads = await db.query<{ empresa_id: number; last_chain_sequence: number }>(
      `SELECT empresa_id, last_chain_sequence
       FROM regulated_chain_heads
       WHERE chain_scope = ?
       ORDER BY empresa_id`,
      [governanceEvidenceRecordConstants.chainScope],
    );
    expect(heads).toEqual([
      { empresa_id: 10, last_chain_sequence: 1 },
      { empresa_id: 11, last_chain_sequence: 1 },
    ]);
    await expect(service.getRecord(11, companyA.id)).rejects.toThrow('Governance evidence record not found');
    await expectSqlFailure(
      () =>
        db.execute(`UPDATE regulated_records SET current_version_id = ? WHERE id = ?`, [
          companyB.latestVersion.id,
          companyA.id,
        ]),
      'regulated_records: current_version_id must belong to the same record and empresa_id',
    );

    const links = await db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM regulated_record_links`);
    expect(links[0].count).toBe(0);
  });

  it('exports, restores and recomputes a logical local record export', async () => {
    const { db } = createDb();
    const service = createService(db);
    const created = await service.createRecord({
      empresaId: 10,
      sourceEntityId: 'governance-evidence-restore',
      payload: basePayload({ document_reference: 'GOV-RESTORE-001' }),
      createdBy: 101,
      nowIso: '2026-06-14T12:00:00.000Z',
    });

    const logicalExport = await service.exportRecord(10, created.id);
    const restoredDb = createDb();
    const restoredService = createService(restoredDb.db);
    await restoredService.restoreExport(logicalExport);
    await expect(restoredService.recomputeIntegrity(10)).resolves.toBe(true);

    const tamperedExport = await tamperExportPayload(
      logicalExport,
      basePayload({
        document_reference: 'GOV-RESTORE-001',
        description: 'Tampered after logical export.',
      }),
    );
    const tamperedDb = createDb();
    const tamperedService = createService(tamperedDb.db);
    await tamperedService.restoreExport(tamperedExport);
    await expect(tamperedService.recomputeIntegrity(10)).resolves.toBe(false);
  });

  it('keeps the vertical slice local and outside public routes', () => {
    expect(migrationPath).toContain('/migrations_experimental/');
    expect(governanceEvidenceRecordConstants.recordType).toBe('governance_evidence_record');
    expect(governanceEvidenceRecordConstants.chainScope).toBe('governance_evidence_record');
  });
});
