import { describe, expect, it } from 'vitest';

import {
  buildHistoricoTipoSnapshot,
  shouldSyncHistoricoSnapshotsOnTipoUpdate,
} from '../../services/qualificacoes-tipos-sync';

describe('qualificacoes-tipos-sync', () => {
  it('recalcula vencimento no dia exato e replica snapshots principais', () => {
    const snapshot = buildHistoricoTipoSnapshot(
      {
        codigo: 'FAP14-139',
        nome: 'FAP 14 - Exame em Rota - AW139',
        categoria: 'CHECK',
        validade: 12,
        vencimentoFimMes: 0,
        cargaHoraria: null,
        cargaHorariaInicial: null,
        cargaHorariaRecorrente: null,
      },
      {
        dataConclusao: '2025-04-15',
        dataVencimentoAtual: '2025-10-15',
        tipoTreinamento: 'RECORRENTE',
        nascimentoFuncionario: null,
      },
    );

    expect(snapshot).toEqual({
      qualificacaoCodigo: 'FAP14-139',
      tipo: 'FAP 14 - Exame em Rota - AW139',
      categoria: 'CHECK',
      validadeMeses: 12,
      dataVencimento: '2026-04-15',
      cargaHoraria: null,
    });
  });

  it('usa fim do mes e carga recorrente quando o tipo exige', () => {
    const snapshot = buildHistoricoTipoSnapshot(
      {
        codigo: 'D3',
        nome: 'CRM',
        categoria: 'TREINAMENTO TEORICO',
        validade: 12,
        vencimentoFimMes: 1,
        cargaHoraria: 8,
        cargaHorariaInicial: 20,
        cargaHorariaRecorrente: 8,
      },
      {
        dataConclusao: '2025-04-15',
        dataVencimentoAtual: null,
        tipoTreinamento: 'RECORRENTE',
        nascimentoFuncionario: null,
      },
    );

    expect(snapshot.validadeMeses).toBe(12);
    expect(snapshot.dataVencimento).toBe('2026-04-30');
    expect(snapshot.cargaHoraria).toBe(8);
  });

  it('preserva a regra semestral de CMA para tripulante acima de 60 anos', () => {
    const snapshot = buildHistoricoTipoSnapshot(
      {
        codigo: 'CMA',
        nome: 'Certificado Medico Aeronautico',
        categoria: 'EXAME',
        validade: 12,
        vencimentoFimMes: 0,
        cargaHoraria: null,
        cargaHorariaInicial: null,
        cargaHorariaRecorrente: null,
      },
      {
        dataConclusao: '2026-04-01',
        dataVencimentoAtual: '2027-04-01',
        tipoTreinamento: null,
        nascimentoFuncionario: '1960-01-01',
      },
    );

    expect(snapshot.validadeMeses).toBe(6);
    expect(snapshot.dataVencimento).toBe('2026-10-01');
  });

  it('sincroniza historico quando qualquer campo mestre relevante muda', () => {
    expect(shouldSyncHistoricoSnapshotsOnTipoUpdate({ validade: 12 })).toBe(true);
    expect(shouldSyncHistoricoSnapshotsOnTipoUpdate({ nome: 'Novo nome' })).toBe(true);
    expect(shouldSyncHistoricoSnapshotsOnTipoUpdate({ observacoes: 'nao sincroniza' })).toBe(
      false,
    );
  });
});