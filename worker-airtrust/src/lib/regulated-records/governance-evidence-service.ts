import { canonicalizeJson } from './canonical';
import { hashCanonicalPayload, sha256Hex } from './hash';

export type GovernanceEvidenceStatus = 'CAPTURED' | 'REVIEWED' | 'REPLACED_BY_ADDENDUM';

export type GovernanceEvidencePayload = {
  evidence_type: string;
  related_module: string;
  document_reference: string;
  description: string;
  internal_author: {
    user_id: number;
    name: string;
    role: string;
  };
  evidence_date: string;
  status: GovernanceEvidenceStatus;
  observations: string | null;
};

export type GovernanceEvidenceCreateInput = {
  empresaId: number;
  tenantId?: string | null;
  sourceEntityId?: string;
  payload: GovernanceEvidencePayload;
  createdBy: number;
  requestId?: string | null;
  nowIso: string;
};

export type GovernanceEvidenceAddendumInput = {
  empresaId: number;
  recordId: string;
  changes: Partial<Pick<GovernanceEvidencePayload, 'document_reference' | 'description' | 'evidence_date' | 'observations' | 'status'>>;
  addendumReason: string;
  createdBy: number;
  requestId?: string | null;
  nowIso: string;
};

export type GovernanceEvidenceVersion = {
  id: string;
  versionNumber: number;
  versionReason: string;
  baseVersionId: string | null;
  payload: GovernanceEvidencePayload;
  canonicalPayloadJson: string;
  payloadHash: string;
  recordHash: string;
};

export type GovernanceEvidenceRecord = {
  id: string;
  empresaId: number;
  tenantId: string | null;
  sourceEntityId: string;
  status: 'DRAFT' | 'SEALED' | 'SUPERSEDED' | 'VOIDED_BY_ADDENDUM';
  latestVersion: GovernanceEvidenceVersion;
  versions: GovernanceEvidenceVersion[];
  chainHead: {
    chainScope: string;
    lastChainSequence: number;
    lastEventHash: string | null;
    lastTenantChainHash: string | null;
  } | null;
};

export type GovernanceEvidenceLogicalExport = {
  regulated_records: Record<string, RegulatedSqlValue>[];
  regulated_record_versions: Record<string, RegulatedSqlValue>[];
  regulated_record_hashes: Record<string, RegulatedSqlValue>[];
  regulated_audit_events: Record<string, RegulatedSqlValue>[];
  regulated_chain_heads: Record<string, RegulatedSqlValue>[];
};

export type RegulatedSqlValue = string | number | null;

export type RegulatedRecordsLocalDatabase = {
  execute(sql: string, params?: readonly RegulatedSqlValue[]): Promise<{ changes?: number }>;
  query<T>(sql: string, params?: readonly RegulatedSqlValue[]): Promise<T[]>;
};

export class GovernanceEvidenceChainConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernanceEvidenceChainConflictError';
  }
}

const RECORD_TYPE = 'governance_evidence_record';
const MODULE = 'records_core_experiment';
const SOURCE_MODULE = 'governance_evidence_local';
const SOURCE_ENTITY_TYPE = 'governance_evidence_record';
const CHAIN_SCOPE = 'governance_evidence_record';
const CANONICAL_SCHEMA_VERSION = 'governance_evidence_record.v1';
const CANONICALIZATION_VERSION = 'canonicalizer.v1';

type ServiceOptions = {
  nextId?: (prefix: string) => string;
  beforeAuditInsert?: (attempt: { empresaId: number; chainScope: string; nextSequence: number }) => Promise<void>;
};

type RecordRow = {
  id: string;
  empresa_id: number;
  tenant_id: string | null;
  source_entity_id: string;
  status: GovernanceEvidenceRecord['status'];
};

type VersionRow = {
  id: string;
  version_number: number;
  version_reason: string;
  base_version_id: string | null;
  canonical_payload_json: string;
};

type HashRow = {
  version_id: string;
  payload_hash: string;
  record_hash: string;
  previous_record_hash: string | null;
  previous_tenant_chain_hash: string | null;
  tenant_chain_hash: string;
  chain_sequence: number;
};

type ChainHeadRow = {
  last_chain_sequence: number;
  last_event_hash: string | null;
  last_tenant_chain_hash: string | null;
};

type AuditEventRow = {
  chain_sequence: number;
  event_payload_json: string;
  previous_event_hash: string | null;
  event_hash: string;
  tenant_chain_hash: string;
};

