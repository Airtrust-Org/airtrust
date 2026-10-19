import { ApiError } from '../../middleware/error-handler';

export type ScormQaCandidate = {
  id: string;
  empresa_id: number;
  curso_id: number;
  package_sha256: string;
  r2_prefix: string;
  launch_file: string;
  scorm_versao: string | null;
  status: string;
  active_prefix: string | null;
};

/**
 * Read-only candidate lookup for *non-production* browser inspection. The
 * production course pointer must NEVER be changed to preview a candidate.
 */
export function assertScormCandidateQaEnvironment(environment: unknown): void {
  if (environment !== 'staging' && environment !== 'development') {
    throw new ApiError('Pré-visualização de candidato indisponível neste ambiente', 403);
  }
}

export function assertCandidateQaScope(
  payload: {
    token_type?: string;
    asset_scope?: string;
    asset_preview?: boolean;
    asset_curso_id?: number;
    asset_qa_candidate_id?: string;
    asset_qa_candidate_sha256?: string;
    empresa_id?: number;
  },
  params: { empresaId: number; cursoId: number; candidate: ScormQaCandidate },
): void {
  if (payload.token_type !== 'lms_asset' || payload.asset_scope !== 'course_assets' ||
      payload.asset_preview !== true || payload.empresa_id !== params.empresaId ||
      Number(payload.asset_curso_id) !== params.cursoId ||
      payload.asset_qa_candidate_id !== params.candidate.id ||
      payload.asset_qa_candidate_sha256 !== params.candidate.package_sha256) {
    throw new ApiError('Token QA não corresponde à edição candidata', 403);
  }
}

export async function readScormQaCandidate(
  db: D1Database,
  params: { empresaId: number; cursoId: number; packageId: string; expectedSha?: string },
): Promise<ScormQaCandidate> {
  if (!/^[0-9a-f-]{36}$/i.test(params.packageId) ||
      (params.expectedSha !== undefined && !/^[a-f0-9]{64}$/.test(params.expectedSha))) {
    throw new ApiError('Identidade da edição candidata inválida', 400);
  }
  const row = await db.prepare(
    `SELECT p.id, p.empresa_id, p.curso_id, p.package_sha256, p.r2_prefix,
            p.launch_file, p.scorm_versao, p.status,
            c.scorm_package_r2_prefix AS active_prefix
       FROM lms_scorm_package_versions p
       JOIN lms_cursos c ON c.id = p.curso_id AND c.empresa_id = p.empresa_id
      WHERE p.id = ? AND p.empresa_id = ? AND p.curso_id = ?
        AND c.deleted_at IS NULL`,
  ).bind(params.packageId, params.empresaId, params.cursoId).first<ScormQaCandidate>();
  if (!row || row.status !== 'VALIDATED') {
    throw new ApiError('Edição candidata não disponível para QA', 404);
  }
  const expectedPrefix = `lms/scorm/${params.empresaId}/${params.cursoId}/_candidates/${row.id}/`;
  const safeLaunch = row.launch_file.length > 0 &&
    row.launch_file.split('/').every((part) => part !== '' && part !== '.' && part !== '..') &&
    !row.launch_file.includes('\\') && !row.launch_file.startsWith('/');
  if (row.r2_prefix !== expectedPrefix || row.active_prefix === row.r2_prefix ||
      !/^[a-f0-9]{64}$/.test(row.package_sha256) || !safeLaunch ||
      (params.expectedSha !== undefined && row.package_sha256 !== params.expectedSha)) {
    throw new ApiError('Identidade imutável ou conteúdo da edição candidata divergente', 409);
  }
  return row;
}
