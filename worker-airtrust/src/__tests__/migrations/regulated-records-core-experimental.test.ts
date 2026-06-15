import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalizeJson } from '../../lib/regulated-records/canonical';
import { hashCanonicalPayload, sha256Hex } from '../../lib/regulated-records/hash';

type SqliteRow = Record<string, string | number | null>;

type TableColumn = {
  name: string;
};

type NamedSchemaObject = {
  name: string;
};

type SqliteHandle = ReturnType<typeof createDb>;

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations_experimental/0410_experimental_regulated_records_core.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

const requiredTables = [
  'regulated_records',
  'regulated_record_versions',
  'regulated_record_hashes',
  'regulated_audit_events',
  'regulated_chain_heads',
  'regulated_record_links',
];

const requiredIndexes = [
  'idx_regulated_records_empresa_type_status_created',
  'idx_regulated_records_empresa_source',
  'idx_regulated_records_empresa_aircraft_period',
  'idx_regulated_records_empresa_person_period',
  'idx_regulated_records_empresa_sealed',
  'idx_regulated_versions_empresa_record_version',
  'idx_regulated_versions_empresa_schema_created',
  'idx_regulated_versions_empresa_status_created',
  'idx_regulated_hashes_empresa_record_computed',
  'idx_regulated_hashes_empresa_chain_sequence',
  'idx_regulated_hashes_empresa_type_computed',
  'idx_regulated_hashes_payload',
  'idx_regulated_hashes_record_hash',
  'idx_regulated_audit_empresa_record_created',
  'idx_regulated_audit_empresa_type_created',
  'idx_regulated_audit_empresa_actor_created',
  'idx_regulated_audit_empresa_chain_sequence',
  'idx_regulated_audit_request',
  'idx_regulated_chain_heads_empresa_scope',
  'idx_regulated_links_empresa_source_type',
  'idx_regulated_links_empresa_target_type',
  'idx_regulated_links_empresa_type_created',
];

const requiredTriggers = [
  'trg_regulated_records_no_update_after_seal',
  'trg_regulated_records_no_delete_after_seal',
  'trg_regulated_records_no_soft_delete_when_sealed',
  'trg_regulated_records_current_version_same_empresa_insert',
  'trg_regulated_records_current_version_same_empresa_update',
  'trg_regulated_versions_no_update_after_seal',
  'trg_regulated_versions_no_delete_after_seal',
  'trg_regulated_versions_no_soft_delete_when_sealed',
  'trg_regulated_versions_same_empresa_insert',
  'trg_regulated_versions_same_empresa_update',
  'trg_regulated_hashes_same_empresa_insert',
  'trg_regulated_hashes_same_empresa_update',
  'trg_regulated_hashes_no_update',
  'trg_regulated_hashes_no_delete',
  'trg_regulated_audit_no_update',
  'trg_regulated_audit_no_delete',
  'trg_regulated_audit_refs_same_empresa_insert',
  'trg_regulated_audit_refs_same_empresa_update',
  'trg_regulated_chain_heads_matches_audit_insert',
  'trg_regulated_chain_heads_no_rewind',
  'trg_regulated_chain_heads_matches_audit_update',
  'trg_regulated_chain_heads_no_delete',
  'trg_regulated_links_same_empresa_insert',
  'trg_regulated_links_same_empresa_update',
  'trg_regulated_links_no_update_active',
  'trg_regulated_links_no_delete_active',
];

const triggerPolicyByTable: Record<string, readonly string[]> = {
  regulated_audit_events: [
    'trg_regulated_audit_no_update',
    'trg_regulated_audit_no_delete',
    'trg_regulated_audit_refs_same_empresa_insert',
    'trg_regulated_audit_refs_same_empresa_update',
  ],
  regulated_chain_heads: [
    'trg_regulated_chain_heads_matches_audit_insert',
    'trg_regulated_chain_heads_no_rewind',
    'trg_regulated_chain_heads_matches_audit_update',
    'trg_regulated_chain_heads_no_delete',
  ],
  regulated_record_hashes: [
    'trg_regulated_hashes_same_empresa_insert',
    'trg_regulated_hashes_same_empresa_update',
    'trg_regulated_hashes_no_update',
    'trg_regulated_hashes_no_delete',
  ],
  regulated_record_links: [
    'trg_regulated_links_same_empresa_insert',
    'trg_regulated_links_same_empresa_update',
    'trg_regulated_links_no_update_active',
    'trg_regulated_links_no_delete_active',
  ],
  regulated_record_versions: [
    'trg_regulated_versions_no_update_after_seal',
    'trg_regulated_versions_no_delete_after_seal',
    'trg_regulated_versions_no_soft_delete_when_sealed',
    'trg_regulated_versions_same_empresa_insert',
    'trg_regulated_versions_same_empresa_update',
  ],
  regulated_records: [
    'trg_regulated_records_no_update_after_seal',
    'trg_regulated_records_no_delete_after_seal',
    'trg_regulated_records_no_soft_delete_when_sealed',
    'trg_regulated_records_current_version_same_empresa_insert',
    'trg_regulated_records_current_version_same_empresa_update',
  ],
};

const hexA = 'a'.repeat(64);
const hexB = 'b'.repeat(64);
const hexC = 'c'.repeat(64);
const hexD = 'd'.repeat(64);

const frozenCanonicalizationVectors = [
  {
    name: 'nested object with ISO date string, nulls, arrays, Unicode NFC, volatile fields and sorted keys',
    input: {
      z: null,
      request_id: 'req-local-1',
      a: {
        values: [3, null, { b: 'Cafe\u0301', a: true }],
        updated_at: '2026-06-14T11:00:00.000Z',
        date_utc: '2026-06-14T00:00:00.000Z',
        nested: {
          second: ['A', 'B'],
          first: null,
        },
      },
      updated_at: '2026-06-14T10:00:00.000Z',
    },
    expectedCanonicalJson:
      '{"a":{"date_utc":"2026-06-14T00:00:00.000Z","nested":{"first":null,"second":["A","B"]},"values":[3,null,{"a":true,"b":"Café"}]},"z":null}',
    expectedSha256: 'ef09c5b4351aa5213e85ecb4847677181adaa0c4bdbd0290445ce0f1d11c7bc8',
  },
] as const;

