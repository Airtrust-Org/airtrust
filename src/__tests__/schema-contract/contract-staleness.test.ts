import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COVERAGE_CLASSES,
  PROVENANCE_STATES,
  computeSchemaV2Digest,
  evaluateStaleness,
  extractDdlTargets,
  isScratchTable,
  sha256,
} from '../../schema-contract/contractStaleness.mjs';

const REPO_ROOT = join(__dirname, '../../..');
const REAL_CONTRACT_PATH = join(
  REPO_ROOT,
  'docs/database/schema-contracts/production-d1-baseline-v2.json',
);
const REAL_CHANGES_DIR = join(REPO_ROOT, 'worker-airtrust/schema-v2/changes');

// --- Unit: DDL target extraction -------------------------------------------------

describe('extractDdlTargets', () => {
  it('captures CREATE TABLE / ALTER TABLE / DROP TABLE targets', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS alpha (id INTEGER);
      ALTER TABLE beta ADD COLUMN x TEXT;
      DROP TABLE IF EXISTS gamma;
    `;
    expect(extractDdlTargets(sql)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('resolves index and trigger targets to the table after ON, not the object name', () => {
    const sql = `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_alpha_x ON alpha (x);
      CREATE TRIGGER trg_alpha_guard AFTER INSERT ON alpha
        BEGIN SELECT 1; END;
    `;
    expect(extractDdlTargets(sql)).toEqual(['alpha']);
  });

  it('ignores scratch / preflight / rollback guard tables', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS _preflight_0500_guard (ok INTEGER);
      CREATE TABLE IF NOT EXISTS demo_0500_guard (ok INTEGER);
      CREATE TABLE IF NOT EXISTS real_table (id INTEGER);
      DROP TABLE _preflight_0500_guard;
    `;
    expect(extractDdlTargets(sql)).toEqual(['real_table']);
    expect(isScratchTable('_x')).toBe(true);
    expect(isScratchTable('qualification_category_0457_guard')).toBe(true);
    expect(isScratchTable('real_table')).toBe(false);
  });

  it('does not read table names out of string literals or comments', () => {
    const sql = `
      -- ALTER TABLE commented_out ADD COLUMN y TEXT;
      CREATE TABLE kept (label TEXT DEFAULT 'ALTER TABLE literal_only');
    `;
    expect(extractDdlTargets(sql)).toEqual(['kept']);
  });
});

describe('computeSchemaV2Digest', () => {
  it('is order-independent over the (file, sha256) pairs', () => {
    const a = [
      { change_file: 'b.sql', sha256: '22' },
      { change_file: 'a.sql', sha256: '11' },
    ];
    const b = [
      { change_file: 'a.sql', sha256: '11' },
      { change_file: 'b.sql', sha256: '22' },
    ];
    expect(computeSchemaV2Digest(a)).toBe(computeSchemaV2Digest(b));
  });

  it('changes when any file content hash changes', () => {
    const base = [{ change_file: 'a.sql', sha256: '11' }];
    const drift = [{ change_file: 'a.sql', sha256: '99' }];
    expect(computeSchemaV2Digest(base)).not.toBe(computeSchemaV2Digest(drift));
  });
});

// --- Synthetic workspace -------------------------------------------------------

interface Workspace {
  root: string;
  changesDir: string;
  writeChange: (name: string, sql: string) => { sha256: string; targets: string[] };
  buildContract: (entries: unknown[], overrides?: Record<string, unknown>) => Record<string, unknown>;
}

function makeWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'schema-contract-staleness-'));
  const changesDir = join(root, 'worker-airtrust/schema-v2/changes');
  mkdirSync(changesDir, { recursive: true });
  mkdirSync(join(root, 'worker-airtrust/schema-v2'), { recursive: true });

  const writeChange = (name: string, sql: string) => {
    writeFileSync(join(changesDir, name), sql, 'utf8');
    return { sha256: sha256(sql), targets: extractDdlTargets(sql) };
  };

  const buildContract = (entries: unknown[], overrides: Record<string, unknown> = {}) => {
    const digestInput = (entries as Array<{ change_file: string; sha256: string }>).map((e) => ({
      change_file: e.change_file,
      sha256: e.sha256,
    }));
    return {
      scoped_tables: ['scoped_table'],
      provenance: {
        baseline_state: 'PRODUCTION_CONFIRMED',
        confirmed_via: 'snapshot.json',
        snapshot_generated_at: '2026-07-29T00:00:00.000Z',
      },
      staleness_guard: {
        schema_v2_changes_dir: 'worker-airtrust/schema-v2/changes',
        reviewed_manifests_dir: 'worker-airtrust/schema-v2',
        schema_v2_digest: computeSchemaV2Digest(digestInput),
      },
      schema_v2_since_baseline: entries,
      ...overrides,
    };
  };

  return { root, changesDir, writeChange, buildContract };
}

