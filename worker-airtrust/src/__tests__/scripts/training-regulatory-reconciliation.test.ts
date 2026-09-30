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

  it('resolve staging para o D1 explícito de staging, nunca para o nome de produção', () => {
    expect(source).toContain("staging: 'airtrust-db-staging-baseline-20260701'");
    expect(source).toContain("production: 'airtrust-db'");
    expect(source).toContain('const target = TARGETS[env]');
    expect(source).toContain('TARGET_DATABASE=${target}');
    expect(source).not.toContain("const target = 'airtrust-db'");
  });

  it('não cria matrícula e usa função automática para exposições inerentes sem perder exceções individuais', () => {
    expect(source).not.toContain('INSERT INTO lms_matriculas');
    expect(source).toContain("condition: 'ARSO'");
    expect(source).toContain("condition: 'SUPERVISOR_ARSO'");
    expect(source).toContain("for (const functionCode of ['MEC', 'ORG_AUX_MAN'])");
    expect(source).toContain("code: 'NR06'");
    expect(source).toContain("condition: 'USO_EPI_REQUER_TREINAMENTO'");
    expect(source).toContain("condition: 'TRABALHO_ALTURA_AUTORIZADO'");
    expect(source).toContain("condition: 'OPERADOR_EQUIP_MOVIMENTACAO'");
    expect(source).toContain("condition: 'MANUSEIA_PRODUTO_QUIMICO'");
  });

  it('mantém NR-20 Iniciação restrita a acesso sem contato e falha fechado para contato direto', () => {
    expect(source).toContain("condition: 'NR20_AREA_SEM_CONTATO'");
    expect(source).toContain('Não vincular');
    expect(source).toContain('NR20_CONTATO_DIRETO');
    expect(source).not.toMatch(/code:\s*'NR-20'[\s\S]{0,180}condition:\s*'NR20_CONTATO_DIRETO'/);
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
