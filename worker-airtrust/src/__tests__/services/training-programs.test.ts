import { describe, expect, it } from 'vitest';
import {
  loadTrainingProgramByModel,
  selectTrainingProgram,
  type TrainingProgram,
} from '../../services/training-programs';

const PROGRAMS: TrainingProgram[] = [
  {
    id: 10,
    empresa_id: 6,
    qualificacao_tipo_id: 33,
    codigo: 'G1:INICIAL',
    nome: 'AW139 Inicial',
    tipo_treinamento: 'INICIAL',
    carga_horaria: 24,
    validade_meses: 12,
    uso_unico: 1,
    total_ciclos: 1,
    ano_base: null,
    ciclo_ano_base: null,
    proximo_programa_id: 11,
    ativo: 1,
  },
  {
    id: 11,
    empresa_id: 6,
    qualificacao_tipo_id: 33,
    codigo: 'G1:RECORRENTE',
    nome: 'AW139 Periódico',
    tipo_treinamento: 'RECORRENTE',
    carga_horaria: 8,
    validade_meses: 12,
    uso_unico: 0,
    total_ciclos: 3,
    ano_base: 2026,
    ciclo_ano_base: 2,
    proximo_programa_id: 11,
    ativo: 1,
  },
];

type HistoryRow = { id: number } | null;

function mockDb(history: HistoryRow, modelProgramId = 10): D1Database {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          binds = args;
          return statement;
        },
        async first<T>() {
          if (sql.includes('sqlite_master') && sql.includes('name=?')) {
            return { name: String(binds[0]) } as T;
          }
          if (sql.includes('FROM qualificacoes_historico')) {
            return history as T;
          }
          if (
            sql.includes('FROM treinamento_programa_modelos pm') &&
            sql.includes('msv.modelo_id=?')
          ) {
            return PROGRAMS.find((program) => program.id === modelProgramId) as T;
          }
          return null as T;
        },
        async all<T>() {
          if (sql.includes('FROM treinamento_programas WHERE')) {
            const qualificationId = Number(binds[1]);
            return {
              results: PROGRAMS.filter(
                (program) =>
                  program.empresa_id === Number(binds[0]) &&
                  program.qualificacao_tipo_id === qualificationId,
              ),
            } as { results: T[] };
          }
          return { results: [] } as { results: T[] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('training program resolution', () => {
  it('selects Initial before the employee has completed the qualification', async () => {
    const program = await selectTrainingProgram({
      db: mockDb(null),
      empresaId: 6,
      qualificationTypeId: 33,
      employeeId: 501,
    });
    expect(program?.codigo).toBe('G1:INICIAL');
    expect(program?.carga_horaria).toBe(24);
  });

  it('selects Periodic after the employee has completed the qualification', async () => {
    const program = await selectTrainingProgram({
      db: mockDb({ id: 900 }),
      empresaId: 6,
      qualificationTypeId: 33,
      employeeId: 501,
    });
    expect(program?.codigo).toBe('G1:RECORRENTE');
    expect(program?.carga_horaria).toBe(8);
  });

  it('honors an explicit program selection', async () => {
    const program = await selectTrainingProgram({
      db: mockDb({ id: 900 }),
      empresaId: 6,
      qualificationTypeId: 33,
      employeeId: 501,
      requestedProgramId: 10,
    });
    expect(program?.tipo_treinamento).toBe('INICIAL');
  });

  it('resolves a current physical model through the canonical mapping', async () => {
    const program = await loadTrainingProgramByModel({
      db: mockDb(null, 11),
      empresaId: 6,
      modelSessionId: 149,
    });
    expect(program?.codigo).toBe('G1:RECORRENTE');
  });
});
