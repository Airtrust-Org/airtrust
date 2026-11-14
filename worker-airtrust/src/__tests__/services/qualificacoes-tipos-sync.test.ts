import { describe, expect, it } from 'vitest';

import {
  buildHistoricoTipoSnapshot,
  shouldPreserveHistoricoExpiryOnTipoUpdate,
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
    expect(snapshot.dataVencimento).toBe('2026-04-15');
    expect(snapshot.cargaHoraria).toBe(8);
  });

  it('preserva a regra semestral de CMA para tripulante acima de 60 anos', () => {
    const snapshot = buildHistoricoTipoSnapshot(
      {
        codigo: 'CMA',
        nome: 'Certificado Medico Aeronautico',
        categoria: 'EXAME',
        validade: 12,
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

  it('dispara sync quando validade e explicitamente null (limpar vencimento)', () => {
    // validade: null deve estar na chave para o sync rodar — sem a chave, o sync e ignorado
    expect(shouldSyncHistoricoSnapshotsOnTipoUpdate({ validade: null })).toBe(true);
  });

  it('retorna validadeMeses null e dataVencimento null quando tipo nao tem validade', () => {
    const snapshot = buildHistoricoTipoSnapshot(
      {
        codigo: 'OUTROS-01',
        nome: 'Curso Interno Geral',
        categoria: 'Outros',
        validade: null,
        cargaHoraria: null,
        cargaHorariaInicial: null,
        cargaHorariaRecorrente: null,
      },
      {
        dataConclusao: '2022-03-10',
        dataVencimentoAtual: null,
        tipoTreinamento: null,
        nascimentoFuncionario: null,
      },
    );

    expect(snapshot.validadeMeses).toBeNull();
    expect(snapshot.dataVencimento).toBeNull();
  });

  it('remove data_vencimento existente quando tipo passa a nao ter validade', () => {
    const snapshot = buildHistoricoTipoSnapshot(
      {
        codigo: 'OUTROS-01',
        nome: 'Curso Interno Geral',
        categoria: 'Outros',
        validade: null,
        cargaHoraria: null,
        cargaHorariaInicial: null,
        cargaHorariaRecorrente: null,
      },
      {
        dataConclusao: '2020-01-01',
        dataVencimentoAtual: '2044-01-01',
        tipoTreinamento: 'RECORRENTE',
        nascimentoFuncionario: null,
      },
    );

    // Mesmo com dataVencimentoAtual preenchida, sem validade deve retornar null
    expect(snapshot.validadeMeses).toBeNull();
    expect(snapshot.dataVencimento).toBeNull();
  });

  it('recalcula corretamente ao mudar de 36 para 24 meses', () => {
    const snapshot = buildHistoricoTipoSnapshot(
      {
        codigo: 'MGM',
        nome: 'Manual Geral de Manutencao',
        categoria: 'EAD',
        validade: 24,
        cargaHoraria: null,
        cargaHorariaInicial: null,
        cargaHorariaRecorrente: null,
      },
      {
        dataConclusao: '2018-08-08',
        dataVencimentoAtual: '2021-08-08',
        tipoTreinamento: null,
        nascimentoFuncionario: null,
      },
    );

    expect(snapshot.validadeMeses).toBe(24);
    expect(snapshot.dataVencimento).toBe('2020-08-08');
  });
});

describe('F14-06 — vencimento historico explicito', () => {
  const tipoAnterior = {
    codigo: 'NR35',
    nome: 'NR-35',
    categoria: 'GERAL',
    validade: 12,
    cargaHoraria: null,
    cargaHorariaInicial: null,
    cargaHorariaRecorrente: null,
  };
  const historico = {
    dataConclusao: '2025-01-15',
    dataVencimentoAtual: '2026-01-15',
    tipoTreinamento: 'INICIAL',
    nascimentoFuncionario: null,
    validadeMesesAtual: 12,
  };

  it('permite atualizar vencimento que coincide com a regra anterior', () => {
    expect(shouldPreserveHistoricoExpiryOnTipoUpdate(tipoAnterior, historico)).toBe(false);
  });

  it('preserva data explicita diferente do vencimento que seria calculado', () => {
    expect(shouldPreserveHistoricoExpiryOnTipoUpdate(tipoAnterior, {
      ...historico,
      dataVencimentoAtual: '2026-02-01',
    })).toBe(true);
  });

  it('preserva duracao individual apesar de a data bater com essa duracao', () => {
    expect(shouldPreserveHistoricoExpiryOnTipoUpdate(tipoAnterior, {
      ...historico,
      validadeMesesAtual: 18,
      dataVencimentoAtual: '2026-07-15',
    })).toBe(true);
  });

  it('nao inventa proveniencia quando o modelo anterior nao tinha validade', () => {
    expect(shouldPreserveHistoricoExpiryOnTipoUpdate({...tipoAnterior, validade: null}, historico)).toBe(true);
  });

  it('permite preencher um historico sem vencimento explicito', () => {
    expect(shouldPreserveHistoricoExpiryOnTipoUpdate(tipoAnterior, {
      ...historico,
      dataVencimentoAtual: null,
    })).toBe(false);
  });

  it('respeita a duracao etaria do CMA', () => {
    const cma = {...tipoAnterior, codigo: 'CMA'};
    const h = {
      ...historico,
      dataConclusao: '2026-04-01',
      dataVencimentoAtual: '2026-10-01',
      validadeMesesAtual: 6,
      nascimentoFuncionario: '1960-01-01',
    };
    expect(shouldPreserveHistoricoExpiryOnTipoUpdate(cma, h)).toBe(false);
    expect(shouldPreserveHistoricoExpiryOnTipoUpdate(cma, {...h, validadeMesesAtual: 12})).toBe(true);
  });
});
