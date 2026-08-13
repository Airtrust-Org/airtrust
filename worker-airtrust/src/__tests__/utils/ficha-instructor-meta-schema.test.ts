import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fichaInstructorMetaJoin,
  fichaInstructorMetaSelect,
  getFichaInstructorMetaSchema,
  resetFichaInstructorMetaSchemaCache,
} from '../../utils/ficha-instructor-meta-schema';

function createDb({
  hasMetaTable,
  legacyColumns = [],
}: {
  hasMetaTable: boolean;
  legacyColumns?: string[];
}) {
  return {
    prepare: vi.fn((query: string) => ({
      bind: () => ({
        first: async () => (query.includes('sqlite_master') && hasMetaTable ? { found: 1 } : null),
        all: async () => ({ results: legacyColumns.map((name) => ({ name })) }),
      }),
      first: async () => (query.includes('sqlite_master') && hasMetaTable ? { found: 1 } : null),
      all: async () => ({ results: legacyColumns.map((name) => ({ name })) }),
    })),
  } as unknown as D1Database;
}

describe('ficha instructor metadata schema compatibility', () => {
  beforeEach(resetFichaInstructorMetaSchemaCache);

  it('preserves the 0429 side-table SELECT and JOIN when the table exists', async () => {
    const schema = await getFichaInstructorMetaSchema(createDb({ hasMetaTable: true }));

    expect(fichaInstructorMetaJoin(schema)).toContain('LEFT JOIN fichas_sessao_instrutor_meta fsi');
    expect(fichaInstructorMetaSelect(schema)).toContain('fsi.equipamento_utilizado');
  });

  it('does not generate an invalid JOIN when the table and legacy columns are absent', async () => {
    const schema = await getFichaInstructorMetaSchema(createDb({ hasMetaTable: false }));

    expect(fichaInstructorMetaJoin(schema)).toBe('');
    expect(fichaInstructorMetaSelect(schema)).toContain('NULL AS equipamento_utilizado');
    expect(fichaInstructorMetaSelect(schema)).not.toContain('fichas_sessao_instrutor_meta');
  });

  it('uses legacy ficha columns only when introspection proves they exist', async () => {
    const schema = await getFichaInstructorMetaSchema(
      createDb({ hasMetaTable: false, legacyColumns: ['equipamento_utilizado'] }),
    );

    const select = fichaInstructorMetaSelect(schema);
    expect(select).toContain('fs.equipamento_utilizado AS equipamento_utilizado');
    expect(select).toContain('NULL AS dispositivo_identificacao');
  });
});
