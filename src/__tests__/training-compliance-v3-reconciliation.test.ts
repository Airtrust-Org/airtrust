import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('training compliance V3 reconciliation', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/compliance/reconcile-training-compliance-v3.mjs', '--env=staging'],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );
  const source = readFileSync('scripts/compliance/reconcile-training-compliance-v3.mjs', 'utf8');
  const stagingWorkflow = readFileSync(
    '.github/workflows/staging-training-compliance-regulatory-reconciliation-v3.yml',
    'utf8',
  );
  const stagingValidator = readFileSync(
    'scripts/staging/validate-training-regulatory-reconciliation.mjs',
    'utf8',
  );

  it('is dry-run only by default and never auto-enrolls', () => {
    expect(output).toContain('MODE=DRY_RUN');
    expect(output).not.toContain('INSERT INTO lms_matriculas');
    expect(output).not.toMatch(/auto_matricular_ead\s*=\s*1/i);
  });

  it('uses Comandante and Copiloto instead of a generic flightcrew requirement', () => {
    expect(output).toContain("TRIM('Comandante')");
    expect(output).toContain("TRIM('Copiloto')");
    expect(source).toContain("profile: 'AVSEC_TRIPULANTE'");
    expect(source).toContain("'PTAP_TRIPULANTE_VOO'");
  });

  it('treats AVSEC awareness as a corporate requirement and keeps activity certifications separate', () => {
    expect(source).toContain("code: 'AVSEC_CONSC'");
    expect(source).toContain('inclusive os lotados no escritório do Rio');
    expect(source).toContain('RBAC 107.97');
    expect(source).toContain('a validade da conscientização acompanha a credencial');
    expect(output).toContain('AVSEC_CONSC');
    expect(output).toContain("'EMPRESA','OBRIGATORIA'");
    expect(output).not.toContain('AVSEC_CREDENCIAL_PERMANENTE');
    expect(output).not.toMatch(/AVSEC_CONSC[\s\S]{0,600}auto_matricular_ead\s*=\s*1/i);
  });

  it('refuses direct production apply outside the governed production workflow', () => {
    expect(source).toContain('PRODUCTION_APPLY_REQUIRES_GOVERNED_PRODUCTION_WORKFLOW');
  });

  it('runs the governed staging workflow with the V3 executor after schema 0519', () => {
    expect(stagingWorkflow).toContain('reconcile-training-compliance-v3.mjs');
    expect(stagingWorkflow).not.toContain('reconcile-training-regulatory-matrix-v2.mjs');
    expect(stagingWorkflow).toContain('expected_reconciliation_sha256');
    expect(stagingWorkflow).toContain('AIRTRUST_STAGING_APPLY_TRAINING_COMPLIANCE_V3');
    expect(stagingValidator).toContain('ledger-0519');
    expect(stagingValidator).toContain('avsec-awareness-corporate');
  });

  it('keeps one DGR qualification with functional profiles', () => {
    expect(source).toContain("deactivate('D4')");
    expect(source).toContain("'PTAP_COORDENADOR_VOO'");
    expect(source).toContain("'PTAP_ATENDIMENTO_BALCAO'");
    expect(source).toContain("'PTAP_AGENTE_RAMPA'");
    expect(source).toContain("'PTAP_AGENTE_RAMPA_DG'");
  });

  it('keeps CA-EBS separate and marks SOP as internal improvement', () => {
    expect(source).toContain("deactivate('CA-EBS')");
    expect(source).toContain("foundation: 'PETROBRAS_IOGP'");
    expect(source).toContain('HUETs legados que não incluíram CA-EBS');
    expect(source).toContain("foundation: 'APRIMORAMENTO_INTERNO'");
  });

  it('retires standalone LOFT and English Assessment without deleting history', () => {
    expect(source).toContain("for (const code of ['LOFT', 'EN-ASSES'])");
    expect(source).toContain('setModelActive(code, false)');
    expect(output).toContain('SET ativo=0');
    expect(output).not.toContain('DELETE FROM qualificacoes_historico');
  });

  it('keeps the audited FDM awareness population and a designation fallback for exceptions', () => {
    expect(source).toContain("deactivate('FDM-EAD')");
    expect(source).toContain('const fdmAwarenessFunctions = [');
    for (const functionName of [
      'Comandante',
      'Copiloto',
      'Mecânico',
      'Auxiliar de Manutenção',
      'Coordenador de Engenharia',
      'Analista de CTM',
      'Analista de CTM I',
      'Auxiliar de CTM',
      'Auxiliar de CTM I',
      'Gerente de Operações',
      'Assistente de Segurança Operacional',
      'Auxiliar de QSMS',
      'Técnico de Segurança do Trabalho',
    ]) {
      expect(source).toContain(`'${functionName}'`);
    }
    expect(source).toContain("condition: 'FDM_EQUIPE'");
    expect(source).toContain('familiarização/conhecimento geral do programa FDM/HFDM');
  });
});
