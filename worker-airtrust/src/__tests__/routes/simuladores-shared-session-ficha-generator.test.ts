import { beforeEach, describe, expect, it, vi } from 'vitest';

const MODELO_SEM_MANOBRAS = 9999;

vi.mock('../../routes/simuladores-shared-session-fichas', async () => {
  const actual = await vi.importActual<typeof import('../../routes/simuladores-shared-session-fichas')>(
    '../../routes/simuladores-shared-session-fichas',
  );
  return {
    ...actual,
    // Real production data always appends NOTECHS items (see
    // buildOperationalFichaManobras), so loadFichaManobrasForModelo never
    // actually returns an empty array in practice. To exercise the
    // generator's own fail-closed branch (assertModeloSessaoTemManobras)
    // deterministically, this mock lets one sentinel modelo_sessao_id
    // simulate the "no manobras" case; every other id returns a normal
    // single-item list. assertModeloSessaoTemManobras itself is untouched
    // (real implementation).
    loadFichaManobrasForModelo: vi.fn(async (_db: unknown, modeloSessaoId: number) => {
      if (modeloSessaoId === MODELO_SEM_MANOBRAS) {
        return [];
      }
      return [
        {
          codigo: 'MNV-001',
          nome: 'Manobra 1',
          descricao: 'Manobra 1',
          categoria: 'GERAL',
          ordem: 1,
          tripulante: 'AB',
        },
      ];
    }),
  };
});

import { generateFichasForSharedSession } from '../../routes/simuladores-shared-session-ficha-generator';

interface AgendamentoRow {
  id: number;
  empresa_id: number;
  data: string;
  instrutor_id: number;
  simulador_id: number;
  modo_compartilhado: number;
  deleted_at: string | null;
}

interface SimuladorRow {
  id: number;
  empresa_id: number;
  modelo_aeronave: string | null;
  nome: string | null;
  deleted_at: string | null;
}

interface AtribuicaoRow {
  id: number;
  agendamento_id: number;
  empresa_id: number;
  participante_empresa_id: number;
  participante_deleted_at: string | null;
  funcionario_id: number;
  modelo_sessao_id: number | null;
  modelo_empresa_id: number;
  modelo_deleted_at: string | null;
  modelo_codigo: string;
  modelo_nome: string;
  tipo_sessao_codigo: string | null;
  gera_ficha: number;
  deleted_at: string | null;
}

interface FichaRow {
  id: number;
  uuid: string;
  agendamento_slot_id: number;
  colaborador_id_aluno: number;
  instrutor_id: number;
  tipo_sessao: string;
  tipo_aeronave: string;
  data_sessao: string;
  status: string;
  template_id: number;
  empresa_id: number;
  atribuicao_curricular_id: number;
  segmento_atribuicao_id: number | null;
  deleted_at: string | null;
}

interface FichaManobraRow {
  id: number;
  ficha_id: number;
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  ordem: number;
  tripulante: string;
  empresa_id: number;
}

interface FakeState {
  agendamentos: AgendamentoRow[];
  simuladores: SimuladorRow[];
  atribuicoes: AtribuicaoRow[];
  fichas: FichaRow[];
  fichaManobras: FichaManobraRow[];
  nextFichaId: number;
  nextManobraId: number;
}

function createState(): FakeState {
  return {
    agendamentos: [],
    simuladores: [],
    atribuicoes: [],
    fichas: [],
    fichaManobras: [],
    nextFichaId: 1,
    nextManobraId: 1,
  };
}

function cloneState(state: FakeState): FakeState {
  return {
    agendamentos: state.agendamentos.map((r) => ({ ...r })),
    simuladores: state.simuladores.map((r) => ({ ...r })),
    atribuicoes: state.atribuicoes.map((r) => ({ ...r })),
    fichas: state.fichas.map((r) => ({ ...r })),
    fichaManobras: state.fichaManobras.map((r) => ({ ...r })),
    nextFichaId: state.nextFichaId,
    nextManobraId: state.nextManobraId,
  };
}

function restoreState(target: FakeState, snapshot: FakeState) {
  target.agendamentos = snapshot.agendamentos;
  target.simuladores = snapshot.simuladores;
  target.atribuicoes = snapshot.atribuicoes;
  target.fichas = snapshot.fichas;
  target.fichaManobras = snapshot.fichaManobras;
  target.nextFichaId = snapshot.nextFichaId;
  target.nextManobraId = snapshot.nextManobraId;
}

type Exec = () => Promise<unknown>;

