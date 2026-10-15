import { describe, expect, it, vi } from 'vitest';
import {
  startNativeEnrollment,
} from '../../services/lms-native-enrollment-starter';

const context = {
  actorUserId: 900, empresaId: 6, matriculaId: 101,
  cursoId: 31, cicloId: 1001, editionHash: 'a'.repeat(64),
};

type BoundStatement = { sql: string; binds: unknown[] };
type BatchResult = { success: boolean; meta: { changes: number } };

function fakeDb(options: {
  matriculaChanges?: number;
  cycleChanges?: number;
  batchThrows?: boolean;
  incompleteResults?: boolean;
} = {}) {
  const prepared: BoundStatement[] = [];
  const batch = vi.fn(async (statements: BoundStatement[]): Promise<BatchResult[]> => {
    if (options.batchThrows) throw new Error('D1_ROLLBACK');
    if (options.incompleteResults) return [];
    expect(statements).toHaveLength(4);
    return [
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: options.matriculaChanges ?? 1 } },
      { success: true, meta: { changes: options.cycleChanges ?? 1 } },
      { success: true, meta: { changes: 0 } },
    ];
  });
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...binds: unknown[]) => {
        const stmt = { sql, binds };
        prepared.push(stmt);
        return stmt;
      },
    })),
    batch,
  } as unknown as D1Database;
  const start = (override: Partial<typeof context>={}) =>
    startNativeEnrollment({ db, ...context, ...override });
  return { db, batch, prepared, start };
}

