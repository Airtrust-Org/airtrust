import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('staging governance for Controle de Voos 0501', () => {
  const dispatcher = read('scripts/staging/apply-approved-migrations.sh');
  const dedicatedRunner = read(
    'scripts/staging/apply-0501-controle-voos-leg-operational-weights.sh',
  );
  const recoveryRunner = read(
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
  );
  const postconditions = read('scripts/staging/validate-0501-postconditions.sh');

  it('allowlists 0501 and routes it only through the dedicated Schema V2-aware runner', () => {
    expect(dispatcher).toContain('"0501_controle_voos_leg_operational_weights.sql"');
    expect(dispatcher).toContain(
      'exec bash "$ROOT/scripts/staging/apply-0501-controle-voos-leg-operational-weights.sh"',
    );
    expect(recoveryRunner).toContain('"0501_controle_voos_leg_operational_weights.sql"');
    expect(recoveryRunner).toContain(
      'bash scripts/staging/validate-0501-postconditions.sh --target="$db_name"',
    );
  });

  it('pins the reviewed Schema V2 manifest, mirror SQL and official staging target', () => {
    expect(dedicatedRunner).toContain(
      'SCHEMA_CHANGE_ID="controle-voos-leg-operational-weights-0501"',
    );
    expect(dedicatedRunner).toContain(
      "manifest.filePath !== 'worker-airtrust/schema-v2/changes/0501_controle_voos_leg_operational_weights.sql'",
    );
    expect(dedicatedRunner).toContain(
      "manifest.planPath !== 'worker-airtrust/schema-v2/plans/controle-voos-leg-operational-weights-0501.md'",
    );
    expect(dedicatedRunner).toContain(
      'cmp -s "$migration_arg" "$schema_sql_path"',
    );
    expect(dedicatedRunner).toContain(
      'db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"',
    );
    expect(dedicatedRunner).toContain(
      'echo "ERROR: 0501 schema/ledger drift or partial apply"',
    );
  });

  it('validates ledger, schema columns and the tenant-scoped Petrobras catalog row', () => {
    expect(postconditions).toContain('assert_count migration-ledger 1');
    expect(postconditions).toContain('assert_count aircraft-weight-columns 2');
    expect(postconditions).toContain('assert_count stage-operational-columns 7');
    expect(postconditions).toContain('assert_count tenant6-petrobras-active 1');
    expect(postconditions).toContain(
      "empresa_id=6 AND codigo='PETROBRAS' AND ativo=1 AND deleted_at IS NULL",
    );
  });
});
