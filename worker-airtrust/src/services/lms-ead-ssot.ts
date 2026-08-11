import { upsertImportedEdappCycle } from './lms-matricula-cycle';

/** The sole functional classifier for LMS-backed qualifications. */
export const CANONICAL_TRAINING_CATEGORY = 'EAD';

type QualificacaoTipoEadRow = {
  id: number;
  empresa_id: number;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  formato_id: number | null;
  formato_codigo: string | null;
  conteudo_programatico: string | null;
  observacoes: string | null;
  carga_horaria: number | null;
  carga_horaria_inicial: number | null;
  carga_horaria_recorrente: number | null;
  deleted_at: string | null;
  dominio_codigo: string | null;
};

type LmsCursoMirrorRow = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number | null;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  formato_id: number | null;
  formato_codigo: string | null;
  carga_horaria_minutos: number | null;
  conteudo_programatico: string | null;
  observacoes: string | null;
  carga_horaria_inicial_horas: number | null;
  carga_horaria_recorrente_horas: number | null;
  tipo_conteudo: string | null;
  scorm_versao: string | null;
  scorm_mastery_score: number | null;
  idioma: string | null;
  publicado: number;
  ativo: number;
  deleted_at: string | null;
  scorm_package_r2_prefix?: string | null;
  scorm_launch_file?: string | null;
  thumbnail_r2_key?: string | null;
  conteudo_arquivo_nome?: string | null;
  matriculas_total?: number | null;
  progressos_scorm_total?: number | null;
  dominio_codigo?: string | null;
};

type ImportedHistoryRow = {
  id: number;
  empresa_id: number;
  funcionario_id: number | null;
  curso_id: number | null;
  curso_titulo: string | null;
  curso_categoria: string | null;
  tipo_conteudo: string | null;
  qualificacao_codigo: string | null;
  qualificacao_historico_id: number | null;
  data_conclusao: string | null;
  integracao_evento_id: number | null;
};

function normalizeNullableText(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizePositiveInteger(value: string | number | null | undefined) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export function isEadCategoria(categoria: string | null | undefined) {
  const normalized = String(categoria || '')
    .trim()
    .toUpperCase();

  return normalized === 'EAD' || normalized === 'TREINAMENTO EAD';
}

/** Compatibility name only; legacy format is never a functional classifier. */
export function isEadFormato(tipo: {
  formato_codigo?: string | null;
  categoria?: string | null;
}): boolean {
  return isEadCategoria(tipo.categoria);
}

async function resolveCanonicalEadCategoriaId(db: D1Database, empresaId: number) {
  const active = await db
    .prepare(
      `SELECT id FROM qualificacoes_categorias
        WHERE empresa_id = ? AND deleted_at IS NULL AND ativo = 1
          AND UPPER(TRIM(nome)) = 'EAD'
        ORDER BY id ASC LIMIT 2`,
    )
    .bind(empresaId)
    .all<{ id: number }>();
  let rows = active.results ?? [];

  // Incident 2026-08-10: production had exactly one 'EAD' categoria row for
  // a tenant, deactivated (ativo=0) by unrelated catalog cleanup, while still
  // being the row qualificacoes_tipos.categoria_id points at. This mirror
  // sync only needs a stable, unambiguous id to classify by — it is not an
  // authorization check — so an inactive-but-unique row still resolves
  // instead of hard-failing every course save. Genuine ambiguity (zero or
  // multiple candidates, active or not) still fails closed.
  if (rows.length === 0) {
    const all = await db
      .prepare(
        `SELECT id FROM qualificacoes_categorias
          WHERE empresa_id = ? AND deleted_at IS NULL
            AND UPPER(TRIM(nome)) = 'EAD'
          ORDER BY id ASC LIMIT 2`,
      )
      .bind(empresaId)
      .all<{ id: number }>();
    rows = all.results ?? [];
  }

  if (rows.length !== 1)
    throw new Error(`Categoria EAD canônica inválida para empresa_id=${empresaId}`);
  return Number(rows[0].id);
}

function hoursToMinutes(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.round(value * 60));
}

function minutesToHours(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Number((value / 60).toFixed(2));
}

function normalizeTipoCodigoFragment(value: string | null | undefined) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.slice(0, 36);
}

function resolveCourseMinutesFromTipo(tipo: QualificacaoTipoEadRow) {
  return hoursToMinutes(
    tipo.carga_horaria_recorrente ?? tipo.carga_horaria_inicial ?? tipo.carga_horaria,
  );
}

