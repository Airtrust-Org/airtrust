import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commitNativeLessonCheckpoint,
} from '../../services/lms-native-checkpoint-writer';
import { validateNativeCourseArtifact } from '../../lib/lms/lms-native-course-contract';
import type { NativeSessionScope } from '../../lib/lms/lms-native-evidence-domain';

const course = validateNativeCourseArtifact(JSON.parse(readFileSync(
  join(process.cwd(), '..', 'scripts', 'learning-factory', 'fixtures', 'native-v1-synthetic.json'),
  'utf8',
)));
const scope: NativeSessionScope = {
  empresaId: 6, matriculaId: 101, cicloId: 11,
  cursoId: 31, artifactHash: 'a'.repeat(64),
};
const event = {
  eventId: 'view-intro-1', sequence: 1,
  artifactHash: scope.artifactHash, unitId: 'opening',
};
const twoLessonCourse = validateNativeCourseArtifact(JSON.parse(JSON.stringify({
  ...course,
  units: [
    course.units[0],
    {
      id: 'second-lesson', title: 'Segunda unidade', kind: 'lesson',
      blocks: [{ type: 'paragraph', text: 'Segundo conteúdo.' }],
      questionIds: [], sourceRefs: ['NR6'],
    },
    ...course.units.slice(1),
  ],
})));
type Row = { event_id: string; sequencia: number; unidade_id: string; payload_sha256: string };