/**
 * Minimal, purpose-built D1 fake for this module's exact known queries —
 * not a general SQL engine. Stateful across calls within a test so
 * idempotency / reexecution / cross-tenant isolation can be asserted for
 * real, unlike a stateless per-call mock.
 */
function createFakeDb(state: FakeState, options?: { forceBatchFailure?: boolean }) {
  const db = {
    prepare(query: string) {
      const prepared = {
        all: async () => {
          if (query === 'PRAGMA table_info(fichas_sessao_manobras)') {
            return { results: [{ name: 'id' }, { name: 'ficha_id' }, { name: 'empresa_id' }] };
          }
          return { results: [] };
        },
        bind(...args: unknown[]) {
          const first = async (): Promise<unknown> => {
            if (query.startsWith('SELECT id, data, instrutor_id, simulador_id')) {
              const [id, empresaId] = args as [number, number];
              const row = state.agendamentos.find(
                (a) => a.id === id && a.empresa_id === empresaId && !a.deleted_at && a.modo_compartilhado === 1,
              );
              return row ? { id: row.id, data: row.data, instrutor_id: row.instrutor_id, simulador_id: row.simulador_id } : null;
            }

            if (query.includes('FROM simuladores s')) {
              const [id, empresaId] = args as [number, number];
              const row = state.simuladores.find((s) => s.id === id && s.empresa_id === empresaId && !s.deleted_at);
              return row ? { modelo_aeronave: row.modelo_aeronave, nome: row.nome } : null;
            }

            if (query.includes('FROM fichas_sessao') && query.includes('agendamento_slot_id = ?')) {
              // Both the canonical existingFicha check and the post-batch
              // fallback resolver share this shape:
              //   empresaId, agendamentoSlotId, colaboradorIdAluno, templateId, atribuicaoCurricularId
              const [empresaId, agendamentoSlotId, colaboradorIdAluno, templateId, atribuicaoCurricularId] = args as [
                number,
                number,
                number,
                number,
                number,
              ];
              const row = state.fichas.find(
                (f) =>
                  f.empresa_id === empresaId &&
                  f.agendamento_slot_id === agendamentoSlotId &&
                  f.colaborador_id_aluno === colaboradorIdAluno &&
                  f.template_id === templateId &&
                  f.atribuicao_curricular_id === atribuicaoCurricularId &&
                  !f.deleted_at,
              );
              return row ? { id: row.id } : null;
            }

            if (query.startsWith('SELECT id FROM fichas_sessao WHERE uuid = ?')) {
              const [uuid, empresaId] = args as [string, number];
              const row = state.fichas.find((f) => f.uuid === uuid && f.empresa_id === empresaId && !f.deleted_at);
              return row ? { id: row.id } : null;
            }

            return null;
          };

          const all = async (): Promise<{ results: unknown[] }> => {
            if (query === 'PRAGMA table_info(fichas_sessao_manobras)') {
              return { results: [{ name: 'id' }, { name: 'ficha_id' }, { name: 'empresa_id' }] };
            }

            if (query.includes('FROM simulador_atribuicoes_curriculares sac') && query.includes('INNER JOIN sessoes_participantes sp')) {
              const [spEmpresaId, msEmpresaId, agendamentoId, sacEmpresaId] = args as [number, number, number, number];
              const rows = state.atribuicoes.filter(
                (a) =>
                  a.agendamento_id === agendamentoId &&
                  a.empresa_id === sacEmpresaId &&
                  !a.deleted_at &&
                  a.gera_ficha === 1 &&
                  a.modelo_sessao_id !== null &&
                  a.participante_empresa_id === spEmpresaId &&
                  !a.participante_deleted_at &&
                  a.modelo_empresa_id === msEmpresaId &&
                  !a.modelo_deleted_at,
              );
              return {
                results: rows.map((a) => ({
                  id: a.id,
                  participante_id: a.id + 10000,
                  modelo_sessao_id: a.modelo_sessao_id,
                  gera_ficha: a.gera_ficha,
                  funcionario_id: a.funcionario_id,
                  modelo_codigo: a.modelo_codigo,
                  modelo_nome: a.modelo_nome,
                  tipo_sessao_codigo: a.tipo_sessao_codigo,
                })),
              };
            }

            return { results: [] };
          };

          const exec: Exec = async () => {
            if (query.startsWith('INSERT INTO fichas_sessao\n') || query.startsWith('INSERT INTO fichas_sessao ')) {
              const [
                uuid,
                agendamentoSlotId,
                colaboradorIdAluno,
                instrutorId,
                tipoSessao,
                tipoAeronave,
                dataSessao,
                templateId,
                empresaId,
                atribuicaoCurricularId,
                weEmpresaId,
                weAgendamentoSlotId,
                weColaboradorIdAluno,
                weTemplateId,
                weAtribuicaoCurricularId,
              ] = args as [
                string,
                number,
                number,
                number,
                string,
                string,
                string,
                number,
                number,
                number,
                number,
                number,
                number,
                number,
                number,
              ];

              const exists = state.fichas.some(
                (f) =>
                  f.empresa_id === weEmpresaId &&
                  f.agendamento_slot_id === weAgendamentoSlotId &&
                  f.colaborador_id_aluno === weColaboradorIdAluno &&
                  f.template_id === weTemplateId &&
                  f.atribuicao_curricular_id === weAtribuicaoCurricularId &&
                  !f.deleted_at,
              );
              if (exists) return { meta: { changes: 0 } };

              if (options?.forceBatchFailure && colaboradorIdAluno === 999) {
                throw new Error('simulated D1 write failure');
              }

              state.fichas.push({
                id: state.nextFichaId++,
                uuid,
                agendamento_slot_id: agendamentoSlotId,
                colaborador_id_aluno: colaboradorIdAluno,
                instrutor_id: instrutorId,
                tipo_sessao: tipoSessao,
                tipo_aeronave: tipoAeronave,
                data_sessao: dataSessao,
                status: 'AVALIACAO_PENDENTE',
                template_id: templateId,
                empresa_id: empresaId,
                atribuicao_curricular_id: atribuicaoCurricularId,
                segmento_atribuicao_id: null,
                deleted_at: null,
              });
              return { meta: { changes: 1 } };
            }

            if (query.startsWith('INSERT INTO fichas_sessao_manobras')) {
              const [codigo, nome, descricao, categoria, ordem, tripulante, manobraEmpresaId, uuid, empresaId] = args as [
                string,
                string,
                string,
                string,
                number,
                string,
                number,
                string,
                number,
              ];

              const ficha = state.fichas.find((f) => f.uuid === uuid && f.empresa_id === empresaId && !f.deleted_at);
              if (!ficha) return { meta: { changes: 0 } };

              state.fichaManobras.push({
                id: state.nextManobraId++,
                ficha_id: ficha.id,
                codigo,
                nome,
                descricao,
                categoria,
                ordem,
                tripulante,
                empresa_id: manobraEmpresaId,
              });
              return { meta: { changes: 1 } };
            }

            throw new Error(`Fake DB: unhandled statement in batch: ${query}`);
          };

          return { first, all, __exec: exec, run: exec };
        },
      };
      return prepared;
    },
    batch: async (statements: Array<{ __exec: Exec }>) => {
      const snapshot = cloneState(state);
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.__exec());
        }
        return results;
      } catch (error) {
        restoreState(state, snapshot);
        throw error;
      }
    },
  };

  return db as unknown as D1Database;
}