describe('evaluateStaleness (synthetic workspace)', () => {
  let ws: Workspace;

  beforeEach(() => {
    ws = makeWorkspace();
  });

  afterEach(() => {
    rmSync(ws.root, { recursive: true, force: true });
  });

  function outOfScopeEntry(name: string, sql: string) {
    const { sha256: hash, targets } = ws.writeChange(name, sql);
    return {
      change_file: name,
      change_id: null,
      sha256: hash,
      targets,
      coverage: 'OUT_OF_CONTRACT_SCOPE',
      governance_state: 'REPO_EXPECTED',
      reviewed_manifest: null,
    };
  }

  it('passes for a well-formed, fully reconciled contract', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    const result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('PASS');
    expect(result.issues).toEqual([]);
  });

  it('fails when a Schema V2 change on disk is not classified in the contract', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    ws.writeChange('0501_orphan.sql', 'CREATE TABLE orphan_y (id INTEGER);');
    // digest still computed only from the single declared entry -> also drifts
    const result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('FAIL');
    expect(result.issues.map((i) => i.code)).toContain('STALENESS_UNCLASSIFIED_CHANGE');
  });

  it('fails when a contract entry points at a file that is not on disk', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    const ghost = { ...entry, change_file: '0499_ghost.sql' };
    const contract = ws.buildContract([entry, ghost]);
    const result = evaluateStaleness({ contract, rootDir: ws.root });
    expect(result.status).toBe('FAIL');
    expect(result.issues.map((i) => i.code)).toContain('STALENESS_ORPHAN_ENTRY');
  });

  it('fails on content drift when the file changes but the entry does not', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    const contract = ws.buildContract([entry]);
    // rewrite the file after the contract was built
    writeFileSync(join(ws.changesDir, '0500_demo.sql'), 'CREATE TABLE demo_x (id INTEGER, extra TEXT);', 'utf8');
    const result = evaluateStaleness({ contract, rootDir: ws.root });
    expect(result.status).toBe('FAIL');
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('STALENESS_CONTENT_DRIFT');
    expect(codes).toContain('STALENESS_DIGEST_MISMATCH');
  });

  it('fails on target drift when declared targets do not match the DDL', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    entry.targets = ['wrong_table'];
    const result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('FAIL');
    expect(result.issues.map((i) => i.code)).toContain('STALENESS_TARGET_DRIFT');
  });

  it('FAILS when a change touches a scoped/contract table but is not marked REFLECTED_IN_CONTRACT', () => {
    // This is the "critical schema change not reflected in the contract" guard.
    const { sha256: hash, targets } = ws.writeChange(
      '0502_touches_scoped.sql',
      'ALTER TABLE scoped_table ADD COLUMN novo_campo TEXT;',
    );
    const entry = {
      change_file: '0502_touches_scoped.sql',
      change_id: null,
      sha256: hash,
      targets,
      coverage: 'OUT_OF_CONTRACT_SCOPE',
      governance_state: 'REPO_EXPECTED',
      reviewed_manifest: null,
    };
    const result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('FAIL');
    expect(result.issues.map((i) => i.code)).toContain('STALENESS_SCOPED_TABLE_CHANGED');
  });

  it('passes when a scoped-table change is properly marked REFLECTED_IN_CONTRACT', () => {
    const { sha256: hash, targets } = ws.writeChange(
      '0502_touches_scoped.sql',
      'ALTER TABLE scoped_table ADD COLUMN novo_campo TEXT;',
    );
    const entry = {
      change_file: '0502_touches_scoped.sql',
      change_id: null,
      sha256: hash,
      targets,
      coverage: 'REFLECTED_IN_CONTRACT',
      governance_state: 'REPO_EXPECTED',
      reviewed_manifest: null,
    };
    const result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('PASS');
  });

  it('fails on a false REFLECTED_IN_CONTRACT claim for an out-of-scope table', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    entry.coverage = 'REFLECTED_IN_CONTRACT';
    const result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('FAIL');
    expect(result.issues.map((i) => i.code)).toContain('STALENESS_FALSE_COVERAGE');
  });

  it('fails on an invalid coverage / governance_state enum', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    entry.coverage = 'SOMETHING_ELSE';
    entry.governance_state = 'MAYBE_APPLIED';
    const result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('FAIL');
    expect(result.issues.filter((i) => i.code === 'STALENESS_INVALID_ENUM').length).toBeGreaterThanOrEqual(2);
  });

  it('requires an existing evidence pointer for an APPLIED governance state', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    entry.governance_state = 'PRODUCTION_CONFIRMED';
    // no evidence field
    let result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.issues.map((i) => i.code)).toContain('STALENESS_MISSING_EVIDENCE');

    // evidence path that does not exist
    (entry as Record<string, unknown>).evidence = 'docs/does-not-exist.md';
    result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.issues.map((i) => i.code)).toContain('STALENESS_MISSING_EVIDENCE');

    // real, existing file
    writeFileSync(join(ws.root, 'EVIDENCE.md'), 'confirmed', 'utf8');
    (entry as Record<string, unknown>).evidence = 'EVIDENCE.md';
    result = evaluateStaleness({ contract: ws.buildContract([entry]), rootDir: ws.root });
    expect(result.status).toBe('PASS');
  });

  it('flags a missing provenance section', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    const contract = ws.buildContract([entry], { provenance: undefined });
    delete (contract as Record<string, unknown>).provenance;
    const result = evaluateStaleness({ contract, rootDir: ws.root });
    expect(result.issues.map((i) => i.code)).toContain('PROVENANCE_MISSING_SECTION');
  });

  it('validates runtime_critical_uncovered entries', () => {
    const entry = outOfScopeEntry('0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    const contract = ws.buildContract([entry], {
      runtime_critical_uncovered: [
        { table: 'scoped_table', introduced_by: '0500_demo.sql', why_critical: 'x', blocked_on: 'y', tracking: 'z' },
        { table: 'ok_table', introduced_by: 'nope.sql', why_critical: 'x', blocked_on: 'y', tracking: 'z' },
      ],
    });
    const result = evaluateStaleness({ contract, rootDir: ws.root });
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('RCU_ALREADY_COVERED');
    expect(codes).toContain('RCU_UNKNOWN_SOURCE');
  });
});

