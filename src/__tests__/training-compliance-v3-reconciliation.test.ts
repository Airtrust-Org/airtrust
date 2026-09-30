import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('training compliance V3 reconciliation', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/compliance/reconcile-training-compliance-v3.mjs', '--env=staging'],
    { encoding: 'utf8' },
  );
  const source = readFileSync('scripts/compliance/reconcile-training-compliance-v3.mjs', 'utf8');

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

  it('limits FDM training to a formal FDM designation', () => {
    expect(source).toContain("deactivate('FDM-EAD')");
    expect(source).toContain("condition: 'FDM_EQUIPE'");
  });
});