async function hasColumn(db: D1Database, table: string, column: string): Promise<boolean> {
  try {
    const { results } = await db
      .prepare(`PRAGMA table_info(${table})`)
      .bind()
      .all<{ name: string }>();
    return (results || []).some((row) => row?.name === column);
  } catch {
    return false;
  }
}

async function fetchQualificacaoTipo(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
) {
  // Item 3: the auto-created lms_curso must inherit dominio_codigo from the
  // SOURCE qualificacao_tipo's categoria — never default to OPERACOES, and
  // never guess from free text. categoria_id/dominio_codigo may be absent
  // in older/frozen fixture schemas, so both joins are defensive.
  const hasCategoriaId = await hasColumn(db, 'qualificacoes_tipos', 'categoria_id');
  const hasCategoriaDominio = await hasColumn(db, 'qualificacoes_categorias', 'dominio_codigo');
  const dominioSelect = hasCategoriaId && hasCategoriaDominio ? 'qc.dominio_codigo' : 'NULL';
  const dominioJoin =
    hasCategoriaId && hasCategoriaDominio
      ? 'LEFT JOIN qualificacoes_categorias qc ON qc.id = qualificacoes_tipos.categoria_id AND qc.deleted_at IS NULL AND qc.ativo = 1'
      : '';

  return db
    .prepare(
      `SELECT qualificacoes_tipos.id,
              qualificacoes_tipos.empresa_id,
              qualificacoes_tipos.codigo,
              qualificacoes_tipos.nome,
              qualificacoes_tipos.descricao,
              qualificacoes_tipos.categoria,
              qualificacoes_tipos.formato_id,
              qf.codigo AS formato_codigo,
              qualificacoes_tipos.conteudo_programatico,
              qualificacoes_tipos.observacoes,
              qualificacoes_tipos.carga_horaria,
              qualificacoes_tipos.carga_horaria_inicial,
              qualificacoes_tipos.carga_horaria_recorrente,
              qualificacoes_tipos.deleted_at,
              ${dominioSelect} AS dominio_codigo
         FROM qualificacoes_tipos
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = qualificacoes_tipos.formato_id
          AND qf.deleted_at IS NULL
         ${dominioJoin}
        WHERE qualificacoes_tipos.id = ?
          AND qualificacoes_tipos.empresa_id = ?
        LIMIT 1`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .first<QualificacaoTipoEadRow>();
}

async function fetchCursoByQualificacaoTipo(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
) {
  const hasDominioCodigo = await hasColumn(db, 'lms_cursos', 'dominio_codigo');
  const result = await db
    .prepare(
      `SELECT lms_cursos.id,
              lms_cursos.empresa_id,
              lms_cursos.qualificacao_tipo_id,
              lms_cursos.titulo,
              lms_cursos.descricao,
              lms_cursos.categoria,
              lms_cursos.formato_id,
              qf.codigo AS formato_codigo,
              lms_cursos.carga_horaria_minutos,
              lms_cursos.conteudo_programatico,
              lms_cursos.observacoes,
              lms_cursos.carga_horaria_inicial_horas,
              lms_cursos.carga_horaria_recorrente_horas,
              lms_cursos.tipo_conteudo,
              lms_cursos.scorm_versao,
              lms_cursos.scorm_mastery_score,
              lms_cursos.idioma,
              lms_cursos.publicado,
              lms_cursos.ativo,
              ${hasDominioCodigo ? 'lms_cursos.dominio_codigo,' : 'NULL AS dominio_codigo,'}
              lms_cursos.deleted_at,
              lms_cursos.scorm_package_r2_prefix,
              lms_cursos.scorm_launch_file,
              lms_cursos.thumbnail_r2_key,
              lms_cursos.conteudo_arquivo_nome,
              (
                SELECT COUNT(*)
                  FROM lms_matriculas m
                 WHERE m.curso_id = lms_cursos.id
                   AND m.empresa_id = lms_cursos.empresa_id
                   AND m.deleted_at IS NULL
              ) AS matriculas_total,
              (
                SELECT COUNT(*)
                  FROM lms_progresso_scorm ps
                  JOIN lms_matriculas m
                    ON m.id = ps.matricula_id
                   AND m.empresa_id = lms_cursos.empresa_id
                 WHERE m.curso_id = lms_cursos.id
                   AND m.deleted_at IS NULL
              ) AS progressos_scorm_total
         FROM lms_cursos
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = lms_cursos.formato_id
          AND qf.deleted_at IS NULL
        WHERE lms_cursos.empresa_id = ?
          AND lms_cursos.qualificacao_tipo_id = ?
        ORDER BY lms_cursos.id DESC`,
    )
    .bind(empresaId, qualificacaoTipoId)
    .all<LmsCursoMirrorRow>();

  const rows = result.results ?? [];
  if (rows.length === 0) return null;

  const recoverable = rows.filter((row) => {
    const hasAssets =
      Boolean(normalizeNullableText(row.scorm_package_r2_prefix)) ||
      Boolean(normalizeNullableText(row.scorm_launch_file)) ||
      Boolean(normalizeNullableText(row.thumbnail_r2_key)) ||
      Boolean(normalizeNullableText(row.conteudo_arquivo_nome));
    const hasState =
      Number(row.matriculas_total ?? 0) > 0 || Number(row.progressos_scorm_total ?? 0) > 0;

    return hasAssets || hasState;
  });

  if (recoverable.length > 1) {
    const scored = recoverable.map((row) => ({
      row,
      score:
        (Number(row.matriculas_total ?? 0) > 0 ? 4 : 0) +
        (Number(row.progressos_scorm_total ?? 0) > 0 ? 3 : 0) +
        (normalizeNullableText(row.scorm_package_r2_prefix) ? 2 : 0) +
        (normalizeNullableText(row.thumbnail_r2_key) ? 1 : 0) +
        (normalizeNullableText(row.conteudo_arquivo_nome) ? 1 : 0),
    }));
    scored.sort((left, right) => right.score - left.score || left.row.id - right.row.id);
    const best = scored[0];
    const tied = scored.filter((entry) => entry.score === best.score);

    if (tied.length > 1) {
      throw new Error(
        `Ambiguidade ao resolver curso LMS canônico para qualificacao_tipo_id=${qualificacaoTipoId} empresa_id=${empresaId}: ${tied
          .map((entry) => entry.row.id)
          .join(', ')}`,
      );
    }

    return best.row;
  }

  if (recoverable.length === 1) {
    return recoverable[0];
  }

  return rows[0];
}

async function fetchCursoMirror(db: D1Database, empresaId: number, cursoId: number) {
  return db
    .prepare(
      `SELECT lms_cursos.id,
              lms_cursos.empresa_id,
              lms_cursos.qualificacao_tipo_id,
              lms_cursos.titulo,
              lms_cursos.descricao,
              lms_cursos.categoria,
              lms_cursos.formato_id,
              qf.codigo AS formato_codigo,
              lms_cursos.carga_horaria_minutos,
              lms_cursos.conteudo_programatico,
              lms_cursos.observacoes,
              lms_cursos.carga_horaria_inicial_horas,
              lms_cursos.carga_horaria_recorrente_horas,
              lms_cursos.tipo_conteudo,
              lms_cursos.scorm_versao,
              lms_cursos.scorm_mastery_score,
              lms_cursos.idioma,
              lms_cursos.publicado,
              lms_cursos.ativo
         FROM lms_cursos
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = lms_cursos.formato_id
          AND qf.deleted_at IS NULL
        WHERE lms_cursos.id = ?
          AND lms_cursos.empresa_id = ?
          AND lms_cursos.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(cursoId, empresaId)
    .first<LmsCursoMirrorRow>();
}

async function findExistingEadQualificacaoTipoByName(
  db: D1Database,
  empresaId: number,
  nome: string,
) {
  const result = await db
    .prepare(
      `SELECT qualificacoes_tipos.id,
              qualificacoes_tipos.codigo,
              qualificacoes_tipos.formato_id,
              qf.codigo AS formato_codigo,
              qualificacoes_tipos.conteudo_programatico,
              qualificacoes_tipos.descricao
         FROM qualificacoes_tipos
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = qualificacoes_tipos.formato_id
          AND qf.deleted_at IS NULL
        WHERE qualificacoes_tipos.empresa_id = ?
          AND qualificacoes_tipos.deleted_at IS NULL
          AND UPPER(TRIM(qualificacoes_tipos.nome)) = UPPER(TRIM(?))
          AND UPPER(TRIM(COALESCE(categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')`,
    )
    .bind(empresaId, nome)
    .all<{
      id: number;
      codigo: string | null;
      formato_id: number | null;
      formato_codigo: string | null;
      conteudo_programatico: string | null;
      descricao: string | null;
    }>();

  const candidates = (result.results ?? []).sort((left, right) => {
    const leftGenerated = String(left.codigo || '')
      .trim()
      .toUpperCase()
      .startsWith('EAD_');
    const rightGenerated = String(right.codigo || '')
      .trim()
      .toUpperCase()
      .startsWith('EAD_');

    if (leftGenerated !== rightGenerated) {
      return leftGenerated ? 1 : -1;
    }

    const leftHasContent = normalizeNullableText(left.conteudo_programatico) ? 1 : 0;
    const rightHasContent = normalizeNullableText(right.conteudo_programatico) ? 1 : 0;
    if (leftHasContent !== rightHasContent) {
      return rightHasContent - leftHasContent;
    }

    const leftHasDescription = normalizeNullableText(left.descricao) ? 1 : 0;
    const rightHasDescription = normalizeNullableText(right.descricao) ? 1 : 0;
    if (leftHasDescription !== rightHasDescription) {
      return rightHasDescription - leftHasDescription;
    }

    return left.id - right.id;
  });

  return candidates[0] ? { id: candidates[0].id } : null;
}

export async function resolveCanonicalEadQualificacaoTipoId(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number | null | undefined,
) {
  if (!qualificacaoTipoId) return null;

  const tipo = await fetchQualificacaoTipo(db, empresaId, qualificacaoTipoId);
  if (!tipo || tipo.deleted_at || !isEadFormato(tipo)) {
    return qualificacaoTipoId;
  }

  const canonical = await findExistingEadQualificacaoTipoByName(db, empresaId, tipo.nome.trim());
  return canonical?.id ?? tipo.id;
}

async function resolveUniqueQualificacaoTipoCode(
  db: D1Database,
  empresaId: number,
  titulo: string,
) {
  const fragment = normalizeTipoCodigoFragment(titulo) || `CURSO_${empresaId}`;
  const base = `EAD_${fragment}`.slice(0, 40);

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const suffixText = suffix === 0 ? '' : `_${suffix + 1}`;
    const candidate = `${base.slice(0, 40 - suffixText.length)}${suffixText}`;
    const existing = await db
      .prepare(
        `SELECT id
           FROM qualificacoes_tipos
          WHERE UPPER(TRIM(COALESCE(codigo, ''))) = UPPER(TRIM(?))
          LIMIT 1`,
      )
      .bind(candidate)
      .first<{ id: number }>();

    if (!existing?.id) {
      return candidate;
    }
  }

  return `EAD_${empresaId}_${Date.now()}`;
}

export async function syncLmsCourseFromQualificacaoTipo(
  db: D1Database,
  params: { empresaId: number; qualificacaoTipoId: string | number },
) {
  const qualificacaoTipoId = normalizePositiveInteger(params.qualificacaoTipoId);
  if (!qualificacaoTipoId) return null;

  const tipo = await fetchQualificacaoTipo(db, params.empresaId, qualificacaoTipoId);

  if (!tipo || tipo.deleted_at || !isEadFormato(tipo)) {
    return null;
  }

  const existingCurso = await fetchCursoByQualificacaoTipo(
    db,
    params.empresaId,
    qualificacaoTipoId,
  );

  const titulo = tipo.nome.trim();
  const descricao = normalizeNullableText(tipo.descricao);
  const categoria = CANONICAL_TRAINING_CATEGORY;
  const conteudoProgramatico = normalizeNullableText(tipo.conteudo_programatico);
  const observacoes = normalizeNullableText(tipo.observacoes);
  const cargaInicial = normalizeNullableNumber(tipo.carga_horaria_inicial);
  const cargaRecorrente = normalizeNullableNumber(tipo.carga_horaria_recorrente);
  const cargaMinutos = resolveCourseMinutesFromTipo(tipo);
  // Item 3: inherited strictly from the source qualificacao_tipo's categoria
  // — never guessed, never defaulted to OPERACOES. Stays NULL (unclassified,
  // blocked by readiness) when the categoria itself has no domain yet.
  const dominioCodigo = normalizeNullableText(tipo.dominio_codigo);
  const hasDominioCodigoColumn = await hasColumn(db, 'lms_cursos', 'dominio_codigo');

  if (existingCurso?.id) {
    // Backfill-only: never overwrite a domain an admin already classified
    // manually, even if the source categoria's domain later changes.
    const shouldSetDominio =
      hasDominioCodigoColumn && !existingCurso.dominio_codigo && dominioCodigo;

    await db
      .prepare(
        `UPDATE lms_cursos
            SET titulo = ?,
                descricao = ?,
                categoria = ?,
                formato_id = NULL,
                carga_horaria_minutos = ?,
                conteudo_programatico = ?,
                observacoes = ?,
                carga_horaria_inicial_horas = ?,
                carga_horaria_recorrente_horas = ?,
                gerar_qualificacao_ao_concluir = 1,
                ativo = 1,
                deleted_at = NULL,
                ${shouldSetDominio ? 'dominio_codigo = ?,' : ''}
                updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?`,
      )
      .bind(
        titulo,
        descricao,
        categoria,
        cargaMinutos,
        conteudoProgramatico,
        observacoes,
        cargaInicial,
        cargaRecorrente,
        ...(shouldSetDominio ? [dominioCodigo] : []),
        existingCurso.id,
        params.empresaId,
      )
      .run();

    return existingCurso.id;
  }

  const insert = await db
    .prepare(
      `INSERT INTO lms_cursos (
         empresa_id,
         titulo,
         descricao,
         categoria,
         formato_id,
         carga_horaria_minutos,
         idioma,
         tipo_conteudo,
         scorm_versao,
         scorm_mastery_score,
         qualificacao_tipo_id,
         gerar_qualificacao_ao_concluir,
         publicado,
         ativo,
         conteudo_programatico,
         observacoes,
         carga_horaria_inicial_horas,
         carga_horaria_recorrente_horas,
         ${hasDominioCodigoColumn ? 'dominio_codigo,' : ''}
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'pt-BR', 'scorm', '1.2', 70, ?, 1, 0, 1, ?, ?, ?, ?, ${
         hasDominioCodigoColumn ? '?,' : ''
       } datetime('now'), datetime('now'), NULL)`,
    )
    .bind(
      params.empresaId,
      titulo,
      descricao,
      categoria,
      null,
      cargaMinutos,
      tipo.id,
      conteudoProgramatico,
      observacoes,
      cargaInicial,
      cargaRecorrente,
      ...(hasDominioCodigoColumn ? [dominioCodigo] : []),
    )
    .run();

  return Number(insert.meta.last_row_id || 0);
}

export async function ensureQualificacaoTipoForCurso(
  db: D1Database,
  params: { empresaId: number; cursoId: number },
) {
  const curso = await fetchCursoMirror(db, params.empresaId, params.cursoId);

  if (!curso || curso.qualificacao_tipo_id || !isEadFormato(curso)) {
    return curso?.qualificacao_tipo_id ?? null;
  }

  const existingTipo = await findExistingEadQualificacaoTipoByName(
    db,
    params.empresaId,
    curso.titulo.trim(),
  );

  let qualificacaoTipoId = existingTipo?.id ?? null;

  if (!qualificacaoTipoId) {
    const cargaInicial =
      normalizeNullableNumber(curso.carga_horaria_inicial_horas) ??
      normalizeNullableNumber(minutesToHours(curso.carga_horaria_minutos));
    const cargaRecorrente =
      normalizeNullableNumber(curso.carga_horaria_recorrente_horas) ??
      normalizeNullableNumber(minutesToHours(curso.carga_horaria_minutos)) ??
      cargaInicial;
    const cargaPadrao =
      cargaRecorrente ?? cargaInicial ?? minutesToHours(curso.carga_horaria_minutos);
    const codigo = await resolveUniqueQualificacaoTipoCode(db, params.empresaId, curso.titulo);
    const categoriaId = await resolveCanonicalEadCategoriaId(db, params.empresaId);
    const hasCategoriaId = await hasColumn(db, 'qualificacoes_tipos', 'categoria_id');

    const insert = await db
      .prepare(
        `INSERT INTO qualificacoes_tipos (
           empresa_id,
           tipo,
           codigo,
           nome,
           descricao,
           categoria,
           ${hasCategoriaId ? 'categoria_id,' : ''}
           formato_id,
           carga_horaria,
           carga_horaria_inicial,
           carga_horaria_recorrente,
           conteudo_programatico,
           validade,
           vencimento_fim_mes,
           observacoes,
           ativo,
           created_at,
           updated_at,
           deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, 1, datetime('now'), datetime('now'), NULL)`,
      )
      .bind(
        params.empresaId,
        String(curso.categoria || 'EAD')
          .trim()
          .toUpperCase(),
        codigo,
        curso.titulo.trim(),
        normalizeNullableText(curso.descricao),
        CANONICAL_TRAINING_CATEGORY,
        ...(hasCategoriaId ? [categoriaId] : []),
        null,
        cargaPadrao,
        cargaInicial,
        cargaRecorrente,
        normalizeNullableText(curso.conteudo_programatico),
        normalizeNullableText(curso.observacoes),
      )
      .run();

    qualificacaoTipoId = Number(insert.meta.last_row_id || 0) || null;
  }

  if (!qualificacaoTipoId) {
    return null;
  }

  await db
    .prepare(
      `UPDATE lms_cursos
          SET qualificacao_tipo_id = ?,
              gerar_qualificacao_ao_concluir = 1,
              updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(qualificacaoTipoId, params.cursoId, params.empresaId)
    .run();

  return qualificacaoTipoId;
}

export async function syncAllEadCoursesFromQualificacoes(db: D1Database, empresaId: number) {
  const tipos = await db
    .prepare(
      `SELECT qt.id,
              qt.nome,
              qt.codigo,
              qt.categoria,
              qt.formato_id,
              qf.codigo AS formato_codigo,
              qt.descricao,
              qt.conteudo_programatico,
              qt.observacoes,
              qt.carga_horaria,
              qt.carga_horaria_inicial,
              qt.carga_horaria_recorrente
         FROM qualificacoes_tipos qt
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = qt.formato_id
          AND qf.deleted_at IS NULL
        WHERE qt.empresa_id = ?
          AND qt.deleted_at IS NULL
        ORDER BY nome ASC`,
    )
    .bind(empresaId)
    .all<QualificacaoTipoEadRow>();

  const created: number[] = [];
  const updated: number[] = [];
  let skipped = 0;
  let totalTiposEad = 0;

  for (const tipo of tipos.results ?? []) {
    if (!isEadFormato(tipo)) {
      skipped += 1;
      continue;
    }
    totalTiposEad += 1;

    const existed = await fetchCursoByQualificacaoTipo(db, empresaId, tipo.id);
    const cursoId = await syncLmsCourseFromQualificacaoTipo(db, {
      empresaId,
      qualificacaoTipoId: tipo.id,
    });

    if (!cursoId) continue;
    if (existed?.id) {
      updated.push(cursoId);
    } else {
      created.push(cursoId);
    }
  }

  return {
    total_tipos_ead: totalTiposEad,
    created,
    updated,
    skipped,
  };
}

export async function syncQualificacaoTipoFromCurso(
  db: D1Database,
  params: { empresaId: number; cursoId: number },
) {
  const curso = await db
    .prepare(
      `SELECT c.id,
              c.empresa_id,
              c.qualificacao_tipo_id,
              c.titulo,
              c.descricao,
              c.categoria,
              c.formato_id,
              qf.codigo AS formato_codigo,
              c.carga_horaria_minutos,
              c.conteudo_programatico,
              c.observacoes,
              c.carga_horaria_inicial_horas,
              c.carga_horaria_recorrente_horas,
              qt.categoria AS qualificacao_categoria,
              qt.formato_id AS qualificacao_formato_id,
              qf_tipo.codigo AS qualificacao_formato_codigo
         FROM lms_cursos c
         JOIN qualificacoes_tipos qt
           ON qt.id = c.qualificacao_tipo_id
          AND qt.empresa_id = c.empresa_id
          AND qt.deleted_at IS NULL
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = c.formato_id
          AND qf.deleted_at IS NULL
         LEFT JOIN qualificacoes_formatos qf_tipo
           ON qf_tipo.id = qt.formato_id
          AND qf_tipo.deleted_at IS NULL
        WHERE c.id = ?
          AND c.empresa_id = ?
          AND c.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.cursoId, params.empresaId)
    .first<
      LmsCursoMirrorRow & {
        qualificacao_categoria: string | null;
        qualificacao_formato_codigo: string | null;
      }
    >();

  if (
    !curso?.qualificacao_tipo_id ||
    !isEadFormato({
      categoria: curso.qualificacao_categoria,
      formato_codigo: curso.qualificacao_formato_codigo ?? curso.formato_codigo,
    })
  ) {
    return null;
  }

  const cargaInicial =
    normalizeNullableNumber(curso.carga_horaria_inicial_horas) ??
    normalizeNullableNumber(minutesToHours(curso.carga_horaria_minutos));
  const cargaRecorrente =
    normalizeNullableNumber(curso.carga_horaria_recorrente_horas) ??
    normalizeNullableNumber(minutesToHours(curso.carga_horaria_minutos)) ??
    cargaInicial;
  const cargaPadrao =
    cargaRecorrente ?? cargaInicial ?? minutesToHours(curso.carga_horaria_minutos);
  const categoriaId = await resolveCanonicalEadCategoriaId(db, params.empresaId);
  const hasCategoriaId = await hasColumn(db, 'qualificacoes_tipos', 'categoria_id');

  await db
    .prepare(
      `UPDATE qualificacoes_tipos
          SET nome = ?,
              descricao = ?,
              categoria = ?,
              ${hasCategoriaId ? 'categoria_id = ?,' : ''}
              formato_id = NULL,
              conteudo_programatico = ?,
              observacoes = ?,
              carga_horaria = ?,
              carga_horaria_inicial = ?,
              carga_horaria_recorrente = ?,
              updated_at = datetime('now')
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(
      curso.titulo.trim(),
      normalizeNullableText(curso.descricao),
      CANONICAL_TRAINING_CATEGORY,
      ...(hasCategoriaId ? [categoriaId] : []),
      normalizeNullableText(curso.conteudo_programatico),
      normalizeNullableText(curso.observacoes),
      cargaPadrao,
      cargaInicial,
      cargaRecorrente,
      curso.qualificacao_tipo_id,
      params.empresaId,
    )
    .run();

  return curso.qualificacao_tipo_id;
}

export async function softDeleteLmsCourseForQualificacaoTipo(
  db: D1Database,
  params: { empresaId: number; qualificacaoTipoId: string | number },
) {
  const qualificacaoTipoId = normalizePositiveInteger(params.qualificacaoTipoId);
  if (!qualificacaoTipoId) return;

  await db
    .prepare(
      `UPDATE lms_cursos
          SET ativo = 0,
              deleted_at = datetime('now'),
              updated_at = datetime('now')
        WHERE empresa_id = ?
          AND qualificacao_tipo_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(params.empresaId, qualificacaoTipoId)
    .run();
}

async function resolveImportedHistoryQualificacaoId(
  db: D1Database,
  row: ImportedHistoryRow,
  resolvedCodigo: string | null,
) {
  if (row.qualificacao_historico_id) {
    const existing = await db
      .prepare(
        `SELECT id
           FROM qualificacoes_historico
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(row.qualificacao_historico_id, row.empresa_id)
      .first<{ id: number }>();

    if (existing?.id) return existing.id;
  }

  if (!row.funcionario_id || !resolvedCodigo || !row.data_conclusao) {
    return null;
  }

  const matched = await db
    .prepare(
      `SELECT id
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND deleted_at IS NULL
          AND UPPER(TRIM(COALESCE(qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(?, '')))
          AND date(COALESCE(data_conclusao, '1900-01-01')) = date(?)
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(row.empresa_id, row.funcionario_id, resolvedCodigo, row.data_conclusao)
    .first<{ id: number }>();

  return matched?.id ?? null;
}

async function resolveImportedHistoryCourse(
  db: D1Database,
  row: ImportedHistoryRow,
  onlyCursoId?: number,
  onlyQualificacaoTipoId?: number,
) {
  if (row.curso_id) {
    const byId = await db
      .prepare(
        `SELECT c.id,
                c.titulo,
                c.categoria,
                c.tipo_conteudo,
                qt.codigo AS qualificacao_codigo,
                qt.id AS qualificacao_tipo_id
           FROM lms_cursos c
           LEFT JOIN qualificacoes_tipos qt
             ON qt.id = c.qualificacao_tipo_id
            AND qt.deleted_at IS NULL
          WHERE c.id = ?
            AND c.empresa_id = ?
            AND c.deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(row.curso_id, row.empresa_id)
      .first<{
        id: number;
        titulo: string;
        categoria: string | null;
        tipo_conteudo: string | null;
        qualificacao_codigo: string | null;
        qualificacao_tipo_id: number | null;
      }>();

    if (byId && (!onlyCursoId || byId.id === onlyCursoId)) {
      return byId;
    }
  }

  if (!row.qualificacao_codigo) return null;

  const match = await db
    .prepare(
      `SELECT c.id,
              c.titulo,
              c.categoria,
              c.tipo_conteudo,
              qt.codigo AS qualificacao_codigo,
              qt.id AS qualificacao_tipo_id
         FROM lms_cursos c
         JOIN qualificacoes_tipos qt
           ON qt.id = c.qualificacao_tipo_id
          AND qt.empresa_id = c.empresa_id
          AND qt.deleted_at IS NULL
        WHERE c.empresa_id = ?
          AND c.deleted_at IS NULL
          AND UPPER(TRIM(COALESCE(qt.codigo, ''))) = UPPER(TRIM(COALESCE(?, '')))
          ${onlyCursoId ? 'AND c.id = ?' : ''}
          ${onlyQualificacaoTipoId ? 'AND qt.id = ?' : ''}
        ORDER BY c.id DESC
        LIMIT 1`,
    )
    .bind(
      row.empresa_id,
      row.qualificacao_codigo,
      ...(onlyCursoId ? [onlyCursoId] : []),
      ...(onlyQualificacaoTipoId ? [onlyQualificacaoTipoId] : []),
    )
    .first<{
      id: number;
      titulo: string;
      categoria: string | null;
      tipo_conteudo: string | null;
      qualificacao_codigo: string | null;
      qualificacao_tipo_id: number | null;
    }>();

  return match ?? null;
}

export async function reconcileImportedEdappHistory(
  db: D1Database,
  params: {
    empresaId: number;
    cursoId?: number;
    qualificacaoTipoId?: string | number;
    integracaoEventoId?: number;
  },
) {
  const qualificacaoTipoId = normalizePositiveInteger(params.qualificacaoTipoId);
  const conditions = ['lhi.empresa_id = ?', "lhi.fonte = 'EDAPP'", 'lhi.deleted_at IS NULL'];
  const bindings: Array<string | number> = [params.empresaId];

  if (params.cursoId) {
    conditions.push('(lhi.curso_id = ? OR lhi.curso_id IS NULL)');
    bindings.push(params.cursoId);
  }

  if (params.integracaoEventoId) {
    conditions.push('lhi.integracao_evento_id = ?');
    bindings.push(params.integracaoEventoId);
  }

  // ⚠️ Filtrar por qualificacaoTipoId quando disponível para evitar processar
  // TODOS os registros EDAPP do tenant (causa hang com muitos registros).
  // Faz JOIN com lms_cursos + qualificacoes_tipos para limitar ao tipo específico.
  if (qualificacaoTipoId) {
    conditions.push('(qt.id = ? OR lhi.curso_id IS NULL)');
    bindings.push(qualificacaoTipoId);
  }

  const rows = await db
    .prepare(
      `SELECT lhi.id,
              lhi.empresa_id,
              lhi.funcionario_id,
              lhi.curso_id,
              lhi.curso_titulo,
              lhi.curso_categoria,
              lhi.tipo_conteudo,
              lhi.qualificacao_codigo,
              lhi.qualificacao_historico_id,
              lhi.data_conclusao,
              lhi.integracao_evento_id
         FROM lms_historico_importado lhi
         LEFT JOIN lms_cursos c
           ON c.id = lhi.curso_id
          AND c.deleted_at IS NULL
         LEFT JOIN qualificacoes_tipos qt
           ON qt.id = c.qualificacao_tipo_id
          AND qt.deleted_at IS NULL
        WHERE ${conditions.join(' AND ')}
        ORDER BY lhi.id ASC`,
    )
    .bind(...bindings)
    .all<ImportedHistoryRow>();

  let updated = 0;

  for (const row of rows.results ?? []) {
    const resolvedCourse = await resolveImportedHistoryCourse(
      db,
      row,
      params.cursoId,
      qualificacaoTipoId ?? undefined,
    );
    const resolvedQualificacaoId = await resolveImportedHistoryQualificacaoId(
      db,
      row,
      resolvedCourse?.qualificacao_codigo ?? row.qualificacao_codigo ?? null,
    );

    const nextCursoId = resolvedCourse?.id ?? row.curso_id ?? null;
    const nextTitulo = resolvedCourse?.titulo ?? row.curso_titulo ?? null;
    const nextCategoria = resolvedCourse?.categoria ?? row.curso_categoria ?? null;
    const nextTipoConteudo = resolvedCourse?.tipo_conteudo ?? row.tipo_conteudo ?? null;
    const nextCodigo =
      resolvedCourse?.qualificacao_codigo ?? normalizeNullableText(row.qualificacao_codigo);

    await db
      .prepare(
        `UPDATE lms_historico_importado
            SET curso_id = ?,
                curso_titulo = ?,
                curso_categoria = ?,
                tipo_conteudo = ?,
                qualificacao_codigo = ?,
                qualificacao_historico_id = ?,
                updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(
        nextCursoId,
        nextTitulo,
        nextCategoria,
        nextTipoConteudo,
        nextCodigo,
        resolvedQualificacaoId,
        row.id,
      )
      .run();

    await upsertImportedEdappCycle(db, { historicoImportadoId: row.id });
    updated += 1;
  }

  return { updated };
}