// --- Integration: the real, committed contract --------------------------------

describe('evaluateStaleness against the committed contract', () => {
  it('the shipped contract is not stale against the current repo tree', () => {
    const contract = JSON.parse(readFileSync(REAL_CONTRACT_PATH, 'utf8'));
    const result = evaluateStaleness({ contract, rootDir: REPO_ROOT });
    if (result.status !== 'PASS') {
      // Surface the exact reconciliation gap in the failure output.
      throw new Error(result.issues.map((i) => `[${i.code}] ${i.message}`).join('\n'));
    }
    expect(result.status).toBe('PASS');
  });

  it('classifies every Schema V2 change file on disk', () => {
    const contract = JSON.parse(readFileSync(REAL_CONTRACT_PATH, 'utf8'));
    const onDisk = readdirSync(REAL_CHANGES_DIR)
      .filter((n) => n.toLowerCase().endsWith('.sql'))
      .sort();
    const classified = new Set(
      (contract.schema_v2_since_baseline ?? []).map((e: { change_file: string }) => e.change_file),
    );
    expect([...classified].sort()).toEqual(onDisk);
  });

  it('only uses the four canonical provenance states and three coverage classes', () => {
    const contract = JSON.parse(readFileSync(REAL_CONTRACT_PATH, 'utf8'));
    for (const entry of contract.schema_v2_since_baseline ?? []) {
      expect(PROVENANCE_STATES).toContain(entry.governance_state);
      expect(COVERAGE_CLASSES).toContain(entry.coverage);
    }
  });

  it('recomputes the committed schema_v2_digest from disk', () => {
    const contract = JSON.parse(readFileSync(REAL_CONTRACT_PATH, 'utf8'));
    const onDisk = readdirSync(REAL_CHANGES_DIR)
      .filter((n) => n.toLowerCase().endsWith('.sql'))
      .sort()
      .map((name) => ({
        change_file: name,
        sha256: sha256(readFileSync(join(REAL_CHANGES_DIR, name), 'utf8')),
      }));
    expect(computeSchemaV2Digest(onDisk)).toBe(contract.staleness_guard.schema_v2_digest);
  });
});
