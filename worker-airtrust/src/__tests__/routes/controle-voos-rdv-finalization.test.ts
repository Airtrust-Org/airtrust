import { describe, expect, it } from 'vitest';
import { assertPlanningDeviationJustified } from '../../routes/controle-voos-rdv-finalization';

function makeDb(stages: Array<{ horario_decolagem: string | null; horario_pouso: string | null }>, justifiedMinutes: number) {
  return {
    prepare(sql: string) {
      const statement = {
        bind: (..._args: unknown[]) => statement,
        all: async () => {
          if (sql.includes('FROM cv_voo_etapas')) return { results: stages };
          return { results: [] };
        },
        first: async () => {
          if (sql.includes('FROM cv_voo_justificativas')) return { total: justifiedMinutes };
          return null;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

const flight = {
  id: 42,
  horario_previsto_partida: '2026-09-20T10:00:00.000Z',
  horario_previsto_chegada: '2026-09-20T11:30:00.000Z',
};

describe('Controle de Voos RDV planning deviation finalization guard', () => {
  it('blocks finalization when realized time exceeds plan and minutes do not close the difference', async () => {
    const db = makeDb(
      [
        { horario_decolagem: '10:00', horario_pouso: '11:00' },
        { horario_decolagem: '11:10', horario_pouso: '12:00' },
      ],
      14,
    );

    await expect(assertPlanningDeviationJustified(db, 7, flight)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONTROLE_VOOS_RDV_PLANNING_DEVIATION_JUSTIFICATION_MISMATCH',
    });
  });

  it('allows finalization when justification minutes exactly equal the positive deviation', async () => {
    const db = makeDb(
      [
        { horario_decolagem: '10:00', horario_pouso: '11:00' },
        { horario_decolagem: '11:10', horario_pouso: '12:00' },
      ],
      20,
    );

    await expect(assertPlanningDeviationJustified(db, 7, flight)).resolves.toBeUndefined();
  });

  it('requires no justification when realized flight time does not exceed planning', async () => {
    const db = makeDb([{ horario_decolagem: '10:05', horario_pouso: '11:25' }], 0);
    await expect(assertPlanningDeviationJustified(db, 7, flight)).resolves.toBeUndefined();
  });
});
