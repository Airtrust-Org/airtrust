import type { Env } from '../types';

type TrainingLinkParams = {
  empresaId: number;
  funcionarioId: number;
  matriculaId?: number | null;
  cursoId?: number | null;
  qualificacaoHistoricoId?: number | null;
  qualificacaoTipoId?: number | null;
};

type TrainingTargetRow = {
  matricula_id: number;
  curso_id: number;
  tipo_conteudo: string | null;
};

function buildPlayerPath(tipoConteudo: string | null, matriculaId: number): string {
  const tipo = String(tipoConteudo || 'scorm').trim().toLowerCase();
  if (tipo === 'h5p') return `/lms/player/h5p/${matriculaId}`;
  if (tipo === 'pdf') return `/lms/player/pdf/${matriculaId}`;
  if (tipo === 'pptx' || tipo === 'powerpoint') return `/lms/player/pptx/${matriculaId}`;
  return `/lms/player/${matriculaId}`;
}

export async function resolveTrainingAccessUrl(
  env: Env,
  db: D1Database,
  params: TrainingLinkParams,
): Promise<string | null> {
  const frontendUrl = String(env.FRONTEND_URL || 'https://airtrust.online').replace(/\/$/, '');
  const filters = [
    'm.empresa_id = ?',
    'm.funcionario_id = ?',
    'm.deleted_at IS NULL',
    "UPPER(COALESCE(m.status, '')) IN ('NAO_INICIADO', 'EM_ANDAMENTO', 'MATRICULADO')",
    'c.deleted_at IS NULL',
    'c.empresa_id = m.empresa_id',
  ];
  const bindings: number[] = [params.empresaId, params.funcionarioId];

  if (params.matriculaId) {
    filters.push('m.id = ?');
    bindings.push(params.matriculaId);
  } else if (params.cursoId) {
    filters.push('m.curso_id = ?');
    bindings.push(params.cursoId);
  } else if (params.qualificacaoTipoId) {
    filters.push('c.qualificacao_tipo_id = ?');
    bindings.push(params.qualificacaoTipoId);
  } else if (params.qualificacaoHistoricoId) {
    filters.push(`c.qualificacao_tipo_id = (
      SELECT qh.qualificacao_id
        FROM qualificacoes_historico qh
       WHERE qh.id = ?
         AND qh.deleted_at IS NULL
       LIMIT 1
    )`);
    bindings.push(params.qualificacaoHistoricoId);
  }

  const row = await db
    .prepare(
      `SELECT m.id AS matricula_id, c.id AS curso_id, c.tipo_conteudo
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id
        WHERE ${filters.join('\n          AND ')}
        ORDER BY
          CASE UPPER(COALESCE(m.status, ''))
            WHEN 'EM_ANDAMENTO' THEN 0
            WHEN 'NAO_INICIADO' THEN 1
            WHEN 'MATRICULADO' THEN 2
            ELSE 3
          END,
          COALESCE(m.updated_at, m.created_at) DESC,
          m.id DESC
        LIMIT 1`,
    )
    .bind(...bindings)
    .first<TrainingTargetRow>();

  if (row?.matricula_id) {
    return `${frontendUrl}${buildPlayerPath(row.tipo_conteudo, Number(row.matricula_id))}`;
  }

  if (params.cursoId) {
    return `${frontendUrl}/lms/cursos/${params.cursoId}`;
  }

  return null;
}
