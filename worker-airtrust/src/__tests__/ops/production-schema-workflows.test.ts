import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function readWorkflow(name: string): string {
  return readFileSync(join(ROOT, `.github/workflows/${name}`), 'utf8');
}

describe('deploy-airtrust.yml — production schema hard block', () => {
  const workflow = readWorkflow('deploy-airtrust.yml');

  it('keeps workflow_dispatch but hard-fails legacy migrations', () => {
    expect(workflow).toContain('run_migrations:');
    expect(workflow).toContain('LEGACY_MIGRATION_RUNNER_DISABLED_USE_SCHEMA_V2');
    expect(workflow).not.toMatch(/wrangler d1 migrations apply/);
  });

  it('does not keep an Apply D1 migrations step', () => {
    expect(workflow).not.toContain('Apply D1 migrations');
  });
});

describe('apply-schema-change-v2.yml — controlled single-file apply', () => {
  const workflow = readWorkflow('apply-schema-change-v2.yml');

  it('runs only on workflow_dispatch and never deploys worker/pages', () => {
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).not.toMatch(/wrangler deploy/);
    expect(workflow).not.toMatch(/pages deploy/);
  });

  it('requires exact production confirmation and main branch', () => {
    expect(workflow).toContain('AIRTRUST_PRODUCTION');
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('expected_sha');
  });

  it('applies exactly one allowlisted file under worker-airtrust/schema-v2/', () => {
    expect(workflow).toContain('worker-airtrust/schema-v2/');
    expect(workflow).toContain('change not already applied');
    expect(workflow).not.toMatch(/d1\s+migrations\s+apply/);
  });

  it('runs the exact read-only 0453 validator after that Schema V2 change', () => {
    expect(workflow).toContain("inputs.change_id == 'ead-category-reconciliation-executor-0453'");
    expect(workflow).toContain('validate-ead-category-reconciliation-executor-0453.sh');
  });

  it('runs the exact read-only 0454 validator after that Schema V2 change', () => {
    expect(workflow).toContain("inputs.change_id == 'qualificacoes-tipos-dominio-override-0454'");
    expect(workflow).toContain('validate-qualificacoes-tipos-dominio-override-0454.sh');
  });
});

describe('EAD reconciliation ledger Schema V2 change 0453', () => {
  const sql = readFileSync(
    join(ROOT, 'worker-airtrust/schema-v2/changes/ead-category-reconciliation-executor-0453.sql'),
    'utf8',
  );
  const stagingSql = readFileSync(
    join(ROOT, 'worker-airtrust/migrations/0453_ead_category_reconciliation_executor.sql'),
    'utf8',
  );
  const validator = readFileSync(
    join(ROOT, 'scripts/schema-v2/validate-ead-category-reconciliation-executor-0453.sh'),
    'utf8',
  );
  const normalizeSql = (source: string) =>
    source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  it('is additive-only and semantically equivalent to staging', () => {
    for (const token of [
      'ead_category_reconciliation_runs',
      'CHECK (empresa_id = 6)',
      "status IN ('APPLIED', 'ROLLED_BACK')",
      'idx_ead_category_reconciliation_single_active',
    ]) {
      expect(sql).toContain(token);
      expect(stagingSql).toContain(token);
    }
    expect(
      sql
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n'),
    ).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
    expect(normalizeSql(sql)).toBe(normalizeSql(stagingSql));
  });

  it('post-validates columns, constraints, partial index, and the empty ledger read-only', () => {
    for (const token of [
      'PRAGMA table_info(ead_category_reconciliation_runs)',
      'CHECK (empresa_id = 6)',
      'idx_ead_category_reconciliation_single_active',
      'SELECT COUNT(*) AS n FROM ead_category_reconciliation_runs',
    ]) {
      expect(validator).toContain(token);
    }
    expect(validator).not.toMatch(
      /--file|\bd1\s+migrations\s+apply|\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s+(INTO|FROM|TABLE)/i,
    );
  });
});

