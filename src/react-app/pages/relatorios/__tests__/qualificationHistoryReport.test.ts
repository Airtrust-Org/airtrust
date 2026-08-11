import { describe, expect, it } from 'vitest';
import type { HistoricoQualificacao } from '@/react-app/hooks/useQualificacoesExt';
import {
  applyQualificationHistoryReportClientFilters,
  buildQualificationHistoryReportQuery,
  buildQualificationHistoryReportRows,
  qualificationStatusLabel,
  type QualificationHistoryReportFilters,
} from '../qualificationHistoryReport';

const baseFilters: QualificationHistoryReportFilters = {
  statuses: ['VENCIDA', 'VENCENDO_30', 'VALIDA'],
};

function historyRow(overrides: Partial<HistoricoQualificacao> = {}): HistoricoQualificacao {
  return {
    id: 1,
    funcionario_id: 10,
    qualificacao_id: 20,
    data_registro: '2026-01-01',
    ...overrides,
  };
}

describe('qualificationHistoryReport', () => {
  it('encaminha filtros canônicos ao endpoint protegido do histórico', () => {
    const query = buildQualificationHistoryReportQuery(
      {
        ...baseFilters,
        search: 'Silva',
        setorIds: [4, 9],
        funcionarioId: 21,
        tipoId: 31,
        aeronaveId: 7,
        categoria: 'SIMULADOR',
      },
      2,
    );
    const url = new URL(query, 'https://airtrust.local');

    expect(url.pathname).toBe('/api/qualificacoes/historico');
    expect(url.searchParams.get('statuses')).toBe('VENCIDA,VENCENDO_30,VALIDA');
    expect(url.searchParams.get('setor_ids')).toBe('4,9');
    expect(url.searchParams.get('funcionario_id')).toBe('21');
    expect(url.searchParams.get('tipo_id')).toBe('31');
    expect(url.searchParams.get('aeronave_id')).toBe('7');
    expect(url.searchParams.get('categoria')).toBe('SIMULADOR');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('500');
  });

  it('preserva VENCENDO_30 como a regra canônica de em vencimento', () => {
    expect(qualificationStatusLabel('VENCENDO_30')).toBe('Em vencimento');
    const query = buildQualificationHistoryReportQuery({ statuses: ['VENCENDO_30'] });
    expect(new URL(query, 'https://airtrust.local').searchParams.get('statuses')).toBe(
      'VENCENDO_30',
    );
  });

  it('filtros locais somente reduzem o conjunto já autorizado pelo backend', () => {
    const rows: HistoricoQualificacao[] = [
      historyRow({
        id: 1,
        funcionario_nome: 'Ana',
        funcionario_funcao: 'Comandante',
        qualificacao_desc: 'Periódico',
        data_conclusao: '2026-01-15',
        data_vencimento: '2026-09-15',
        status: 'VALIDA',
      }),
      historyRow({
        id: 2,
        funcionario_id: 11,
        funcionario_nome: 'Bruno',
        funcionario_funcao: 'Copiloto',
        qualificacao_desc: 'Periódico',
        data_conclusao: '2026-02-15',
        data_vencimento: '2026-10-15',
        status: 'VALIDA',
      }),
    ];

    const filtered = applyQualificationHistoryReportClientFilters(rows, {
      ...baseFilters,
      funcao: 'comandante',
      vencimentoInicio: '2026-09-01',
      vencimentoFim: '2026-09-30',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });

  it('gera linhas com status textual e datas legíveis sem recalcular status', () => {
    const rows = buildQualificationHistoryReportRows([
      historyRow({
        funcionario_nome: 'Ana',
        funcionario_setor: 'Operações',
        funcionario_funcao: 'Comandante',
        qualificacao_desc: 'Periódico AW139',
        data_conclusao: '2026-01-15',
        data_vencimento: '2026-09-15',
        status: 'VENCENDO_30',
      }),
    ]);

    expect(rows[0]).toMatchObject({
      status: 'VENCENDO_30',
      statusLabel: 'Em vencimento',
      dataConclusao: '15/01/2026',
      dataVencimento: '15/09/2026',
    });
  });
});
