/**
 * #1492 / #2158: regra canonica de validade em meses (vence NO DIA: dia preservado,
 * limitado ao ultimo dia do mes-alvo; o modo "fim do mes" foi removido). Mesma resposta em todos os
 * consumidores do Worker + SQL. Rode tambem com TZ=America/Sao_Paulo e
 * TZ=Pacific/Auckland: o resultado nao pode depender do fuso.
 */
import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsClamped,
  parseCivilDay,
  tryAddCalendarMonthsClamped,
} from '../../../../src/shared/utils/validade-meses';
import { calcularDataVencimento as util } from '../qualificacoes-expiration';
import { calcularDataVencimento as historico } from '../../services/qualificacoes/historico-helpers';
import { resolveHistoricoDataVencimento } from '../../services/qualificacoes-tipos-sync';
import { calculateQualificationExpiry } from '../../services/qualification-history-atomic';
import { computeRequirement, type Rule } from '../../services/training-compliance-snapshot-builder';
import { sqlAddMonthsClamped } from '../sql-add-months';
import { SqliteD1Database } from '../../__tests__/helpers/qualification-history-sqlite-d1';

/** [conclusao, meses, vencimentoNoDia] */
const CASES: Array<[string, number, string]> = [
  ['2024-02-29', 24, '2026-02-28'],
  ['2025-01-31', 1, '2025-02-28'],
  ['2024-01-31', 1, '2024-02-29'],
  ['2024-04-30', 1, '2024-05-30'],
  ['2024-02-29', 12, '2025-02-28'],
  ['2024-02-29', 48, '2028-02-29'],
  ['2023-08-31', 6, '2024-02-29'],
  ['2023-08-31', 3, '2023-11-30'],
  ['2024-12-15', 1, '2025-01-15'],
  ['2024-11-30', 3, '2025-02-28'],
  ['2024-01-15', 12, '2025-01-15'],
  ['2025-10-31', 24, '2027-10-31'],
  ['2024-03-31', 11, '2025-02-28'],
  ['2024-05-31', 120, '2034-05-31'],
];

describe('funcao canonica', () => {
  it.each(CASES)('%s + %im => vence no dia %s', (data, meses, exato) => {
    expect(addCalendarMonthsClamped(data, meses)).toBe(exato);
  });

  it('aceita sufixo de hora e rejeita datas inexistentes/mal formadas', () => {
    expect(addCalendarMonthsClamped('2025-01-31T12:00:00Z', 1)).toBe('2025-02-28');
    for (const bad of ['2024-02-30', '2025-02-29', '2024-13-01', '2024-00-10', 'abc', '', '2024-1-1']) {
      expect(parseCivilDay(bad)).toBeNull();
      expect(() => addCalendarMonthsClamped(bad, 1)).toThrow();
      expect(tryAddCalendarMonthsClamped(bad, 1)).toBeNull();
    }
    expect(parseCivilDay(null)).toBeNull();
  });

  it('meses <= 0, nao inteiros ou fora do intervalo lancam', () => {
    for (const m of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => addCalendarMonthsClamped('2024-01-15', m)).toThrow();
      expect(tryAddCalendarMonthsClamped('2024-01-15', m)).toBeNull();
    }
    expect(() => addCalendarMonthsClamped('2024-01-15', 12 * 9000)).toThrow();
  });
});

