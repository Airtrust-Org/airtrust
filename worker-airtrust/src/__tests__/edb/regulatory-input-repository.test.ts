import { describe, expect, it } from 'vitest';
import {
  createControleVoosRegulatoryStage,
  replaceControleVoosRegulatoryStage,
  type RegulatoryStageWriteInput,
} from '../../repositories/edb/edb-regulatory-input-repository';

const neverDb = new Proxy(
  {},
  {
    get() {
      throw new Error('database must not be touched when input validation fails');
    },
  },
) as D1Database;

function validInput(
  overrides: Partial<RegulatoryStageWriteInput> = {},
): RegulatoryStageWriteInput {
  return {
    tempo_voo_diurno_minutos: 45,
    tempo_voo_noturno_minutos: 15,
    tempo_voo_total_minutos: 60,
    tempo_ifr_real_minutos: 10,
    tempo_ifr_simulado_minutos: 0,
    tempo_ifr_nao_classificado_minutos: 0,
    pousos_total: 1,
    ciclos: 1,
    combustivel_antes_partida_motor: 900,
    pessoas_a_bordo_total: 8,
    carga_regulatoria_kg: 100,
    ocorrencias_json: '[]',
    origem_dados: 'MANUAL',
    ...overrides,
  };
}

describe('versioned regulatory-stage writes', () => {
  it('rejects internally inconsistent flight time before D1', async () => {
    await expect(
      createControleVoosRegulatoryStage({
        db: neverDb,
        empresaId: 1,
        vooId: 10,
        etapaId: 20,
        input: validInput({ tempo_voo_total_minutos: 61 }),
      }),
    ).rejects.toThrow('day + night flight time must equal total flight time');
  });

  it('rejects legacy-shaped occurrence content before D1', async () => {
    await expect(
      createControleVoosRegulatoryStage({
        db: neverDb,
        empresaId: 1,
        vooId: 10,
        etapaId: 20,
        input: validInput({ ocorrencias_json: '{"descricao":"legacy"}' }),
      }),
    ).rejects.toThrow('JSON array of strings');
  });

  it('rejects invalid unclassified IFR before D1', async () => {
    await expect(
      createControleVoosRegulatoryStage({
        db: neverDb,
        empresaId: 1,
        vooId: 10,
        etapaId: 20,
        input: validInput({ tempo_ifr_nao_classificado_minutos: -1 }),
      }),
    ).rejects.toThrow('tempo_ifr_nao_classificado_minutos');
  });

  it('requires a positive optimistic version before replacing', async () => {
    await expect(
      replaceControleVoosRegulatoryStage({
        db: neverDb,
        empresaId: 1,
        vooId: 10,
        etapaId: 20,
        expectedVersion: 0,
        input: validInput(),
      }),
    ).rejects.toThrow('EDB_REGULATORY_STAGE_INVALID_VERSION');
  });
});