describe('qualificacoes_tipos domain override Schema V2 change 0454', () => {
  const sql = readFileSync(
    join(ROOT, 'worker-airtrust/schema-v2/changes/0454_qualificacoes_tipos_dominio_override.sql'),
    'utf8',
  );
  const stagingSql = readFileSync(
    join(ROOT, 'worker-airtrust/migrations/0454_qualificacoes_tipos_dominio_override.sql'),
    'utf8',
  );
  const validator = readFileSync(
    join(ROOT, 'scripts/schema-v2/validate-qualificacoes-tipos-dominio-override-0454.sh'),
    'utf8',
  );
  const normalizeSql = (source: string) =>
    source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  it('is additive-only (ALTER ADD COLUMN + CREATE INDEX only, no DML) and semantically equivalent to staging', () => {
    for (const token of [
      'ALTER TABLE qualificacoes_tipos ADD COLUMN dominio_codigo TEXT',
      'CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_dominio_codigo',
    ]) {
      expect(sql).toContain(token);
      expect(stagingSql).toContain(token);
    }
    const executableStatements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    // Only additive DDL is allowed: ALTER TABLE ... ADD COLUMN and
    // CREATE INDEX. No INSERT/UPDATE/DELETE/DROP, and no ALTER other than
    // ADD COLUMN (e.g. no ALTER ... DROP COLUMN, no ALTER ... RENAME).
    expect(executableStatements).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP)\b/i);
    expect(executableStatements).toMatch(/ALTER TABLE qualificacoes_tipos ADD COLUMN/i);
    expect(
      (executableStatements.match(/\bALTER\s+TABLE\b/gi) || []).every((_, i) => i === 0),
    ).toBe(true);
    expect(normalizeSql(sql)).toBe(normalizeSql(stagingSql));
  });

  it('the migration comments point at the Schema V2 production path, not the legacy wrapper', () => {
    expect(stagingSql).toContain('Schema V2');
    expect(stagingSql).toContain('worker-airtrust/schema-v2/changes/0454_qualificacoes_tipos_dominio_override.sql');
    expect(stagingSql).toContain('qualificacoes-tipos-dominio-override-0454');
    // The old, incorrect pointer to the raw migration-file production
    // wrapper must not remain unqualified — it may still be mentioned to
    // explain why it's NOT the right path, but never as an instruction to
    // use it directly for this migration.
    expect(stagingSql).toContain('NOT\n-- scripts/apply-migration-production.sh');
  });

  it('post-validates the column, index, zero-classification postcondition, and 0452 table read-only', () => {
    for (const token of [
      'PRAGMA table_info(qualificacoes_tipos)',
      'idx_qualificacoes_tipos_dominio_codigo',
      'SELECT COUNT(*) AS n FROM qualificacoes_tipos WHERE dominio_codigo IS NOT NULL',
      'dominios_operacionais',
    ]) {
      expect(validator).toContain(token);
    }
    expect(validator).not.toMatch(
      /--file|\bd1\s+migrations\s+apply|\b(INSERT|UPDATE|DELETE|DROP)\s+(INTO|FROM|TABLE)/i,
    );
  });

  it('production plan doc exists and does not claim execution', () => {
    const plan = readFileSync(
      join(ROOT, 'docs/ops/production-certificados-0454-schema-v2.md'),
      'utf8',
    );
    expect(plan).toContain('qualificacoes-tipos-dominio-override-0454');
    expect(plan).toContain('production-d1-baseline-v2-20260714');
    expect(plan).toContain('autorização humana');
  });
});

describe('security token guard — least privilege', () => {
  const applySchema = readWorkflow('apply-schema-change-v2.yml');
  const deployAirtrust = readWorkflow('deploy-airtrust.yml');

  it('forbids generic CLOUDFLARE_API_TOKEN usage directly', () => {
    expect(applySchema).not.toMatch(/secrets\.CLOUDFLARE_API_TOKEN/);
    expect(deployAirtrust).not.toMatch(/secrets\.CLOUDFLARE_API_TOKEN/);
  });

  it('schema workflow requires D1 migration token and fail-closed gate', () => {
    expect(applySchema).toContain('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN');
    expect(applySchema).toContain('PRODUCTION_D1_MIGRATION_TOKEN_MISSING');
    expect(applySchema).not.toMatch(
      /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/,
    );
  });

  it('deploy-airtrust continues using only Worker and Pages tokens', () => {
    expect(deployAirtrust).toContain('secrets.CLOUDFLARE_WORKER_API_TOKEN');
    expect(deployAirtrust).toContain('secrets.CLOUDFLARE_PAGES_API_TOKEN');
    expect(deployAirtrust).not.toContain('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN');
  });

  it('error handling blocks do not contain corrupt redirections', () => {
    expect(applySchema).not.toContain('>echo');
    expect(applySchema).not.toContain('>&22');
  });
});
