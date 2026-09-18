import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('staging governance for Controle de Voos 0502', () => {
  const dispatcher = read('scripts/staging/apply-approved-migrations.sh');
  const runner = read('scripts/staging/apply-0502-controle-voos-fueling-companies.sh');
  const recovery = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
  const post = read('scripts/staging/validate-0502-postconditions.sh');

  it('allowlists 0502 and routes it through its reviewed runner', () => {
    expect(dispatcher).toContain('"0502_controle_voos_fueling_companies.sql"');
    expect(dispatcher).toContain(
      'exec bash "$ROOT/scripts/staging/apply-0502-controle-voos-fueling-companies.sh"',
    );
    expect(recovery).toContain('"0502_controle_voos_fueling_companies.sql"');
    expect(recovery).toContain(
      'bash scripts/staging/validate-0502-postconditions.sh --target="$db_name"',
    );
  });

  it('pins manifest, mirror SQL and official staging target', () => {
    expect(runner).toContain('SCHEMA_CHANGE_ID="controle-voos-fueling-companies-0502"');
    expect(runner).toContain(
      "manifest.filePath !== 'worker-airtrust/schema-v2/changes/0502_controle_voos_fueling_companies.sql'",
    );
    expect(runner).toContain(
      "manifest.planPath !== 'worker-airtrust/schema-v2/plans/controle-voos-fueling-companies-0502.md'",
    );
    expect(runner).toContain('cmp -s "$migration_arg" "$schema_sql_path"');
    expect(runner).toContain('db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"');
    expect(runner).toContain('ERROR: 0502 schema/ledger drift or partial apply');
  });

  it('validates the ledger, catalog table, columns and indexes', () => {
    expect(post).toContain('assert_count migration-ledger 1');
    expect(post).toContain('assert_count fueling-company-table 1');
    expect(post).toContain('assert_count fueling-company-columns 12');
    expect(post).toContain('assert_count fueling-company-indexes 3');
  });
});
