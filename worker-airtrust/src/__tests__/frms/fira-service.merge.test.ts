import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/frms/db-service', () => ({
  atualizarJornada: vi.fn(),
  salvarJornada: vi.fn(),
}));

import { confirmarImportacaoFira } from '../../lib/frms/fira-service';
import { atualizarJornada, salvarJornada } from '../../lib/frms/db-service';

type StubImportacao = {
  id: string;
  tripulante_id: string;
  canac: string;
  ano: number;
  mes: number;
  preview_json: string;
  status: string;
  total_dias_importados: number;
};

function createDbStub(params: {
  importacao: StubImportacao;
  rowsById?: Array<Record<string, unknown>>;
  rowsByDate?: Array<Record<string, unknown>>;
}) {
  const { importacao, rowsById = [], rowsByDate = [] } = params;
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM frms_importacao_fira f')) return importacao;
          return null;
        },
        all: async () => {
          if (sql.includes('FROM frms_jornada') && sql.includes('tripulante_id = ?') && sql.includes('data IN')) {
            return { results: rowsByDate };
          }
          if (sql.includes('FROM frms_jornada') && sql.includes('WHERE id IN')) {
            return { results: rowsById };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 1 } }),
      }),
      first: async () => {
        if (sql.includes('FROM frms_importacao_fira f')) return importacao;
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 1 } }),
    }),
    batch: async () => [],
  } as any;
}

describe('confirmarImportacaoFira duplicate merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(atualizarJornada).mockResolvedValue({
      alertas: [],
      bloqueado: false,
      jornada: {} as any,
      fatorizacao: {} as any,
      acumulo: {} as any,
    });
    vi.mocked(salvarJornada).mockResolvedValue({
      alertas: [],
      bloqueado: false,
      jornada: {} as any,
      fatorizacao: {} as any,
      acumulo: {} as any,
    });
  });

  it('merges SIGVOOS duplicate into existing manual-empty journey instead of ignoring', async () => {
    const preview = {
      importacao_id: 'imp-1',
      tripulante_encontrado: true,
      tripulante_id: '20',
      tripulante_nome_fira: 'Magioli',
      tripulante_nome_sistema: 'Magioli',
      canac: '123456',
      ano: 2026,
      mes: 5,
      mes_nome: 'maio',
      total_dias: 1,
      totais_fira: { jornada: '06:00', voo: '03:30' },
      totais_calculados: { jornada_min: 360, voo_min: 210 },
      divergencia_totais: false,
      avisos: [],
      erros: [],
      linhas: [
        {
          dia: 25,
          data: '2026-05-25',
          status_fira: 'SIGVOOS',
          status_frms: 'ES',
          hora_apresentacao: '07:00',
          hora_termino: '13:00',
          duracao_jornada_min: 360,
          horas_voo_min: 210,
          local_base: 'SBJR',
          situacao: 'DUPLICATA',
          jornada_existente_id: 'jornada-manual-vazia',
          marcado: true,
        },
      ],
    };

    const db = createDbStub({
      importacao: {
        id: 'imp-1',
        tripulante_id: '20',
        canac: '123456',
        ano: 2026,
        mes: 5,
        preview_json: JSON.stringify(preview),
        status: 'REVISAO',
        total_dias_importados: 0,
      },
      rowsById: [
        {
          id: 'jornada-manual-vazia',
          data: '2026-05-25',
          origem: 'MANUAL',
          empresa_id: 6,
          hora_apresentacao: null,
          hora_termino: null,
          horas_voo_minutos: null,
          duracao_jornada_minutos: null,
        },
      ],
      rowsByDate: [
        {
          id: 'jornada-manual-vazia',
          data: '2026-05-25',
          origem: 'MANUAL',
          empresa_id: 6,
          hora_apresentacao: null,
          hora_termino: null,
          horas_voo_minutos: null,
          duracao_jornada_minutos: null,
        },
      ],
    });

    const result = await confirmarImportacaoFira(
      db,
      'imp-1',
      { dias_selecionados: [{ dia: 25, forcar_substituicao: true }] },
      '30',
      {} as any,
      6,
    );

    expect(atualizarJornada).toHaveBeenCalledTimes(1);
    expect(salvarJornada).not.toHaveBeenCalled();
    expect(result.substituidos).toBe(1);
    expect(result.importados).toBe(0);
    expect(result.ignorados).toBe(0);
    expect(result.erros).toBe(0);
  });

  it('does not cross dates when preview points to a duplicate id from another day', async () => {
    const preview = {
      importacao_id: 'imp-2',
      tripulante_encontrado: true,
      tripulante_id: '19',
      tripulante_nome_fira: 'Max',
      tripulante_nome_sistema: 'Max',
      canac: '654321',
      ano: 2026,
      mes: 5,
      mes_nome: 'maio',
      total_dias: 1,
      totais_fira: { jornada: '05:00', voo: '03:00' },
      totais_calculados: { jornada_min: 300, voo_min: 180 },
      divergencia_totais: false,
      avisos: [],
      erros: [],
      linhas: [
        {
          dia: 25,
          data: '2026-05-25',
          status_fira: 'SIGVOOS',
          status_frms: 'ES',
          hora_apresentacao: '08:00',
          hora_termino: '13:00',
          duracao_jornada_min: 300,
          horas_voo_min: 180,
          local_base: 'SBJR',
          situacao: 'DUPLICATA',
          jornada_existente_id: 'jornada-dia-26',
          marcado: true,
        },
      ],
    };

    const db = createDbStub({
      importacao: {
        id: 'imp-2',
        tripulante_id: '19',
        canac: '654321',
        ano: 2026,
        mes: 5,
        preview_json: JSON.stringify(preview),
        status: 'REVISAO',
        total_dias_importados: 0,
      },
      rowsById: [
        {
          id: 'jornada-dia-26',
          data: '2026-05-26',
          origem: 'MANUAL',
          empresa_id: 6,
          hora_apresentacao: null,
          hora_termino: null,
          horas_voo_minutos: null,
          duracao_jornada_minutos: null,
        },
      ],
      rowsByDate: [
        {
          id: 'jornada-dia-25',
          data: '2026-05-25',
          origem: 'MANUAL',
          empresa_id: 6,
          hora_apresentacao: null,
          hora_termino: null,
          horas_voo_minutos: null,
          duracao_jornada_minutos: null,
        },
        {
          id: 'jornada-dia-26',
          data: '2026-05-26',
          origem: 'MANUAL',
          empresa_id: 6,
          hora_apresentacao: null,
          hora_termino: null,
          horas_voo_minutos: null,
          duracao_jornada_minutos: null,
        },
      ],
    });

    await confirmarImportacaoFira(
      db,
      'imp-2',
      { dias_selecionados: [{ dia: 25, forcar_substituicao: true }] },
      '30',
      {} as any,
      6,
    );

    expect(atualizarJornada).toHaveBeenCalledTimes(1);
    expect(vi.mocked(atualizarJornada).mock.calls[0]?.[1]).toBe('jornada-dia-25');
    expect(salvarJornada).not.toHaveBeenCalled();
  });
});