export class GovernanceEvidenceRecordService {
  private idCounter = 0;

  constructor(
    private readonly db: RegulatedRecordsLocalDatabase,
    private readonly options: ServiceOptions = {},
  ) {}

  async createRecord(input: GovernanceEvidenceCreateInput): Promise<GovernanceEvidenceRecord> {
    const recordId = this.nextId('governance-evidence-record');
    const versionId = this.nextId('governance-evidence-version');
    const hashId = this.nextId('governance-evidence-hash');
    const sourceEntityId = input.sourceEntityId ?? recordId;
    const canonicalPayload = await this.canonicalPayload(input.payload);

    await this.db.execute(
      `INSERT INTO regulated_records (
        id, empresa_id, tenant_id, module, record_type, source_module, source_entity_type,
        source_entity_id, status, canonical_schema_version, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
      [
        recordId,
        input.empresaId,
        input.tenantId ?? null,
        MODULE,
        RECORD_TYPE,
        SOURCE_MODULE,
        SOURCE_ENTITY_TYPE,
        sourceEntityId,
        CANONICAL_SCHEMA_VERSION,
        input.createdBy,
        input.nowIso,
        input.nowIso,
      ],
    );

    await this.insertVersion({
      id: versionId,
      empresaId: input.empresaId,
      tenantId: input.tenantId ?? null,
      recordId,
      versionNumber: 1,
      versionReason: 'INITIAL_GOVERNANCE_EVIDENCE',
      baseVersionId: null,
      canonicalJson: canonicalPayload.canonicalJson,
      createdBy: input.createdBy,
      nowIso: input.nowIso,
    });

    const hash = await this.insertRecordHash({
      id: hashId,
      empresaId: input.empresaId,
      tenantId: input.tenantId ?? null,
      recordId,
      versionId,
      payloadHash: canonicalPayload.payloadHash,
      chainScope: CHAIN_SCOPE,
      createdBy: input.createdBy,
      nowIso: input.nowIso,
    });

    await this.appendAuditEvent({
      empresaId: input.empresaId,
      tenantId: input.tenantId ?? null,
      recordId,
      versionId,
      eventType: 'GOVERNANCE_EVIDENCE_CREATED',
      payload: {
        event: 'GOVERNANCE_EVIDENCE_CREATED',
        record_id: recordId,
        version_id: versionId,
        payload_hash: canonicalPayload.payloadHash,
        record_hash: hash.recordHash,
        request_id: input.requestId ?? null,
      },
      actorUserId: input.createdBy,
      nowIso: input.nowIso,
    });

    await this.db.execute(
      `UPDATE regulated_records
       SET status = 'SEALED', current_version_id = ?, sealed_by = ?, sealed_at = ?, updated_at = ?
       WHERE id = ? AND empresa_id = ?`,
      [versionId, input.createdBy, input.nowIso, input.nowIso, recordId, input.empresaId],
    );

    return this.getRecord(input.empresaId, recordId);
  }

  async addAddendum(input: GovernanceEvidenceAddendumInput): Promise<GovernanceEvidenceRecord> {
    const existing = await this.getRecord(input.empresaId, input.recordId);
    const latest = existing.latestVersion;
    const nextPayload: GovernanceEvidencePayload = {
      ...latest.payload,
      ...input.changes,
    };
    const versionNumber = latest.versionNumber + 1;
    const versionId = this.nextId('governance-evidence-version');
    const hashId = this.nextId('governance-evidence-hash');
    const canonicalPayload = await this.canonicalPayload(nextPayload);

    await this.insertVersion({
      id: versionId,
      empresaId: input.empresaId,
      tenantId: existing.tenantId,
      recordId: input.recordId,
      versionNumber,
      versionReason: input.addendumReason,
      baseVersionId: latest.id,
      canonicalJson: canonicalPayload.canonicalJson,
      createdBy: input.createdBy,
      nowIso: input.nowIso,
    });

    const hash = await this.insertRecordHash({
      id: hashId,
      empresaId: input.empresaId,
      tenantId: existing.tenantId,
      recordId: input.recordId,
      versionId,
      payloadHash: canonicalPayload.payloadHash,
      chainScope: CHAIN_SCOPE,
      createdBy: input.createdBy,
      nowIso: input.nowIso,
    });

    await this.appendAuditEvent({
      empresaId: input.empresaId,
      tenantId: existing.tenantId,
      recordId: input.recordId,
      versionId,
      eventType: 'GOVERNANCE_EVIDENCE_ADDENDUM',
      payload: {
        event: 'GOVERNANCE_EVIDENCE_ADDENDUM',
        record_id: input.recordId,
        version_id: versionId,
        base_version_id: latest.id,
        version_number: versionNumber,
        addendum_reason: input.addendumReason,
        payload_hash: canonicalPayload.payloadHash,
        record_hash: hash.recordHash,
        request_id: input.requestId ?? null,
      },
      actorUserId: input.createdBy,
      nowIso: input.nowIso,
    });

    return this.getRecord(input.empresaId, input.recordId);
  }

  async getRecord(empresaId: number, recordId: string): Promise<GovernanceEvidenceRecord> {
    const records = await this.db.query<RecordRow>(
      `SELECT id, empresa_id, tenant_id, source_entity_id, status
       FROM regulated_records
       WHERE id = ? AND empresa_id = ? AND record_type = ?`,
      [recordId, empresaId, RECORD_TYPE],
    );
    const record = records[0];
    if (!record) {
      throw new Error(`Governance evidence record not found: ${recordId}`);
    }

    const versions = await this.db.query<VersionRow>(
      `SELECT id, version_number, version_reason, base_version_id, canonical_payload_json
       FROM regulated_record_versions
       WHERE record_id = ? AND empresa_id = ?
       ORDER BY version_number`,
      [recordId, empresaId],
    );
    const hashes = await this.db.query<HashRow>(
      `SELECT version_id, payload_hash, record_hash, previous_record_hash, previous_tenant_chain_hash, tenant_chain_hash, chain_sequence
       FROM regulated_record_hashes
       WHERE record_id = ? AND empresa_id = ?
       ORDER BY chain_sequence`,
      [recordId, empresaId],
    );
    const hashByVersionId = new Map(hashes.map((hash) => [hash.version_id, hash]));
    const mappedVersions = versions.map((version) => {
      const hash = hashByVersionId.get(version.id);
      if (!hash) {
        throw new Error(`Missing hash row for governance evidence version: ${version.id}`);
      }

      return {
        id: version.id,
        versionNumber: version.version_number,
        versionReason: version.version_reason,
        baseVersionId: version.base_version_id,
        payload: this.parsePayload(version.canonical_payload_json),
        canonicalPayloadJson: version.canonical_payload_json,
        payloadHash: hash.payload_hash,
        recordHash: hash.record_hash,
      };
    });
    const latestVersion = mappedVersions.at(-1);
    if (!latestVersion) {
      throw new Error(`Governance evidence record has no versions: ${recordId}`);
    }

    const chainHead = await this.getChainHead(empresaId);

    return {
      id: record.id,
      empresaId: record.empresa_id,
      tenantId: record.tenant_id,
      sourceEntityId: record.source_entity_id,
      status: record.status,
      latestVersion,
      versions: mappedVersions,
      chainHead: chainHead
        ? {
            chainScope: CHAIN_SCOPE,
            lastChainSequence: chainHead.last_chain_sequence,
            lastEventHash: chainHead.last_event_hash,
            lastTenantChainHash: chainHead.last_tenant_chain_hash,
          }
        : null,
    };
  }

  async recomputeIntegrity(empresaId: number): Promise<boolean> {
    const hashRows = await this.db.query<
      HashRow & {
        record_id: string;
        record_type: string;
        canonical_payload_json: string;
      }
    >(
      `SELECT
         h.record_id,
         h.version_id,
         h.record_type,
         v.canonical_payload_json,
         h.payload_hash,
         h.record_hash,
         h.previous_record_hash,
         h.previous_tenant_chain_hash,
         h.tenant_chain_hash,
         h.chain_sequence
       FROM regulated_record_hashes h
       JOIN regulated_record_versions v ON v.id = h.version_id
       WHERE h.empresa_id = ? AND h.chain_scope = ?
       ORDER BY h.chain_sequence`,
      [empresaId, CHAIN_SCOPE],
    );

    let previousRecordHash: string | null = null;
    let previousRecordTenantChainHash: string | null = null;
    let expectedRecordSequence = 1;
    for (const row of hashRows) {
      const expectedPayloadHash = await sha256Hex(row.canonical_payload_json);
      const expectedRecordHash = await this.buildRecordHash({
        recordId: row.record_id,
        versionId: row.version_id,
        payloadHash: row.payload_hash,
      });
      const expectedTenantChainHash = await sha256Hex(`${previousRecordTenantChainHash ?? 'GENESIS'}:${row.record_hash}`);

      if (row.chain_sequence !== expectedRecordSequence) return false;
      if (row.payload_hash !== expectedPayloadHash) return false;
      if (row.record_hash !== expectedRecordHash) return false;
      if (row.previous_record_hash !== previousRecordHash) return false;
      if (row.previous_tenant_chain_hash !== previousRecordTenantChainHash) return false;
      if (row.tenant_chain_hash !== expectedTenantChainHash) return false;

      previousRecordHash = row.record_hash;
      previousRecordTenantChainHash = row.tenant_chain_hash;
      expectedRecordSequence += 1;
    }

    const events = await this.db.query<AuditEventRow>(
      `SELECT chain_sequence, event_payload_json, previous_event_hash, event_hash, tenant_chain_hash
       FROM regulated_audit_events
       WHERE empresa_id = ? AND chain_scope = ?
       ORDER BY chain_sequence`,
      [empresaId, CHAIN_SCOPE],
    );
    let previousEventHash: string | null = null;
    let previousEventTenantChainHash: string | null = null;
    let expectedEventSequence = 1;
    for (const event of events) {
      const expectedEventHash = await this.buildEventHash(previousEventHash, event.event_payload_json);
      const expectedTenantChainHash = await this.buildTenantChainHash(previousEventTenantChainHash, expectedEventHash);

      if (event.chain_sequence !== expectedEventSequence) return false;
      if (event.previous_event_hash !== previousEventHash) return false;
      if (event.event_hash !== expectedEventHash) return false;
      if (event.tenant_chain_hash !== expectedTenantChainHash) return false;

      previousEventHash = event.event_hash;
      previousEventTenantChainHash = event.tenant_chain_hash;
      expectedEventSequence += 1;
    }

    const chainHead = await this.getChainHead(empresaId);
    const lastEvent = events.at(-1);
    if (!lastEvent) return chainHead === null;

    return (
      chainHead !== null &&
      chainHead.last_chain_sequence === lastEvent.chain_sequence &&
      chainHead.last_event_hash === lastEvent.event_hash &&
      chainHead.last_tenant_chain_hash === lastEvent.tenant_chain_hash
    );
  }

  async exportRecord(empresaId: number, recordId: string): Promise<GovernanceEvidenceLogicalExport> {
    const records = await this.db.query<Record<string, RegulatedSqlValue>>(
      `SELECT * FROM regulated_records WHERE id = ? AND empresa_id = ? AND record_type = ?`,
      [recordId, empresaId, RECORD_TYPE],
    );
    const versions = await this.db.query<Record<string, RegulatedSqlValue>>(
      `SELECT * FROM regulated_record_versions WHERE record_id = ? AND empresa_id = ? ORDER BY version_number`,
      [recordId, empresaId],
    );
    const hashes = await this.db.query<Record<string, RegulatedSqlValue>>(
      `SELECT * FROM regulated_record_hashes WHERE record_id = ? AND empresa_id = ? ORDER BY chain_sequence`,
      [recordId, empresaId],
    );
    const events = await this.db.query<Record<string, RegulatedSqlValue>>(
      `SELECT * FROM regulated_audit_events WHERE record_id = ? AND empresa_id = ? ORDER BY chain_sequence`,
      [recordId, empresaId],
    );
    const chainHeads = await this.db.query<Record<string, RegulatedSqlValue>>(
      `SELECT * FROM regulated_chain_heads WHERE empresa_id = ? AND chain_scope = ?`,
      [empresaId, CHAIN_SCOPE],
    );

    return {
      regulated_records: records,
      regulated_record_versions: versions,
      regulated_record_hashes: hashes,
      regulated_audit_events: events,
      regulated_chain_heads: chainHeads,
    };
  }

  async restoreExport(logicalExport: GovernanceEvidenceLogicalExport): Promise<void> {
    for (const row of logicalExport.regulated_records) {
      await this.insertRow('regulated_records', {
        ...row,
        current_version_id: null,
        status: 'DRAFT',
        sealed_by: null,
        sealed_at: null,
      });
    }

    for (const table of ['regulated_record_versions', 'regulated_record_hashes', 'regulated_audit_events', 'regulated_chain_heads'] as const) {
      for (const row of logicalExport[table]) {
        await this.insertRow(table, row);
      }
    }

    for (const row of logicalExport.regulated_records) {
      await this.db.execute(
        `UPDATE regulated_records
         SET status = ?, current_version_id = ?, sealed_by = ?, sealed_at = ?, updated_at = ?
         WHERE id = ? AND empresa_id = ?`,
        [
          row.status,
          row.current_version_id,
          row.sealed_by,
          row.sealed_at,
          row.updated_at,
          row.id,
          row.empresa_id,
        ],
      );
    }
  }

  private async insertVersion(input: {
    id: string;
    empresaId: number;
    tenantId: string | null;
    recordId: string;
    versionNumber: number;
    versionReason: string;
    baseVersionId: string | null;
    canonicalJson: string;
    createdBy: number;
    nowIso: string;
  }) {
    await this.db.execute(
      `INSERT INTO regulated_record_versions (
        id, empresa_id, tenant_id, record_id, version_number, version_reason, base_version_id,
        canonical_payload_json, canonical_payload_size, canonical_schema_version,
        canonicalization_version, status, created_by, created_at, sealed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEALED', ?, ?, ?)`,
      [
        input.id,
        input.empresaId,
        input.tenantId,
        input.recordId,
        input.versionNumber,
        input.versionReason,
        input.baseVersionId,
        input.canonicalJson,
        input.canonicalJson.length,
        CANONICAL_SCHEMA_VERSION,
        CANONICALIZATION_VERSION,
        input.createdBy,
        input.nowIso,
        input.nowIso,
      ],
    );
  }

  private async insertRecordHash(input: {
    id: string;
    empresaId: number;
    tenantId: string | null;
    recordId: string;
    versionId: string;
    payloadHash: string;
    chainScope: string;
    createdBy: number;
    nowIso: string;
  }) {
    const previousRows = await this.db.query<{
      record_hash: string;
      tenant_chain_hash: string;
      chain_sequence: number;
    }>(
      `SELECT record_hash, tenant_chain_hash, chain_sequence
       FROM regulated_record_hashes
       WHERE empresa_id = ? AND chain_scope = ?
       ORDER BY chain_sequence DESC
       LIMIT 1`,
      [input.empresaId, input.chainScope],
    );
    const previous = previousRows[0] ?? null;
    const recordHash = await this.buildRecordHash({
      recordId: input.recordId,
      versionId: input.versionId,
      payloadHash: input.payloadHash,
    });
    const tenantChainHash = await sha256Hex(`${previous?.tenant_chain_hash ?? 'GENESIS'}:${recordHash}`);
    const chainSequence = (previous?.chain_sequence ?? 0) + 1;

    await this.db.execute(
      `INSERT INTO regulated_record_hashes (
        id, empresa_id, tenant_id, record_id, version_id, record_type, canonicalization_version,
        canonical_schema_version, payload_hash, record_hash, previous_record_hash,
        previous_tenant_chain_hash, tenant_chain_hash, chain_scope, chain_sequence, computed_by, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.empresaId,
        input.tenantId,
        input.recordId,
        input.versionId,
        RECORD_TYPE,
        CANONICALIZATION_VERSION,
        CANONICAL_SCHEMA_VERSION,
        input.payloadHash,
        recordHash,
        previous?.record_hash ?? null,
        previous?.tenant_chain_hash ?? null,
        tenantChainHash,
        input.chainScope,
        chainSequence,
        input.createdBy,
        input.nowIso,
      ],
    );

    return { recordHash, tenantChainHash, chainSequence };
  }

  private async appendAuditEvent(input: {
    empresaId: number;
    tenantId: string | null;
    recordId: string;
    versionId: string;
    eventType: string;
    payload: Record<string, unknown>;
    actorUserId: number;
    nowIso: string;
  }) {
    const head = await this.getChainHead(input.empresaId);
    const nextSequence = (head?.last_chain_sequence ?? 0) + 1;
    const eventPayloadJson = canonicalizeJson(input.payload);
    const eventHash = await this.buildEventHash(head?.last_event_hash ?? null, eventPayloadJson);
    const tenantChainHash = await this.buildTenantChainHash(head?.last_tenant_chain_hash ?? null, eventHash);
    const eventId = this.nextId('governance-evidence-event');

    await this.options.beforeAuditInsert?.({
      empresaId: input.empresaId,
      chainScope: CHAIN_SCOPE,
      nextSequence,
    });

    try {
      await this.db.execute(
        `INSERT INTO regulated_audit_events (
          id, empresa_id, tenant_id, record_id, version_id, event_type, event_category,
          actor_user_id, actor_type, request_id, event_payload_json, previous_event_hash,
          event_hash, tenant_chain_hash, chain_scope, chain_sequence, canonical_schema_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'GOVERNANCE_EVIDENCE_RECORD', ?, 'system', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          input.empresaId,
          input.tenantId,
          input.recordId,
          input.versionId,
          input.eventType,
          input.actorUserId,
          eventPayloadJson,
          head?.last_event_hash ?? null,
          eventHash,
          tenantChainHash,
          CHAIN_SCOPE,
          nextSequence,
          CANONICAL_SCHEMA_VERSION,
          input.nowIso,
        ],
      );
    } catch (error) {
      throw new GovernanceEvidenceChainConflictError(`Audit event append failed for ${CHAIN_SCOPE}: ${String(error)}`);
    }

    if (!head) {
      try {
        await this.db.execute(
          `INSERT INTO regulated_chain_heads (
            id, empresa_id, tenant_id, chain_scope, last_chain_sequence, last_event_hash,
            last_tenant_chain_hash, updated_by, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.nextId('governance-evidence-chain-head'),
            input.empresaId,
            input.tenantId,
            CHAIN_SCOPE,
            nextSequence,
            eventHash,
            tenantChainHash,
            input.actorUserId,
            input.nowIso,
          ],
        );
      } catch (error) {
        throw new GovernanceEvidenceChainConflictError(`Chain head insert failed for ${CHAIN_SCOPE}: ${String(error)}`);
      }
      return;
    }

    const result = await this.db.execute(
      `UPDATE regulated_chain_heads
       SET last_chain_sequence = ?, last_event_hash = ?, last_tenant_chain_hash = ?, updated_by = ?, updated_at = ?
       WHERE empresa_id = ?
         AND chain_scope = ?
         AND last_chain_sequence = ?
         AND last_event_hash = ?`,
      [
        nextSequence,
        eventHash,
        tenantChainHash,
        input.actorUserId,
        input.nowIso,
        input.empresaId,
        CHAIN_SCOPE,
        head.last_chain_sequence,
        head.last_event_hash,
      ],
    );

    if (result.changes !== undefined && result.changes !== 1) {
      throw new GovernanceEvidenceChainConflictError(`Stale chain head for ${CHAIN_SCOPE}; retry with a fresh head`);
    }
  }

  private async canonicalPayload(payload: GovernanceEvidencePayload) {
    return hashCanonicalPayload({
      canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      payload,
    });
  }

  private async buildRecordHash(input: { recordId: string; versionId: string; payloadHash: string }) {
    return sha256Hex(
      canonicalizeJson({
        attachments_manifest_hash: null,
        canonical_schema_version: CANONICAL_SCHEMA_VERSION,
        canonicalization_version: CANONICALIZATION_VERSION,
        payload_hash: input.payloadHash,
        record_id: input.recordId,
        record_type: RECORD_TYPE,
        version_id: input.versionId,
      }),
    );
  }

  private async buildEventHash(previousEventHash: string | null, payload: string) {
    return sha256Hex(`${previousEventHash ?? 'GENESIS'}:${payload}`);
  }

  private async buildTenantChainHash(previousTenantChainHash: string | null, eventHash: string) {
    return sha256Hex(`${previousTenantChainHash ?? 'GENESIS'}:${eventHash}`);
  }

  private parsePayload(canonicalPayloadJson: string): GovernanceEvidencePayload {
    const envelope = JSON.parse(canonicalPayloadJson) as { payload: GovernanceEvidencePayload };
    return envelope.payload;
  }

  private async getChainHead(empresaId: number): Promise<ChainHeadRow | null> {
    const rows = await this.db.query<ChainHeadRow>(
      `SELECT last_chain_sequence, last_event_hash, last_tenant_chain_hash
       FROM regulated_chain_heads
       WHERE empresa_id = ? AND chain_scope = ?`,
      [empresaId, CHAIN_SCOPE],
    );
    return rows[0] ?? null;
  }

  private async insertRow(table: keyof GovernanceEvidenceLogicalExport, row: Record<string, RegulatedSqlValue>) {
    const columns = Object.keys(row);
    const placeholders = columns.map(() => '?').join(', ');
    await this.db.execute(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      columns.map((column) => row[column]),
    );
  }

  private nextId(prefix: string) {
    if (this.options.nextId) return this.options.nextId(prefix);
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }
}

export const governanceEvidenceRecordConstants = {
  recordType: RECORD_TYPE,
  chainScope: CHAIN_SCOPE,
  canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
  canonicalizationVersion: CANONICALIZATION_VERSION,
} as const;
