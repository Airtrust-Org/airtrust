/**
 * CMA: validade por idade (fonte unica). 12 meses abaixo de 60 anos; 6 meses a partir
 * dos 60 anos completos na data de realizacao; sem data de nascimento: 12 meses COM
 * sinalizacao (nunca inventar idade). O vencimento segue a regra unica "no dia".
 */
import { describe, expect, it } from 'vitest';
import {
  CMA_VALIDITY_MONTHS_AGE_60_PLUS,
  CMA_VALIDITY_MONTHS_DEFAULT,
  cmaValidityWarning,
  completedAgeYears,
  isCmaCode,
  loadFuncionarioNascimento,
  resolveCmaValidity,
  resolveCmaValidityForEmployee,
} from '../cma-validity';
import { calcularDataVencimento } from '../qualificacoes-expiration';
import { resolveEffectiveValidityMonths } from '../../services/qualification-history-atomic';
import { resolveHistoricoValidadeMeses, resolveHistoricoDataVencimento } from '../../services/qualificacoes-tipos-sync';
import { resolveQualificationExportExpiry } from '../../services/qualificacoes/export-expiry';
import { SqliteD1Database } from '../../__tests__/helpers/qualification-history-sqlite-d1';

describe('completedAgeYears', () => {
  it('conta anos completos por componentes civis', () => {
    expect(completedAgeYears('1966-03-10', '2026-03-09')).toBe(59);
    expect(completedAgeYears('1966-03-10', '2026-03-10')).toBe(60);
    expect(completedAgeYears('1966-03-10', '2026-03-11')).toBe(60);
  });

  it('nascido em 29/02 completa anos em 01/03 nos anos nao bissextos', () => {
    expect(completedAgeYears('1964-02-29', '2024-02-29')).toBe(60);
    expect(completedAgeYears('1965-02-28', '2025-02-28')).toBe(60);
    expect(completedAgeYears('1964-02-29', '2025-02-28')).toBe(60);
    expect(completedAgeYears('1965-02-28', '2026-02-27')).toBe(60);
  });

  it('retorna null para datas invalidas ou referencia anterior ao nascimento', () => {
    expect(completedAgeYears(null, '2026-01-01')).toBeNull();
    expect(completedAgeYears('', '2026-01-01')).toBeNull();
    expect(completedAgeYears('1990-02-30', '2026-01-01')).toBeNull();
    expect(completedAgeYears('2030-01-01', '2026-01-01')).toBeNull();
  });
});

describe('resolveCmaValidity', () => {
  it('menos de 60 anos => 12 meses', () => {
    const v = resolveCmaValidity({ dataRealizacao: '2026-03-09', dataNascimento: '1966-03-10' });
    expect(v).toMatchObject({ months: 12, basis: 'UNDER_60', ageYears: 59, birthDateMissing: false, warning: null });
    expect(v.months).toBe(CMA_VALIDITY_MONTHS_DEFAULT);
  });

  it('exatamente 60 anos no dia da realizacao => 6 meses', () => {
    const v = resolveCmaValidity({ dataRealizacao: '2026-03-10', dataNascimento: '1966-03-10' });
    expect(v).toMatchObject({ months: 6, basis: 'AGE_60_PLUS', ageYears: 60, birthDateMissing: false, warning: null });
    expect(v.months).toBe(CMA_VALIDITY_MONTHS_AGE_60_PLUS);
  });

  it('mais de 60 anos => 6 meses', () => {
    expect(resolveCmaValidity({ dataRealizacao: '2026-03-10', dataNascimento: '1950-01-01' }).months).toBe(6);
  });

  it('sem data de nascimento => 12 meses com sinalizacao (nao inventa idade)', () => {
    for (const nascimento of [null, undefined, '', 'lixo', '1990-02-30']) {
      const v = resolveCmaValidity({ dataRealizacao: '2026-03-10', dataNascimento: nascimento });
      expect(v.months).toBe(12);
      expect(v.basis).toBe('BIRTH_DATE_MISSING');
      expect(v.ageYears).toBeNull();
      expect(v.birthDateMissing).toBe(true);
      expect(v.warning).toMatch(/nascimento/i);
    }
  });

  it('vencimento resultante segue a regra no dia', () => {
    const under = resolveCmaValidity({ dataRealizacao: '2026-01-31', dataNascimento: '1990-05-05' });
    expect(calcularDataVencimento('2026-01-31', under.months)).toBe('2027-01-31');
    const over = resolveCmaValidity({ dataRealizacao: '2026-08-31', dataNascimento: '1960-05-05' });
    expect(calcularDataVencimento('2026-08-31', over.months)).toBe('2027-02-28');
  });
});

