import { describe, expect, it, vi } from 'vitest';

import {
  createAtomicUploadDb,
  createProtectedR2Bucket,
  createSettledR2Bucket,
} from '../../../lib/lms/lms-content-upload-service';

class FakeStatement {
  constructor(
    readonly query: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.query, values);
  }

  async run() {
    return { success: true, meta: { changes: 1, last_row_id: 1 } };
  }
}

describe('LMS upload atomic adapters', () => {
  it('waits for every R2 put in the synchronous batch before surfacing a rejection', async () => {
    let siblingSettled = false;
    const rawBucket = {
      put: vi.fn((key: string) => {
        if (key === 'first') return Promise.reject(new Error('first failed'));
        return new Promise((resolve) => {
          setTimeout(() => {
            siblingSettled = true;
            resolve({ key });
          }, 5);
        });
      }),
    } as unknown as R2Bucket;
    const bucket = createSettledR2Bucket(rawBucket);

    const first = bucket.put('first', 'a');
    const sibling = bucket.put('sibling', 'b');

    await expect(first).rejects.toThrow('first failed');
    expect(siblingSettled).toBe(true);
    await expect(sibling).resolves.toMatchObject({ key: 'sibling' });
  });

  it('does not delete a prefix already promoted by a concurrent winner', async () => {
    const winnerPrefix = 'lms/scorm/77/12/_versions/shared/';
    const rawDelete = vi.fn(async () => undefined);
    const rawBucket = {
      delete: rawDelete,
    } as unknown as R2Bucket;
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({
          first: async () => ({ scorm_package_r2_prefix: winnerPrefix }),
        }),
      })),
    } as unknown as D1Database;
    const bucket = createProtectedR2Bucket(rawBucket, {
      db,
      empresaId: 77,
      cursoId: 12,
    });

    await bucket.delete([
      `${winnerPrefix}index.html`,
      'lms/scorm/77/12/_versions/loser/index.html',
    ]);

    expect(rawDelete).toHaveBeenCalledTimes(1);
    expect(rawDelete).toHaveBeenCalledWith([
      'lms/scorm/77/12/_versions/loser/index.html',
    ]);
  });

  it('fails safe without deleting content when the current pointer cannot be read', async () => {
    const rawDelete = vi.fn(async () => undefined);
    const rawBucket = {
      delete: rawDelete,
    } as unknown as R2Bucket;
    const db = {
      prepare: vi.fn(() => {
        throw new Error('schema unavailable');
      }),
    } as unknown as D1Database;
    const bucket = createProtectedR2Bucket(rawBucket, {
      db,
      empresaId: 77,
      cursoId: 12,
    });

    await bucket.delete('lms/scorm/77/12/_versions/candidate/index.html');

    expect(rawDelete).not.toHaveBeenCalled();
  });

  it('batches the conditional H5P insert with the course CAS update', async () => {
    const batchCalls: FakeStatement[][] = [];
    const rawDb = {
      prepare: vi.fn((query: string) => new FakeStatement(query)),
      batch: vi.fn(async (statements: D1PreparedStatement[]) => {
        const captured = statements as unknown as FakeStatement[];
        batchCalls.push(captured);
        return [
          { success: true, meta: { changes: 1, last_row_id: 321 } },
          { success: true, meta: { changes: 1, last_row_id: 0 } },
        ];
      }),
    } as unknown as D1Database;
    const db = createAtomicUploadDb(rawDb);

    const deferred = await db
      .prepare(
        'INSERT INTO lms_h5p_conteudos (empresa_id, titulo, tipo_h5p, r2_key) VALUES (?, ?, ?, ?)',
      )
      .bind(77, 'Curso', 'H5P.Column', 'lms/h5p/77/12/_versions/new/')
      .run();
    expect(deferred.meta.last_row_id).toBe(-1);
    expect(batchCalls).toHaveLength(0);

    const update = await db
      .prepare(
        `UPDATE lms_cursos
            SET tipo_conteudo = ?,
                scorm_package_r2_prefix = ?,
                scorm_launch_file = ?,
                scorm_versao = ?,
                conteudo_arquivo_nome = ?,
                version_tag = ?,
                h5p_conteudo_id = ?
          WHERE id = ?
            AND empresa_id = ?
            AND COALESCE(version_tag, '') = COALESCE(?, '')
            AND COALESCE(scorm_package_r2_prefix, '') = COALESCE(?, '')`,
      )
      .bind(
        'h5p',
        'lms/h5p/77/12/_versions/new/',
        null,
        null,
        'curso.h5p',
        'v2',
        -1,
        12,
        77,
        'v1',
        'lms/h5p/77/12/_versions/old/',
      )
      .run();

    expect(update.meta.changes).toBe(1);
    expect(batchCalls).toHaveLength(1);
    const [insert, courseUpdate] = batchCalls[0]!;
    expect(insert.query).toContain('WHERE EXISTS');
    expect(insert.values.slice(-4)).toEqual([
      12,
      77,
      'v1',
      'lms/h5p/77/12/_versions/old/',
    ]);
    expect(courseUpdate.query).toContain('SELECT id');
    expect(courseUpdate.query).not.toMatch(/h5p_conteudo_id\s*=\s*\?/);
    expect(courseUpdate.values).toContain('lms/h5p/77/12/_versions/new/');
  });
});