const EMPRESA_6 = 6;
const EMPRESA_8 = 8;

function seedSession(state: FakeState, overrides: Partial<AgendamentoRow> = {}): AgendamentoRow {
  const row: AgendamentoRow = {
    id: 109,
    empresa_id: EMPRESA_6,
    data: '2026-07-10',
    instrutor_id: 501,
    simulador_id: 10,
    modo_compartilhado: 1,
    deleted_at: null,
    ...overrides,
  };
  state.agendamentos.push(row);
  return row;
}

function seedSimulador(state: FakeState, overrides: Partial<SimuladorRow> = {}): SimuladorRow {
  const row: SimuladorRow = {
    id: 10,
    empresa_id: EMPRESA_6,
    modelo_aeronave: 'AW139',
    nome: 'SIM-01',
    deleted_at: null,
    ...overrides,
  };
  state.simuladores.push(row);
  return row;
}

function seedAtribuicao(state: FakeState, overrides: Partial<AtribuicaoRow>): AtribuicaoRow {
  const row: AtribuicaoRow = {
    id: 1,
    agendamento_id: 109,
    empresa_id: EMPRESA_6,
    participante_empresa_id: EMPRESA_6,
    participante_deleted_at: null,
    funcionario_id: 101,
    modelo_sessao_id: 2001,
    modelo_empresa_id: EMPRESA_6,
    modelo_deleted_at: null,
    modelo_codigo: 'PER',
    modelo_nome: 'Modelo A',
    tipo_sessao_codigo: 'PER',
    gera_ficha: 1,
    deleted_at: null,
    ...overrides,
  };
  state.atribuicoes.push(row);
  return row;
}

