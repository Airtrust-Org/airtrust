import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSchemaColumns,
  getSchemaTriggerNames,
  hasSchemaColumn,
  hasSchemaTable,
  resetSchemaCache,
} from '../../utils/db-schema';

type FakeSchema = Record<string, string[]>;

function makeDb(schema: FakeSchema) {
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      calls.push(sql);
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async first() {
          const name = String(bindings[0] || '').toLowerCase();
          return Object.hasOwn(schema, name) ? { found: 1 } : null;
        },
        async all() {
          const match = sql.match(/table_info\('([^']+)'\)/i);
          const name = String(match?.[1] || '').toLowerCase();
          return { results: (schema[name] || []).map((column) => ({ name: column })) };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe('D1 schema metadata cache', () => {
  beforeEach(() => resetSchemaCache());

  it('caches physical trigger metadata per D1 binding and clears it explicitly', async () => {
    let probes = 0;
    function binding() {
      return {
        prepare(sql: string) {
          expect(sql).toContain('sqlite_schema');
          return {
            bind(table: string) {
              expect(table).toBe('sessoes_checks_resultados_individuais');
              return {
                async all() {
                  probes += 1;
                  return { results: [{ name: 'trg_checks_individuais_scope_insert' }] };
                },
              };
            },
          };
        },
      } as unknown as D1Database;
    }
    const first = binding();
    const second = binding();
    expect(await getSchemaTriggerNames(first, 'sessoes_checks_resultados_individuais'))
      .toEqual(new Set(['trg_checks_individuais_scope_insert']));
    await getSchemaTriggerNames(first, 'sessoes_checks_resultados_individuais');
    expect(probes).toBe(1);
    await getSchemaTriggerNames(second, 'sessoes_checks_resultados_individuais');
    expect(probes).toBe(2);
    resetSchemaCache();
    await getSchemaTriggerNames(first, 'sessoes_checks_resultados_individuais');
    expect(probes).toBe(3);
  });

  it('caches table and column probes for the same D1 binding', async () => {
    const { db, calls } = makeDb({ funcionarios: ['id', 'empresa_id', 'nome'] });

    expect(await hasSchemaTable(db, 'funcionarios')).toBe(true);
    expect(await hasSchemaTable(db, 'funcionarios')).toBe(true);
    expect(await getSchemaColumns(db, 'funcionarios')).toEqual(
      new Set(['id', 'empresa_id', 'nome']),
    );
    expect(await getSchemaColumns(db, 'funcionarios')).toEqual(
      new Set(['id', 'empresa_id', 'nome']),
    );

    expect(calls.filter((sql) => sql.includes('sqlite_master'))).toHaveLength(1);
    expect(calls.filter((sql) => sql.includes('PRAGMA table_info'))).toHaveLength(1);
  });

  it('isolates cached metadata between different D1 bindings', async () => {
    const first = makeDb({ exemplo: ['id', 'ativo'] });
    const second = makeDb({});

    expect(await hasSchemaTable(first.db, 'exemplo')).toBe(true);
    expect(await hasSchemaColumn(first.db, 'exemplo', 'ativo')).toBe(true);
    expect(await hasSchemaTable(second.db, 'exemplo')).toBe(false);
    expect(await hasSchemaColumn(second.db, 'exemplo', 'ativo')).toBe(false);

    expect(first.calls.filter((sql) => sql.includes('sqlite_master'))).toHaveLength(1);
    expect(second.calls.filter((sql) => sql.includes('sqlite_master'))).toHaveLength(1);
  });

  it('re-queries metadata after an explicit cache reset', async () => {
    const { db, calls } = makeDb({ exemplo: ['id'] });
    await hasSchemaTable(db, 'exemplo');
    resetSchemaCache();
    await hasSchemaTable(db, 'exemplo');

    expect(calls.filter((sql) => sql.includes('sqlite_master'))).toHaveLength(2);
  });
});
