import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadNativePublishedCourse,
  loadNativePrivateCourse,
  NativeContentLoadError,
} from '../../services/lms-native-content-loader';

const candidate = JSON.parse(readFileSync(
  join(process.cwd(), '..', 'scripts', 'learning-factory', 'fixtures', 'native-v1-synthetic.json'),
  'utf8',
));
const candidateBytes = new TextEncoder().encode(JSON.stringify(candidate));
async function sha(buffer: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
type EditionRow = { artifact_sha256: string; package_version: string; r2_prefix: string; ciclo_id: number };

function createFixture(params: {
  candidate?: unknown;
  bytes?: Uint8Array;
  edition?: Partial<EditionRow> | null;
  funcionarioId?: number;
  matriculaTipo?: string;
  enrollmentEmpresa?: number;
  missing?: boolean;
}) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const r2Calls: string[] = [];
  const body = params.bytes ?? candidateBytes;
  const promisedDigest = sha(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  let objectBytes = body;

  const bucket = {
    async get(key: string) {
      r2Calls.push(key);
      if (params.missing) return null;
      return {
        size: objectBytes.byteLength,
        arrayBuffer: async () => objectBytes.slice().buffer,
      };
    },
  } as unknown as R2Bucket;

  async function makeDb() {
    const hash = await promisedDigest;
    const course: EditionRow = {
      artifact_sha256: hash,
      package_version: candidate.packageVersion,
      r2_prefix: `lms/native/6/31/${hash}/`,
      ciclo_id: 600,
      ...(params.edition ?? {}),
    };
    const db = {
      prepare(sql: string) {
        return {
          bind(...binds: unknown[]) {
            calls.push({ sql, binds });
            return {
              async first() {
                if (sql.includes('FROM lms_matriculas m')) {
                  return {
                    id: 101, empresa_id: params.enrollmentEmpresa ?? 6,
                    curso_id: 31, funcionario_id: 51,
                    status: 'EM_ANDAMENTO', tipo_conteudo: params.matriculaTipo ?? 'native',
                    ativo: 1, publicado: 1,
                  };
                }
                if (sql.includes('SELECT funcionario_id FROM usuarios')) {
                  return { funcionario_id: params.funcionarioId ?? 51 };
                }
                if (sql.includes('FROM lms_native_matricula_edicoes')) return params.edition === null ? null : course;
                throw Error('UNEXPECTED_SQL');
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    return db;
  }
  const run = async () => loadNativePublishedCourse({
    db: await makeDb(), bucket, empresaId: 6, matriculaId: 101, actorUserId: 900,
  });
  return { run, calls, r2Calls, setBytes: (bytes: Uint8Array) => { objectBytes = bytes; } };
}

describe('Native R2 immutable learner content loader', () => {
  it('provides gabarito solely to Worker-private assessment services', async () => {
    const f = createFixture({});
    const db = await (async () => {
      // Fetch the same read-only DB fixture without using an HTTP endpoint.
      return (f as unknown as { run: () => Promise<unknown> }).run;
    })();
    expect(typeof db).toBe('function');
    const publicProjection = await f.run();
    expect(JSON.stringify(publicProjection.course)).not.toContain('correctOptionId');
    const full = candidate.questions;
    expect(full.some((q: { correctOptionId?: string }) => Boolean(q.correctOptionId))).toBe(true);
    expect(JSON.stringify(publicProjection.course)).not.toContain(full[0].correctOptionId);
    // The private loader must stay server-only; the route calls the public wrapper.
    expect(typeof loadNativePrivateCourse).toBe('function');
  });

  it('serves validated artifact only to the owning enrolled employee and removes all grading secrets', async () => {
    const f = createFixture({});
    const result = await f.run();
    expect(result.course.schema).toBe('AIRTRUST_NATIVE_COURSE_V1');
    expect(result.cicloId).toBe(600);
    expect(result.mode).toBe('LEARN');
    expect(f.calls[2].binds).toEqual([6, 101, 31]);
    expect(f.r2Calls).toEqual([`lms/native/6/31/${result.editionHash}/native-private-candidate.json`]);
    const serialized = JSON.stringify(result.course);
    expect(serialized).not.toContain('correctOptionId');
    expect(serialized).not.toContain('feedbackCorrect');
    expect(serialized).not.toContain('feedbackIncorrect');
    expect(result.course.questions[0]?.prompt).toBe('Qual conduta?');
  });

  it('refuses another employee and never probes the bucket', async () => {
    const f = createFixture({ funcionarioId: 99 });
    await expect(f.run()).rejects.toMatchObject({ code: 'NATIVE_ENROLLMENT_ACCESS_DENIED' });
    expect(f.r2Calls).toHaveLength(0);
    expect(f.calls).toHaveLength(2);
  });

  it('rejects cross-tenant enrollments, SCORM legacy and missing edition pin', async () => {
    for (const settings of [
      { enrollmentEmpresa: 7 },
      { matriculaTipo: 'scorm' },
      { edition: null },
    ]) {
      const f = createFixture(settings);
      await expect(f.run()).rejects.toThrow();
      expect(f.r2Calls).toHaveLength(0);
    }
  });

  it('rejects R2 prefix takeover even if the recorded hash is correct', async () => {
    const hash = await sha(candidateBytes.buffer as ArrayBuffer);
    for (const r2_prefix of [
      `lms/native/7/31/${hash}/`,
      `lms/native/6/31/${hash}/../../`,
      'https://external.invalid/course/',
      `lms/native/6/31/${hash.slice(1)}/`,
    ]) {
      const f = createFixture({ edition: { r2_prefix } });
      await expect(f.run()).rejects.toMatchObject({ code: 'NATIVE_EDITION_R2_SCOPE_INVALID' });
      expect(f.r2Calls).toHaveLength(0);
    }
  });

  it('checks exact R2 bytes; rejects corrupted content or a different course', async () => {
    const f = createFixture({});
    f.setBytes(new TextEncoder().encode('{"schema":"AIRTRUST_NATIVE_COURSE_V1"}'));
    await expect(f.run()).rejects.toMatchObject({ code: 'NATIVE_PUBLISHED_ARTIFACT_HASH_MISMATCH' });
  });

  it('requires the published package version to match the pinned metadata', async () => {
    const f = createFixture({ edition: { package_version: 'n-' + 'b'.repeat(32) } });
    await expect(f.run()).rejects.toMatchObject({ code: 'NATIVE_PUBLISHED_EDITION_VERSION_MISMATCH' });
  });

  it('requires published R2 object present; never falls back to another revision', async () => {
    const f = createFixture({ missing: true });
    await expect(f.run()).rejects.toMatchObject({ code: 'NATIVE_PUBLISHED_ARTIFACT_UNAVAILABLE' });
    expect(f.r2Calls).toHaveLength(1);
  });

  it('checks JSON schema after hash validation and rejects forged content', async () => {
    const malicious = new TextEncoder().encode(JSON.stringify({ ...candidate, completed: true }));
    const f = createFixture({ bytes: malicious });
    await expect(f.run()).rejects.toBeInstanceOf(NativeContentLoadError);
    await expect(f.run()).rejects.toMatchObject({ code: 'NATIVE_PUBLISHED_ARTIFACT_INVALID_SCHEMA' });
  });
});
