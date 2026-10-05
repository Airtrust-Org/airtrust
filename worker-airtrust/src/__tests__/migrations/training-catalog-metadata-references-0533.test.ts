import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const migrationPath = 'worker-airtrust/migrations/0533_training_catalog_metadata_references.sql';
const changePath =
  'worker-airtrust/schema-v2/changes/0533_training_catalog_metadata_references.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-catalog-metadata-references-0533.md';
const manifestPath = 'worker-airtrust/schema-v2/training-catalog-metadata-references-0533.json';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('training catalog metadata references 0533', () => {
  it('keeps canonical migration and reviewed Schema V2 change identical and hashed', () => {
    const migration = read(migrationPath);
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;

    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-catalog-metadata-references-0533',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
      fileHash: hash(change),
      planHash: hash(plan),
    });
  });

  it('adds explicit references to qualification and LMS metadata', () => {
    const sql = read(changePath);
    expect(sql).toContain('ALTER TABLE qualificacoes_tipos ADD COLUMN referencias TEXT;');
    expect(sql).toContain('ALTER TABLE lms_cursos ADD COLUMN referencias TEXT;');
    expect(sql).toContain('referencias=(SELECT qt.referencias');
    expect(sql).toContain('empresa_id=6');
  });

  it('applies the reviewed maintenance 24-month rule and corrected loads', () => {
    const sql = read(changePath);
    for (const code of [
      'MNT_ARRIEL2',
      'MNT_ARRIEL2_DESM_MOD',
      'MNT_HUMS',
      'MNT_IRM',
      'MNT_IIO_APRS',
      'MNT_MCQ',
      'MNT_MGM',
      'MNT_MOM',
    ]) {
      expect(sql).toContain(code);
    }
    expect(sql).toContain('SET validade=24');
    expect(sql).toContain('validade_meses=24');
    expect(sql).toContain("UPPER(TRIM(codigo))='PT6C-67C'");
    expect(sql).toContain('carga_horaria_inicial=16');
    expect(sql).toContain('carga_horaria_recorrente=8');
    expect(sql).toContain("UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO'");
  });

  it('keeps regulated NR-20/NR-35 completion fail-closed for EAD-only completion', () => {
    const sql = read(changePath);
    expect(sql).toContain("modalidade_requerida='PRESENCIAL'");
    expect(sql).toContain("modalidade_requerida='HIBRIDO'");
    expect(sql).toContain('auto_matricular_ead=0');
    expect(sql).toContain('gerar_qualificacao_ao_concluir=0');
    expect(sql).toContain('Portaria MTE nº 1.259/2026');
  });

  it('routes 0533 through the governed staging recovery-point workflow', () => {
    const workflow = read('.github/workflows/staging-d1-schema-change.yml');
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const migration = '0533_training_catalog_metadata_references.sql';
    expect(
      workflow.match(new RegExp(`^\\s*- ${migration.replace('.', '\\.')}$`, 'gm')),
    ).toHaveLength(1);
    expect(workflow).toContain(
      `0532_training_compliance_fdm_designation_only.sql|${migration}) ;;`,
    );
    expect(runner.match(new RegExp(`^\\s*"${migration.replace('.', '\\.')}"$`, 'gm'))).toHaveLength(
      1,
    );
    expect(
      runner.match(/bash scripts\/staging\/validate-0533-preflight\.sh --target="\$db_name"/g),
    ).toHaveLength(1);
    expect(
      runner.match(/bash scripts\/staging\/validate-0533-postconditions\.sh --target="\$db_name"/g),
    ).toHaveLength(1);
  });

  it('ships governed preflight and postcondition validators', () => {
    const files = [
      'scripts/schema-v2/validate-0533-production-preflight.sh',
      'scripts/schema-v2/validate-0533-production-postconditions.sh',
      'scripts/staging/validate-0533-preflight.sh',
      'scripts/staging/validate-0533-postconditions.sh',
    ].map(read);
    for (const source of files) {
      expect(source).toContain('0533');
      expect(source).toContain('referencias');
    }
  });
});