const tempDirs: string[] = [];

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function createDb() {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-regulated-core-'));
  const databasePath = join(tempDir, 'schema.sqlite');
  tempDirs.push(tempDir);

  function sqlite(sql: string): string {
    const result = spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  function sqliteResult(sql: string) {
    return spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });
  }

  function queryJson<T extends SqliteRow>(sql: string): T[] {
    const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
  }

  sqlite(migrationSql);

  return { databasePath, sqlite, sqliteResult, queryJson };
}

function expectSqlFailure(result: ReturnType<typeof spawnSync>, message: string) {
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
}

function insertRecord(sqlite: (sql: string) => string, id: string, empresaId: number, status = 'DRAFT') {
  sqlite(`
    INSERT INTO regulated_records (
      id, empresa_id, module, record_type, source_module, source_entity_type,
      source_entity_id, status, canonical_schema_version, created_by, sealed_at
    ) VALUES (
      ${sqlString(id)}, ${empresaId}, 'records_core_experiment', 'EXPERIMENTAL_RECORD',
      'test', 'fixture', ${sqlString(id)}, ${sqlString(status)}, 'exp.schema.v1', 101,
      ${status === 'SEALED' ? "'2026-06-14T00:00:00.000Z'" : 'NULL'}
    );
  `);
}

function insertVersion(
  sqlite: (sql: string) => string,
  input: {
    id: string;
    empresaId: number;
    recordId: string;
    versionNumber: number;
    payload: string;
    status?: 'DRAFT' | 'SEALED';
    baseVersionId?: string | null;
    reason?: string;
  },
) {
  sqlite(`
    INSERT INTO regulated_record_versions (
      id, empresa_id, record_id, version_number, version_reason, base_version_id,
      canonical_payload_json, canonical_payload_size, canonical_schema_version,
      canonicalization_version, status, created_by, sealed_at
    ) VALUES (
      ${sqlString(input.id)}, ${input.empresaId}, ${sqlString(input.recordId)}, ${input.versionNumber},
      ${sqlString(input.reason ?? 'INITIAL_SEAL')},
      ${input.baseVersionId ? sqlString(input.baseVersionId) : 'NULL'},
      ${sqlString(input.payload)}, ${input.payload.length}, 'exp.schema.v1',
      'canonicalizer.v1', ${sqlString(input.status ?? 'SEALED')}, 101,
      ${(input.status ?? 'SEALED') === 'SEALED' ? "'2026-06-14T00:00:00.000Z'" : 'NULL'}
    );
  `);
}

async function buildRecordHash(input: {
  recordId: string;
  versionId: string;
  recordType: string;
  payloadHash: string;
  attachmentsManifestHash?: string | null;
  canonicalSchemaVersion?: string;
  canonicalizationVersion?: string;
}) {
  return sha256Hex(
    canonicalizeJson({
      attachments_manifest_hash: input.attachmentsManifestHash ?? null,
      canonical_schema_version: input.canonicalSchemaVersion ?? 'exp.schema.v1',
      canonicalization_version: input.canonicalizationVersion ?? 'canonicalizer.v1',
      payload_hash: input.payloadHash,
      record_id: input.recordId,
      record_type: input.recordType,
      version_id: input.versionId,
    }),
  );
}

async function insertRecordHash(
  sqlite: (sql: string) => string,
  input: {
    id: string;
    empresaId: number;
    recordId: string;
    versionId: string;
    recordType: string;
    payloadHash: string;
    chainScope: string;
    chainSequence: number;
    previousRecordHash?: string | null;
    previousTenantChainHash?: string | null;
  },
) {
  const recordHash = await buildRecordHash(input);
  const tenantChainHash = await sha256Hex(`${input.previousTenantChainHash ?? 'GENESIS'}:${recordHash}`);

  sqlite(`
    INSERT INTO regulated_record_hashes (
      id, empresa_id, record_id, version_id, record_type, canonicalization_version,
      canonical_schema_version, payload_hash, record_hash, previous_record_hash,
      previous_tenant_chain_hash, tenant_chain_hash, chain_scope, chain_sequence, computed_by
    ) VALUES (
      ${sqlString(input.id)}, ${input.empresaId}, ${sqlString(input.recordId)}, ${sqlString(input.versionId)},
      ${sqlString(input.recordType)}, 'canonicalizer.v1', 'exp.schema.v1',
      ${sqlString(input.payloadHash)}, ${sqlString(recordHash)},
      ${input.previousRecordHash ? sqlString(input.previousRecordHash) : 'NULL'},
      ${input.previousTenantChainHash ? sqlString(input.previousTenantChainHash) : 'NULL'},
      ${sqlString(tenantChainHash)}, ${sqlString(input.chainScope)}, ${input.chainSequence}, 101
    );
  `);

  return { recordHash, tenantChainHash };
}

async function buildEventHash(previousEventHash: string | null, payload: string) {
  return sha256Hex(`${previousEventHash ?? 'GENESIS'}:${payload}`);
}

async function buildTenantChainHash(previousTenantChainHash: string | null, eventHash: string) {
  return sha256Hex(`${previousTenantChainHash ?? 'GENESIS'}:${eventHash}`);
}

