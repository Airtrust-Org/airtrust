import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const scriptPath = resolve(process.cwd(), '../scripts/compliance/reconcile-training-regulatory-matrix-v2.mjs');
const source = readFileSync(scriptPath, 'utf8');
const validatorPath = resolve(process.cwd(), '../scripts/staging/validate-training-regulatory-reconciliation.mjs');
const validatorSource = readFileSync(validatorPath, 'utf8');

function dryRun() {
  return execFileSync(process.execPath, [scriptPath, '--env=staging'], {
    encoding: 'utf8',
  });
}

describe('training regulatory reconciliation v2', () => {
  it('é staging-only e foi aposentado como superfície de escrita', () => {
    expect(source).toContain("const STAGING_DB = 'airtrust-db-staging-baseline-20260701'");
    expect(source).toContain('V2_RECONCILIATION_STAGING_ONLY');
    expect(source).toContain('V2_RECONCILIATION_APPLY_SUPERSEDED_BY_V3_SCHEMA_0526');
    expect(source).not.toContain('AIRTRUST_STAGING_RECONCILIATION_AUTH');
    expect(source).not.toContain('STAGING_RECONCILIATION_AUTH_REQUIRED');
    expect(source).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(source).not.toContain("'./node_modules/.bin/wrangler'");
    expect(source).not.toContain("production: 'airtrust-db'");
  });

  it('mantém apenas dry-run histórico e metadados compatíveis com a 0526', () => {
    const output = dryRun();
    expect(output).toContain('BASE_RECONCILIATION_SHA256=38f5912b3f4890a3c3acc956c8192d5cacfe259394fd6037571dc5889ea2bc75');
    expect(output).toMatch(/RECONCILIATION_SHA256=[0-9a-f]{64}/);
    expect(output).toContain('TARGET_DATABASE=airtrust-db-staging-baseline-20260701');
    expect(output).toContain('MODE=DRY_RUN');
    expect(output).toContain('STATEMENTS=65');
    expect(output).toContain("'D1','AVSEC','Teórico',24,4");
    expect(output).toContain("'NR-20 - Intermediário sobre Inflamáveis e Combustíveis','EAD',24,16");
    expect(output).toContain("'NR-35 - Trabalho em Altura','Presencial',24,8");
    expect(output).toContain("'PRE - Plano de Resposta à Emergências','EAD',12,2");
    expect(output).toContain("UPPER('TREINAMENTO_OPERACIONAL')");
    const sql = output.split('STATEMENTS=65\n')[1];
    expect(sql).toBeTruthy();
    const modelInserts = sql.split(';\n').filter((statement) => statement.startsWith('INSERT INTO qualificacoes_tipos ('));
    expect(modelInserts).toHaveLength(22);
    expect(modelInserts.every((statement) => statement.includes('categoria_id'))).toBe(true);
    expect(validatorSource).toContain('staging-qualification-category');
    expect(validatorSource).toContain('reconciled-model-category-bindings');
    expect(output).toContain("'PTAP_TRIPULANTE_VOO','Tripulante de voo PTAP','ATIVIDADE'");
    expect(output).not.toContain("UPPER('TRI')");
    expect(output).not.toContain('INSERT INTO lms_matriculas');
    expect(output).not.toMatch(/auto_matricular_ead\s*=\s*1/i);
  });

  it('recusa produção e recusa qualquer tentativa de apply por estar superseded', () => {
    const production = spawnSync(process.execPath, [scriptPath, '--env=production'], { encoding: 'utf8' });
    expect(production.status).not.toBe(0);
    expect(production.stderr).toContain('V2_RECONCILIATION_STAGING_ONLY');

    const apply = spawnSync(
      process.execPath,
      [scriptPath, '--apply', '--env=staging'],
      { encoding: 'utf8' },
    );
    expect(apply.status).not.toBe(0);
    expect(apply.stderr).toContain('V2_RECONCILIATION_APPLY_SUPERSEDED_BY_V3_SCHEMA_0526');
  });
});
