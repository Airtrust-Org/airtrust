import type { BeginUploadParams, UploadCommitResult } from './lms-content-upload-service-legacy';
import * as legacy from './lms-content-upload-service-legacy';

export type {
  BeginUploadParams,
  CourseUploadContext,
  UploadCommitResult,
  UploadOperationMarker,
} from './lms-content-upload-service-legacy';

export {
  beginLmsContentUpload,
  purgeR2Prefix,
  putLmsContentUploadFile,
} from './lms-content-upload-service-legacy';

const DEFERRED_H5P_ID = -1;
const H5P_INSERT = /INSERT\s+INTO\s+lms_h5p_conteudos/i;
const COURSE_UPDATE = /UPDATE\s+lms_cursos/i;
const H5P_BINDING_ASSIGNMENT = /,\s*h5p_conteudo_id\s*=\s*\?/i;

type PendingH5pInsert = {
  values: unknown[];
};

type ProtectedR2DeleteContext = {
  db: D1Database;
  empresaId: number;
  cursoId: number;
};

function bindMember<T extends object>(target: T, property: PropertyKey): unknown {
  const value = Reflect.get(target, property);
  return typeof value === 'function' ? value.bind(target) : value;
}

/**
 * Groups R2 puts started in the same synchronous batch behind one settlement
 * barrier. A rejected put is not observed by Promise.all until every sibling
 * put has settled, preventing late writes from racing the compensating purge.
 */
export function createSettledR2Bucket(bucket: R2Bucket): R2Bucket {
  let activeBatch:
    | {
        raw: Array<Promise<unknown>>;
        settled: Promise<Array<PromiseSettledResult<unknown>>>;
      }
    | null = null;

  return new Proxy(bucket, {
    get(target, property) {
      if (property !== 'put') return bindMember(target, property);

      return (...args: Parameters<R2Bucket['put']>) => {
        if (!activeBatch) {
          const batch = {
            raw: [] as Array<Promise<unknown>>,
            settled: Promise.resolve([] as Array<PromiseSettledResult<unknown>>),
          };
          batch.settled = Promise.resolve().then(async () => {
            if (activeBatch === batch) activeBatch = null;
            return Promise.allSettled(batch.raw);
          });
          activeBatch = batch;
        }

        const batch = activeBatch;
        const index = batch.raw.length;
        batch.raw.push(Promise.resolve(target.put(...args)));

        return batch.settled.then((results) => {
          const result = results[index];
          if (!result) throw new Error('R2 upload settlement barrier lost an entry');
          if (result.status === 'rejected') throw result.reason;
          return result.value;
        });
      };
    },
  });
}

