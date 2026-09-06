import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldUseForOperationalFrms } from '../../lib/frms/frms-source-policy';

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
    expect(vi.mocked(atualizarJornada).mock.calls[0]?.[2]).toMatchObject({ origem: 'SIGVOOS' });
    expect(shouldUseForOperationalFrms({ origem: vi.mocked(atualizarJornada).mock.calls[0]?.[2]?.origem })).toBe(true);
    expect(salvarJornada).not.toHaveBeenCalled();
    expect(result.substituidos).toBe(1);
    expect(result.importados).toBe(0);
    expect(result.ignorados).toBe(0);
    expect(result.erros).toBe(0);
  });

  it('re-syncing SIGVOOS over an already-populated SIGVOOS journey updates it in place instead of duplicating it (regression: staging duplicate bug)', async () => {
    const preview = {
      importacao_id: 'imp-resync',
      tripulante_encontrado: true,
      tripulante_id: '1',
      tripulante_nome_fira: 'QA',
      tripulante_nome_sistema: 'QA',
      canac: '999006',
      ano: 2026,
      mes: 8,
      mes_nome: 'agosto',
      total_dias: 1,
      totais_fira: { jornada: '05:30', voo: '03:15' },
      totais_calculados: { jornada_min: 330, voo_min: 195 },
      divergencia_totais: false,
      avisos: [],
      erros: [],
      linhas: [
        {
          dia: 6,
          data: '2026-08-06',
          status_fira: 'SIGVOOS',
          status_frms: 'ES',
          hora_apresentacao: '02:30',
          hora_termino: '08:00',
          duracao_jornada_min: 330,
          horas_voo_min: 195,
          local_base: 'SBQA',
          // Already-existing SIGVOOS journey from a prior sync — NOT empty,
          // it already carries real operational data. A routine periodic
          // re-sync of the same period must refresh it, not duplicate it.
          situacao: 'DUPLICATA',
          jornada_existente_id: 'jornada-sigvoos-existente',
          marcado: true,
        },
      ],
    };

    const db = createDbStub({
      importacao: {
        id: 'imp-resync',
        tripulante_id: '1',
        canac: '999006',
        ano: 2026,
        mes: 8,
        preview_json: JSON.stringify(preview),
        status: 'REVISAO',
        total_dias_importados: 0,
      },
      rowsById: [
        {
          id: 'jornada-sigvoos-existente',
          data: '2026-08-06',
          origem: 'SIGVOOS',
          empresa_id: 999006,
          hora_apresentacao: '02:30',
          hora_termino: '08:00',
          horas_voo_minutos: 195,
          duracao_jornada_minutos: 330,
        },
      ],
      rowsByDate: [
        {
          id: 'jornada-sigvoos-existente',
          data: '2026-08-06',
          origem: 'SIGVOOS',
          empresa_id: 999006,
          hora_apresentacao: '02:30',
          hora_termino: '08:00',
          horas_voo_minutos: 195,
          duracao_jornada_minutos: 330,
        },
      ],
    });

    const result = await confirmarImportacaoFira(
      db,
      'imp-resync',
      { dias_selecionados: [{ dia: 6, forcar_substituicao: true }] },
      '30',
      {} as any,
      999006,
    );

    expect(atualizarJornada).toHaveBeenCalledTimes(1);
    expect(vi.mocked(atualizarJornada).mock.calls[0]?.[1]).toBe('jornada-sigvoos-existente');
    // Never falls through to a fresh insert — that would be the duplicate.
    expect(salvarJornada).not.toHaveBeenCalled();
    expect(result.substituidos).toBe(1);
    expect(result.importados).toBe(0);
    expect(result.ignorados).toBe(0);
    expect(result.erros).toBe(0);
  });

  it('forced replacement of a populated MANUAL jornada updates in place without delete-before-insert', async () => {
    const preview = {
      importacao_id: 'imp-force-manual',
      tripulante_encontrado: true,
      tripulante_id: '24',
      tripulante_nome_fira: 'Force',
      tripulante_nome_sistema: 'Force',
      canac: '242424',
      ano: 2026,
      mes: 5,
      mes_nome: 'maio',
      total_dias: 1,
      totais_fira: { jornada: '06:00', voo: '02:00' },
      totais_calculados: { jornada_min: 360, voo_min: 120 },
      divergencia_totais: false,
      avisos: [],
      erros: [],
      linhas: [
        {
          dia: 28,
          data: '2026-05-28',
          status_fira: 'VOO',
          status_frms: 'TR',
          hora_apresentacao: '07:00',
          hora_termino: '13:00',
          duracao_jornada_min: 360,
          horas_voo_min: 120,
          local_base: 'SBJR',
          situacao: 'DUPLICATA',
          jornada_existente_id: 'jornada-manual-populada',
          marcado: true,
        },
      ],
    };

    const db = createDbStub({
      importacao: {
        id: 'imp-force-manual',
        tripulante_id: '24',
        canac: '242424',
        ano: 2026,
        mes: 5,
        preview_json: JSON.stringify(preview),
        status: 'REVISAO',
        total_dias_importados: 0,
      },
      rowsById: [
        {
          id: 'jornada-manual-populada',
          data: '2026-05-28',
          origem: 'MANUAL',
          empresa_id: 6,
          hora_apresentacao: '08:00',
          hora_termino: '12:00',
          horas_voo_minutos: 60,
          duracao_jornada_minutos: 240,
        },
      ],
      rowsByDate: [
        {
          id: 'jornada-manual-populada',
          data: '2026-05-28',
          origem: 'MANUAL',
          empresa_id: 6,
          hora_apresentacao: '08:00',
          hora_termino: '12:00',
          horas_voo_minutos: 60,
          duracao_jornada_minutos: 240,
        },
      ],
    });
    const batchSpy = vi.spyOn(db, 'batch');

    const result = await confirmarImportacaoFira(
      db,
      'imp-force-manual',
      { dias_selecionados: [{ dia: 28, forcar_substituicao: true }] },
      'operador-humano',
      {} as any,
      6,
    );

    expect(atualizarJornada).toHaveBeenCalledTimes(1);
    expect(vi.mocked(atualizarJornada).mock.calls[0]?.[1]).toBe('jornada-manual-populada');
    expect(vi.mocked(atualizarJornada).mock.calls[0]?.[2]).toMatchObject({
      origem: 'FIRA',
      hora_apresentacao: '07:00',
      hora_termino: '13:00',
    });
    expect(salvarJornada).not.toHaveBeenCalled();
    expect(batchSpy).not.toHaveBeenCalled();
    expect(result.substituidos).toBe(1);
    expect(result.erros).toBe(0);
  });

  it('persists new SIGVOOS journeys with canonical operational origin', async () => {
    const preview = {
      importacao_id: 'imp-3',
      tripulante_encontrado: true,
      tripulante_id: '22',
      tripulante_nome_fira: 'Lia',
      tripulante_nome_sistema: 'Lia',
      canac: '777777',
      ano: 2026,
      mes: 5,
      mes_nome: 'maio',
      total_dias: 1,
      totais_fira: { jornada: '05:30', voo: '02:45' },
      totais_calculados: { jornada_min: 330, voo_min: 165 },
      divergencia_totais: false,
      avisos: [],
      erros: [],
      linhas: [
        {
          dia: 26,
          data: '2026-05-26',
          status_fira: 'SIGVOOS',
          status_frms: 'ES',
          hora_apresentacao: '09:00',
          hora_termino: '14:30',
          duracao_jornada_min: 330,
          horas_voo_min: 165,
          local_base: 'SBSP',
          situacao: 'NOVO',
          jornada_existente_id: null,
          marcado: true,
        },
      ],
    };

    const db = createDbStub({
      importacao: {
        id: 'imp-3',
        tripulante_id: '22',
        canac: '777777',
        ano: 2026,
        mes: 5,
        preview_json: JSON.stringify(preview),
        status: 'REVISAO',
        total_dias_importados: 0,
      },
    });

    const result = await confirmarImportacaoFira(
      db,
      'imp-3',
      { dias_selecionados: [{ dia: 26 }] },
      '30',
      {} as any,
      6,
    );

    expect(salvarJornada).toHaveBeenCalledTimes(1);
    expect(atualizarJornada).not.toHaveBeenCalled();
    expect(vi.mocked(salvarJornada).mock.calls[0]?.[1]).toMatchObject({
      data: '2026-05-26',
      origem: 'SIGVOOS',
      local_base: 'SBSP',
    });
    expect(shouldUseForOperationalFrms({ origem: vi.mocked(salvarJornada).mock.calls[0]?.[1]?.origem })).toBe(true);
    expect(result.importados).toBe(1);
    expect(result.substituidos).toBe(0);
    expect(result.ignorados).toBe(0);
    expect(result.erros).toBe(0);
  });

  it('keeps real FIRA imports labeled as FIRA on new inserts', async () => {
    const preview = {
      importacao_id: 'imp-4',
      tripulante_encontrado: true,
      tripulante_id: '23',
      tripulante_nome_fira: 'Rafa',
      tripulante_nome_sistema: 'Rafa',
      canac: '888888',
      ano: 2026,
      mes: 5,
      mes_nome: 'maio',
      total_dias: 1,
      totais_fira: { jornada: '04:00', voo: '01:30' },
      totais_calculados: { jornada_min: 240, voo_min: 90 },
      divergencia_totais: false,
      avisos: [],
      erros: [],
      linhas: [
        {
          dia: 27,
          data: '2026-05-27',
          status_fira: 'VOO',
          status_frms: 'TR',
          hora_apresentacao: '10:00',
          hora_termino: '14:00',
          duracao_jornada_min: 240,
          horas_voo_min: 90,
          local_base: 'SBRJ',
          situacao: 'NOVO',
          jornada_existente_id: null,
          marcado: true,
        },
      ],
    };

    const db = createDbStub({
      importacao: {
        id: 'imp-4',
        tripulante_id: '23',
        canac: '888888',
        ano: 2026,
        mes: 5,
        preview_json: JSON.stringify(preview),
        status: 'REVISAO',
        total_dias_importados: 0,
      },
    });

    await confirmarImportacaoFira(
      db,
      'imp-4',
      { dias_selecionados: [{ dia: 27 }] },
      'operador-humano',
      {} as any,
      6,
    );

    expect(salvarJornada).toHaveBeenCalledTimes(1);
    expect(vi.mocked(salvarJornada).mock.calls[0]?.[1]).toMatchObject({
      data: '2026-05-27',
      origem: 'FIRA',
      local_base: 'SBRJ',
    });
    expect(shouldUseForOperationalFrms({ origem: vi.mocked(salvarJornada).mock.calls[0]?.[1]?.origem })).toBe(false);
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