async function insertAuditEvent(
  sqlite: (sql: string) => string,
  input: {
    id: string;
    empresaId: number;
    chainScope: string;
    chainSequence: number;
    payload: string;
    previousEventHash: string | null;
    previousTenantChainHash: string | null;
    recordId?: string;
    versionId?: string;
  },
) {
  const eventHash = await buildEventHash(input.previousEventHash, input.payload);
  const tenantChainHash = await buildTenantChainHash(input.previousTenantChainHash, eventHash);

  sqlite(`
    INSERT INTO regulated_audit_events (
      id, empresa_id, record_id, version_id, event_type, event_category, actor_type,
      event_payload_json, previous_event_hash, event_hash, tenant_chain_hash,
      chain_scope, chain_sequence, canonical_schema_version
    ) VALUES (
      ${sqlString(input.id)}, ${input.empresaId},
      ${input.recordId ? sqlString(input.recordId) : 'NULL'},
      ${input.versionId ? sqlString(input.versionId) : 'NULL'},
      'TEST_EVENT', 'REGULATED_RECORDS_CORE', 'system',
      ${sqlString(input.payload)},
      ${input.previousEventHash ? sqlString(input.previousEventHash) : 'NULL'},
      ${sqlString(eventHash)}, ${sqlString(tenantChainHash)},
      ${sqlString(input.chainScope)}, ${input.chainSequence}, 'exp.schema.v1'
    );
  `);

  return { eventHash, tenantChainHash };
}

async function verifyEventChain(rows: { chain_sequence: number; event_payload_json: string; previous_event_hash: string | null; event_hash: string }[]) {
  let previousEventHash: string | null = null;
  let expectedSequence = 1;

  for (const row of rows) {
    if (row.chain_sequence !== expectedSequence) return false;
    if (row.previous_event_hash !== previousEventHash) return false;
    if (row.event_hash !== (await buildEventHash(previousEventHash, row.event_payload_json))) return false;

    previousEventHash = row.event_hash;
    expectedSequence += 1;
  }

  return true;
}

function advanceChainHead(
  sqlite: (sql: string) => string,
  input: {
    empresaId: number;
    chainScope: string;
    expectedSequence: number;
    expectedEventHash: string;
    nextSequence: number;
    nextEventHash: string;
    nextTenantChainHash: string;
  },
) {
  return Number(
    sqlite(`
      UPDATE regulated_chain_heads
      SET
        last_chain_sequence = ${input.nextSequence},
        last_event_hash = ${sqlString(input.nextEventHash)},
        last_tenant_chain_hash = ${sqlString(input.nextTenantChainHash)},
        updated_by = 101,
        updated_at = '2026-06-14T00:00:00.000Z'
      WHERE empresa_id = ${input.empresaId}
        AND chain_scope = ${sqlString(input.chainScope)}
        AND last_chain_sequence = ${input.expectedSequence}
        AND last_event_hash = ${sqlString(input.expectedEventHash)};

      SELECT changes();
    `),
  );
}

