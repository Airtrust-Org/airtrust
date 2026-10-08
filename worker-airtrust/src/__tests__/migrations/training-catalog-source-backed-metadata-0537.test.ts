import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const migrationPath = 'worker-airtrust/migrations/0537_training_catalog_source_backed_metadata.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0537_training_catalog_source_backed_metadata.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-catalog-source-backed-metadata-0537.md';
const manifestPath = 'worker-airtrust/schema-v2/training-catalog-source-backed-metadata-0537.json';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('training catalog source-backed metadata 0537', () => {
  it('pins identical migration/change SQL and reviewed plan in Schema V2', () => {
    const sql = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(read(migrationPath)).toBe(sql);
    expect(manifest).toMatchObject({
      changeId: 'training-catalog-source-backed-metadata-0537',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      fileHash: sha256(sql),
      planPath,
      planHash: sha256(plan),
    });
  });

  it('uses PTM Rev.06 without fabricating standalone manual hours', () => {
    const sql = read(changePath);
    expect(sql).toContain('PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06, item 20.3');
    expect(sql).toContain("UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO'");
    expect(sql).toContain('carga_horaria_inicial=8');
    expect(sql).toContain('carga_horaria_recorrente=4');
    expect(sql).toContain('O PTM não atribui carga horária autônoma');
    expect(sql).not.toContain('PTM Rev.07, item 20.3');
  });

  it('sources FDM loads from Manual FDM Rev.09 Annex 1', () => {
    const sql = read(changePath);
    expect(sql).toContain('Anexo 1 — Grupo de Voo');
    expect(sql).toContain('Anexo 1 — Comitê do FDM');
    expect(sql).toContain('Anexo 1 — Mecânicos');
    expect(sql).toContain("UPPER(TRIM(codigo))='FDM-TRIPULACAO'");
    expect(sql).toContain("UPPER(TRIM(codigo))='FDM-COMITE-GATEKEEPER'");
    expect(sql).toContain("UPPER(TRIM(codigo))='FDM-MECANICO'");
  });

  it('records LGPD two-hour evidence as company practice, not statutory minimum', () => {
    const sql = read(changePath);
    expect(sql).toContain('Certificado 2025 CDS Curso de LGPD — 2 horas EAD');
    expect(sql).toContain('a LGPD não fixa carga horária mínima universal');
  });

  it('does not create courses, enrollments, histories or employee assignments', () => {
    const sql = read(changePath);
    expect(sql).not.toContain('INSERT INTO lms_cursos');
    expect(sql).not.toContain('INSERT INTO lms_matriculas');
    expect(sql).not.toContain('INSERT INTO qualificacoes_historico');
    expect(sql).not.toContain('INSERT INTO funcionarios_compliance_condicoes');
  });

  it('keeps staging LGPD bootstrap guarded and 0537 PTM source checks aligned', () => {
    const preflight = read('scripts/staging/validate-0537-preflight.sh');
    const adapter = read('scripts/staging/staging-migration-adapters.mjs');
    const post = read('scripts/staging/validate-0537-postconditions.sh');
    const source = 'PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06';
    expect(preflight).toContain('lgpd-staging-template');
    expect(preflight).toContain('lgpd-staging-bootstrap-required');
    expect(adapter).toContain("migrationName === '0537_training_catalog_source_backed_metadata.sql'");
    expect(adapter).toContain("src.codigo='LGPD_SEG_INFO'");
    expect(adapter).toContain("SELECT 6,'LGPD'");
    expect(post).toContain(`referencias LIKE '%${source}%'`);
    const production = read('scripts/schema-v2/validate-0537-production-postconditions.sh');
    expect(production).toContain(`referencias LIKE '%${source}%'`);
    expect(read(changePath)).toContain(source);
  });

  it('wires governed staging and production validation', () => {
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const staging = read('.github/workflows/staging-d1-schema-change.yml');
    const production = read('.github/workflows/apply-schema-change-v2.yml');
    expect(runner).toContain('0537_training_catalog_source_backed_metadata.sql');
    expect(runner).toContain('validate-0537-preflight.sh');
    expect(runner).toContain('validate-0537-postconditions.sh');
    expect(staging).toContain('0537_training_catalog_source_backed_metadata.sql');
    expect(production).toContain('training-catalog-source-backed-metadata-0537');
    expect(production).toContain('validate-0537-production-preflight.sh');
    expect(production).toContain('validate-0537-production-postconditions.sh');
  });
});