async function readCurrentCoursePrefix(
  context: ProtectedR2DeleteContext,
): Promise<string | null | undefined> {
  try {
    const row = await context.db
      .prepare(
        `SELECT scorm_package_r2_prefix
           FROM lms_cursos
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(context.cursoId, context.empresaId)
      .first<{ scorm_package_r2_prefix: string | null }>();
    return row?.scorm_package_r2_prefix ?? null;
  } catch (error) {
    console.error('[LMS_UPLOAD_COMPENSATION_STATE_UNKNOWN]', {
      code: 'LMS_UPLOAD_COMPENSATION_STATE_UNKNOWN',
      empresaId: context.empresaId,
      cursoId: context.cursoId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return undefined;
  }
}

/**
 * Prevents compensating cleanup from deleting a prefix that another concurrent
 * completion has already promoted. When D1 state cannot be confirmed, cleanup
 * fails safe and leaves an orphan candidate for later reconciliation instead of
 * risking deletion of live course content.
 */
export function createProtectedR2Bucket(
  bucket: R2Bucket,
  context: ProtectedR2DeleteContext,
): R2Bucket {
  const settledBucket = createSettledR2Bucket(bucket);

  return new Proxy(settledBucket, {
    get(target, property) {
      if (property !== 'delete') return bindMember(target, property);

      return async (keys: string | string[]) => {
        const requestedKeys = Array.isArray(keys) ? keys : [keys];
        const currentPrefix = await readCurrentCoursePrefix(context);
        if (currentPrefix === undefined) return;

        const safeKeys = currentPrefix
          ? requestedKeys.filter((key) => !key.startsWith(currentPrefix))
          : requestedKeys;
        if (safeKeys.length === 0) return;
        await target.delete(safeKeys);
      };
    },
  });
}

function conditionalH5pInsert(
  db: D1Database,
  pending: PendingH5pInsert,
  courseId: unknown,
  empresaId: unknown,
  previousVersionTag: unknown,
  previousPrefix: unknown,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO lms_h5p_conteudos (empresa_id, titulo, tipo_h5p, r2_key)
       SELECT ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
            FROM lms_cursos
           WHERE id = ?
             AND empresa_id = ?
             AND deleted_at IS NULL
             AND COALESCE(version_tag, '') = COALESCE(?, '')
             AND COALESCE(scorm_package_r2_prefix, '') = COALESCE(?, '')
        )`,
    )
    .bind(
      ...pending.values,
      courseId,
      empresaId,
      previousVersionTag,
      previousPrefix,
    );
}

function rewriteCourseUpdate(
  db: D1Database,
  query: string,
  values: unknown[],
): {
  statement: D1PreparedStatement;
  courseId: unknown;
  empresaId: unknown;
  previousVersionTag: unknown;
  previousPrefix: unknown;
} {
  const hasH5pBinding = H5P_BINDING_ASSIGNMENT.test(query);
  const whereIndex = hasH5pBinding ? 7 : 6;
  const courseId = values[whereIndex];
  const empresaId = values[whereIndex + 1];
  const previousVersionTag = values[whereIndex + 2];
  const previousPrefix = values[whereIndex + 3];

  if (!hasH5pBinding) {
    return {
      statement: db.prepare(query).bind(...values),
      courseId,
      empresaId,
      previousVersionTag,
      previousPrefix,
    };
  }

  const prefix = values[1];
  const rewrittenQuery = query.replace(
    H5P_BINDING_ASSIGNMENT,
    `, h5p_conteudo_id = (
       SELECT id
         FROM lms_h5p_conteudos
        WHERE empresa_id = ?
          AND r2_key = ?
          AND ativo = 1
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1
     )`,
  );
  const rewrittenValues = [
    ...values.slice(0, 6),
    empresaId,
    prefix,
    ...values.slice(7),
  ];

  return {
    statement: db.prepare(rewrittenQuery).bind(...rewrittenValues),
    courseId,
    empresaId,
    previousVersionTag,
    previousPrefix,
  };
}

/**
 * Defers the legacy H5P INSERT until the course CAS UPDATE is available, then
 * executes both in one D1 batch. The INSERT repeats the CAS precondition, so a
 * concurrent loser commits neither an orphan H5P row nor a course pointer.
 */
export function createAtomicUploadDb(db: D1Database): D1Database {
  if (typeof Reflect.get(db, 'batch') !== 'function') return db;
  let pending: PendingH5pInsert | null = null;

  return new Proxy(db, {
    get(target, property) {
      if (property !== 'prepare') return bindMember(target, property);

      return (query: string) => {
        const statement = target.prepare(query);

        if (H5P_INSERT.test(query)) {
          return new Proxy(statement, {
            get(preparedTarget, preparedProperty) {
              if (preparedProperty !== 'bind') {
                return bindMember(preparedTarget, preparedProperty);
              }
              return (...values: unknown[]) => {
                const bound = preparedTarget.bind(...values);
                return new Proxy(bound, {
                  get(boundTarget, boundProperty) {
                    if (boundProperty !== 'run') return bindMember(boundTarget, boundProperty);
                    return async () => {
                      pending = { values };
                      return {
                        success: true,
                        meta: { changes: 1, last_row_id: DEFERRED_H5P_ID },
                      };
                    };
                  },
                });
              };
            },
          });
        }

        if (pending && COURSE_UPDATE.test(query)) {
          return new Proxy(statement, {
            get(preparedTarget, preparedProperty) {
              if (preparedProperty !== 'bind') {
                return bindMember(preparedTarget, preparedProperty);
              }
              return (...values: unknown[]) => {
                const rewritten = rewriteCourseUpdate(target, query, values);
                const deferred = pending;
                if (!deferred) throw new Error('Pending H5P insert state was lost');
                return new Proxy(rewritten.statement, {
                  get(boundTarget, boundProperty) {
                    if (boundProperty !== 'run') return bindMember(boundTarget, boundProperty);
                    return async () => {
                      try {
                        const insert = conditionalH5pInsert(
                          target,
                          deferred,
                          rewritten.courseId,
                          rewritten.empresaId,
                          rewritten.previousVersionTag,
                          rewritten.previousPrefix,
                        );
                        const results = await target.batch([insert, rewritten.statement]);
                        const updateResult = results[1];
                        if (!updateResult) {
                          throw new Error('D1 batch omitted the course update result');
                        }
                        return updateResult;
                      } finally {
                        pending = null;
                      }
                    };
                  },
                });
              };
            },
          });
        }

        if (pending) pending = null;
        return statement;
      };
    },
  });
}

async function hydrateH5pResult(
  db: D1Database,
  tipoConteudo: BeginUploadParams['tipoConteudo'],
  empresaId: number,
  result: UploadCommitResult,
): Promise<UploadCommitResult> {
  if (tipoConteudo !== 'h5p') return result;
  const row = await db
    .prepare(
      `SELECT id
         FROM lms_h5p_conteudos
        WHERE empresa_id = ?
          AND r2_key = ?
          AND ativo = 1
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(empresaId, result.prefix)
    .first<{ id: number }>();
  return { ...result, h5p_id: row?.id ?? null };
}

export async function completeStructuredLmsContentUpload(
  params: Parameters<typeof legacy.completeStructuredLmsContentUpload>[0],
): Promise<UploadCommitResult> {
  const result = await legacy.completeStructuredLmsContentUpload({
    ...params,
    db: createAtomicUploadDb(params.db),
    bucket: createProtectedR2Bucket(params.bucket, {
      db: params.db,
      empresaId: params.empresaId,
      cursoId: params.cursoId,
    }),
  });
  return hydrateH5pResult(params.db, params.tipoConteudo, params.empresaId, result);
}

export async function uploadLmsZipPackage(
  params: Parameters<typeof legacy.uploadLmsZipPackage>[0],
): Promise<UploadCommitResult> {
  const result = await legacy.uploadLmsZipPackage({
    ...params,
    db: createAtomicUploadDb(params.db),
    bucket: createProtectedR2Bucket(params.bucket, {
      db: params.db,
      empresaId: params.empresaId,
      cursoId: params.cursoId,
    }),
  });
  return hydrateH5pResult(params.db, params.tipoConteudo, params.empresaId, result);
}
