import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), '../scripts/compliance/reconcile-training-regulatory-matrix.mjs'),
  'utf8',
);

describe('training regulatory reconciliation', () => {
  it('é dry-run por padrão e bloqueia apply de produção sem autorização específica', () => {
    expect(source).toContain("const apply = args.has('--apply')");
    expect(source).toContain("env === 'production' && apply");
    expect(source).toContain('AIRTRUST_PRODUCTION_RECONCILIATION_AUTH');
  });

  it('não cria matrícula e converte regras históricas em condição/designação', () => {
    expect(source).not.toContain('INSERT INTO lms_matriculas');
    expect(source).toContain("condition: 'ARSO'");
    expect(source).toContain("condition: 'SUPERVISOR_ARSO'");
    expect(source).toContain("condition: 'TRABALHO_ALTURA_AUTORIZADO'");
    expect(source).toContain("condition: 'OPERADOR_EQUIP_MOVIMENTACAO'");
    expect(source).toContain("condition: 'MANUSEIA_PRODUTO_QUIMICO'");
  });

  it('cria somente modelos ausentes controlados e preserva DGR/AVSEC por perfil', () => {
    expect(source).toContain("code: 'NR-05'");
    expect(source).toContain("code: 'NR-12'");
    expect(source).toContain("code: 'BRIGADA_INCENDIO'");
    expect(source).toContain("code: 'PRIMEIROS_SOCORROS'");
    expect(source).toContain("code: 'COD_ETICA'");
    expect(source).toContain("profile: 'PTAP_COORDENADOR_VOO'");
    expect(source).toContain("profile: 'PTAP_ATENDIMENTO_BALCAO'");
    expect(source).toContain("profile: 'PTAP_AGENTE_RAMPA'");
    expect(source).toContain("profile: 'PTAP_TRIPULANTE_VOO'");
    expect(source).toContain("profile: 'AVSEC_ATENDIMENTO_PASSAGEIRO'");
    expect(source).toContain("profile: 'AVSEC_OPERACOES_SOLO'");
  });

  it('mantém auto-matrícula desligada em toda regra criada', () => {
    expect(source).not.toContain('auto_matricular_ead=1');
    expect(source).not.toContain('auto_matricular_ead = 1');
    expect(source).toContain('auto_matricular_ead,ativo');
  });
});
