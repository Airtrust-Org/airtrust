import { describe, expect, it } from 'vitest';
import {
  startNativeEnrollment,
} from '../../services/lms-native-enrollment-starter';

const ctx = {
  actorUserId: 900, empresaId: 6, matriculaId: 101,
  cursoId: 31, cicloId: 1001, editionHash: 'a'.repeat(64),
};
function fixture(options: {
  status?: string | null;
  owner?: number;
  digest?: string;
  active?: boolean;
  startFails?: boolean;
} = {}) {
  const statements: Array<{ query: string; binds: unknown[] }> = [];
  let status = options.status === undefined ? 'NAO_INICIADO' : options.status;
  const db = {
    prepare(query: string) {
      return {
        bind(...binds: unknown[]) {
          statements.push({ query, binds });
          return {
            async run() {
              if (!query.startsWith('UPDATE lms_matriculas')) throw Error('UNEXPECTED_WRITE');
              if (options.startFails) throw Error('D1_FAILURE');
              const expected = [101, 6, 31, options.owner ?? 900, 1001, options.digest ?? ctx.editionHash];
              if (status === 'NAO_INICIADO' && options.active !== false &&
                  JSON.stringify(binds) === JSON.stringify(expected)) {
                status = 'EM_ANDAMENTO';
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            },
            async first() {
              if (!query.startsWith('SELECT m.status')) throw Error('UNEXPECTED_READ');
              if (options.active === false || options.owner === 0 ||
                  options.digest === 'b'.repeat(64)) return null;
              return status === null ? null : { status };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const start = (override: Partial<typeof ctx> = {}) =>
    startNativeEnrollment({ db, ...ctx, ...override });
  return { start, statements };
}

describe('Native LMS start — single-transaction tenant/cycle/edition pin gate', () => {
  it('starts a pinned NAO_INICIADO enrollment without inventing completion evidence', async () => {
    const f = fixture();
    await expect(f.start()).resolves.toEqual({
      state: 'STARTED', cicloId: 1001, editionHash: ctx.editionHash,
    });
    expect(f.statements).toHaveLength(1);
    expect(f.statements[0].binds).toEqual([101,6,31,900,1001,ctx.editionHash]);
    const sql = f.statements[0].query;
    expect(sql).toContain("status='NAO_INICIADO'");
    expect(sql).toContain("ed.status='PUBLISHED'");
    expect(sql).toContain('ed.artifact_sha256=?');
    expect(sql).toContain('u.funcionario_id=lms_matriculas.funcionario_id');
    expect(sql).toContain('c.tipo_conteudo=\'native\'');
    expect(sql).toContain('ciclo.ciclo_atual=1');
    expect(sql).not.toContain('CONCLUIDO');
    expect(sql).not.toContain('qualificacao_historico');
  });

  it('is idempotent when the same authenticated enrollment was already started', async () => {
    const f = fixture();
    expect((await f.start()).state).toBe('STARTED');
    expect((await f.start()).state).toBe('ALREADY_STARTED');
    expect(f.statements.filter((s) => s.query.startsWith('SELECT'))).toHaveLength(1);
  });

  it('rejects completed and canceled enrollments instead of silently reopening them', async () => {
    for (const status of ['CONCLUIDO','CANCELADO','REPROVADO']) {
      const f = fixture({ status });
      await expect(f.start()).rejects.toMatchObject({
        code: 'NATIVE_START_ACCESS_OR_STATE_DENIED',
      });
    }
  });

  it('refuses a revoked edition or cycle in both update and replay', async () => {
    const f = fixture({ active: false });
    await expect(f.start()).rejects.toMatchObject({ code: 'NATIVE_START_ACCESS_OR_STATE_DENIED' });
  });

  it('rejects invalid tenant, user, cycle and SHA before SQL', async () => {
    const f = fixture();
    for (const override of [
      { actorUserId: 0 }, { empresaId: 0 }, { matriculaId: -1 },
      { cursoId: NaN }, { cicloId: 0 }, { editionHash: 'b' },
    ]) {
      await expect(f.start(override)).rejects.toMatchObject({
        code: 'NATIVE_START_INVALID_CONTEXT',
      });
    }
    expect(f.statements).toHaveLength(0);
  });

  it('propagates D1 failures rather than claiming a successful start', async () => {
    const f = fixture({ startFails: true });
    await expect(f.start()).rejects.toThrow('D1_FAILURE');
  });

  it('rechecks pinned tenant, employee and edition on retry', async () => {
    const f = fixture({ status: 'EM_ANDAMENTO', owner: 0 });
    await expect(f.start()).rejects.toMatchObject({ code: 'NATIVE_START_ACCESS_OR_STATE_DENIED' });
    const altered = fixture({ status: 'EM_ANDAMENTO', digest: 'b'.repeat(64) });
    await expect(altered.start()).rejects.toMatchObject({ code: 'NATIVE_START_ACCESS_OR_STATE_DENIED' });
  });
});
