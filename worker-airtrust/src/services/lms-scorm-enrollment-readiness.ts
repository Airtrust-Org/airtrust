import { ApiError } from '../middleware/error-handler';
/**
 * Prevents new enrollment into a PUBLISHED SCORM course without a valid,
 * currently ACTIVE package. Existing history/progress/legacy enrollment
 * remains untouched. This is a fail-closed discovery/enrollment invariant,
 * not a package activation or certification override.
 */
export async function hasLaunchablePublishedScormPackage(
  db: Pick<D1Database, 'prepare'>,
  params: {
    empresaId: number;
    cursoId: number;
    tipoConteudo: unknown;
    publicado: unknown;
    packagePrefix: unknown;
  },
): Promise<boolean> {
  if (String(params.tipoConteudo ?? '').trim().toLowerCase() !== 'scorm' ||
      Number(params.publicado) !== 1) {
    return true; // Non-SCORM and unpublished admin drafts retain their policy.
  }
  const { empresaId, cursoId, packagePrefix } = params;
  const scoped = `lms/scorm/${empresaId}/${cursoId}/`;
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !Number.isSafeInteger(cursoId) || cursoId <= 0 ||
      typeof packagePrefix !== 'string' ||
      !packagePrefix.startsWith(scoped) ||
      packagePrefix.includes('..') || packagePrefix.includes('\\')) {
    return false;
  }
  const active = await db.prepare(`
    SELECT 1 AS ready
    FROM lms_scorm_package_versions
    WHERE empresa_id=? AND curso_id=? AND r2_prefix=?
      AND status='ACTIVE'
    LIMIT 1
  `).bind(empresaId, cursoId, packagePrefix).first<{ready:number}>();
  return active?.ready === 1;
}


export async function assertPublishedScormEnrollmentReady(
  db: Pick<D1Database, 'prepare'>,
  empresaId: number,
  cursoId: number,
  course: {
    tipo_conteudo: unknown;
    publicado: unknown;
    scorm_package_r2_prefix: unknown;
  },
): Promise<void> {
  const ready = await hasLaunchablePublishedScormPackage(db, {
    empresaId, cursoId, tipoConteudo: course.tipo_conteudo,
    publicado: course.publicado, packagePrefix: course.scorm_package_r2_prefix,
  });
  if (!ready) {
    throw new ApiError(
      'Curso SCORM publicado sem pacote ativo validado. Novas matrículas bloqueadas até a regularização.',
      409,
    );
  }
}
