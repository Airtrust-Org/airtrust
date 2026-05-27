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

function createDbStub(importacao: StubImportacao, jornadaExistente: Record<string, unknown>) {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM frms_importacao_fira f')) return importacao;
          return null;
        },
        all: async () => {
          if (sql.includes('FROM frms_jornada') && sql.includes('WHERE id IN')) {
            return { results: [jornadaExistente] };
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

    const db = createDbStub(
      {
        id: 'imp-1',
        tripulante_id: '20',
        canac: '123456',
        ano: 2026,
        mes: 5,
        preview_json: JSON.stringify(preview),
        status: 'REVISAO',
        total_dias_importados: 0,
      },
      {
        id: 'jornada-manual-vazia',
        origem: 'MANUAL',
        empresa_id: 6,
        hora_apresentacao: null,
        hora_termino: null,
        horas_voo_minutos: null,
        duracao_jornada_minutos: null,
      },
    );

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
});
