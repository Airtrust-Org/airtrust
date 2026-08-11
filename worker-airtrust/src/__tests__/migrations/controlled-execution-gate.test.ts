import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const genericGateScript = join(testDir, '../../../../scripts/controlled-execution-gate.sh');
const migGateScript = join(
  testDir,
  '../../../../scripts/mig01-controlled-rebaseline-gate.sh',
);

const tempDirs: string[] = [];

function createTempFile(name: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-controlled-gate-'));
  tempDirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

function runGenericGate(env: Record<string, string>) {
  return spawnSync('bash', [genericGateScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('controlled execution gate', () => {
  function baseEnv(overrides: Record<string, string> = {}) {
    const dbPath = createTempFile('target.sqlite', '');
    const snapshotPath = createTempFile('snapshot.sqlite', '');
    const rollbackPath = createTempFile('rollback.md', 'restore snapshot');

    return {
      AIRTRUST_CONTROLLED_MODE: 'dq01-backfill',
      AIRTRUST_CONTROLLED_TARGET: 'staging',
      AIRTRUST_CONTROLLED_APPROVAL: 'ticket-123',
      AIRTRUST_DB_PATH: dbPath,
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND: 'bash scripts/run-dq01-backfill.sh --mode backfill',
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      ...overrides,
    };
  }

  it('blocks when target is missing', () => {
    const env = baseEnv();
    env.AIRTRUST_CONTROLLED_TARGET = '';

    const result = runGenericGate(env);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('CONTROLLED_EXECUTION_GATE=BLOCKED_BY_ENVIRONMENT_CONTRACT');
    expect(result.stdout).toContain('target_not_declared');
  });

  it('blocks when approval is missing', () => {
    const env = baseEnv();
    env.AIRTRUST_CONTROLLED_APPROVAL = '';

    const result = runGenericGate(env);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('approval_missing');
  });

  it('blocks when snapshot evidence is missing', () => {
    const env = baseEnv();
    env.AIRTRUST_CONTROLLED_SNAPSHOT_PATH = '';

    const result = runGenericGate(env);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('snapshot_missing');
  });

  it('blocks when rollback evidence is missing', () => {
    const env = baseEnv();
    env.AIRTRUST_CONTROLLED_ROLLBACK_PATH = '';

    const result = runGenericGate(env);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('rollback_missing');
  });

  it('blocks production without extra authorization', () => {
    const env = baseEnv({
      AIRTRUST_CONTROLLED_TARGET: 'production',
      AIRTRUST_CONTROLLED_TARGET_REF: 'cluster://production/db',
      AIRTRUST_CONTROLLED_SAFE_COMMAND:
        'bash scripts/run-dq01-backfill.sh --mode backfill --target production',
    });
    env.AIRTRUST_DB_PATH = '';

    const result = runGenericGate(env);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('production_requires_additional_authorization');
  });

  it('blocks commands that contain deploy', () => {
    const result = runGenericGate(
      baseEnv({
        AIRTRUST_CONTROLLED_SAFE_COMMAND:
          'wrangler deploy && bash scripts/run-dq01-backfill.sh --mode backfill',
      }),
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('command_contains_deploy');
  });

  it('blocks remote D1 commands without explicit authorization', () => {
    const result = runGenericGate(
      baseEnv({
        AIRTRUST_CONTROLLED_SAFE_COMMAND:
          'wrangler d1 execute airtrust --remote --file scripts/run-dq01-backfill.sql --mode backfill',
      }),
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('remote_d1_not_authorized');
  });

  it('blocks when the command does not match the mode', () => {
    const result = runGenericGate(
      baseEnv({
        AIRTRUST_CONTROLLED_MODE: 'mig01-rebaseline',
      }),
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('mode_command_mismatch');
  });

  it(
    'blocks when safe_command references a quarantined migration marked NO_GO_MIGRATION_PRODUCAO',
    () => {
      const result = runGenericGate(
        baseEnv({
          AIRTRUST_CONTROLLED_MODE: 'audit-v2-schema',
          AIRTRUST_CONTROLLED_TARGET: 'local-copy',
          AIRTRUST_CONTROLLED_SAFE_COMMAND:
            'audit-v2 schema check then apply scripts/sql/manual/no-go/0432_revisao_completa_codigos_manobras.sql',
        }),
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toContain(
        'CONTROLLED_EXECUTION_GATE=BLOCKED_BY_ENVIRONMENT_CONTRACT',
      );
      expect(result.stdout).toContain('no_go_migration_referenced');
      expect(result.stdout).toContain('0432_revisao_completa_codigos_manobras.sql');
    },
  );

  it('blocks when safe_command references quarantined migration 0433', () => {
    const result = runGenericGate(
      baseEnv({
        AIRTRUST_CONTROLLED_MODE: 'audit-v2-schema',
        AIRTRUST_CONTROLLED_TARGET: 'local-copy',
        AIRTRUST_CONTROLLED_SAFE_COMMAND:
          'audit-v2 schema check then apply scripts/sql/manual/no-go/0433_fix_loft_references.sql',
      }),
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('no_go_migration_referenced');
    expect(result.stdout).toContain('0433_fix_loft_references.sql');
  });

  it(
    'blocks when safe_command references a migration file that does not exist (fail-closed)',
    () => {
      const result = runGenericGate(
        baseEnv({
          AIRTRUST_CONTROLLED_MODE: 'audit-v2-schema',
          AIRTRUST_CONTROLLED_TARGET: 'local-copy',
          AIRTRUST_CONTROLLED_SAFE_COMMAND:
            'audit-v2 schema check then apply worker-airtrust/migrations/9999_does_not_exist.sql',
        }),
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toContain('referenced_migration_file_not_found');
    },
  );

  it('allows safe_command referencing a migration that is NOT marked NO_GO', () => {
    const result = runGenericGate(
      baseEnv({
        AIRTRUST_CONTROLLED_MODE: 'audit-v2-schema',
        AIRTRUST_CONTROLLED_TARGET: 'local-copy',
        AIRTRUST_CONTROLLED_SAFE_COMMAND:
          'audit-v2 schema check referencing worker-airtrust/migrations/0431_remover_prefixo_inv_manobras.sql',
      }),
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'CONTROLLED_EXECUTION_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION',
    );
  });

  it('allows a local-copy scenario with fake artifacts and reviewed command', () => {
    const result = runGenericGate(
      baseEnv({
        AIRTRUST_CONTROLLED_TARGET: 'local-copy',
        AIRTRUST_CONTROLLED_SAFE_COMMAND:
          'bash scripts/run-dq01-local-backfill.sh --mode backfill --target local-copy',
      }),
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'CONTROLLED_EXECUTION_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION',
    );
    expect(result.stdout).toContain('TARGET=local-copy');
    expect(result.stdout).toContain('SNAPSHOT_EVIDENCE=YES');
    expect(result.stdout).toContain('ROLLBACK_EVIDENCE=YES');
  });
});

describe('mig01 controlled rebaseline gate', () => {
  it('remains fail-closed without environment inputs', () => {
    const result = spawnSync('bash', [migGateScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
      },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('MIG01_REBASELINE_GATE=BLOCKED_BY_ENVIRONMENT_READINESS');
    expect(result.stdout).toContain('CONTROLLED_EXECUTION_GATE=BLOCKED_BY_ENVIRONMENT_CONTRACT');
  });
});
