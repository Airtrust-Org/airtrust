/**
 * INTEGRACOES EDAPP — Shared Helpers
 * Used by integracoes_edapp.ts and integracoes-edapp-eventos.ts
 */

import type { Context } from 'hono';
import type { Env } from '../types';
import { createModuleLogger } from '../utils/logger';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';
import { garantirG1SemPlanejado, isG1QualificacaoCode } from '../services/qualificacoes-g1-sem';

export type EdAppUserLookup = {
  edappUserId?: string | null;
  userExternalId?: string | null;
  edappEmail?: string | null;
  edappUsername?: string | null;
};

export type EdAppCourseLookup = {
  courseId?: string | null;
  courseExternalId?: string | null;
  courseTitle?: string | null;
};

export type EdAppMappedFuncionario = {
  funcionario_id: number;
  funcionario_nome: string | null;
  edapp_user_id?: string | null;
  edapp_email?: string | null;
  edapp_username?: string | null;
  matched_by?:
    | 'edapp_user_id'
    | 'user_external_id'
    | 'edapp_email'
    | 'edapp_username'
    | 'funcionario_email'
    | 'funcionario_matricula'
    | 'funcionario_codigo_anac'
    | 'funcionario_nome'
    | 'funcionario_guerra';
};

type EdAppFuncionarioCandidate = {
  funcionario_id: number;
  funcionario_nome: string | null;
  funcionario_email?: string | null;
  matricula?: string | null;
  codigo_anac?: string | null;
  guerra?: string | null;
  edapp_user_id?: string | null;
  edapp_email?: string | null;
  edapp_username?: string | null;
};

type EdAppFuncionarioMatchType = NonNullable<EdAppMappedFuncionario['matched_by']>;

export type EdAppMappedQualificacao = {
  qualificacao_codigo: string;
  edapp_course_name: string | null;
  edapp_course_id?: string | null;
  edapp_course_code?: string | null;
  matched_by?: 'edapp_course_id' | 'course_external_id' | 'edapp_course_code' | 'course_title';
};

export type EdAppCompletionPayload = {
  edappUserId: string | null;
  userExternalId: string | null;
  edappCourseId: string | null;
  courseExternalId: string | null;
  courseTitle: string | null;
  completedAt: string | null;
  score?: number;
};

export type CreateQualificacaoResult = {
  success: boolean;
  qualificacao_id?: number;
  message: string;
  renovacao: boolean;
  created?: boolean;
  duplicate?: boolean;
};

