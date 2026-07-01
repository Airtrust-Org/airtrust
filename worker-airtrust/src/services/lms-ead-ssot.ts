import { upsertImportedEdappCycle } from './lms-matricula-cycle';

type QualificacaoTipoEadRow = {
  id: number;
  empresa_id: number;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  conteudo_programatico: string | null;
  observacoes: string | null;
  carga_horaria: number | null;
  carga_horaria_inicial: number | null;
  carga_horaria_recorrente: number | null;
  deleted_at: string | null;
};

type LmsCursoMirrorRow = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number | null;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
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

/**
 * Determina se uma qualificação/curso tem formato EAD.
 * Usa formato_codigo (campo estruturado pós-migration 0412) com fallback para categoria string.
 * Substitui progressivamente isEadCategoria() para novos flows.
 */
export function isEadFormato(tipo: {
  formato_codigo?: string | null;
  categoria?: string | null;
}): boolean {
  if (tipo.formato_codigo) {
    return tipo.formato_codigo.toUpperCase() === 'EAD';
  }
  return isEadCategoria(tipo.categoria);
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

async function fetchQualificacaoTipo(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
) {
  return db
    .prepare(
      `SELECT id,
              empresa_id,
              codigo,
              nome,
              descricao,
              categoria,
              conteudo_programatico,
              observacoes,
              carga_horaria,
              carga_horaria_inicial,
              carga_horaria_recorrente,
              deleted_at
         FROM qualificacoes_tipos
        WHERE id = ?
          AND empresa_id = ?
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
  return db
    .prepare(
      `SELECT id,
              empresa_id,
              qualificacao_tipo_id,
              titulo,
              descricao,
              categoria,
              carga_horaria_minutos,
              conteudo_programatico,
              observacoes,
              carga_horaria_inicial_horas,
              carga_horaria_recorrente_horas,
              tipo_conteudo,
              scorm_versao,
              scorm_mastery_score,
              idioma,
              publicado,
              ativo
         FROM lms_cursos
        WHERE empresa_id = ?
          AND qualificacao_tipo_id = ?
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(empresaId, qualificacaoTipoId)
    .first<LmsCursoMirrorRow>();
}

async function fetchCursoMirror(db: D1Database, empresaId: number, cursoId: number) {
  return db
    .prepare(
      `SELECT id,
              empresa_id,
              qualificacao_tipo_id,
              titulo,
              descricao,
              categoria,
              carga_horaria_minutos,
              conteudo_programatico,
              observacoes,
              carga_horaria_inicial_horas,
              carga_horaria_recorrente_horas,
              tipo_conteudo,
              scorm_versao,
              scorm_mastery_score,
              idioma,
              publicado,
              ativo
         FROM lms_cursos
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
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
      `SELECT id,
              codigo,
              conteudo_programatico,
              descricao
         FROM qualificacoes_tipos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND UPPER(TRIM(nome)) = UPPER(TRIM(?))
          AND UPPER(TRIM(COALESCE(categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')`,
    )
    .bind(empresaId, nome)
    .all<{
      id: number;
      codigo: string | null;
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
  if (!tipo || tipo.deleted_at || !isEadCategoria(tipo.categoria)) {
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

  if (!tipo || tipo.deleted_at || !isEadCategoria(tipo.categoria)) {
    return null;
  }

  const existingCurso = await fetchCursoByQualificacaoTipo(
    db,
    params.empresaId,
    qualificacaoTipoId,
  );

  const titulo = tipo.nome.trim();
  const descricao = normalizeNullableText(tipo.descricao);
  const categoria = normalizeNullableText(tipo.categoria) ?? 'EAD';
  const conteudoProgramatico = normalizeNullableText(tipo.conteudo_programatico);
  const observacoes = normalizeNullableText(tipo.observacoes);
  const cargaInicial = normalizeNullableNumber(tipo.carga_horaria_inicial);
  const cargaRecorrente = normalizeNullableNumber(tipo.carga_horaria_recorrente);
  const cargaMinutos = resolveCourseMinutesFromTipo(tipo);

  if (existingCurso?.id) {
    await db
      .prepare(
        `UPDATE lms_cursos
            SET titulo = ?,
                descricao = ?,
                categoria = ?,
                carga_horaria_minutos = ?,
                conteudo_programatico = ?,
                observacoes = ?,
                carga_horaria_inicial_horas = ?,
                carga_horaria_recorrente_horas = ?,
                gerar_qualificacao_ao_concluir = 1,
                ativo = 1,
                deleted_at = NULL,
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
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'pt-BR', 'scorm', '1.2', 70, ?, 1, 0, 1, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)`,
    )
    .bind(
      params.empresaId,
      titulo,
      descricao,
      categoria,
      cargaMinutos,
      tipo.id,
      conteudoProgramatico,
      observacoes,
      cargaInicial,
      cargaRecorrente,
    )
    .run();

  return Number(insert.meta.last_row_id || 0);
}

export async function ensureQualificacaoTipoForCurso(
  db: D1Database,
  params: { empresaId: number; cursoId: number },
) {
  const curso = await fetchCursoMirror(db, params.empresaId, params.cursoId);

  if (!curso || curso.qualificacao_tipo_id || !isEadCategoria(curso.categoria)) {
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

    const insert = await db
      .prepare(
        `INSERT INTO qualificacoes_tipos (
           empresa_id,
           tipo,
           codigo,
           nome,
           descricao,
           categoria,
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
        normalizeNullableText(curso.categoria) ?? 'EAD',
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
      `SELECT id
         FROM qualificacoes_tipos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND UPPER(TRIM(COALESCE(categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
        ORDER BY nome ASC`,
    )
    .bind(empresaId)
    .all<{ id: number }>();

  const created: number[] = [];
  const updated: number[] = [];

  for (const tipo of tipos.results ?? []) {
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
    total_tipos_ead: (tipos.results ?? []).length,
    created,
    updated,
    skipped: 0,
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
              c.carga_horaria_minutos,
              c.conteudo_programatico,
              c.observacoes,
              c.carga_horaria_inicial_horas,
              c.carga_horaria_recorrente_horas,
              qt.categoria AS qualificacao_categoria
         FROM lms_cursos c
         JOIN qualificacoes_tipos qt
           ON qt.id = c.qualificacao_tipo_id
          AND qt.empresa_id = c.empresa_id
          AND qt.deleted_at IS NULL
        WHERE c.id = ?
          AND c.empresa_id = ?
          AND c.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.cursoId, params.empresaId)
    .first<
      LmsCursoMirrorRow & {
        qualificacao_categoria: string | null;
      }
    >();

  if (!curso?.qualificacao_tipo_id || !isEadCategoria(curso.qualificacao_categoria)) {
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

  await db
    .prepare(
      `UPDATE qualificacoes_tipos
          SET nome = ?,
              descricao = ?,
              categoria = ?,
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
      normalizeNullableText(curso.categoria) ?? 'EAD',
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