function harness(settings: { owner?: number; binding?: boolean; race?: 'SAME' | 'CONFLICT'; artifact?: typeof course } = {}) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const rows: Row[] = [];
  let insertAttempts = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return {
            async first() {
              if (sql.startsWith('SELECT b.id FROM lms_native_matricula_edicoes b')) {
                if (settings.binding === false || binds[0] !== (settings.owner ?? 900) ||
                    binds[1] !== 6 || binds[2] !== 101 || binds[3] !== 11 ||
                    binds[4] !== 31 || binds[5] !== scope.artifactHash) return null;
                return { id: 51 };
              }
              if (sql.startsWith('SELECT event_id')) {
                return rows.find((item) =>
                  item.event_id === binds[1] && binds[0] === 51) ?? null;
              }
              throw new Error('UNEXPECTED_SELECT');
            },
            async all() {
              if (!sql.startsWith('SELECT event_id') || binds[0] !== 51) {
                throw Error('UNEXPECTED_EVENT_READ');
              }
              return { success: true, results: [...rows] };
            },
            async run() {
              if (!sql.startsWith('INSERT INTO lms_native_eventos')) throw Error('UNEXPECTED_WRITE');
              insertAttempts++;
              const row: Row = {
                event_id: String(binds[0]), sequencia: Number(binds[1]),
                unidade_id: String(binds[2]), payload_sha256: String(binds[3]),
              };
              if (settings.race === 'SAME') {
                rows.push(row);
                throw new Error('SIMULATED_UNIQUE_RACE');
              }
              if (settings.race === 'CONFLICT') {
                rows.push({ ...row, unidade_id: 'different' });
                throw new Error('SIMULATED_UNIQUE_RACE');
              }
              if (rows.some((item) => item.event_id === row.event_id ||
                  item.sequencia === row.sequencia)) throw Error('UNIQUE_EVENT');
              rows.push(row);
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const commit = (override: Partial<typeof event> = {}, who=900,
    scoped: Partial<NativeSessionScope> = {}) =>
    commitNativeLessonCheckpoint({
      db, actorUserId: who, scope: { ...scope, ...scoped },
      artifact: settings.artifact ?? course, event: { ...event, ...override },
    });
  return { rows, calls, commit, insertAttempts: () => insertAttempts };
}

describe('Native V1 atomic checkpoint writer — no LMS completion side effects', () => {
  it('writes one server-hashed lesson event only for the pinned active enrollment', async () => {
    const f = harness();
    const result = await f.commit();
    expect(result).toEqual({
      state: 'APPLIED', committedSequence: 1, editionHash: scope.artifactHash,
    });
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]?.payload_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(f.calls[0]?.binds).toEqual([900,6,101,11,31,scope.artifactHash]);
    const insert = f.calls.find((call) => call.sql.startsWith('INSERT'));
    expect(insert?.sql).toContain('AND m.status=\'EM_ANDAMENTO\'');
    expect(insert?.sql).toContain('AND cycle.ciclo_atual=1');
    expect(insert?.sql).toContain("cycle.status='EM_ANDAMENTO'");
    expect(insert?.sql).toContain('cycle.funcionario_id=m.funcionario_id');
    expect(insert?.sql).toContain('AND ed.artifact_sha256=?');
    expect(insert?.sql).not.toContain('UPDATE lms_matriculas');
    expect(f.calls.every((call) => /^(SELECT|INSERT)/.test(call.sql))).toBe(true);
  });

  it('retries the exact event idempotently without a second insert', async () => {
    const f = harness();
    await f.commit();
    await expect(f.commit()).resolves.toMatchObject({ state: 'IDEMPOTENT_REPLAY' });
    expect(f.insertAttempts()).toBe(1);
    expect(f.rows).toHaveLength(1);
  });

  it('refuses a reused event ID with different sequence or unit', async () => {
    const f = harness();
    await f.commit();
    await expect(f.commit({ sequence: 2 })).rejects.toThrowError('NATIVE_IDEMPOTENCY_CONFLICT');
    await expect(f.commit({ unitId: 'exam' })).rejects.toThrow();
    expect(f.rows).toHaveLength(1);
  });

  it('rejects unknown lesson and forged event edition without writing', async () => {
    const f = harness();
    await expect(f.commit({ unitId: 'exam' })).rejects.toThrowError('NATIVE_INVALID_UNIT_EVENT');
    await expect(f.commit({ artifactHash: 'b'.repeat(64) })).rejects.toThrowError('NATIVE_EDITION_CONFLICT');
    await expect(f.commit({ sequence: 4 })).rejects.toThrowError('NATIVE_STALE_OR_GAP_SEQUENCE');
    expect(f.insertAttempts()).toBe(0);
  });

  it('enforces authored lesson order on the server and rejects duplicate forward evidence', async () => {
    const f = harness({ artifact: twoLessonCourse });
    await expect(f.commit({ unitId: 'second-lesson' }))
      .rejects.toThrowError('NATIVE_OUT_OF_ORDER_UNIT');
    expect(f.insertAttempts()).toBe(0);

    await expect(f.commit()).resolves.toMatchObject({ state: 'APPLIED' });
    await expect(f.commit({
      eventId: 'view-opening-again', sequence: 2, unitId: 'opening',
    })).rejects.toThrowError('NATIVE_OUT_OF_ORDER_UNIT');
    await expect(f.commit({
      eventId: 'view-second-2', sequence: 2, unitId: 'second-lesson',
    })).resolves.toMatchObject({ state: 'APPLIED', committedSequence: 2 });
    await expect(f.commit({
      eventId: 'view-after-end', sequence: 3, unitId: 'second-lesson',
    })).rejects.toThrowError('NATIVE_CHECKPOINT_SEQUENCE_COMPLETE');
    expect(f.rows.map(row => row.unidade_id)).toEqual(['opening','second-lesson']);
  });

  it('refuses requests from a different user, tenant, enrollment, cycle or edition', async () => {
    const f = harness();
    await expect(f.commit({},901)).rejects.toThrowError('NATIVE_CHECKPOINT_ACCESS_DENIED');
    for (const override of [
      { empresaId: 7 }, { matriculaId: 102 }, { cicloId: 12 },
      { cursoId: 32 }, { artifactHash: 'b'.repeat(64) },
    ]) {
      await expect(f.commit({},900,override)).rejects.toThrowError('NATIVE_CHECKPOINT_ACCESS_DENIED');
    }
    expect(f.calls.every((call) => !call.sql.startsWith('INSERT'))).toBe(true);
  });

  it('handles a two-device race only when the other commit matches all event fields', async () => {
    const f = harness({ race: 'SAME' });
    await expect(f.commit()).resolves.toMatchObject({ state: 'IDEMPOTENT_REPLAY' });
    expect(f.rows).toHaveLength(1);
    const other = harness({ race: 'CONFLICT' });
    await expect(other.commit()).rejects.toThrowError('NATIVE_CHECKPOINT_ATOMIC_COMMIT_CONFLICT');
  });

  it('does not accept fake persisted evidence or a mismatched stored hash on replay', async () => {
    const f = harness();
    await f.commit();
    f.rows[0]!.payload_sha256 = 'f'.repeat(64);
    await expect(f.commit()).rejects.toThrowError('NATIVE_CHECKPOINT_INVALID_LEDGER');
  });

  it('refuses to append after a previously persisted checkpoint hash is corrupted', async () => {
    const f = harness({ artifact: twoLessonCourse });
    await f.commit();
    f.rows[0]!.payload_sha256 = '0'.repeat(64);
    await expect(f.commit({
      eventId: 'view-second-2', sequence: 2, unitId: 'second-lesson',
    })).rejects.toThrowError('NATIVE_CHECKPOINT_INVALID_LEDGER');
    expect(f.rows).toHaveLength(1);
    expect(f.insertAttempts()).toBe(1);
  });

  it('rejects malformed authenticated context before selecting the enrollment', async () => {
    const f = harness();
    await expect(f.commit({},0)).rejects.toThrowError('NATIVE_CHECKPOINT_INVALID_CONTEXT');
    await expect(f.commit({},900,{ empresaId: 0 })).rejects.toThrowError('NATIVE_CHECKPOINT_INVALID_CONTEXT');
    expect(f.calls).toHaveLength(0);
  });
});