function normalizeLookupValue(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function extractCalendarDate(value?: string | null): string | null {
  const normalized = normalizeLookupValue(value);
  if (!normalized) {
    return null;
  }

  const dateMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
  if (dateMatch) {
    return dateMatch[1];
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

function normalizeLookupKey(value?: string | null): string | null {
  const normalized = normalizeLookupValue(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeComparableText(value?: string | null): string | null {
  const normalized = normalizeLookupValue(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9@._\-\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompactIdentifier(value?: string | null): string | null {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return compact || null;
}

function stripLeadingZeros(value?: string | null): string | null {
  const normalized = normalizeCompactIdentifier(value);
  if (!normalized) {
    return null;
  }

  const stripped = normalized.replace(/^0+/, '');
  return stripped || normalized;
}

function normalizeEmailLocalPart(value?: string | null): string | null {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  const localPart = normalized.split('@')[0]?.trim();
  return localPart || null;
}

function tokenizeComparableText(value?: string | null): string[] {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function isLikelyEmail(value?: string | null): boolean {
  return Boolean(normalizeLookupValue(value)?.includes('@'));
}

function scoreNameApproximation(candidate: string, target?: string | null): number {
  const normalizedTarget = normalizeComparableText(target);
  if (!normalizedTarget) {
    return 0;
  }

  if (candidate === normalizedTarget) {
    return 1;
  }

  const candidateTokens = tokenizeComparableText(candidate);
  const targetTokens = tokenizeComparableText(normalizedTarget);
  if (candidateTokens.length === 0 || targetTokens.length === 0) {
    return 0;
  }

  const targetTokenSet = new Set(targetTokens);
  const candidateTokenSet = new Set(candidateTokens);
  const commonCount = candidateTokens.filter((token) => targetTokenSet.has(token)).length;
  const containsAllCandidateTokens = commonCount === candidateTokenSet.size;
  const targetCommonCount = targetTokens.filter((token) => candidateTokenSet.has(token)).length;
  const containsAllTargetTokens = targetCommonCount === targetTokenSet.size;
  const firstTokenMatches = candidateTokens[0] === targetTokens[0];
  const lastTokenMatches =
    candidateTokens[candidateTokens.length - 1] === targetTokens[targetTokens.length - 1];

  if (containsAllCandidateTokens && candidateTokenSet.size >= 2) {
    return firstTokenMatches || lastTokenMatches ? 0.97 : 0.95;
  }

  if (containsAllTargetTokens && targetTokenSet.size >= 2) {
    return firstTokenMatches || lastTokenMatches ? 0.96 : 0.94;
  }

  const overlap = commonCount / Math.max(candidateTokenSet.size, targetTokenSet.size);
  if (overlap >= 0.75 && firstTokenMatches && lastTokenMatches) {
    return 0.93;
  }

  return 0;
}

async function loadFuncionarioCandidates(
  db: D1Database,
  empresaId?: number | null,
): Promise<EdAppFuncionarioCandidate[]> {
  const result = await db
    .prepare(
      `
      SELECT
        f.id AS funcionario_id,
        f.nome AS funcionario_nome,
        f.email AS funcionario_email,
        f.matricula,
        f.codigo_anac,
        f.guerra,
        u.edapp_user_id,
        u.edapp_email,
        u.edapp_username
      FROM funcionarios f
      LEFT JOIN integracoes_edapp_usuarios u
        ON u.funcionario_id = f.id
       AND u.deleted_at IS NULL
       AND u.ativo = 1
       AND (? IS NULL OR u.empresa_id = ?)
      WHERE f.deleted_at IS NULL
        AND (? IS NULL OR f.empresa_id = ?)
    `,
    )
    .bind(empresaId ?? null, empresaId ?? null, empresaId ?? null, empresaId ?? null)
    .all<EdAppFuncionarioCandidate>();

  return result.results || [];
}

function buildApproximateFuncionarioMatch(
  candidate: string,
  rows: EdAppFuncionarioCandidate[],
): EdAppMappedFuncionario | null {
  const comparableCandidate = normalizeComparableText(candidate);
  if (!comparableCandidate) {
    return null;
  }

  const compactCandidate = normalizeCompactIdentifier(candidate);
  const strippedCandidate = stripLeadingZeros(candidate);
  const emailLocalPart = normalizeEmailLocalPart(candidate);

  const scored = rows
    .map((row) => {
      const comparisons: Array<{ score: number; matched_by: EdAppFuncionarioMatchType }> = [];

      if (isLikelyEmail(candidate)) {
        if (normalizeComparableText(row.edapp_email) === comparableCandidate) {
          comparisons.push({ score: 0.99, matched_by: 'edapp_email' });
        }
        if (normalizeComparableText(row.funcionario_email) === comparableCandidate) {
          comparisons.push({ score: 0.99, matched_by: 'funcionario_email' });
        }
        if (emailLocalPart) {
          if (normalizeEmailLocalPart(row.edapp_email) === emailLocalPart) {
            comparisons.push({ score: 0.95, matched_by: 'edapp_email' });
          }
          if (normalizeEmailLocalPart(row.funcionario_email) === emailLocalPart) {
            comparisons.push({ score: 0.95, matched_by: 'funcionario_email' });
          }
        }
      }

      if (compactCandidate) {
        const rowMatricula = normalizeCompactIdentifier(row.matricula);
        const rowCodigoAnac = normalizeCompactIdentifier(row.codigo_anac);
        if (
          rowMatricula &&
          (rowMatricula === compactCandidate ||
            stripLeadingZeros(row.matricula) === strippedCandidate)
        ) {
          comparisons.push({ score: 0.98, matched_by: 'funcionario_matricula' });
        }
        if (
          rowCodigoAnac &&
          (rowCodigoAnac === compactCandidate ||
            stripLeadingZeros(row.codigo_anac) === strippedCandidate)
        ) {
          comparisons.push({ score: 0.98, matched_by: 'funcionario_codigo_anac' });
        }
      }

      const edappUsernameScore = scoreNameApproximation(comparableCandidate, row.edapp_username);
      if (edappUsernameScore > 0) {
        comparisons.push({ score: edappUsernameScore, matched_by: 'edapp_username' });
      }

      const funcionarioNomeScore = scoreNameApproximation(
        comparableCandidate,
        row.funcionario_nome,
      );
      if (funcionarioNomeScore > 0) {
        comparisons.push({ score: funcionarioNomeScore, matched_by: 'funcionario_nome' });
      }

      const funcionarioGuerraScore = scoreNameApproximation(comparableCandidate, row.guerra);
      if (funcionarioGuerraScore > 0) {
        comparisons.push({ score: funcionarioGuerraScore, matched_by: 'funcionario_guerra' });
      }

      const bestComparison = comparisons.sort((left, right) => right.score - left.score)[0];
      if (!bestComparison || bestComparison.score < 0.93) {
        return null;
      }

      return {
        row,
        score: bestComparison.score,
        matched_by: bestComparison.matched_by,
      };
    })
    .filter(
      (
        match,
      ): match is {
        row: EdAppFuncionarioCandidate;
        score: number;
        matched_by: EdAppFuncionarioMatchType;
      } => Boolean(match),
    )
    .sort((left, right) => right.score - left.score);

  const bestMatch = scored[0];
  if (!bestMatch) {
    return null;
  }

  const secondMatch = scored.find(
    (match) => match.row.funcionario_id !== bestMatch.row.funcionario_id,
  );
  if (secondMatch && bestMatch.score - secondMatch.score < 0.03) {
    return null;
  }

  return {
    funcionario_id: bestMatch.row.funcionario_id,
    funcionario_nome: bestMatch.row.funcionario_nome,
    edapp_user_id: bestMatch.row.edapp_user_id,
    edapp_email: bestMatch.row.edapp_email,
    edapp_username: bestMatch.row.edapp_username,
    matched_by: bestMatch.matched_by,
  };
}

export function resolveEdAppCompletionDate(dataCompletedAt?: string): string {
  const extractedDate = extractCalendarDate(dataCompletedAt);
  if (extractedDate) {
    return extractedDate;
  }

  return new Date().toISOString().split('T')[0];
}

export function buildEdAppQualificacaoVencimentoExpr(rowAlias?: string): string {
  const prefix = rowAlias ? `${rowAlias}.` : '';
  return `COALESCE(
    ${prefix}data_vencimento,
    date(
      ${prefix}data_conclusao,
      '+' || COALESCE(
        ${prefix}validade_meses,
        (
          SELECT qt.validade
          FROM qualificacoes_tipos qt
          WHERE qt.id = ${prefix}qualificacao_id
            AND qt.deleted_at IS NULL
        ),
        12
      ) || ' months'
    )
  )`;
}

async function findPreviousQualificacaoToRenew(
  db: D1Database,
  funcionarioId: number,
  qualificacaoCodigo: string,
  dataConclusao: string,
  empresaId?: number | null,
): Promise<{ id: number } | null> {
  return db
    .prepare(
      `
      SELECT id
      FROM qualificacoes_historico
      WHERE funcionario_id = ?
        AND (? IS NULL OR empresa_id = ?)
        AND qualificacao_codigo = ?
        AND deleted_at IS NULL
        AND COALESCE(renovada, 0) = 0
        AND COALESCE(status, 'CONCLUIDA') <> 'PLANEJADA'
        AND date(COALESCE(data_conclusao, '1900-01-01')) < date(?)
      ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) DESC, id DESC
      LIMIT 1
    `,
    )
    .bind(funcionarioId, empresaId ?? null, empresaId ?? null, qualificacaoCodigo, dataConclusao)
    .first<{ id: number }>();
}

async function markPreviousQualificacoesAsRenovadas(
  db: D1Database,
  funcionarioId: number,
  qualificacaoCodigo: string,
  dataConclusao: string,
  observacaoTexto: string,
  empresaId?: number | null,
): Promise<number> {
  const observacaoLike = `%${observacaoTexto.split(' em ')[0]}%`;

  const result = await db
    .prepare(
      `
      UPDATE qualificacoes_historico
      SET renovada = 1,
          status = 'RENOVADA',
          updated_at = datetime('now'),
          observacoes = CASE
            WHEN COALESCE(observacoes, '') = '' THEN ?
            WHEN COALESCE(observacoes, '') LIKE ? THEN observacoes
            ELSE observacoes || ' | ' || ?
          END
      WHERE funcionario_id = ?
        AND (? IS NULL OR empresa_id = ?)
        AND qualificacao_codigo = ?
        AND deleted_at IS NULL
        AND COALESCE(renovada, 0) = 0
        AND COALESCE(status, 'CONCLUIDA') <> 'PLANEJADA'
        AND date(COALESCE(data_conclusao, '1900-01-01')) < date(?)
    `,
    )
    .bind(
      observacaoTexto,
      observacaoLike,
      observacaoTexto,
      funcionarioId,
      empresaId ?? null,
      empresaId ?? null,
      qualificacaoCodigo,
      dataConclusao,
    )
    .run();

  return Number(result.meta.changes || 0);
}

async function findNextQualificacaoAfterDate(
  db: D1Database,
  funcionarioId: number,
  qualificacaoCodigo: string,
  dataConclusao: string,
  empresaId?: number | null,
): Promise<{ id: number; data_conclusao: string | null } | null> {
  return db
    .prepare(
      `
      SELECT id, data_conclusao
      FROM qualificacoes_historico
      WHERE funcionario_id = ?
        AND (? IS NULL OR empresa_id = ?)
        AND qualificacao_codigo = ?
        AND deleted_at IS NULL
        AND COALESCE(status, 'CONCLUIDA') <> 'PLANEJADA'
        AND date(COALESCE(data_conclusao, '1900-01-01')) > date(?)
      ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) ASC, id ASC
      LIMIT 1
    `,
    )
    .bind(funcionarioId, empresaId ?? null, empresaId ?? null, qualificacaoCodigo, dataConclusao)
    .first<{ id: number; data_conclusao: string | null }>();
}

async function findFuncionarioByExactUserId(
  db: D1Database,
  edappUserId: string,
  empresaId?: number | null,
): Promise<EdAppMappedFuncionario | null> {
  return db
    .prepare(
      `
      SELECT
        u.funcionario_id,
        f.nome as funcionario_nome,
        u.edapp_user_id,
        u.edapp_email,
        u.edapp_username
      FROM integracoes_edapp_usuarios u
      LEFT JOIN funcionarios f
        ON f.id = u.funcionario_id
       AND f.deleted_at IS NULL
       AND (? IS NULL OR f.empresa_id = ?)
      WHERE u.edapp_user_id = ?
        AND (? IS NULL OR u.empresa_id = ?)
        AND u.deleted_at IS NULL
        AND u.ativo = 1
      LIMIT 1
    `,
    )
    .bind(empresaId ?? null, empresaId ?? null, edappUserId, empresaId ?? null, empresaId ?? null)
    .first<EdAppMappedFuncionario>();
}

async function findFuncionarioByAlternateIdentifier(
  db: D1Database,
  identifier: string,
  empresaId?: number | null,
): Promise<EdAppMappedFuncionario | null> {
  return db
    .prepare(
      `
      SELECT
        u.funcionario_id,
        f.nome as funcionario_nome,
        u.edapp_user_id,
        u.edapp_email,
        u.edapp_username
      FROM integracoes_edapp_usuarios u
      LEFT JOIN funcionarios f
        ON f.id = u.funcionario_id
       AND f.deleted_at IS NULL
       AND (? IS NULL OR f.empresa_id = ?)
      WHERE u.deleted_at IS NULL
        AND (? IS NULL OR u.empresa_id = ?)
        AND u.ativo = 1
        AND (
          lower(trim(COALESCE(u.edapp_user_id, ''))) = ?
          OR lower(trim(COALESCE(u.edapp_email, ''))) = ?
          OR lower(trim(COALESCE(u.edapp_username, ''))) = ?
        )
      ORDER BY
        CASE
          WHEN lower(trim(COALESCE(u.edapp_user_id, ''))) = ? THEN 0
          WHEN lower(trim(COALESCE(u.edapp_email, ''))) = ? THEN 1
          WHEN lower(trim(COALESCE(u.edapp_username, ''))) = ? THEN 2
          ELSE 3
        END,
        u.id DESC
      LIMIT 1
    `,
    )
    .bind(
      empresaId ?? null,
      empresaId ?? null,
      empresaId ?? null,
      empresaId ?? null,
      identifier,
      identifier,
      identifier,
      identifier,
      identifier,
      identifier,
    )
    .first<EdAppMappedFuncionario>();
}

async function findQualificacaoByExactCourseId(
  db: D1Database,
  courseId: string,
  empresaId?: number | null,
): Promise<EdAppMappedQualificacao | null> {
  return db
    .prepare(
      `
      SELECT
        qualificacao_codigo,
        edapp_course_name,
        edapp_course_id,
        edapp_course_code
      FROM integracoes_edapp_cursos
      WHERE edapp_course_id = ?
        AND (? IS NULL OR empresa_id = ?)
        AND deleted_at IS NULL
        AND ativo = 1
      LIMIT 1
    `,
    )
    .bind(courseId, empresaId ?? null, empresaId ?? null)
    .first<EdAppMappedQualificacao>();
}

async function findQualificacaoByCourseCode(
  db: D1Database,
  courseCode: string,
  empresaId?: number | null,
): Promise<EdAppMappedQualificacao | null> {
  return db
    .prepare(
      `
      SELECT
        qualificacao_codigo,
        edapp_course_name,
        edapp_course_id,
        edapp_course_code
      FROM integracoes_edapp_cursos
      WHERE lower(trim(COALESCE(edapp_course_code, ''))) = ?
        AND (? IS NULL OR empresa_id = ?)
        AND deleted_at IS NULL
        AND ativo = 1
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(courseCode, empresaId ?? null, empresaId ?? null)
    .first<EdAppMappedQualificacao>();
}

async function findQualificacaoByCourseTitle(
  db: D1Database,
  courseTitle: string,
  empresaId?: number | null,
): Promise<EdAppMappedQualificacao | null> {
  return db
    .prepare(
      `
      SELECT
        qualificacao_codigo,
        edapp_course_name,
        edapp_course_id,
        edapp_course_code
      FROM integracoes_edapp_cursos
      WHERE lower(trim(COALESCE(edapp_course_name, ''))) = ?
        AND (? IS NULL OR empresa_id = ?)
        AND deleted_at IS NULL
        AND ativo = 1
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(courseTitle, empresaId ?? null, empresaId ?? null)
    .first<EdAppMappedQualificacao>();
}

export function edappErrorResponse(
  c: Context,
  status: 400 | 401 | 404 | 500,
  error: string,
  code: string,
  extra?: Record<string, unknown>,
) {
  return c.json(
    {
      success: false,
      error,
      code,
      ...extra,
    },
    status,
  );
}

export async function findFuncionarioByEdappUser(
  db: D1Database,
  lookup: string | EdAppUserLookup,
  empresaId?: number | null,
): Promise<EdAppMappedFuncionario | null> {
  const resolvedLookup =
    typeof lookup === 'string'
      ? {
          edappUserId: lookup,
        }
      : lookup;

  const edappUserId = normalizeLookupValue(resolvedLookup.edappUserId);
  if (edappUserId) {
    const exact = await findFuncionarioByExactUserId(db, edappUserId, empresaId);
    if (exact?.funcionario_id) {
      return {
        ...exact,
        matched_by: 'edapp_user_id',
      };
    }
  }

  const alternateCandidates = [
    normalizeLookupKey(resolvedLookup.userExternalId),
    normalizeLookupKey(resolvedLookup.edappEmail),
    normalizeLookupKey(resolvedLookup.edappUsername),
  ].filter((candidate, index, values): candidate is string => {
    return Boolean(candidate) && values.indexOf(candidate) === index;
  });

  for (const candidate of alternateCandidates) {
    const alternate = await findFuncionarioByAlternateIdentifier(db, candidate, empresaId);
    if (!alternate?.funcionario_id) {
      continue;
    }

    const matchedBy =
      normalizeLookupKey(alternate.edapp_email) === candidate
        ? 'edapp_email'
        : normalizeLookupKey(alternate.edapp_username) === candidate
          ? 'edapp_username'
          : 'user_external_id';

    return {
      ...alternate,
      matched_by: matchedBy,
    };
  }

  const approximateCandidates = [
    normalizeLookupValue(resolvedLookup.userExternalId),
    normalizeLookupValue(resolvedLookup.edappEmail),
    normalizeLookupValue(resolvedLookup.edappUsername),
  ].filter((candidate, index, values): candidate is string => {
    return Boolean(candidate) && values.indexOf(candidate) === index;
  });

  if (approximateCandidates.length > 0) {
    const rows = await loadFuncionarioCandidates(db, empresaId);
    for (const candidate of approximateCandidates) {
      const approximate = buildApproximateFuncionarioMatch(candidate, rows);
      if (approximate?.funcionario_id) {
        return approximate;
      }
    }
  }

  return null;
}

export async function findQualificacaoByCourse(
  db: D1Database,
  lookup: string | EdAppCourseLookup,
  empresaId?: number | null,
): Promise<EdAppMappedQualificacao | null> {
  const resolvedLookup =
    typeof lookup === 'string'
      ? {
          courseId: lookup,
        }
      : lookup;

  const courseId = normalizeLookupValue(resolvedLookup.courseId);
  if (courseId) {
    const exact = await findQualificacaoByExactCourseId(db, courseId, empresaId);
    if (exact?.qualificacao_codigo) {
      return {
        ...exact,
        matched_by: 'edapp_course_id',
      };
    }
  }

  const courseExternalId = normalizeLookupValue(resolvedLookup.courseExternalId);
  if (courseExternalId && courseExternalId !== courseId) {
    const byExternalId = await findQualificacaoByExactCourseId(db, courseExternalId, empresaId);
    if (byExternalId?.qualificacao_codigo) {
      return {
        ...byExternalId,
        matched_by: 'course_external_id',
      };
    }
  }

  const courseCodeCandidates = [
    normalizeLookupKey(courseExternalId),
    normalizeLookupKey(courseId),
  ].filter(
    (candidate, index, values): candidate is string =>
      Boolean(candidate) && values.indexOf(candidate) === index,
  );

  for (const courseCode of courseCodeCandidates) {
    const byCourseCode = await findQualificacaoByCourseCode(db, courseCode, empresaId);
    if (byCourseCode?.qualificacao_codigo) {
      return {
        ...byCourseCode,
        matched_by: 'edapp_course_code',
      };
    }
  }

  const courseTitle = normalizeLookupKey(resolvedLookup.courseTitle);
  if (courseTitle) {
    const byTitle = await findQualificacaoByCourseTitle(db, courseTitle, empresaId);
    if (byTitle?.qualificacao_codigo) {
      return {
        ...byTitle,
        matched_by: 'course_title',
      };
    }
  }

  return null;
}

export function parseEdAppCompletionPayload(payloadJson?: string | null): EdAppCompletionPayload {
  try {
    const parsed = JSON.parse(payloadJson || '{}') as {
      data?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const data =
      parsed.data && typeof parsed.data === 'object' && parsed.data !== null ? parsed.data : parsed;

    return {
      edappUserId: normalizeLookupValue((data.userId || parsed.edapp_user_id) as string | null),
      userExternalId: normalizeLookupValue(
        (data.userExternalId || data.username || data.email) as string | null,
      ),
      edappCourseId: normalizeLookupValue(
        (data.courseId || parsed.edapp_course_id) as string | null,
      ),
      courseExternalId: normalizeLookupValue(
        (data.courseExternalId || parsed.edapp_course_external_id) as string | null,
      ),
      courseTitle: normalizeLookupValue((data.courseTitle || parsed.course_title) as string | null),
      completedAt: normalizeLookupValue(
        (data.completedAt || data.completedDateTime) as string | null,
      ),
      score:
        typeof data.score === 'number'
          ? data.score
          : typeof parsed.score === 'number'
            ? (parsed.score as number)
            : undefined,
    };
  } catch {
    return {
      edappUserId: null,
      userExternalId: null,
      edappCourseId: null,
      courseExternalId: null,
      courseTitle: null,
      completedAt: null,
    };
  }
}

export async function upsertEdAppConfig(
  db: D1Database,
  key: string,
  value: string | null,
  empresaId?: number | null,
): Promise<void> {
  if (empresaId == null) {
    const updated = await db
      .prepare(
        `
        UPDATE integracoes_edapp_config
           SET valor = ?,
               updated_at = datetime('now'),
               deleted_at = NULL
         WHERE chave = ?
           AND empresa_id IS NULL
      `,
      )
      .bind(value, key)
      .run();

    if ((updated.meta.changes ?? 0) > 0) {
      return;
    }

    await db
      .prepare(
        `
        INSERT INTO integracoes_edapp_config (empresa_id, chave, valor, updated_at, deleted_at)
        VALUES (NULL, ?, ?, datetime('now'), NULL)
      `,
      )
      .bind(key, value)
      .run();
    return;
  }

  const updated = await db
    .prepare(
      `
      UPDATE integracoes_edapp_config
         SET valor = ?,
             updated_at = datetime('now'),
             deleted_at = NULL
       WHERE chave = ?
         AND empresa_id = ?
    `,
    )
    .bind(value, key, empresaId)
    .run();

  if ((updated.meta.changes ?? 0) > 0) {
    return;
  }

  try {
    await db
      .prepare(
        `
        INSERT INTO integracoes_edapp_config (empresa_id, chave, valor, updated_at, deleted_at)
        VALUES (?, ?, ?, datetime('now'), NULL)
      `,
      )
      .bind(empresaId, key, value)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const isLegacyUniqueConstraint =
      message.includes('UNIQUE constraint failed') &&
      message.includes('integracoes_edapp_config.chave');

    if (!isLegacyUniqueConstraint) {
      throw error;
    }

    await db
      .prepare(
        `
        UPDATE integracoes_edapp_config
           SET valor = ?,
               updated_at = datetime('now'),
               deleted_at = NULL
         WHERE chave = ?
           AND (empresa_id = ? OR empresa_id IS NULL)
      `,
      )
      .bind(value, key, empresaId)
      .run();
  }
}

export async function getEdAppConfigValue(
  db: D1Database,
  key: string,
  empresaId?: number | null,
): Promise<{ valor: string | null; updated_at: string | null; empresa_id?: number | null } | null> {
  if (empresaId == null) {
    return db
      .prepare(
        `
        SELECT valor, updated_at, empresa_id
          FROM integracoes_edapp_config
         WHERE chave = ?
           AND empresa_id IS NULL
           AND deleted_at IS NULL
         ORDER BY id DESC
         LIMIT 1
      `,
      )
      .bind(key)
      .first<{ valor: string | null; updated_at: string | null; empresa_id: number | null }>();
  }

  return db
    .prepare(
      `
      SELECT valor, updated_at, empresa_id
        FROM integracoes_edapp_config
       WHERE chave = ?
         AND deleted_at IS NULL
         AND (empresa_id = ? OR empresa_id IS NULL)
       ORDER BY CASE WHEN empresa_id = ? THEN 0 ELSE 1 END, id DESC
      LIMIT 1
    `,
    )
    .bind(key, empresaId, empresaId)
    .first<{ valor: string | null; updated_at: string | null; empresa_id: number | null }>();
}

export async function deleteEdAppConfig(
  db: D1Database,
  key: string,
  empresaId?: number | null,
): Promise<number> {
  if (empresaId != null) {
    const deletedTenant = await db
      .prepare(
        `
        DELETE FROM integracoes_edapp_config
         WHERE chave = ?
           AND empresa_id = ?
      `,
      )
      .bind(key, empresaId)
      .run();

    if ((deletedTenant.meta.changes ?? 0) > 0) {
      return Number(deletedTenant.meta.changes ?? 0);
    }
  }

  const deletedGlobal = await db
    .prepare(
      `
      DELETE FROM integracoes_edapp_config
       WHERE chave = ?
         AND empresa_id IS NULL
    `,
    )
    .bind(key)
    .run();

  return Number(deletedGlobal.meta.changes ?? 0);
}

export async function createQualificacao(
  db: D1Database,
  funcionarioId: number,
  qualificacaoCodigo: string,
  origem: string,
  dataCompletedAt?: string, // Data de conclusão do curso (do EdApp)
  empresaId?: number | null,
): Promise<CreateQualificacaoResult> {
  const dataConclusao = resolveEdAppCompletionDate(dataCompletedAt);

  // 1. Buscar configuração do tipo de qualificação (validade em meses e ID)
  const tipoQualificacao = await db
    .prepare(
      `
    SELECT id, validade, COALESCE(vencimento_fim_mes, 0) as vencimento_fim_mes
    FROM qualificacoes_tipos
    WHERE codigo = ?
      AND (? IS NULL OR empresa_id = ?)
      AND deleted_at IS NULL
  `,
    )
    .bind(qualificacaoCodigo, empresaId ?? null, empresaId ?? null)
    .first<{ id: number; validade: number | null; vencimento_fim_mes: number | null }>();

  if (!tipoQualificacao) {
    return {
      success: false,
      message: `Tipo de qualificação ${qualificacaoCodigo} não encontrado`,
      renovacao: false,
    };
  }

  const validadeMeses =
    typeof tipoQualificacao.validade === 'number' && tipoQualificacao.validade > 0
      ? tipoQualificacao.validade
      : 12;
  const vencimentoFimMes = Number(tipoQualificacao.vencimento_fim_mes || 0) === 1 ? 1 : 0;
  const dataVencimento = calcularDataVencimento(dataConclusao, validadeMeses, vencimentoFimMes);

  const qualificacaoExistente = await db
    .prepare(
      `
      SELECT id
      FROM qualificacoes_historico
      WHERE funcionario_id = ?
        AND (? IS NULL OR empresa_id = ?)
        AND qualificacao_codigo = ?
        AND data_conclusao = ?
        AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(funcionarioId, empresaId ?? null, empresaId ?? null, qualificacaoCodigo, dataConclusao)
    .first<{ id: number }>();

  if (qualificacaoExistente?.id) {
    return {
      success: true,
      qualificacao_id: qualificacaoExistente.id,
      message: 'Qualificação já existente para esta data de conclusão',
      renovacao: false,
      created: false,
      duplicate: true,
    };
  }

  const renovadas = await markPreviousQualificacoesAsRenovadas(
    db,
    funcionarioId,
    qualificacaoCodigo,
    dataConclusao,
    `Substituída por curso EdApp em ${dataConclusao}`,
    empresaId,
  );
  const nextQualificacao = await findNextQualificacaoAfterDate(
    db,
    funcionarioId,
    qualificacaoCodigo,
    dataConclusao,
    empresaId,
  );
  const observacoes = [
    `EdApp: ${origem} | Válido por ${validadeMeses} meses | Conclusão: ${dataConclusao}`,
  ];

  if (nextQualificacao?.data_conclusao) {
    observacoes.push(`Substituída por curso EdApp em ${nextQualificacao.data_conclusao}`);
  }

  // 4. Criar SEMPRE uma nova qualificação (registro individual de cada conclusão)
  const result = await db
    .prepare(
      `
    INSERT INTO qualificacoes_historico (
      funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, data_vencimento,
      validade_meses, observacoes, renovada, status, created_at
      , empresa_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `,
    )
    .bind(
      funcionarioId,
      tipoQualificacao.id,
      qualificacaoCodigo,
      dataConclusao,
      dataVencimento,
      validadeMeses,
      observacoes.join(' | '),
      nextQualificacao ? 1 : 0,
      nextQualificacao ? 'RENOVADA' : null,
      empresaId ?? null,
    )
    .run();

  if (isG1QualificacaoCode(qualificacaoCodigo)) {
    await garantirG1SemPlanejado(db, {
      funcionarioId,
      dataConclusaoG1: dataConclusao,
      g1HistoricoId: Number(result.meta.last_row_id || 0),
    });
  }

  return {
    success: true,
    qualificacao_id: result.meta.last_row_id,
    message: nextQualificacao
      ? `Qualificação histórica criada como renovada (validade: ${validadeMeses} meses)`
      : `Qualificação criada (validade: ${validadeMeses} meses)`,
    renovacao: renovadas > 0 || Boolean(nextQualificacao),
    created: true,
  };
}

export async function renovarQualificacao(
  db: D1Database,
  funcionarioId: number,
  qualificacaoCodigo: string,
  origem: string,
  dataCompletedAt: string,
  empresaId?: number | null,
) {
  const dataConclusao = resolveEdAppCompletionDate(dataCompletedAt);

  const qualificacaoExistente = await findPreviousQualificacaoToRenew(
    db,
    funcionarioId,
    qualificacaoCodigo,
    dataConclusao,
    empresaId,
  );

  if (qualificacaoExistente) {
    // Criar nova qualificação com vencimento calculado a partir da data de conclusão
    const resultado = await createQualificacao(
      db,
      funcionarioId,
      qualificacaoCodigo,
      origem,
      dataCompletedAt,
      empresaId,
    );

    return {
      ...resultado,
      renovada: true,
      qualificacao_antiga_id: qualificacaoExistente.id,
    };
  }

  // Se não existe qualificação válida, criar nova normalmente
  return await createQualificacao(
    db,
    funcionarioId,
    qualificacaoCodigo,
    origem,
    dataCompletedAt,
    empresaId,
  );
}

export async function createEdAppQualificacaoNotification(
  db: D1Database,
  params: {
    funcionarioId: number;
    funcionarioNome: string | null;
    qualificacaoCodigo: string;
    cursoNome: string | null;
    qualificacaoHistoricoId: number;
    dataConclusao?: string | null;
    score?: number;
    courseId?: string | null;
    renovacao?: boolean;
    origem: 'webhook' | 'analytics';
  },
): Promise<void> {
  const grupoNotificacao = `edapp_${params.origem}_${new Date().toISOString().split('T')[0]}`;

  await db
    .prepare(
      `INSERT INTO notificacoes_sistema (
        tipo, prioridade, titulo, mensagem, dados, grupo,
        funcionario_id, qualificacao_historico_id, link, acao_primaria,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      'EDAPP_QUALIFICACAO',
      'MEDIA',
      '✅ Treinamento EdApp Concluído',
      `${params.funcionarioNome || 'Funcionário'} concluiu o treinamento ${params.cursoNome || params.qualificacaoCodigo}`,
      JSON.stringify({
        funcionario_id: params.funcionarioId,
        funcionario_nome: params.funcionarioNome,
        qualificacao_codigo: params.qualificacaoCodigo,
        data_conclusao: params.dataConclusao,
        score: params.score,
        courseId: params.courseId,
        renovacao: params.renovacao || false,
        origem: params.origem,
      }),
      grupoNotificacao,
      params.funcionarioId,
      params.qualificacaoHistoricoId,
      `/qualificacoes?id=${params.qualificacaoHistoricoId}`,
      'Ver Qualificação',
    )
    .run();
}

export async function callEdAppAPI(env: Env, method: string, endpoint: string, body?: unknown) {
  const logger = createModuleLogger('EdAppAPI', env.ENVIRONMENT);

  if (!env.EDAPP_API_TOKEN) {
    throw new Error('EDAPP_API_TOKEN não configurado');
  }

  const url = `https://rest.edapp.com${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${env.EDAPP_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const responseText = await response.text();

  if (!response.ok) {
    logger.error(`EdApp API Error: ${response.status}`, undefined, {
      endpoint,
      method,
      responseText,
    });
    throw new Error(`EdApp API Error: ${response.status} - ${responseText}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}
