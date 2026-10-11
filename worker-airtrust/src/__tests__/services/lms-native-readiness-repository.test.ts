import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readNativeCanonicalReadiness } from '../../services/lms-native-readiness-repository';
import { validateNativeCourseArtifact } from '../../lib/lms/lms-native-course-contract';
import type { NativeSessionScope } from '../../lib/lms/lms-native-evidence-domain';

const artifact = validateNativeCourseArtifact(JSON.parse(readFileSync(
  join(process.cwd(), '..', 'scripts/learning-factory/fixtures/native-v1-synthetic.json'), 'utf-8',
)));
const scope: NativeSessionScope = {
  empresaId: 6, cursoId: 10, matriculaId: 100, cicloId: 1000, artifactHash: 'a'.repeat(64),
};
const answers = JSON.stringify([
  { questionId: 'choice-question-001', optionId: 'option-2' },
  { questionId: 'exam-question-001', optionId: 'option-2' },
]);
async function digest(input: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
type Attempt = {
  id: number; answers_json: string; answers_sha256: string;
  policy: string; score_pct: number | null; assessment_satisfied: number;
};
function dbMock(settings: {
  binding?: { id: number; status: string } | null;
  events?: Array<{ event_id: string; sequencia: number; unidade_id: string }>;
  attempt?: Attempt | null;
  expectedActor?: number;
} = {}) {
  const calls: Array<{ query: string; params: unknown[] }> = [];
  const binding = settings.binding === undefined ? { id: 41, status: 'EM_ANDAMENTO' } : settings.binding;
  const events = settings.events ?? [{ event_id: 'visit-1', sequencia: 1, unidade_id: 'opening' }];
  const attempt = settings.attempt ?? null;
  const db = {
    prepare(query: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ query, params });
          return {
            async first() {
              if (query.includes('lms_native_matricula_edicoes b')) {
                const matches = params[0] === (settings.expectedActor ?? 12) &&
                  params[1] === 6 && params[2] === 100 && params[3] === 1000 &&
                  params[4] === 10 && params[5] === 'a'.repeat(64);
                return matches ? binding : null;
              }
              return attempt;
            },
            async all() { return { success: true, results: events }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}
const run = (db: D1Database, actorUserId=12, override: Partial<NativeSessionScope>={}) =>
  readNativeCanonicalReadiness({ db, actorUserId, scope: { ...scope, ...override }, artifact });

describe('Native V1 persisted-readiness bridge (read only)', () => {
  it('recomputes correct private quiz grade from persisted answers, then allows readiness', async () => {
    const attempt: Attempt = {
      id: 80, answers_json: answers, answers_sha256: await digest(answers),
      policy: 'SCORED', score_pct: 100, assessment_satisfied: 1,
    };
    const { db, calls } = dbMock({ attempt });
    await expect(run(db)).resolves.toEqual({ readyForCanonicalCompletion: true, reason: 'READY' });
    expect(calls[0].params).toEqual([12,6,100,1000,10,'a'.repeat(64)]);
    expect(calls.every((call) => call.query.trimStart().startsWith('SELECT'))).toBe(true);
    expect(calls[0].query).toContain("c.tipo_conteudo='native'");
    expect(calls[0].query).toContain("cycle.ciclo_atual=1");
    expect(calls[0].query).toContain('u.funcionario_id=m.funcionario_id');
  });

  it('never treats a full lesson counter as exam approval', async () => {
    const { db } = dbMock();
    await expect(run(db)).resolves.toEqual({
      readyForCanonicalCompletion: false, reason: 'ASSESSMENT_EVIDENCE_MISSING',
    });
  });

  it('rejects tampered answer hashes without exposing the answer key', async () => {
    const { db } = dbMock({ attempt: {
      id: 80, answers_json: answers, answers_sha256: 'f'.repeat(64),
      policy: 'SCORED', score_pct: 100, assessment_satisfied: 1,
    } });
    await expect(run(db)).rejects.toMatchObject({ code: 'NATIVE_READ_ATTEMPT_HASH_CONFLICT' });
  });

  it('re-evaluates and rejects forged persisted grades and pass flags', async () => {
    const wrong = JSON.stringify([
      { questionId: 'choice-question-001', optionId: 'option-2' },
      { questionId: 'exam-question-001', optionId: 'option-1' },
    ]);
    const { db } = dbMock({ attempt: {
      id: 80, answers_json: wrong, answers_sha256: await digest(wrong),
      policy: 'SCORED', score_pct: 100, assessment_satisfied: 1,
    } });
    await expect(run(db)).rejects.toMatchObject({ code: 'NATIVE_READ_GRADE_RECONCILIATION_CONFLICT' });
  });

  it('refuses alien user/tenant/cycle/hash and never accesses the proof ledger', async () => {
    for (const [actor, overrides] of [
      [14, {}], [12, { empresaId: 7 }], [12, { matriculaId: 110 }],
      [12, { cicloId: 1001 }], [12, { artifactHash: 'b'.repeat(64) }],
    ] as const) {
      const { db, calls } = dbMock();
      await expect(run(db, actor, overrides)).rejects.toMatchObject({
        code: 'NATIVE_READ_ACCESS_OR_VERSION_DENIED',
      });
      expect(calls).toHaveLength(1);
    }
  });

  it('keeps canceled and finalized enrollments in a non-finalizing state', async () => {
    for (const status of ['CONCLUIDO', 'CANCELADO']) {
      const { db } = dbMock({ binding: { id: 41, status } });
      await expect(run(db)).resolves.toMatchObject({
        readyForCanonicalCompletion: false, reason: 'NOT_ACTIVE',
      });
    }
  });

  it('refuses forged full coverage when the event sequence has a gap', async () => {
    const attempt: Attempt = {
      id: 80, answers_json: answers, answers_sha256: await digest(answers),
      policy: 'SCORED', score_pct: 100, assessment_satisfied: 1,
    };
    const { db } = dbMock({ attempt, events: [{ event_id: 'visit-2', sequencia: 2, unidade_id: 'opening' }] });
    await expect(run(db)).resolves.toMatchObject({
      readyForCanonicalCompletion: false, reason: 'LESSON_EVIDENCE_MISSING',
    });
  });
});