describe('isCmaCode / cmaValidityWarning', () => {
  it('reconhece CMA sem diferenciar caixa/espacos e ignora outros codigos', () => {
    expect(isCmaCode('CMA')).toBe(true);
    expect(isCmaCode(' cma ')).toBe(true);
    expect(isCmaCode('ASO')).toBe(false);
    expect(isCmaCode(null)).toBe(false);
  });

  it('so sinaliza CMA sem nascimento', () => {
    expect(cmaValidityWarning({ codigo: 'CMA', dataRealizacao: '2026-01-01', dataNascimento: null })).toMatch(/nascimento/i);
    expect(cmaValidityWarning({ codigo: 'CMA', dataRealizacao: '2026-01-01', dataNascimento: '1990-01-01' })).toBeNull();
    expect(cmaValidityWarning({ codigo: 'ASO', dataRealizacao: '2026-01-01', dataNascimento: null })).toBeNull();
  });
});

describe('todos os caminhos de calculo usam a mesma regra de CMA', () => {
  const casos: Array<[string, string, string | null, 6 | 12]> = [
    ['abaixo de 60 anos', '2026-03-09', '1966-03-10', 12],
    ['exatamente 60 anos', '2026-03-10', '1966-03-10', 6],
    ['sem nascimento', '2026-03-10', null, 12],
  ];

  it.each(casos)('%s', (_nome, realizacao, nascimento, esperado) => {
    // atomic (create/renovar) — o modelo pode ter qualquer validade (inclusive 24): CMA e por idade
    for (const validadeModelo of [12, 24, null]) {
      expect(
        resolveEffectiveValidityMonths({
          qualificationCode: 'CMA',
          typeValidityMonths: validadeModelo,
          birthDate: nascimento,
          completionDate: realizacao,
        }),
      ).toBe(esperado);
    }
    // outros codigos nao sao afetados
    expect(
      resolveEffectiveValidityMonths({
        qualificationCode: 'ASO',
        typeValidityMonths: 12,
        birthDate: '1950-01-01',
        completionDate: realizacao,
      }),
    ).toBe(12);

    // sincronizacao do tipo -> historico
    const tipo = {
      codigo: 'CMA', nome: 'CMA', categoria: 'EXAME', validade: 24,
      cargaHoraria: null, cargaHorariaInicial: null, cargaHorariaRecorrente: null,
    };
    const sync = { dataConclusao: realizacao, dataVencimentoAtual: null, tipoTreinamento: null, nascimentoFuncionario: nascimento };
    expect(resolveHistoricoValidadeMeses(tipo, sync)).toBe(esperado);
    expect(resolveHistoricoDataVencimento(tipo, sync, esperado)).toBe(calcularDataVencimento(realizacao, esperado));

    // exportacao (fallback quando nao ha vencimento persistido)
    expect(
      resolveQualificationExportExpiry({
        validadeMeses: 24, dataVencimentoPersistida: null, dataRealizacao: realizacao,
        codigoQualificacao: 'CMA', nascimentoFuncionario: nascimento,
      }).validadeMeses,
    ).toBe(esperado);
  });
});

describe('resolveCmaValidityForEmployee (D1/SQLite, escopo de tenant)', () => {
  it('le funcionarios.nascimento do tenant e aplica a regra; outro codigo nao consulta o banco', async () => {
    const sqlite = new SqliteD1Database();
    sqlite.database.exec(`
      INSERT INTO funcionarios (id, empresa_id, nascimento, nome, cpf) VALUES
        (1, 6, '1966-03-10', 'A', '00000000001'), (2, 6, NULL, 'B', '00000000002'), (3, 7, '1950-01-01', 'C', '00000000003');
    `);
    const base = { codigo: 'CMA', empresaId: 6, dataRealizacao: '2026-03-10' };
    expect((await resolveCmaValidityForEmployee(sqlite, { ...base, funcionarioId: 1 }))?.months).toBe(6);
    expect((await resolveCmaValidityForEmployee(sqlite, { ...base, funcionarioId: 1, dataRealizacao: '2026-03-09' }))?.months).toBe(12);
    const semNascimento = await resolveCmaValidityForEmployee(sqlite, { ...base, funcionarioId: 2 });
    expect(semNascimento).toMatchObject({ months: 12, birthDateMissing: true });
    // funcionario de outro tenant nao vaza a data de nascimento: cai no padrao sinalizado
    expect(await loadFuncionarioNascimento(sqlite, 6, 3)).toBeNull();
    expect(await resolveCmaValidityForEmployee(sqlite, { ...base, funcionarioId: 3 })).toMatchObject({ months: 12, birthDateMissing: true });
    expect(await resolveCmaValidityForEmployee(sqlite, { ...base, codigo: 'ASO', funcionarioId: 1 })).toBeNull();
  });
});