function dumpDatabase(databasePath: string) {
  const result = spawnSync('sqlite3', [databasePath], {
    input: '.dump\n',
    encoding: 'utf8',
  });

  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function restoreDumpToTempDb(dumpSql: string) {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-regulated-core-restore-'));
  const databasePath = join(tempDir, 'restore.sqlite');
  tempDirs.push(tempDir);

  const result = spawnSync('sqlite3', [databasePath], {
    input: dumpSql,
    encoding: 'utf8',
  });

  expect(result.status, result.stderr).toBe(0);

  function queryJson<T extends SqliteRow>(sql: string): T[] {
    const queryResult = spawnSync('sqlite3', ['-json', databasePath, sql], {
      encoding: 'utf8',
    });

    expect(queryResult.status, queryResult.stderr).toBe(0);
    return queryResult.stdout.trim() ? (JSON.parse(queryResult.stdout) as T[]) : [];
  }

  return { databasePath, queryJson };
}

async function verifyRestoredCoreHashes(queryJson: SqliteHandle['queryJson']) {
  const hashRows = queryJson<{
    record_id: string;
    version_id: string;
    record_type: string;
    canonical_payload_json: string;
    payload_hash: string;
    record_hash: string;
    previous_tenant_chain_hash: string | null;
    tenant_chain_hash: string;
    chain_sequence: number;
  }>(
    `SELECT
       h.record_id,
       h.version_id,
       h.record_type,
       v.canonical_payload_json,
       h.payload_hash,
       h.record_hash,
       h.previous_tenant_chain_hash,
       h.tenant_chain_hash,
       h.chain_sequence
     FROM regulated_record_hashes h
     JOIN regulated_record_versions v ON v.id = h.version_id
     ORDER BY h.chain_sequence;`,
  );

  let previousRecordTenantChainHash: string | null = null;
  for (const row of hashRows) {
    const expectedPayloadHash = await sha256Hex(row.canonical_payload_json);
    const expectedRecordHash = await buildRecordHash({
      recordId: row.record_id,
      versionId: row.version_id,
      recordType: row.record_type,
      payloadHash: row.payload_hash,
    });
    const expectedTenantChainHash = await sha256Hex(`${previousRecordTenantChainHash ?? 'GENESIS'}:${row.record_hash}`);

    if (row.payload_hash !== expectedPayloadHash) return false;
    if (row.record_hash !== expectedRecordHash) return false;
    if (row.previous_tenant_chain_hash !== previousRecordTenantChainHash) return false;
    if (row.tenant_chain_hash !== expectedTenantChainHash) return false;

    previousRecordTenantChainHash = row.tenant_chain_hash;
  }

  const auditRows = queryJson<{
    chain_sequence: number;
    event_payload_json: string;
    previous_event_hash: string | null;
    event_hash: string;
    tenant_chain_hash: string;
  }>(
    `SELECT chain_sequence, event_payload_json, previous_event_hash, event_hash, tenant_chain_hash
     FROM regulated_audit_events
     WHERE empresa_id = 10 AND chain_scope = 'EXPERIMENTAL_RECORD'
     ORDER BY chain_sequence;`,
  );

  let previousEventHash: string | null = null;
  let previousTenantChainHash: string | null = null;
  for (const row of auditRows) {
    const expectedEventHash = await buildEventHash(previousEventHash, row.event_payload_json);
    const expectedTenantChainHash = await buildTenantChainHash(previousTenantChainHash, expectedEventHash);

    if (row.previous_event_hash !== previousEventHash) return false;
    if (row.event_hash !== expectedEventHash) return false;
    if (row.tenant_chain_hash !== expectedTenantChainHash) return false;

    previousEventHash = row.event_hash;
    previousTenantChainHash = row.tenant_chain_hash;
  }

  const chainHeads = queryJson<{
    last_chain_sequence: number;
    last_event_hash: string | null;
    last_tenant_chain_hash: string | null;
  }>(
    `SELECT last_chain_sequence, last_event_hash, last_tenant_chain_hash
     FROM regulated_chain_heads
     WHERE empresa_id = 10 AND chain_scope = 'EXPERIMENTAL_RECORD';`,
  );
  const lastAuditRow = auditRows.at(-1);

  return (
    chainHeads.length === 1 &&
    lastAuditRow !== undefined &&
    chainHeads[0].last_chain_sequence === lastAuditRow.chain_sequence &&
    chainHeads[0].last_event_hash === lastAuditRow.event_hash &&
    chainHeads[0].last_tenant_chain_hash === lastAuditRow.tenant_chain_hash
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('migration 0410 experimental regulated records core', () => {
  it('loads the SQL from the experimental migrations folder only', () => {
    expect(migrationPath).toContain('/migrations_experimental/');
    expect(migrationPath).not.toContain('/migrations/');
  });

  it('creates the regulated local candidate tables with empresa_id on every table', () => {
    const { queryJson } = createDb();

    const tables = queryJson<NamedSchemaObject>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'regulated_%' ORDER BY name;",
    ).map(({ name }) => name);

    expect(tables).toEqual([...requiredTables].sort());

    for (const table of requiredTables) {
      const columns = queryJson<TableColumn>(`PRAGMA table_info(${table});`).map(({ name }) => name);
      expect(columns).toContain('empresa_id');
    }
  });

  it('creates the required tenant-first indexes and immutability triggers', () => {
    const { queryJson } = createDb();

    const indexes = queryJson<NamedSchemaObject>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_regulated_%' ORDER BY name;",
    ).map(({ name }) => name);
    const triggers = queryJson<NamedSchemaObject>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_regulated_%' ORDER BY name;",
    ).map(({ name }) => name);

    expect(indexes).toEqual(expect.arrayContaining(requiredIndexes));
    expect(triggers).toEqual(expect.arrayContaining(requiredTriggers));
  });

  it('requires an explicit trigger policy for every experimental regulated table', () => {
    const { queryJson } = createDb();

    const tables = queryJson<NamedSchemaObject>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'regulated_%' ORDER BY name;",
    ).map(({ name }) => name);
    const triggers = queryJson<{ name: string; tbl_name: string }>(
      "SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_regulated_%' ORDER BY name;",
    );

    expect(Object.keys(triggerPolicyByTable).sort()).toEqual(tables);

    for (const table of tables) {
      const tableTriggers = triggers.filter(({ tbl_name }) => tbl_name === table).map(({ name }) => name);
      expect(tableTriggers).toEqual(expect.arrayContaining([...triggerPolicyByTable[table]]));
    }
  });

  it('blocks UPDATE and DELETE on sealed versions', () => {
    const { sqlite, sqliteResult } = createDb();
    insertRecord(sqlite, 'record-immutability', 10, 'SEALED');
    insertVersion(sqlite, {
      id: 'version-immutability',
      empresaId: 10,
      recordId: 'record-immutability',
      versionNumber: 1,
      payload: '{"value":"original"}',
    });

    expectSqlFailure(
      sqliteResult("UPDATE regulated_record_versions SET canonical_payload_json = '{\"value\":\"changed\"}' WHERE id = 'version-immutability';"),
      'regulated_record_versions: sealed versions are immutable',
    );
    expectSqlFailure(
      sqliteResult("DELETE FROM regulated_record_versions WHERE id = 'version-immutability';"),
      'regulated_record_versions: sealed versions cannot be deleted',
    );
  });

  it('blocks UPDATE and DELETE on audit events', async () => {
    const { sqlite, sqliteResult } = createDb();
    await insertAuditEvent(sqlite, {
      id: 'event-immutability',
      empresaId: 10,
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 1,
      payload: '{"event":"created"}',
      previousEventHash: null,
      previousTenantChainHash: null,
    });

    expectSqlFailure(
      sqliteResult("UPDATE regulated_audit_events SET event_payload_json = '{\"event\":\"changed\"}' WHERE id = 'event-immutability';"),
      'regulated_audit_events: ledger rows are append-only',
    );
    expectSqlFailure(
      sqliteResult("DELETE FROM regulated_audit_events WHERE id = 'event-immutability';"),
      'regulated_audit_events: ledger rows cannot be deleted',
    );
  });

  it('blocks hash row mutation and deletion', () => {
    const { sqlite, sqliteResult } = createDb();
    insertRecord(sqlite, 'record-hash', 10, 'SEALED');
    insertVersion(sqlite, {
      id: 'version-hash',
      empresaId: 10,
      recordId: 'record-hash',
      versionNumber: 1,
      payload: '{"value":"original"}',
    });

    sqlite(`
      INSERT INTO regulated_record_hashes (
        id, empresa_id, record_id, version_id, record_type, canonicalization_version,
        canonical_schema_version, payload_hash, record_hash, tenant_chain_hash,
        chain_scope, chain_sequence, computed_by
      ) VALUES (
        'hash-1', 10, 'record-hash', 'version-hash', 'EXPERIMENTAL_RECORD',
        'canonicalizer.v1', 'exp.schema.v1', '${hexA}', '${hexB}', '${hexC}',
        'EXPERIMENTAL_RECORD', 1, 101
      );
    `);

    expectSqlFailure(
      sqliteResult(`UPDATE regulated_record_hashes SET payload_hash = '${hexD}' WHERE id = 'hash-1';`),
      'regulated_record_hashes: hash rows are append-only',
    );
    expectSqlFailure(
      sqliteResult("DELETE FROM regulated_record_hashes WHERE id = 'hash-1';"),
      'regulated_record_hashes: hash rows cannot be deleted',
    );
  });

  it('blocks cross-tenant record, version, hash and audit references', () => {
    const { sqlite, sqliteResult } = createDb();
    insertRecord(sqlite, 'record-tenant-a', 10);
    insertRecord(sqlite, 'record-tenant-b', 11);
    insertVersion(sqlite, {
      id: 'version-tenant-b',
      empresaId: 11,
      recordId: 'record-tenant-b',
      versionNumber: 1,
      payload: '{"value":"tenant-b"}',
    });

    expectSqlFailure(
      sqliteResult("UPDATE regulated_records SET current_version_id = 'version-tenant-b' WHERE id = 'record-tenant-a';"),
      'regulated_records: current_version_id must belong to the same record and empresa_id',
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_record_versions (
          id, empresa_id, record_id, version_number, version_reason,
          canonical_payload_json, canonical_payload_size, canonical_schema_version,
          canonicalization_version, status, created_by
        ) VALUES (
          'version-cross-tenant', 11, 'record-tenant-a', 1, 'INITIAL_SEAL',
          '{"value":"wrong-tenant"}', 24, 'exp.schema.v1', 'canonicalizer.v1', 'SEALED', 101
        );
      `),
      'regulated_record_versions: record_id and base_version_id must belong to version empresa_id',
    );

    insertVersion(sqlite, {
      id: 'version-tenant-a',
      empresaId: 10,
      recordId: 'record-tenant-a',
      versionNumber: 1,
      payload: '{"value":"tenant-a"}',
    });

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_record_versions (
          id, empresa_id, record_id, version_number, version_reason, base_version_id,
          canonical_payload_json, canonical_payload_size, canonical_schema_version,
          canonicalization_version, status, created_by
        ) VALUES (
          'version-base-cross-tenant', 11, 'record-tenant-b', 2, 'ADDENDUM_CORRECTION', 'version-tenant-a',
          '{"value":"wrong-base"}', 22, 'exp.schema.v1', 'canonicalizer.v1', 'SEALED', 101
        );
      `),
      'regulated_record_versions: record_id and base_version_id must belong to version empresa_id',
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_record_hashes (
          id, empresa_id, record_id, version_id, record_type, canonicalization_version,
          canonical_schema_version, payload_hash, record_hash, tenant_chain_hash,
          chain_scope, chain_sequence, computed_by
        ) VALUES (
          'hash-cross-tenant', 11, 'record-tenant-a', 'version-tenant-a', 'EXPERIMENTAL_RECORD',
          'canonicalizer.v1', 'exp.schema.v1', '${hexA}', '${hexB}', '${hexC}',
          'EXPERIMENTAL_RECORD', 1, 101
        );
      `),
      'regulated_record_hashes: record_id and version_id must belong to hash empresa_id',
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_audit_events (
          id, empresa_id, record_id, version_id, event_type, event_category, actor_type,
          event_payload_json, event_hash, tenant_chain_hash, chain_scope, chain_sequence
        ) VALUES (
          'event-cross-tenant', 11, 'record-tenant-a', 'version-tenant-a',
          'TEST_EVENT', 'REGULATED_RECORDS_CORE', 'system',
          '{"event":"wrong-tenant"}', '${hexA}', '${hexB}', 'EXPERIMENTAL_RECORD', 1
        );
      `),
      'regulated_audit_events: record_id and version_id must belong to event empresa_id',
    );
  });

  it('enforces monotonic sequence uniqueness per empresa_id and chain_scope', async () => {
    const { sqlite, sqliteResult } = createDb();
    const first = await insertAuditEvent(sqlite, {
      id: 'event-seq-1',
      empresaId: 10,
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 1,
      payload: '{"event":"created"}',
      previousEventHash: null,
      previousTenantChainHash: null,
    });

    const duplicateHash = await buildEventHash(first.eventHash, '{"event":"duplicate"}');
    const duplicateTenantHash = await buildTenantChainHash(first.tenantChainHash, duplicateHash);
    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_audit_events (
          id, empresa_id, event_type, event_category, actor_type, event_payload_json,
          previous_event_hash, event_hash, tenant_chain_hash, chain_scope, chain_sequence
        ) VALUES (
          'event-seq-duplicate', 10, 'TEST_EVENT', 'REGULATED_RECORDS_CORE', 'system',
          '{"event":"duplicate"}', '${first.eventHash}', '${duplicateHash}', '${duplicateTenantHash}',
          'EXPERIMENTAL_RECORD', 1
        );
      `),
      'UNIQUE constraint failed: regulated_audit_events.empresa_id, regulated_audit_events.chain_scope, regulated_audit_events.chain_sequence',
    );

    const otherCompany = await buildEventHash(null, '{"event":"other-company"}');
    const otherTenantChainHash = await buildTenantChainHash(null, otherCompany);
    sqlite(`
      INSERT INTO regulated_audit_events (
        id, empresa_id, event_type, event_category, actor_type, event_payload_json,
        event_hash, tenant_chain_hash, chain_scope, chain_sequence
      ) VALUES (
        'event-seq-other-company', 11, 'TEST_EVENT', 'REGULATED_RECORDS_CORE', 'system',
        '{"event":"other-company"}', '${otherCompany}', '${otherTenantChainHash}',
        'EXPERIMENTAL_RECORD', 1
      );
    `);
  });

  it('serializes a local chain head by empresa_id and chain_scope and forces stale attempts to retry', async () => {
    const { sqlite, sqliteResult, queryJson } = createDb();
    const scope = 'EXPERIMENTAL_RECORD';
    const first = await insertAuditEvent(sqlite, {
      id: 'event-head-1',
      empresaId: 10,
      chainScope: scope,
      chainSequence: 1,
      payload: '{"event":"created"}',
      previousEventHash: null,
      previousTenantChainHash: null,
    });

    sqlite(`
      INSERT INTO regulated_chain_heads (
        id, empresa_id, chain_scope, last_chain_sequence, last_event_hash,
        last_tenant_chain_hash, updated_by
      ) VALUES (
        'head-10-experimental-record', 10, ${sqlString(scope)}, 1,
        ${sqlString(first.eventHash)}, ${sqlString(first.tenantChainHash)}, 101
      );
    `);

    const winner = await insertAuditEvent(sqlite, {
      id: 'event-head-2-winner',
      empresaId: 10,
      chainScope: scope,
      chainSequence: 2,
      payload: '{"event":"sealed","attempt":"winner"}',
      previousEventHash: first.eventHash,
      previousTenantChainHash: first.tenantChainHash,
    });

    expect(
      advanceChainHead(sqlite, {
        empresaId: 10,
        chainScope: scope,
        expectedSequence: 1,
        expectedEventHash: first.eventHash,
        nextSequence: 2,
        nextEventHash: winner.eventHash,
        nextTenantChainHash: winner.tenantChainHash,
      }),
    ).toBe(1);

    const staleEventHash = await buildEventHash(first.eventHash, '{"event":"sealed","attempt":"stale"}');
    const staleTenantChainHash = await buildTenantChainHash(first.tenantChainHash, staleEventHash);
    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_audit_events (
          id, empresa_id, event_type, event_category, actor_type, event_payload_json,
          previous_event_hash, event_hash, tenant_chain_hash, chain_scope, chain_sequence
        ) VALUES (
          'event-head-2-stale', 10, 'TEST_EVENT', 'REGULATED_RECORDS_CORE', 'system',
          '{"event":"sealed","attempt":"stale"}', ${sqlString(first.eventHash)},
          ${sqlString(staleEventHash)}, ${sqlString(staleTenantChainHash)}, ${sqlString(scope)}, 2
        );
      `),
      'UNIQUE constraint failed: regulated_audit_events.empresa_id, regulated_audit_events.chain_scope, regulated_audit_events.chain_sequence',
    );

    const third = await insertAuditEvent(sqlite, {
      id: 'event-head-3',
      empresaId: 10,
      chainScope: scope,
      chainSequence: 3,
      payload: '{"event":"retry-after-refresh"}',
      previousEventHash: winner.eventHash,
      previousTenantChainHash: winner.tenantChainHash,
    });

    expect(
      advanceChainHead(sqlite, {
        empresaId: 10,
        chainScope: scope,
        expectedSequence: 1,
        expectedEventHash: first.eventHash,
        nextSequence: 3,
        nextEventHash: third.eventHash,
        nextTenantChainHash: third.tenantChainHash,
      }),
    ).toBe(0);
    expect(
      advanceChainHead(sqlite, {
        empresaId: 10,
        chainScope: scope,
        expectedSequence: 2,
        expectedEventHash: winner.eventHash,
        nextSequence: 3,
        nextEventHash: third.eventHash,
        nextTenantChainHash: third.tenantChainHash,
      }),
    ).toBe(1);

    const heads = queryJson<{ last_chain_sequence: number; last_event_hash: string; last_tenant_chain_hash: string }>(
      "SELECT last_chain_sequence, last_event_hash, last_tenant_chain_hash FROM regulated_chain_heads WHERE id = 'head-10-experimental-record';",
    );
    expect(heads).toEqual([
      {
        last_chain_sequence: 3,
        last_event_hash: third.eventHash,
        last_tenant_chain_hash: third.tenantChainHash,
      },
    ]);
  });

  it('blocks chain head deletion, rewind and references to missing audit events', async () => {
    const { sqlite, sqliteResult } = createDb();
    const first = await insertAuditEvent(sqlite, {
      id: 'event-head-guard-1',
      empresaId: 10,
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 1,
      payload: '{"event":"created"}',
      previousEventHash: null,
      previousTenantChainHash: null,
    });

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_chain_heads (
          id, empresa_id, chain_scope, last_chain_sequence, last_event_hash,
          last_tenant_chain_hash, updated_by
        ) VALUES (
          'head-missing-event', 10, 'EXPERIMENTAL_RECORD', 2,
          ${sqlString(hexA)}, ${sqlString(hexB)}, 101
        );
      `),
      'regulated_chain_heads: head must match an existing audit event',
    );

    sqlite(`
      INSERT INTO regulated_chain_heads (
        id, empresa_id, chain_scope, last_chain_sequence, last_event_hash,
        last_tenant_chain_hash, updated_by
      ) VALUES (
        'head-guard', 10, 'EXPERIMENTAL_RECORD', 1,
        ${sqlString(first.eventHash)}, ${sqlString(first.tenantChainHash)}, 101
      );
    `);

    expectSqlFailure(
      sqliteResult("UPDATE regulated_chain_heads SET last_chain_sequence = 0, last_event_hash = NULL, last_tenant_chain_hash = NULL WHERE id = 'head-guard';"),
      'regulated_chain_heads: chain head can only advance within the same empresa_id and chain_scope',
    );
    expectSqlFailure(
      sqliteResult("DELETE FROM regulated_chain_heads WHERE id = 'head-guard';"),
      'regulated_chain_heads: chain heads cannot be deleted',
    );
  });

  it('stores previous_event_hash and makes removal or reordering detectable by recomputation', async () => {
    const { sqlite, queryJson } = createDb();
    const first = await insertAuditEvent(sqlite, {
      id: 'event-chain-1',
      empresaId: 10,
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 1,
      payload: '{"event":"created"}',
      previousEventHash: null,
      previousTenantChainHash: null,
    });
    await insertAuditEvent(sqlite, {
      id: 'event-chain-2',
      empresaId: 10,
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 2,
      payload: '{"event":"sealed"}',
      previousEventHash: first.eventHash,
      previousTenantChainHash: first.tenantChainHash,
    });

    const rows = queryJson<{
      chain_sequence: number;
      event_payload_json: string;
      previous_event_hash: string | null;
      event_hash: string;
    }>(
      `SELECT chain_sequence, event_payload_json, previous_event_hash, event_hash
       FROM regulated_audit_events
       WHERE empresa_id = 10 AND chain_scope = 'EXPERIMENTAL_RECORD'
       ORDER BY chain_sequence;`,
    );

    expect(rows[0].previous_event_hash).toBeNull();
    expect(rows[1].previous_event_hash).toBe(first.eventHash);
    await expect(verifyEventChain(rows)).resolves.toBe(true);
    await expect(verifyEventChain([...rows].reverse())).resolves.toBe(false);
    await expect(verifyEventChain(rows.slice(1))).resolves.toBe(false);
  });

  it('restores a local SQLite logical dump and detects payload tampering by recomputation', async () => {
    const { databasePath, sqlite } = createDb();
    const payload = {
      aircraft_prefix: 'PR-ABC',
      observed_at: '2026-06-14T00:00:00.000Z',
      readings: [3, null, { label: 'Cafe\u0301' }],
      updated_at: 'volatile-local-field',
    };
    const sealedPayload = await hashCanonicalPayload({
      canonicalSchemaVersion: 'exp.schema.v1',
      canonicalizationVersion: 'canonicalizer.v1',
      payload,
    });

    insertRecord(sqlite, 'record-restore', 10, 'SEALED');
    insertVersion(sqlite, {
      id: 'version-restore',
      empresaId: 10,
      recordId: 'record-restore',
      versionNumber: 1,
      payload: sealedPayload.canonicalJson,
    });
    const recordHash = await insertRecordHash(sqlite, {
      id: 'hash-restore',
      empresaId: 10,
      recordId: 'record-restore',
      versionId: 'version-restore',
      recordType: 'EXPERIMENTAL_RECORD',
      payloadHash: sealedPayload.payloadHash,
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 1,
    });
    const first = await insertAuditEvent(sqlite, {
      id: 'event-restore-1',
      empresaId: 10,
      recordId: 'record-restore',
      versionId: 'version-restore',
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 1,
      payload: canonicalizeJson({
        event: 'RECORD_HASHED',
        payload_hash: sealedPayload.payloadHash,
        record_hash: recordHash.recordHash,
      }),
      previousEventHash: null,
      previousTenantChainHash: null,
    });

    sqlite(`
      INSERT INTO regulated_chain_heads (
        id, empresa_id, chain_scope, last_chain_sequence, last_event_hash,
        last_tenant_chain_hash, updated_by
      ) VALUES (
        'head-restore', 10, 'EXPERIMENTAL_RECORD', 1,
        ${sqlString(first.eventHash)}, ${sqlString(first.tenantChainHash)}, 101
      );
    `);

    const second = await insertAuditEvent(sqlite, {
      id: 'event-restore-2',
      empresaId: 10,
      recordId: 'record-restore',
      versionId: 'version-restore',
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 2,
      payload: canonicalizeJson({
        event: 'HEAD_ADVANCED',
        tenant_chain_hash: recordHash.tenantChainHash,
      }),
      previousEventHash: first.eventHash,
      previousTenantChainHash: first.tenantChainHash,
    });

    expect(
      advanceChainHead(sqlite, {
        empresaId: 10,
        chainScope: 'EXPERIMENTAL_RECORD',
        expectedSequence: 1,
        expectedEventHash: first.eventHash,
        nextSequence: 2,
        nextEventHash: second.eventHash,
        nextTenantChainHash: second.tenantChainHash,
      }),
    ).toBe(1);

    const dump = dumpDatabase(databasePath);
    const restored = restoreDumpToTempDb(dump);
    await expect(verifyRestoredCoreHashes(restored.queryJson)).resolves.toBe(true);

    const tamperedPayload = await hashCanonicalPayload({
      canonicalSchemaVersion: 'exp.schema.v1',
      canonicalizationVersion: 'canonicalizer.v1',
      payload: { ...payload, aircraft_prefix: 'PR-TMP' },
    });
    expect(dump).toContain(sealedPayload.canonicalJson);

    const tamperedRestore = restoreDumpToTempDb(dump.replace(sealedPayload.canonicalJson, tamperedPayload.canonicalJson));
    await expect(verifyRestoredCoreHashes(tamperedRestore.queryJson)).resolves.toBe(false);
  });

  it('blocks cross-tenant links', () => {
    const { sqlite, sqliteResult } = createDb();
    insertRecord(sqlite, 'record-link-source', 10, 'SEALED');
    insertRecord(sqlite, 'record-link-target', 11, 'SEALED');

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO regulated_record_links (
          id, empresa_id, source_record_id, target_record_id, link_type,
          link_reason, canonical_schema_version, created_by
        ) VALUES (
          'link-cross-tenant', 10, 'record-link-source', 'record-link-target',
          'TRACEABILITY', 'cross tenant should fail', 'exp.link.v1', 101
        );
      `),
      'regulated_record_links: source and target records must belong to link empresa_id',
    );
  });

  it('allows same-tenant links and blocks destructive link changes after activation', () => {
    const { sqlite, sqliteResult } = createDb();
    insertRecord(sqlite, 'record-link-source-ok', 10, 'SEALED');
    insertRecord(sqlite, 'record-link-target-ok', 10, 'SEALED');

    sqlite(`
      INSERT INTO regulated_record_links (
        id, empresa_id, source_record_id, target_record_id, link_type,
        link_reason, canonical_schema_version, created_by
      ) VALUES (
        'link-same-tenant', 10, 'record-link-source-ok', 'record-link-target-ok',
        'TRACEABILITY', 'same tenant traceability', 'exp.link.v1', 101
      );
    `);

    expectSqlFailure(
      sqliteResult("UPDATE regulated_record_links SET link_reason = 'changed' WHERE id = 'link-same-tenant';"),
      'regulated_record_links: active links are immutable',
    );
    expectSqlFailure(
      sqliteResult("DELETE FROM regulated_record_links WHERE id = 'link-same-tenant';"),
      'regulated_record_links: active links cannot be deleted',
    );
  });

  it('supports addendum by appending a new version without mutating the original', async () => {
    const { sqlite, sqliteResult, queryJson } = createDb();
    insertRecord(sqlite, 'record-addendum', 10, 'SEALED');
    insertVersion(sqlite, {
      id: 'version-addendum-original',
      empresaId: 10,
      recordId: 'record-addendum',
      versionNumber: 1,
      payload: '{"value":"original"}',
    });

    expectSqlFailure(
      sqliteResult("UPDATE regulated_record_versions SET canonical_payload_json = '{\"value\":\"edited\"}' WHERE id = 'version-addendum-original';"),
      'regulated_record_versions: sealed versions are immutable',
    );

    insertVersion(sqlite, {
      id: 'version-addendum-correction',
      empresaId: 10,
      recordId: 'record-addendum',
      versionNumber: 2,
      payload: '{"value":"corrected"}',
      baseVersionId: 'version-addendum-original',
      reason: 'ADDENDUM_CORRECTION',
    });
    await insertAuditEvent(sqlite, {
      id: 'event-addendum',
      empresaId: 10,
      recordId: 'record-addendum',
      versionId: 'version-addendum-correction',
      chainScope: 'EXPERIMENTAL_RECORD',
      chainSequence: 1,
      payload: '{"event":"ADDENDUM_CORRECTION","base_version_id":"version-addendum-original"}',
      previousEventHash: null,
      previousTenantChainHash: null,
    });

    const versions = queryJson<{
      id: string;
      version_number: number;
      version_reason: string;
      base_version_id: string | null;
      canonical_payload_json: string;
    }>(
      `SELECT id, version_number, version_reason, base_version_id, canonical_payload_json
       FROM regulated_record_versions
       WHERE record_id = 'record-addendum'
       ORDER BY version_number;`,
    );

    expect(versions).toEqual([
      {
        id: 'version-addendum-original',
        version_number: 1,
        version_reason: 'INITIAL_SEAL',
        base_version_id: null,
        canonical_payload_json: '{"value":"original"}',
      },
      {
        id: 'version-addendum-correction',
        version_number: 2,
        version_reason: 'ADDENDUM_CORRECTION',
        base_version_id: 'version-addendum-original',
        canonical_payload_json: '{"value":"corrected"}',
      },
    ]);
  });

  it('does not contain remote wrangler, deploy, secret or production/staging execution commands', () => {
    expect(migrationSql).not.toMatch(/\bwrangler\b/i);
    expect(migrationSql).not.toMatch(/\bdeploy\b/i);
    expect(migrationSql).not.toMatch(/\bsecret\b/i);
    expect(migrationSql).not.toMatch(/--remote/i);
  });
});

