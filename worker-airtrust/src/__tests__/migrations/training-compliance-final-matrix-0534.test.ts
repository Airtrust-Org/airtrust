import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const migrationPath = 'worker-airtrust/migrations/0534_training_compliance_final_matrix.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0534_training_compliance_final_matrix.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-final-matrix-0534.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-final-matrix-0534.json';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('training compliance final matrix 0534', () => {
  it('keeps migration/change identical and manifest hashes exact', () => {
    const migration = read(migrationPath);
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-final-matrix-0534',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
      fileHash: hash(change),
      planHash: hash(plan),
    });
  });

  it('implements the final matrix metadata and the NR-05 EAD correction', () => {
    const sql = read(changePath);
    expect(sql).toContain("UPPER(TRIM(codigo))='NR-05'");
    expect(sql).toContain("categoria='EAD',validade=NULL");
    expect(sql).toContain("UPPER(TRIM(codigo))='COD_ETICA'");
    expect(sql).toContain("validade=12,carga_horaria=3");
    expect(sql).toContain("UPPER(TRIM(codigo))='INTEGRA'");
    expect(sql).toContain("UPPER(TRIM(codigo))='D2'");
    expect(sql).toContain("validade=36,carga_horaria=4,carga_horaria_inicial=4,carga_horaria_recorrente=4");
  });

  it('replaces the prior NR-20 hybrid rule with the final 24-month 2-hour EAD rule', () => {
    const sql = read(changePath);
    expect(sql).toContain("codigo='NR-20'");
    expect(sql).toContain("categoria='EAD',validade=24,carga_horaria=2");
    expect(sql).toContain('gerar_qualificacao_ao_concluir=1');
    expect(sql).not.toContain("modalidade_requerida='HIBRIDO'");
  });

  it('adds the final FDM mechanic and BOWTIEXP models and retires FDM-EAD compliance only', () => {
    const sql = read(changePath);
    expect(sql).toContain("'FDM-MECANICO','FDM - Mecânico','EAD',(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),NULL,1,1,1");
    expect(sql).toContain("'BOWTIEXP','BOWTIEXP','EAD',(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),24,4,4,4");
    expect(sql).toContain("UPPER(TRIM(codigo))='FDM-EAD'");
    expect(sql).not.toContain("UPDATE lms_cursos SET ativo=0");
  });

  it('preserves the evidence-bearing Regras de Ouro model while retiring the unused duplicate', () => {
    const sql = read(changePath);
    expect(sql).toContain("UPPER(TRIM(codigo))='PETRO-OURO'");
    expect(sql).toContain("codigo='REGRAS_OURO_PETROBRAS'");
    expect(sql).toContain("REGRAS_OURO_PETROBRAS_UNUSED_");
    expect(sql).toContain('qualificacoes_historico');
  });

  it('encodes exact function audiences and manager rules without inferring designations', () => {
    const sql = read(changePath);
    expect(sql).toContain("qt.codigo='NR-26'");
    expect(sql).toContain("'GERENTE DE SEGURANÇA OPERACIONAL'");
    expect(sql).toContain("qt.codigo IN ('PPSP_SUP','BOWTIEXP')");
    expect(sql).toContain("UPPER(TRIM(f.nome))='GERENTE'");
    expect(sql).toContain("AND escopo<>'FUNCIONARIO'");
  });

  it('fails closed and exposes only classified D1 query transport failures', () => {
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    expect(runner).toContain('REVIEWED_D1_QUERY_TRANSPORT=');
    expect(runner).toContain('REVIEWED_D1_QUERY_ERROR_CLASS=');
    expect(runner).toContain('SQLITE_INCOMPLETE_INPUT');
    expect(runner).toContain('SQLITE_CONSTRAINT');
    expect(runner).not.toContain('--json >/dev/null');
  });

  it('uses reviewed bounded query transport for 0534 after repeated D1_RESET_DO', () => {
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const workflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(runner).toContain('[[ "$migration_basename" == "0534_training_compliance_final_matrix.sql" ]]');
    const manifest = JSON.parse(read(manifestPath)) as { fileHash: string };
    expect(runner).toContain(manifest.fileHash);
    expect(runner).toContain('--env staging --remote --command="$sql_payload" --json');
    expect(runner).toContain('ledger_count="$(read_ledger_count)"');
    expect(runner).toContain('validate_postconditions');
    expect(workflow).toContain('"$CHANGE_ID" == "training-compliance-final-matrix-0534"');
    expect(workflow).toContain('--env production --remote --command="$sql_payload" --json');
    expect(workflow).toContain('Verify ledger postcondition');
  });

  it('binds both new EAD qualifications to the canonical tenant-6 category', () => {
    const sql = read(changePath);
    const lookup = "(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)";
    expect(sql.split('(empresa_id,codigo,nome,categoria,categoria_id,validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,area_id,ativo,is_check,observacoes,created_at,updated_at)').length - 1).toBe(2);
    expect(sql.split(lookup).length - 1).toBe(2);
    expect(read('scripts/staging/validate-0534-preflight.sh')).toContain('ead-category-canonical');
    expect(read('scripts/schema-v2/validate-0534-production-preflight.sh')).toContain('ead-category-canonical');
  });

  it('routes 0534 through governed staging and production validators', () => {
    const stagingWorkflow = read('.github/workflows/staging-d1-schema-change.yml');
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const productionWorkflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(stagingWorkflow).toContain('0534_training_compliance_final_matrix.sql');
    expect(runner).toContain('"0534_training_compliance_final_matrix.sql"');
    expect(runner).toContain('validate-0534-preflight.sh');
    expect(runner).toContain('validate-0534-postconditions.sh');
    expect(productionWorkflow).toContain("training-compliance-final-matrix-0534");
    expect(productionWorkflow).toContain('validate-0534-production-preflight.sh');
    expect(productionWorkflow).toContain('validate-0534-production-postconditions.sh');
  });
  it('prints only bounded read-only diagnostics if the INTEGRA postcondition diverges', () => {
    const script = read('scripts/staging/validate-0534-postconditions.sh');
    for (const key of [
      'DIAG_0534_INTEGRA_ACTIVE_CANONICAL',
      'DIAG_0534_INTEGRA_ANY_STATE',
      'DIAG_0534_INTEGRA_ACTIVE_EXACT',
      'DIAG_0534_INTEGRA_CATEGORY_EAD',
      'DIAG_0534_INTEGRA_VALIDITY_24',
      'DIAG_0534_INTEGRA_HOURS_2',
      'DIAG_0534_INTEGRA_NAME_CANDIDATES',
      'DIAG_0534_INTEGRA_ACTIVE_COURSES',
    ]) expect(script).toContain(key);
    expect(script).not.toContain('SELECT *');
    expect(script).not.toContain('DELETE FROM');
    expect(script).not.toContain('UPDATE qualificacoes_tipos');
  });

});
