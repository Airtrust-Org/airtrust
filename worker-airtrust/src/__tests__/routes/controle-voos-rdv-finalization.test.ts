import { describe, expect, it } from 'vitest';
import { assertPlanningDeviationJustified } from '../../routes/controle-voos-rdv-finalization';

type StageTimes = {
  horario_motor_ligado: string | null;
  horario_decolagem: string | null;
  horario_pouso: string | null;
  horario_motor_desligado: string | null;
};

function makeDb(stages: StageTimes[], justifiedMinutes: number) {
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
  it('blocks finalization when realized total time exceeds plan and minutes do not close the difference', async () => {
    const db = makeDb(
      [
        {
          horario_motor_ligado: '10:00',
          horario_decolagem: '10:05',
          horario_pouso: '11:00',
          horario_motor_desligado: '11:05',
        },
        {
          horario_motor_ligado: '11:10',
          horario_decolagem: '11:15',
          horario_pouso: '12:00',
          horario_motor_desligado: '12:05',
        },
      ],
      14,
    );

    await expect(assertPlanningDeviationJustified(db, 7, flight)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONTROLE_VOOS_RDV_PLANNING_DEVIATION_JUSTIFICATION_MISMATCH',
    });
  });

  it('allows finalization when justification minutes exactly equal the positive total-time deviation', async () => {
    const db = makeDb(
      [
        {
          horario_motor_ligado: '10:00',
          horario_decolagem: '10:05',
          horario_pouso: '11:00',
          horario_motor_desligado: '11:05',
        },
        {
          horario_motor_ligado: '11:10',
          horario_decolagem: '11:15',
          horario_pouso: '12:00',
          horario_motor_desligado: '12:05',
        },
      ],
      30,
    );

    await expect(assertPlanningDeviationJustified(db, 7, flight)).resolves.toBeUndefined();
  });

  it('requires no justification when realized total time does not exceed planning', async () => {
    const db = makeDb([
      {
        horario_motor_ligado: '10:05',
        horario_decolagem: '10:10',
        horario_pouso: '11:20',
        horario_motor_desligado: '11:25',
      },
    ], 0);
    await expect(assertPlanningDeviationJustified(db, 7, flight)).resolves.toBeUndefined();
  });

  it('uses landing as provisional total-time end when engine cut is not informed yet', async () => {
    const provisionalFlight = {
      ...flight,
      horario_previsto_chegada: '2026-09-20T10:55:00.000Z',
    };
    const db = makeDb([
      {
        horario_motor_ligado: '10:00',
        horario_decolagem: '10:10',
        horario_pouso: '11:00',
        horario_motor_desligado: null,
      },
    ], 5);

    await expect(assertPlanningDeviationJustified(db, 7, provisionalFlight)).resolves.toBeUndefined();
  });
});