describe('generateFichasForSharedSession', () => {
  let state: FakeState;

  beforeEach(() => {
    state = createState();
  });

  it('creates exactly one ficha per assignment for two participants and two models', async () => {
    seedSession(state);
    seedSimulador(state);
    seedAtribuicao(state, { id: 501, funcionario_id: 101, modelo_sessao_id: 2001, modelo_codigo: 'PER-A' });
    seedAtribuicao(state, { id: 502, funcionario_id: 102, modelo_sessao_id: 2002, modelo_codigo: 'PER-B' });

    const db = createFakeDb(state);
    const result = await generateFichasForSharedSession(db, EMPRESA_6, 109);

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(state.fichas).toHaveLength(2);

    const fichaFor101 = state.fichas.find((f) => f.colaborador_id_aluno === 101);
    const fichaFor102 = state.fichas.find((f) => f.colaborador_id_aluno === 102);
    expect(fichaFor101?.template_id).toBe(2001);
    expect(fichaFor101?.atribuicao_curricular_id).toBe(501);
    expect(fichaFor102?.template_id).toBe(2002);
    expect(fichaFor102?.atribuicao_curricular_id).toBe(502);

    const itemsFor101 = state.fichaManobras.filter((m) => m.ficha_id === fichaFor101?.id);
    const itemsFor102 = state.fichaManobras.filter((m) => m.ficha_id === fichaFor102?.id);
    expect(itemsFor101).toHaveLength(1);
    expect(itemsFor102).toHaveLength(1);
  });

  it('does not create four fichas when two segments share the same assignments', async () => {
    // The generator queries by atribuicao_curricular_id at the session
    // level, not per-segment, so two segments referencing the same two
    // assignment rows must not double the ficha count.
    seedSession(state);
    seedSimulador(state);
    seedAtribuicao(state, { id: 501, funcionario_id: 101, modelo_sessao_id: 2001 });
    seedAtribuicao(state, { id: 502, funcionario_id: 102, modelo_sessao_id: 2002 });

    const db = createFakeDb(state);
    const result = await generateFichasForSharedSession(db, EMPRESA_6, 109);

    expect(result.created).toBe(2);
    expect(state.fichas).toHaveLength(2);
  });

  it('reexecution creates zero new fichas and zero new items', async () => {
    seedSession(state);
    seedSimulador(state);
    seedAtribuicao(state, { id: 501, funcionario_id: 101, modelo_sessao_id: 2001 });
    seedAtribuicao(state, { id: 502, funcionario_id: 102, modelo_sessao_id: 2002 });

    const db = createFakeDb(state);
    const first = await generateFichasForSharedSession(db, EMPRESA_6, 109);
    expect(first.created).toBe(2);
    expect(state.fichas).toHaveLength(2);
    expect(state.fichaManobras).toHaveLength(2);

    const second = await generateFichasForSharedSession(db, EMPRESA_6, 109);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
    expect(state.fichas).toHaveLength(2);
    expect(state.fichaManobras).toHaveLength(2);
  });

  it('creates only the missing ficha when one already exists and one is absent', async () => {
    seedSession(state);
    seedSimulador(state);
    const a501 = seedAtribuicao(state, { id: 501, funcionario_id: 101, modelo_sessao_id: 2001 });
    seedAtribuicao(state, { id: 502, funcionario_id: 102, modelo_sessao_id: 2002 });

    state.fichas.push({
      id: 900,
      uuid: 'pre-existing-uuid',
      agendamento_slot_id: 109,
      colaborador_id_aluno: a501.funcionario_id,
      instrutor_id: 501,
      tipo_sessao: 'PER',
      tipo_aeronave: 'AW139',
      data_sessao: '2026-07-10',
      status: 'AVALIACAO_PENDENTE',
      template_id: a501.modelo_sessao_id!,
      empresa_id: EMPRESA_6,
      atribuicao_curricular_id: a501.id,
      segmento_atribuicao_id: null,
      deleted_at: null,
    });

    const db = createFakeDb(state);
    const result = await generateFichasForSharedSession(db, EMPRESA_6, 109);

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(state.fichas).toHaveLength(2);
    expect(state.fichas.some((f) => f.atribuicao_curricular_id === 502)).toBe(true);
  });

  it('generates no fichas when gera_ficha = 0', async () => {
    seedSession(state);
    seedSimulador(state);
    seedAtribuicao(state, { id: 501, funcionario_id: 101, modelo_sessao_id: 2001, gera_ficha: 0 });

    const db = createFakeDb(state);
    const result = await generateFichasForSharedSession(db, EMPRESA_6, 109);

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(state.fichas).toHaveLength(0);
  });

  it('does not execute the batch or create a partial ficha when a modelo has no manobras', async () => {
    seedSession(state);
    seedSimulador(state);
    seedAtribuicao(state, { id: 501, funcionario_id: 101, modelo_sessao_id: 2001 });
    seedAtribuicao(state, { id: 502, funcionario_id: 102, modelo_sessao_id: MODELO_SEM_MANOBRAS });

    const db = createFakeDb(state);

    await expect(generateFichasForSharedSession(db, EMPRESA_6, 109)).rejects.toThrow(/manobras/i);
    expect(state.fichas).toHaveLength(0);
    expect(state.fichaManobras).toHaveLength(0);
  });

  it('rolls back all new fichas in the batch when a write fails partway through', async () => {
    seedSession(state);
    seedSimulador(state);
    seedAtribuicao(state, { id: 501, funcionario_id: 101, modelo_sessao_id: 2001 });
    // funcionario_id 999 is rigged by the fake to throw during its ficha
    // insert, simulating a genuine D1 write failure partway through the
    // batch — real D1Database.batch() is atomic at the platform level, so
    // the first assignment's ficha must not survive either.
    seedAtribuicao(state, { id: 502, funcionario_id: 999, modelo_sessao_id: 2002 });

    const db = createFakeDb(state, { forceBatchFailure: true });

    await expect(generateFichasForSharedSession(db, EMPRESA_6, 109)).rejects.toThrow('simulated D1 write failure');
    expect(state.fichas).toHaveLength(0);
    expect(state.fichaManobras).toHaveLength(0);
  });

  it('isolates tenant 6 from tenant 8: same numeric ids, no cross-tenant read or write', async () => {
    // Tenant 6's real session/simulator/assignment.
    seedSession(state, { id: 200, empresa_id: EMPRESA_6, simulador_id: 10 });
    seedSimulador(state, { id: 10, empresa_id: EMPRESA_6, modelo_aeronave: 'AW139' });
    seedAtribuicao(state, { id: 501, agendamento_id: 200, empresa_id: EMPRESA_6, funcionario_id: 101, modelo_sessao_id: 2001, modelo_empresa_id: EMPRESA_6, participante_empresa_id: EMPRESA_6 });

    // Tenant 8's session/simulator/assignment reusing the exact same
    // numeric ids (200 / 10 / 501 / 101 / 2001) — nothing here should ever
    // be visible to a call scoped to empresa 6.
    seedSession(state, { id: 200, empresa_id: EMPRESA_8, simulador_id: 10 });
    seedSimulador(state, { id: 10, empresa_id: EMPRESA_8, modelo_aeronave: 'H225' });
    seedAtribuicao(state, { id: 501, agendamento_id: 200, empresa_id: EMPRESA_8, funcionario_id: 101, modelo_sessao_id: 2001, modelo_empresa_id: EMPRESA_8, participante_empresa_id: EMPRESA_8 });

    const db = createFakeDb(state);
    const result = await generateFichasForSharedSession(db, EMPRESA_6, 200);

    expect(result.created).toBe(1);
    expect(state.fichas).toHaveLength(1);
    const [ficha] = state.fichas;
    expect(ficha.empresa_id).toBe(EMPRESA_6);
    expect(ficha.tipo_aeronave).toBe('AW139'); // tenant 6's simulator model, not tenant 8's H225

    // Running the same call for tenant 8 must create its own, independent
    // ficha rather than finding/reusing tenant 6's row for the same ids.
    const resultTenant8 = await generateFichasForSharedSession(db, EMPRESA_8, 200);
    expect(resultTenant8.created).toBe(1);
    expect(state.fichas).toHaveLength(2);
    const fichaTenant8 = state.fichas.find((f) => f.empresa_id === EMPRESA_8);
    expect(fichaTenant8?.tipo_aeronave).toBe('H225');

    // Tenant 6's row remains untouched.
    const fichaTenant6 = state.fichas.find((f) => f.empresa_id === EMPRESA_6);
    expect(fichaTenant6?.tipo_aeronave).toBe('AW139');
  });

  it('throws when the shared session does not exist in the given tenant (cross-tenant read attempt)', async () => {
    seedSession(state, { id: 300, empresa_id: EMPRESA_8 });

    const db = createFakeDb(state);
    await expect(generateFichasForSharedSession(db, EMPRESA_6, 300)).rejects.toThrow(/não encontrada/);
    expect(state.fichas).toHaveLength(0);
  });
});
