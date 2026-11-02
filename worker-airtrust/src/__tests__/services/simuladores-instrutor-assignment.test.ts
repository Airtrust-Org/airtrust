import { describe, expect, it } from 'vitest';
import { validateInstrutorAssignment } from '../../services/simuladores/instrutor-assignment';

type Row = Record<string, unknown> | null;

function createDb(opts: { columns: string[]; instrutor: Row; participantes?: Array<{ funcionario_id: number }> }) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds = args;
          calls.push({ sql, binds });
          return stmt;
        },
        async all() {
          if (sql.startsWith('PRAGMA table_info')) {
            return { results: opts.columns.map((name) => ({ name })) };
          }
          return { results: opts.participantes ?? [] };
        },
        async first() {
          return opts.instrutor;
        },
      };
      return stmt;
    },
  };
  return { db: db as never, calls };
}

// getSchemaColumns caches per D1 binding, so each test builds its own db object.
const base = { empresaId: 7, sessaoId: 'ses-1', instrutorId: 42, participantesReenviados: false };

describe('validateInstrutorAssignment', () => {
  it('accepts a tenant instructor flagged is_instrutor', async () => {
    const { db, calls } = createDb({ columns: ['is_instrutor'], instrutor: { is_instrutor: 1 } });
    await expect(validateInstrutorAssignment(db, base)).resolves.toEqual({ ok: true });
    const lookup = calls.find((c) => c.sql.includes('FROM funcionarios'));
    expect(lookup?.binds).toEqual([42, 7]);
    expect(lookup?.sql).toContain('empresa_id = ?');
  });

  it('rejects an employee that is not an instructor', async () => {
    const { db } = createDb({ columns: ['is_instrutor'], instrutor: { is_instrutor: 0 } });
    await expect(validateInstrutorAssignment(db, base)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Instrutor inválido para esta empresa.',
    });
  });

  it('rejects an instructor that does not exist in the tenant', async () => {
    const { db } = createDb({ columns: ['is_instrutor'], instrutor: null });
    const result = await validateInstrutorAssignment(db, base);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('skips the flag check when the schema has no is_instrutor column', async () => {
    const { db } = createDb({ columns: [], instrutor: { is_instrutor: 1 } });
    await expect(validateInstrutorAssignment(db, base)).resolves.toEqual({ ok: true });
  });

  it('blocks self-evaluation when participants are not resent', async () => {
    const { db } = createDb({
      columns: ['is_instrutor'],
      instrutor: { is_instrutor: 1 },
      participantes: [{ funcionario_id: 42 }],
    });
    await expect(validateInstrutorAssignment(db, base)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'O instrutor da sessão não pode constar como participante avaliado',
    });
  });

  it('does not query participants when they are resent in the same request', async () => {
    const { db, calls } = createDb({
      columns: ['is_instrutor'],
      instrutor: { is_instrutor: 1 },
      participantes: [{ funcionario_id: 42 }],
    });
    await expect(
      validateInstrutorAssignment(db, { ...base, participantesReenviados: true }),
    ).resolves.toEqual({ ok: true });
    expect(calls.some((c) => c.sql.includes('sessoes_participantes'))).toBe(false);
  });
});
