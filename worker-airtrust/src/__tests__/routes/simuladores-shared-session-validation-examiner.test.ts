import { describe, expect, it, vi } from 'vitest';
import { assertEntityOwnership } from '../../routes/simuladores-shared-session-validation';
import type { NormalizedSharedSessionRequest } from '../../routes/simuladores-shared-session-logic';

/**
 * Direct unit coverage of assertEntityOwnership for EXA-V01..V04 payloads,
 * complementing the generic coverage already in
 * simuladores-shared-session-routes.test.ts. This is the single guard that
 * blocks self-evaluation (instructor === curricular trainee) for every
 * shared-session ficha, examiner training included — proven here with the
 * exact modelo codes EXA-V01..V04 rather than a generic placeholder code.
 */
function buildDb(options: {
  modeloId: number;
  modeloCodigo: string;
  empresaId: number;
  simuladorAeronave?: string | null;
}) {
  // Default: simuladores table has empresa_id (tenant-scoped schema).
  // Set hasEmpresaId to false to simulate global schema (no empresa_id column).
  const hasEmpresaId = (options as any).hasEmpresaId !== false;

  return {
    prepare: vi.fn((query: string) => {
      // Direct .all() — used by simuladoresHasEmpresaId (PRAGMA without .bind())
      const directAll = async () => {
        if (query.includes('PRAGMA table_info(simuladores)')) {
          return {
            results: hasEmpresaId
              ? [{ name: 'id' }, { name: 'nome' }, { name: 'modelo' }, { name: 'empresa_id' }, { name: 'deleted_at' }]
              : [{ name: 'id' }, { name: 'nome' }, { name: 'modelo' }, { name: 'deleted_at' }],
          };
        }
        return { results: [] };
      };

      return {
        all: directAll,
        first: async () => null,
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (query.includes('COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
              // participant-ownership count: exactly 1 distinct participant, always in-tenant here
              return { total: 1 };
            }
            if (query.includes('COALESCE(aeronave_codigo, codigo_aeronave, tipo, modelo') && query.includes('FROM simuladores')) {
              // getSimuladorModeloAeronave: the simulator's own aircraft model
              return { modelo_aeronave: options.simuladorAeronave ?? null };
            }
            if (query.includes('FROM funcionarios') && query.includes('WHERE id = ?')) {
              // instrutor single-row ownership check
              return { id: args[0] };
            }
            if (query.includes('FROM simuladores')) {
              return { id: args[0] };
            }
            return null;
          },
          all: async () => {
            if (query.includes('FROM modelos_sessao ms')) {
              return {
                results: [
                  {
                    id: options.modeloId,
                    codigo: options.modeloCodigo,
                    nome: options.modeloCodigo,
                    ativo: 1,
                    tipo: 'RECORRENTE',
                    modelo_aeronave: null,
                    tipo_sessao_codigo: 'EXA',
                    gera_qualificacao: 0,
                    qualificacao_tipo_id: null,
                  },
                ],
              };
            }
            return { results: [] };
          },
        }),
      };
    }),
  } as unknown as D1Database;
}

function buildPayload(overrides: {
  instrutorId: number;
  atribuicoesFuncionarioId: number;
  modeloId: number;
}): NormalizedSharedSessionRequest {
  return {
    instrutor_id: overrides.instrutorId,
    simulador_id: 1,
    data: '2026-07-20',
    hora_inicio: '08:00',
    hora_fim: '10:00',
    participantes: [{ funcionario_id: overrides.atribuicoesFuncionarioId }],
    segmentos: [],
    resumo_participantes: [],
    atribuicoes_planejadas: [
      {
        assignment_key: 'k1',
        funcionario_id: overrides.atribuicoesFuncionarioId,
        modelo_sessao_id: overrides.modeloId,
        treinamento_planejado_id: null,
        carga_horaria_total_minutos: 60,
        gera_ficha: true,
      },
    ],
  } as unknown as NormalizedSharedSessionRequest;
}

describe.each(['EXA-V01', 'EXA-V02', 'EXA-V03', 'EXA-V04'])(
  'assertEntityOwnership self-evaluation guard — %s',
  (modeloCodigo) => {
    it(`blocks the session instructor from also being the ${modeloCodigo} curricular trainee`, async () => {
      const db = buildDb({ modeloId: 80, modeloCodigo, empresaId: 6 });
      const payload = buildPayload({ instrutorId: 500, atribuicoesFuncionarioId: 500, modeloId: 80 });

      await expect(assertEntityOwnership(db, 6, payload)).rejects.toThrow(
        'Instrutor supervisor não pode ser o próprio treinando curricular',
      );
    });

    it(`allows a distinct instructor to supervise a ${modeloCodigo} curricular trainee`, async () => {
      const db = buildDb({ modeloId: 80, modeloCodigo, empresaId: 6 });
      const payload = buildPayload({ instrutorId: 999, atribuicoesFuncionarioId: 500, modeloId: 80 });

      await expect(assertEntityOwnership(db, 6, payload)).resolves.toBeInstanceOf(Map);
    });
  },
);

describe('EXA-V01..V04 universal semantics — modelo_aeronave = NULL means "any aircraft", never hidden/invalid/unavailable', () => {
  const modelos = ['EXA-V01', 'EXA-V02', 'EXA-V03', 'EXA-V04'];
  const aeronaves = ['AW139', 'SK76', 'BELL-429']; // BELL-429 stands in for "a future/third aircraft model"

  for (const modeloCodigo of modelos) {
    for (const aeronave of aeronaves) {
      it(`${modeloCodigo} is accepted for a simulador whose aircraft model is ${aeronave} (no equipment-compat rejection)`, async () => {
        const db = buildDb({ modeloId: 80, modeloCodigo, empresaId: 6, simuladorAeronave: aeronave });
        const payload = buildPayload({ instrutorId: 999, atribuicoesFuncionarioId: 500, modeloId: 80 });

        const modelosMap = await assertEntityOwnership(db, 6, payload);
        expect(modelosMap.get(80)?.codigo).toBe(modeloCodigo);
      });
    }
  }

  it('never throws "Modelo de sessão incompatível com equipamento" for a universal (modelo_aeronave NULL) model, regardless of simulator aircraft', async () => {
    for (const aeronave of aeronaves) {
      const db = buildDb({ modeloId: 80, modeloCodigo: 'EXA-V01', empresaId: 6, simuladorAeronave: aeronave });
      const payload = buildPayload({ instrutorId: 999, atribuicoesFuncionarioId: 500, modeloId: 80 });
      await expect(assertEntityOwnership(db, 6, payload)).resolves.toBeInstanceOf(Map);
    }
  });
});