describe('regulated records canonicalization helper', () => {
  it.each(frozenCanonicalizationVectors)('matches frozen canonicalization vector: $name', async (vector) => {
    const canonicalJson = canonicalizeJson(vector.input);

    expect(canonicalJson).toBe(vector.expectedCanonicalJson);
    await expect(sha256Hex(canonicalJson)).resolves.toBe(vector.expectedSha256);
  });

  it('generates the same canonical string for objects with different key order', () => {
    const first = canonicalizeJson({ b: 2, a: { y: true, x: null } });
    const second = canonicalizeJson({ a: { x: null, y: true }, b: 2 });

    expect(first).toBe(second);
    expect(first).toBe('{"a":{"x":null,"y":true},"b":2}');
  });

  it('preserves array order', () => {
    expect(canonicalizeJson({ values: [2, 1] })).toBe('{"values":[2,1]}');
    expect(canonicalizeJson({ values: [1, 2] })).toBe('{"values":[1,2]}');
  });

  it('normalizes Unicode strings to NFC and preserves null values', () => {
    const composed = canonicalizeJson({ label: 'Caf\u00e9', optional: null });
    const decomposed = canonicalizeJson({ optional: null, label: 'Cafe\u0301' });

    expect(composed).toBe(decomposed);
    expect(composed).toBe('{"label":"Café","optional":null}');
  });

  it('excludes volatile fields from canonical material', () => {
    const first = canonicalizeJson({
      aircraft_prefix: 'PR-AAA',
      updated_at: '2026-06-14T10:00:00.000Z',
      request_id: 'req-1',
    });
    const second = canonicalizeJson({
      aircraft_prefix: 'PR-AAA',
      updated_at: '2026-06-14T11:00:00.000Z',
      request_id: 'req-2',
    });

    expect(first).toBe(second);
    expect(first).toBe('{"aircraft_prefix":"PR-AAA"}');
  });

  it('rejects undefined explicitly', () => {
    expect(() => canonicalizeJson({ value: undefined })).toThrow('Undefined is not allowed');
  });

  it('rejects Date objects and non-finite numbers explicitly', () => {
    expect(() => canonicalizeJson({ created_at: new Date('2026-06-14T00:00:00.000Z') })).toThrow('Date objects are not allowed');
    expect(() => canonicalizeJson({ value: Number.NaN })).toThrow('Non-finite numbers are not allowed');
    expect(() => canonicalizeJson({ value: Number.POSITIVE_INFINITY })).toThrow('Non-finite numbers are not allowed');
  });

  it('changes hash when relevant data changes and includes schema/canonicalizer versions', async () => {
    const first = await hashCanonicalPayload({
      canonicalSchemaVersion: 'exp.schema.v1',
      canonicalizationVersion: 'canonicalizer.v1',
      payload: { value: 'A' },
    });
    const reordered = await hashCanonicalPayload({
      canonicalSchemaVersion: 'exp.schema.v1',
      canonicalizationVersion: 'canonicalizer.v1',
      payload: { value: 'A', updated_at: 'volatile' },
    });
    const changedPayload = await hashCanonicalPayload({
      canonicalSchemaVersion: 'exp.schema.v1',
      canonicalizationVersion: 'canonicalizer.v1',
      payload: { value: 'B' },
    });
    const changedSchema = await hashCanonicalPayload({
      canonicalSchemaVersion: 'exp.schema.v2',
      canonicalizationVersion: 'canonicalizer.v1',
      payload: { value: 'A' },
    });
    const changedCanonicalizer = await hashCanonicalPayload({
      canonicalSchemaVersion: 'exp.schema.v1',
      canonicalizationVersion: 'canonicalizer.v2',
      payload: { value: 'A' },
    });

    expect(first.payloadHash).toBe(reordered.payloadHash);
    expect(first.payloadHash).not.toBe(changedPayload.payloadHash);
    expect(first.payloadHash).not.toBe(changedSchema.payloadHash);
    expect(first.payloadHash).not.toBe(changedCanonicalizer.payloadHash);
    expect(first.canonicalJson).toContain('"canonical_schema_version":"exp.schema.v1"');
    expect(first.canonicalJson).toContain('"canonicalization_version":"canonicalizer.v1"');
  });
});