describe('consumidores do Worker usam a mesma regra', () => {
  const tipo = (fim: number) => ({
    codigo: 'X', nome: 'X', categoria: null, validade: 1, vencimento_fim_mes: fim,
    cargaHoraria: null, cargaHorariaInicial: null, cargaHorariaRecorrente: null,
  });
  const syncInput = (dataConclusao: string) => ({
    dataConclusao, dataVencimentoAtual: null, tipoTreinamento: null, nascimentoFuncionario: null,
  });
  const rule = (fim: number, meses: number) =>
    ({
      id: 1, empresa_id: 6, qualificacao_tipo_id: 10, qualificacao_tipo_nome: 'T',
      qualificacao_tipo_codigo: 'T', validade_meses: meses, escopo: 'EMPRESA', setor_id: null,
      setor_nome: null, funcao_id: null, funcao_nome: null, funcionario_id: null,
      funcionario_nome: null, aeronave_modelo: null, condicao_id: null, condicao_codigo: null,
      condicao_nome: null, justificativa: null, perfil_competencia: null,
      modalidade_requerida: null, fundamento_tipo: null, fundamento_documento: null,
      fundamento_item: null, validade_fonte: 'MODELO', obrigatoriedade: 'OBRIGATORIA',
      nivel_requerido: null, critico_operacional: 0, origem: 'REGULATORIO',
      referencia_normativa: null, observacoes: null, vigencia_inicio: null, vigencia_fim: null,
      prazo_inicial_dias: null, auto_matricular_ead: 0, ativo: 1, created_at: '2026-01-01',
      updated_at: '2026-01-01', vencimento_fim_mes: fim,
    }) as Rule;
  const evidence = (data_realizacao: string) => ({
    funcionario_id: 1, tipo_id: 10, data_realizacao, data_vencimento: null,
    origem: 'QUALIFICACAO' as const, origem_id: 1, origem_titulo: null, modalidade: 'PRESENCIAL',
  });

  it.each(CASES)('%s + %im', (data, meses, esperado) => {
    // A coluna legada vencimento_fim_mes (0 ou 1) e IGNORADA em todos os consumidores.
    for (const flag of [0, 1]) {
      expect(util(data, meses)).toBe(esperado);
      expect(historico({ dataConclusao: data, validadeMeses: meses })).toBe(esperado);
      expect(
        resolveHistoricoDataVencimento(tipo(flag), syncInput(data), meses),
      ).toBe(esperado);
      expect(calculateQualificationExpiry({ completionDate: data, validityMonths: meses })).toBe(esperado);
      expect(
        computeRequirement(rule(flag, meses), [evidence(data)] as never, [], { today: '2090-01-01' })
          .data_validade,
      ).toBe(esperado);
    }
  });

  it('contratos de erro/nulo preservados', () => {
    expect(() => util('2024-01-15', 0)).toThrow();
    expect(() => util('invalid', 1)).toThrow();
    expect(historico({ dataConclusao: 'x', validadeMeses: 1 })).toBeNull();
    expect(historico({ dataConclusao: '2024-01-31', validadeMeses: 0 })).toBeNull();
  });
});

describe('paridade SQL x TypeScript', () => {
  it('sqlAddMonthsClamped == addCalendarMonthsClamped para cada caso e para uma varredura', () => {
    const { database } = new SqliteD1Database();
    const expr = sqlAddMonthsClamped('?', '?');
    // O SQL repete os placeholders; usa colunas via CTE para evitar contagem de binds.
    const stmt = database.prepare(
      `WITH t(d, m) AS (SELECT ?, ?) SELECT ${sqlAddMonthsClamped('d', 'm')} AS r FROM t`,
    );
    expect(expr).toContain('CASE');
    const dates: string[] = [];
    for (const y of [2023, 2024, 2025, 2028]) {
      for (let m = 1; m <= 12; m += 1) {
        for (const d of [1, 15, 28, 29, 30, 31]) {
          const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (parseCivilDay(iso)) dates.push(iso);
        }
      }
    }
    for (const date of dates) {
      for (const months of [1, 2, 3, 6, 11, 12, 13, 24, 36, 48]) {
        const row = stmt.get(date, months) as { r: string };
        expect(row.r, `${date} + ${months}m`).toBe(addCalendarMonthsClamped(date, months));
      }
    }
    for (const [data, meses, exato] of CASES) {
      expect((stmt.get(data, meses) as { r: string }).r).toBe(exato);
    }
  });

  it('NULL/invalido propaga NULL, como o date() original', () => {
    const { database } = new SqliteD1Database();
    const stmt = database.prepare(
      `WITH t(d, m) AS (SELECT ?, ?) SELECT ${sqlAddMonthsClamped('d', 'm')} AS r FROM t`,
    );
    expect((stmt.get(null, 12) as { r: unknown }).r).toBeNull();
    expect((stmt.get('2024-01-31', null) as { r: unknown }).r).toBeNull();
    expect((stmt.get('lixo', 1) as { r: unknown }).r).toBeNull();
  });
});

describe('independencia de fuso', () => {
  it('resultado identico qualquer TZ do processo (rodar com TZ=Pacific/Auckland e America/Sao_Paulo)', () => {
    for (const [data, meses, exato] of CASES) {
      expect(addCalendarMonthsClamped(data, meses)).toBe(exato);
    }
  });
});
