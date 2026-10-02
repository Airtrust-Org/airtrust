import { beforeEach, describe, expect, it } from 'vitest';
import { detectTreinamentoSchemaCapabilities } from '../../services/treinamentos-planejados-schema';
import { resetSchemaCache } from '../../utils/db-schema';

function createSchemaDb(options: {
  plannedColumns: string[];
  qualificationColumns: string[];
  tables: string[];
}) {
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      calls.push(sql);
      return {
        bind(...args: unknown[]) {
          return {
            first: async () => ({ found: options.tables.includes(String(args[0])) ? 1 : 0 }),
          };
        },
        all: async () => {
          const table = sql.includes("'treinamentos_planejados'")
            ? 'treinamentos_planejados'
            : sql.includes("'qualificacoes_tipos'")
              ? 'qualificacoes_tipos'
              : '';
          const columns =
            table === 'treinamentos_planejados'
              ? options.plannedColumns
              : table === 'qualificacoes_tipos'
                ? options.qualificationColumns
                : [];
          return { results: columns.map((name) => ({ name })) };
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe('treinamentos planejados schema capabilities', () => {
  beforeEach(() => resetSchemaCache());

  it('reuses shared schema probes for repeated reads on the same D1 binding', async () => {
    const { db, calls } = createSchemaDb({
      plannedColumns: [
        'modalidade',
        'codigo_turma',
        'data_inicio',
        'data_fim',
        'base',
        'sala',
        'equipamento_descricao',
        'limite_participantes',
      ],
      qualificationColumns: ['formato_id', 'categoria_id'],
      tables: ['treinamentos_instrutores', 'treinamentos_dias'],
    });

    const first = await detectTreinamentoSchemaCapabilities(db);
    const second = await detectTreinamentoSchemaCapabilities(db);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      hasModalidade: true,
      hasInstrutoresTable: true,
      hasDiasTable: true,
      hasQualificacoesTiposFormato: true,
      hasQualificacoesTiposCategoria: true,
    });
    expect(calls.filter((sql) => sql.includes('PRAGMA table_info'))).toHaveLength(2);
    expect(calls.filter((sql) => sql.includes('sqlite_master'))).toHaveLength(2);
  });

  it('keeps schema capability results isolated between different D1 bindings', async () => {
    const full = createSchemaDb({
      plannedColumns: ['modalidade', 'codigo_turma'],
      qualificationColumns: ['formato_id'],
      tables: ['treinamentos_instrutores'],
    });
    const legacy = createSchemaDb({
      plannedColumns: [],
      qualificationColumns: [],
      tables: [],
    });

    const fullCapabilities = await detectTreinamentoSchemaCapabilities(full.db);
    const legacyCapabilities = await detectTreinamentoSchemaCapabilities(legacy.db);

    expect(fullCapabilities.hasModalidade).toBe(true);
    expect(fullCapabilities.hasInstrutoresTable).toBe(true);
    expect(fullCapabilities.hasQualificacoesTiposFormato).toBe(true);
    expect(legacyCapabilities.hasModalidade).toBe(false);
    expect(legacyCapabilities.hasInstrutoresTable).toBe(false);
    expect(legacyCapabilities.hasQualificacoesTiposFormato).toBe(false);
    expect(legacy.calls.filter((sql) => sql.includes('PRAGMA table_info'))).toHaveLength(2);
    expect(legacy.calls.filter((sql) => sql.includes('sqlite_master'))).toHaveLength(2);
  });

  it('preserves fail-closed capability detection when schema probes fail', async () => {
    const db = {
      prepare() {
        throw new Error('schema unavailable');
      },
    } as unknown as D1Database;

    await expect(detectTreinamentoSchemaCapabilities(db)).resolves.toEqual({
      hasModalidade: false,
      hasCodigoTurma: false,
      hasDataInicio: false,
      hasDataFim: false,
      hasBase: false,
      hasSala: false,
      hasEquipamentoDescricao: false,
      hasLimiteParticipantes: false,
      hasInstrutoresTable: false,
      hasDiasTable: false,
      hasQualificacoesTiposFormato: false,
      hasQualificacoesTiposCategoria: false,
    });
  });
});