describe('Native start transaction — D1 batch and tenant/cycle scope', () => {
  it('uses one atomic D1 batch with preflight, matrícula, cycle and postcheck', async () => {
    const f = fakeDb();
    expect(await f.start()).toEqual({
      state: 'STARTED', cicloId: 1001, editionHash: context.editionHash,
    });
    expect(f.batch).toHaveBeenCalledTimes(1);
    expect(f.prepared).toHaveLength(4);
    expect(f.prepared.every((stmt) => stmt.binds.join(':') === [
      900,101,6,31,1001,context.editionHash,
    ].join(':'))).toBe(true);
    expect(f.prepared[0].sql).toContain('NATIVE_START_SCOPE_OR_STATUS_DRIFT');
    expect(f.prepared[1].sql).toContain('UPDATE lms_matriculas');
    expect(f.prepared[1].sql).toContain("ciclo.status='NAO_INICIADO'");
    expect(f.prepared[2].sql).toContain('UPDATE lms_matricula_ciclos');
    expect(f.prepared[2].sql).toContain('m.data_inicio');
    expect(f.prepared[3].sql).toContain('NATIVE_START_ATOMIC_SYNC_FAILED');
    for (const statement of f.prepared) {
      expect(statement.sql).toContain("ed.status='PUBLISHED'");
      expect(statement.sql).toContain('ciclo.ciclo_atual=1');
      expect(statement.sql).toContain("c.tipo_conteudo='native'");
      expect(statement.sql).toContain('u.funcionario_id=m.funcionario_id');
      expect(statement.sql).toContain('ed.artifact_sha256=?');
      expect(statement.sql).not.toContain('qualificacoes_historico');
      expect(statement.sql).not.toContain('certificados');
    }
  });

  it('authorizes a SCORM-physical activated course only through all four scoped D1 statements', async () => {
    const f = fakeDb();
    const env = {
      ENVIRONMENT: 'staging',
      NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6',
      PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS: '6',
      PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS: '6',
    } as import('../../types').Env;
    await expect(startNativeEnrollment({
      db: f.db, ...context, env,
    })).resolves.toMatchObject({state:'STARTED',cicloId:1001});
    expect(f.prepared).toHaveLength(4);
    expect(f.batch).toHaveBeenCalledOnce();
    for(const statement of f.prepared){
      expect(statement.sql).toContain("c.tipo_conteudo='scorm'");
      expect(statement.sql).toContain('lms_native_catalog_activation');
      expect(statement.sql).toContain('a.empresa_id=c.empresa_id');
      expect(statement.sql).toContain('a.curso_id=c.id');
      expect(statement.sql).toContain("c.tipo_conteudo='native'");
      expect(statement.sql).toContain('FROM lms_player3_politicas p');
      expect(statement.sql).toContain("p.estado='APPROVED'");
      expect(statement.sql).toContain('p.edicao_id=ed.id');
      expect(statement.binds).toEqual([
        900,101,6,31,1001,context.editionHash,
      ]);
    }
  });

  it('keeps activation lookup OFF in production and unallowlisted tenants', async()=>{
    for(const env of [
      {ENVIRONMENT:'production',NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS:'6'},
      {ENVIRONMENT:'staging',NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS:''},
    ]){
      const f=fakeDb();
      await f.start();
      expect(f.prepared.every(stmt=>!stmt.sql.includes('lms_native_catalog_activation'))).toBe(true);
      // A marker lookup is never available when the feature is not enabled.
      const another=fakeDb();
      await startNativeEnrollment({db:another.db,...context,env:env as import('../../types').Env});
      expect(another.prepared.every(stmt=>
        !stmt.sql.includes('lms_native_catalog_activation'))).toBe(true);
    }
  });

  it('refuses activated SCORM start before authored launch and modular grading are enabled', async()=>{
    for(const variant of [
      {PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS:'',PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS:'6'},
      {PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS:'6',PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS:''},
      {PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS:'*',PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS:'6'},
    ]){
      const f=fakeDb();
      const env={
        ENVIRONMENT:'staging',
        NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS:'6',
        ...variant,
      } as import('../../types').Env;
      await startNativeEnrollment({db:f.db,...context,env});
      expect(f.prepared).toHaveLength(4);
      for(const stmt of f.prepared){
        expect(stmt.sql).toContain("c.tipo_conteudo='scorm' AND (0)");
        expect(stmt.sql).not.toContain('lms_player3_politicas');
        expect(stmt.sql).toContain('lms_native_catalog_activation');
      }
    }
  });

  it('returns idempotent receipt only after transactional postcheck', async () => {
    const f = fakeDb({ matriculaChanges: 0, cycleChanges: 0 });
    expect(await f.start()).toEqual({
      state: 'ALREADY_STARTED', cicloId: 1001, editionHash: context.editionHash,
    });
    expect(f.batch).toHaveBeenCalledOnce();
  });

  it('never claims success on mixed transition counts', async () => {
    const f = fakeDb({ matriculaChanges: 1, cycleChanges: 0 });
    await expect(f.start()).rejects.toMatchObject({
      code: 'NATIVE_START_INCONSISTENT_CHANGES',
    });
  });

  it('does not recover from a rolled back batch by guessing start state', async () => {
    const f = fakeDb({ batchThrows: true });
    await expect(f.start()).rejects.toMatchObject({
      code: 'NATIVE_START_ATOMIC_SYNC_REJECTED',
    });
    expect(f.batch).toHaveBeenCalledOnce();
  });

  it('refuses incomplete D1 results instead of reporting completed', async () => {
    const f = fakeDb({ incompleteResults: true });
    await expect(f.start()).rejects.toMatchObject({
      code: 'NATIVE_START_ATOMIC_SYNC_REJECTED',
    });
  });

  it('validates all trusted context before touching D1', async () => {
    const f = fakeDb();
    for (const invalid of [
      { actorUserId: 0 }, { empresaId: 0 }, { matriculaId: -1 },
      { cursoId: NaN }, { cicloId: 0 }, { editionHash: 'x' },
    ]) {
      await expect(f.start(invalid)).rejects.toMatchObject({
        code: 'NATIVE_START_INVALID_CONTEXT',
      });
    }
    expect(f.batch).not.toHaveBeenCalled();
    expect(f.prepared).toHaveLength(0);
  });
});
