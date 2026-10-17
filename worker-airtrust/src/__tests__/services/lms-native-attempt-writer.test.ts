import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitNativeAssessmentAttempt } from '../../services/lms-native-attempt-writer';
import { validateNativeCourseArtifact } from '../../lib/lms/lms-native-course-contract';
import type { NativeSessionScope } from '../../lib/lms/lms-native-evidence-domain';

const artifact = validateNativeCourseArtifact(JSON.parse(readFileSync(
  join(process.cwd(), '..', 'scripts/learning-factory/fixtures/native-v1-synthetic.json'),
  'utf8',
)));
const scope: NativeSessionScope = {
  empresaId: 6, matriculaId: 101, cicloId: 11,
  cursoId: 31, artifactHash: 'a'.repeat(64),
};
const good = [
  { questionId: 'choice-question-001', optionId: 'option-2' },
  { questionId: 'exam-question-001', optionId: 'option-2' },
];
const failed = [
  good[0],
  { questionId: 'exam-question-001', optionId: 'option-1' },
];
type Row = {
  id: number; tentativa_numero: number; answers_json: string;
  answers_sha256: string; policy: string; score_pct: number | null;
  assessment_satisfied: number;
};

function harness(opts: { owner?: number; race?: 'SAME' | 'DIFFERENT'; deny?: boolean } = {}) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const rows: Row[] = [];
  let insertionCount = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return {
            async first() {
              if (sql.startsWith('SELECT b.id FROM lms_native_matricula_edicoes')) {
                if (opts.deny || binds[0] !== (opts.owner ?? 900) ||
                  binds[1] !== 6 || binds[2] !== 101 || binds[3] !== 11 ||
                  binds[4] !== 31 || binds[5] !== scope.artifactHash) return null;
                return { id: 51 };
              }
              if (sql.includes('ORDER BY tentativa_numero DESC')) return rows.at(-1) ?? null;
              if (sql.includes('WHERE vinculo_id=? AND tentativa_numero=?')) {
                return rows.find((row) => row.tentativa_numero === binds[1]) ?? null;
              }
              throw Error('UNEXPECTED_QUERY');
            },
            async run() {
              if (!sql.startsWith('INSERT INTO lms_native_tentativas')) throw Error('UNEXPECTED_WRITE');
              insertionCount++;
              const row: Row = {
                id: rows.length + 10,
                tentativa_numero: Number(binds[0]),
                answers_json: String(binds[1]),
                answers_sha256: String(binds[2]),
                policy: String(binds[3]),
                score_pct: binds[4] === null ? null : Number(binds[4]),
                assessment_satisfied: Number(binds[5]),
              };
              if (opts.race === 'SAME') {
                rows.push(row);
                throw Error('SIMULATED_CONCURRENT_INSERT');
              }
              if (opts.race === 'DIFFERENT') {
                rows.push({ ...row, answers_sha256: 'f'.repeat(64) });
                throw Error('SIMULATED_CONCURRENT_INSERT');
              }
              rows.push(row);
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const commit = (attemptNumber=1, answers: unknown=good,
    overrides: Partial<NativeSessionScope>={}, actorUserId=900) =>
    commitNativeAssessmentAttempt({
      db, actorUserId, scope: { ...scope, ...overrides },
      attemptNumber, answers, artifact,
    });
  return { commit, calls, rows, writes: () => insertionCount };
}

describe('Native V1 private server-graded attempt persistence', () => {
  it('stores computed score only via a same-statement enrolled tenant+cycle guard', async () => {
    const f=harness();
    const receipt=await f.commit();
    expect(receipt).toEqual({
      state: 'APPLIED', attemptNumber: 1, editionHash: scope.artifactHash,
      scorePct: 100, assessmentSatisfied: true,
    });
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]?.answers_sha256).toMatch(/^[a-f0-9]{64}$/);
    const insert=f.calls.find((call)=>call.sql.startsWith('INSERT'));
    expect(insert?.sql).toContain("m.status='EM_ANDAMENTO'");
    expect(insert?.sql).toContain("cycle.status='EM_ANDAMENTO'");
    expect(insert?.sql).toContain('cycle.funcionario_id=m.funcionario_id');
    expect(insert?.sql).toContain("c.tipo_conteudo='native'");
    expect(insert?.sql).toContain('u.funcionario_id=m.funcionario_id');
    expect(insert?.binds[4]).toBe(100);
    expect(insert?.binds[5]).toBe(1);
    expect(f.calls.every((call) => /^(SELECT|INSERT)/.test(call.sql))).toBe(true);
  });

  it('persists an actual failure with zero rather than fabricating approval', async () => {
    const f=harness();
    const receipt=await f.commit(1,failed);
    expect(receipt).toMatchObject({ scorePct: 0, assessmentSatisfied: false });
    expect(f.rows[0]?.score_pct).toBe(0);
  });

  it('accepts an identical retry without writing a second attempt', async () => {
    const f=harness();
    await f.commit();
    expect(await f.commit()).toMatchObject({ state: 'IDEMPOTENT_REPLAY' });
    expect(f.rows).toHaveLength(1);
    expect(f.writes()).toBe(1);
  });

  it('rejects changing the same attempt after it was graded', async () => {
    const f=harness();
    await f.commit();
    await expect(f.commit(1,failed)).rejects.toThrowError('NATIVE_ATTEMPT_REPLAY_CONFLICT');
    await expect(f.commit(3)).rejects.toThrowError('NATIVE_ATTEMPT_SEQUENCE_CONFLICT');
    expect(f.rows).toHaveLength(1);
  });

  it('rejects guessed grade, forged answer key, and incomplete scored exam', async () => {
    const f=harness();
    await expect(f.commit(1,{ scorePct:100,completed:true }))
      .rejects.toThrow();
    await expect(f.commit(1,[{ ...good[0], correctOptionId:'option-2' },good[1]]))
      .rejects.toThrow();
    await expect(f.commit(1,[good[0]]))
      .rejects.toThrowError('NATIVE_ATTEMPT_INCOMPLETE');
    expect(f.calls).toHaveLength(0);
  });

  it('fails closed when user, tenant, cycle or artifact edition changes', async () => {
    const f=harness();
    await expect(f.commit(1,good,{},999)).rejects.toThrowError('NATIVE_ATTEMPT_ACCESS_DENIED');
    for(const override of [
      {empresaId:7}, {matriculaId:102}, {cicloId:12},
      {cursoId:32}, {artifactHash:'b'.repeat(64)},
    ]) {
      await expect(f.commit(1,good,override)).rejects.toThrowError('NATIVE_ATTEMPT_ACCESS_DENIED');
    }
    expect(f.writes()).toBe(0);
  });

  it('handles two-device races only when the persisted result is identical', async () => {
    const matching=harness({race:'SAME'});
    expect(await matching.commit()).toMatchObject({state:'IDEMPOTENT_REPLAY'});
    const mismatch=harness({race:'DIFFERENT'});
    await expect(mismatch.commit()).rejects.toThrowError('NATIVE_ATTEMPT_ATOMIC_COMMIT_CONFLICT');
  });

  it('rejects an invalid attempt counter before any SQL query', async () => {
    const f=harness();
    await expect(f.commit(0)).rejects.toThrowError('NATIVE_ATTEMPT_INVALID_CONTEXT');
    await expect(f.commit(501)).rejects.toThrowError('NATIVE_ATTEMPT_INVALID_CONTEXT');
    expect(f.calls).toHaveLength(0);
  });
});
