import { tableHasColumn } from '../routes/qualificacoes-certificados-helpers';

type G1SemHistoricoRow = {
  id: number;
  data_conclusao: string | null;
  data_vencimento: string | null;
  observacoes: string | null;
  status: string | null;
  validade_meses: number | null;
};

type EnsureG1SemParams = {
  funcionarioId: number;
  dataConclusaoG1: string;
  g1HistoricoId?: number | null;
};

type RealizarG1SemParams = {
  funcionarioId: number;
  qualificacaoId?: number | null;
  qualificacaoCodigo?: string | null;
  categoria?: string | null;
  dataConclusao: string;
  observacoes?: string | null;
  instrutor?: string | null;
  status?: string | null;
  tipoTreinamento?: string | null;
  cargaHoraria?: number | null;
};

type FuncionarioEmpresaRow = {
  empresa_id: number | null;
};

function normalizeCodigo(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function splitObservacoes(value?: string | null): string[] {
  return String(value || '')
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function mergeObservacoes(
  currentValue?: string | null,
  nextValues?: Array<string | null | undefined>,
): string | null {
  const segmentos = splitObservacoes(currentValue);

  for (const candidate of nextValues || []) {
    const texto = String(candidate || '').trim();
    if (texto && !segmentos.includes(texto)) {
      segmentos.push(texto);
    }
  }

  return segmentos.length > 0 ? segmentos.join(' | ') : null;
}

function addMonths(dateValue: string, months: number): string | null {
  const normalizedDate = String(dateValue || '').trim();
  if (!normalizedDate) return null;

  const baseDate = new Date(`${normalizedDate}T00:00:00Z`);
  if (Number.isNaN(baseDate.getTime())) return null;

  baseDate.setUTCMonth(baseDate.getUTCMonth() + months);
  return baseDate.toISOString().slice(0, 10);
}

async function marcarG1SemAnteriorComoRenovada(
  db: D1Database,
  params: {
    funcionarioId: number | string;
    empresaId: number;
    historicoAtualId: number;
    dataConclusaoAtual: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE qualificacoes_historico
          SET renovada = 1,
              status = 'RENOVADA',
              updated_at = datetime('now')
        WHERE funcionario_id = ?
          AND empresa_id = ?
          AND id <> ?
          AND deleted_at IS NULL
          AND UPPER(COALESCE(qualificacao_codigo, '')) = 'G1-SEM'
          AND COALESCE(renovada, 0) = 0
          AND COALESCE(status, 'CONCLUIDA') <> 'PLANEJADA'
          AND COALESCE(status, '') <> 'CANCELADA'
          AND date(COALESCE(data_conclusao, data_vencimento, '1900-01-01')) < date(?)`,
    )
    .bind(params.funcionarioId, params.empresaId, params.historicoAtualId, params.dataConclusaoAtual)
    .run();
}

/**
 * Closes the confirmed gap: this file materialized the predecessor as
 * RENOVADA (legacy flag) but never linked the canonical SSOT invariant
 * (successor.renovacao_de = predecessor.id) on the row it just realized.
 * Reuses the same chronologically-immediate-predecessor correlation
 * pattern established in qualification-history-atomic.ts /
 * reconcileQualificationLineageAtomic — not a new algorithm.
 */
async function linkG1SemRenovacaoDe(
  db: D1Database,
  params: {
    empresaId: number;
    funcionarioId: number | string;
    historicoAtualId: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE qualificacoes_historico AS qh
          SET renovacao_de = (
            SELECT pred.id
              FROM qualificacoes_historico pred
             WHERE pred.empresa_id = qh.empresa_id
               AND pred.funcionario_id = qh.funcionario_id
               AND UPPER(COALESCE(pred.qualificacao_codigo, '')) = 'G1-SEM'
               AND pred.id <> qh.id
               AND pred.deleted_at IS NULL
               AND UPPER(COALESCE(pred.status, '')) NOT IN ('PLANEJADA', 'PLANEJADO', 'CANCELADA', 'CANCELADO')
               AND (
                 date(COALESCE(pred.data_conclusao, '1900-01-01')) < date(qh.data_conclusao)
                 OR (
                   date(COALESCE(pred.data_conclusao, '1900-01-01')) = date(qh.data_conclusao)
                   AND pred.id < qh.id
                 )
               )
             ORDER BY date(COALESCE(pred.data_conclusao, '1900-01-01')) DESC, pred.id DESC
             LIMIT 1
          ),
              updated_at = datetime('now')
        WHERE qh.id = ?
          AND qh.empresa_id = ?
          AND qh.deleted_at IS NULL
          AND UPPER(COALESCE(qh.status, '')) = 'CONCLUIDA'`,
    )
    .bind(params.historicoAtualId, params.empresaId)
    .run();
}

export function isG1QualificacaoCode(value?: string | null): boolean {
  return normalizeCodigo(value) === 'G1';
}

export function isG1SemQualificacaoCode(value?: string | null): boolean {
  return normalizeCodigo(value) === 'G1-SEM';
}

export function calcularDataPrevistaG1Sem(dataConclusaoG1: string): string | null {
  return addMonths(dataConclusaoG1, 0);
}

export function calcularDataVencimentoG1Sem(dataConclusaoG1: string): string | null {
  return addMonths(dataConclusaoG1, 6);
}

async function buscarEmpresaFuncionario(
  db: D1Database,
  funcionarioId?: number | string | null,
): Promise<number | null> {
  if (funcionarioId == null) return null;

  const row = await db
    .prepare(
      `SELECT empresa_id
         FROM funcionarios
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(funcionarioId)
    .first<FuncionarioEmpresaRow>();

  const empresaId = Number(row?.empresa_id || 0);
  return Number.isFinite(empresaId) && empresaId > 0 ? empresaId : null;
}

async function buscarTipoG1Sem(
  db: D1Database,
  funcionarioId?: number | string | null,
): Promise<{ id: number; categoria: string | null } | null> {
  const tiposHasEmpresaId = await tableHasColumn(db, 'qualificacoes_tipos', 'empresa_id');

  if (tiposHasEmpresaId) {
    // The tenant column exists in this schema — every lookup path from here
    // must be tenant-scoped or fail closed. Never fall through to the
    // unscoped query below once this column is present, whether or not the
    // funcionario's tenant could be resolved.
    const empresaId = await buscarEmpresaFuncionario(db, funcionarioId);
    if (empresaId == null) return null;

    return (
      (await db
        .prepare(
          `SELECT id, categoria
             FROM qualificacoes_tipos
            WHERE UPPER(COALESCE(codigo, '')) = 'G1-SEM'
              AND deleted_at IS NULL
              AND empresa_id = ?
            ORDER BY id DESC
            LIMIT 1`,
        )
        .bind(empresaId)
        .first<{ id: number; categoria: string | null }>()) || null
    );
  }

  // Only reached when qualificacoes_tipos.empresa_id doesn't exist yet
  // (pre-migration compatibility) — genuinely no tenant column to filter by.
  return db
    .prepare(
      `SELECT id, categoria
         FROM qualificacoes_tipos
        WHERE UPPER(COALESCE(codigo, '')) = 'G1-SEM'
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind()
    .first<{ id: number; categoria: string | null }>();
}

export async function buscarG1SemPendente(
  db: D1Database,
  funcionarioId: number | string,
  dataReferencia?: string | null,
): Promise<G1SemHistoricoRow | null> {
  const referencia = String(dataReferencia || '').trim();
  const empresaId = await buscarEmpresaFuncionario(db, funcionarioId);
  if (!empresaId) return null;

  return db
    .prepare(
      `SELECT id, data_conclusao, data_vencimento, observacoes, status, validade_meses
         FROM qualificacoes_historico
        WHERE funcionario_id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
          AND UPPER(COALESCE(qualificacao_codigo, '')) = 'G1-SEM'
          AND COALESCE(status, 'PLANEJADA') = 'PLANEJADA'
        ORDER BY CASE
                   WHEN ? != '' THEN ABS(julianday(COALESCE(data_conclusao, data_vencimento, ?)) - julianday(?))
                   ELSE 0
                 END ASC,
                 date(COALESCE(data_conclusao, data_vencimento, '9999-12-31')) DESC,
                 id DESC
        LIMIT 1`,
    )
    .bind(
      funcionarioId,
      empresaId,
      referencia,
      referencia || '9999-12-31',
      referencia || '9999-12-31',
    )
    .first<G1SemHistoricoRow>();
}

async function upsertG1SemConcluido(
  db: D1Database,
  params: {
    funcionarioId: number | string;
    dataConclusao: string;
    g1HistoricoId?: number | null;
    qualificacaoId?: number | null;
    qualificacaoCodigo?: string | null;
    categoria?: string | null;
    observacoes?: string | null;
    instrutor?: string | null;
    status?: string | null;
    tipoTreinamento?: string | null;
    cargaHoraria?: number | null;
    existingId?: number | null;
  },
): Promise<{ id: number; dataVencimento: string | null; action: 'insert' | 'reuse' }> {
  const dataConclusao = String(params.dataConclusao || '').trim();
  const dataVencimento = calcularDataVencimentoG1Sem(dataConclusao);
  if (!dataConclusao || !dataVencimento) {
    throw new Error('INVALID_G1_SEM_DATE');
  }

  const empresaId = await buscarEmpresaFuncionario(db, params.funcionarioId);
  if (!empresaId) {
    throw new Error('G1_SEM_TENANT_NOT_FOUND');
  }

  const tipoG1Sem = await buscarTipoG1Sem(db, params.funcionarioId);
  if (!tipoG1Sem && !params.qualificacaoId) {
    throw new Error('G1_SEM_TIPO_NOT_FOUND');
  }

  const observacaoOrigem = params.g1HistoricoId
    ? `Gerada automaticamente a partir do G1 #${params.g1HistoricoId}`
    : null;
  const observacoes = mergeObservacoes(params.observacoes, [observacaoOrigem]);
  const statusFinal = String(params.status || '').trim() || 'CONCLUIDA';
  const codigoFinal = params.qualificacaoCodigo ?? 'G1-SEM';
  const categoriaFinal = params.categoria ?? tipoG1Sem?.categoria ?? null;
  const tipoTreinamentoFinal = params.tipoTreinamento ?? 'SEMESTRAL';
  const qualificacaoIdFinal = params.qualificacaoId ?? tipoG1Sem?.id ?? null;

  const existente = params.existingId
    ? await db
        .prepare(
          `SELECT id
             FROM qualificacoes_historico
            WHERE id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(params.existingId, empresaId)
        .first<{ id: number }>()
    : await db
        .prepare(
          `SELECT id
            FROM qualificacoes_historico
           WHERE funcionario_id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL
              AND UPPER(COALESCE(qualificacao_codigo, '')) = 'G1-SEM'
              AND COALESCE(status, '') != 'CANCELADA'
              AND (
                COALESCE(data_conclusao, '') = ?
                OR (? IS NOT NULL AND observacoes LIKE ?)
              )
            ORDER BY CASE WHEN COALESCE(status, '') = 'PLANEJADA' THEN 0 ELSE 1 END,
                     id DESC
            LIMIT 1`,
        )
        .bind(
          params.funcionarioId,
          empresaId,
          dataConclusao,
          observacaoOrigem,
          observacaoOrigem ? `%${observacaoOrigem}%` : null,
        )
        .first<{ id: number }>();

  if (existente?.id) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET qualificacao_id = COALESCE(?, qualificacao_id),
                qualificacao_codigo = COALESCE(?, qualificacao_codigo),
                categoria = COALESCE(?, categoria),
                data_conclusao = ?,
                data_vencimento = ?,
                validade_meses = 6,
            instrutor = COALESCE(?, instrutor),
                observacoes = ?,
                status = ?,
                renovada = 0,
                tipo_treinamento = COALESCE(?, tipo_treinamento),
                carga_horaria = COALESCE(?, carga_horaria),
                updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(
        qualificacaoIdFinal,
        codigoFinal,
        categoriaFinal,
        dataConclusao,
        dataVencimento,
        params.instrutor ?? null,
        observacoes,
        statusFinal,
        tipoTreinamentoFinal,
        params.cargaHoraria ?? null,
        existente.id,
        empresaId,
      )
      .run();

    await marcarG1SemAnteriorComoRenovada(db, {
      funcionarioId: params.funcionarioId,
      empresaId,
      historicoAtualId: existente.id,
      dataConclusaoAtual: dataConclusao,
    });
    await linkG1SemRenovacaoDe(db, {
      empresaId,
      funcionarioId: params.funcionarioId,
      historicoAtualId: existente.id,
    });

    return { id: existente.id, dataVencimento, action: 'reuse' };
  }

  const result = await db
    .prepare(
      `INSERT INTO qualificacoes_historico (
         funcionario_id,
         qualificacao_id,
         qualificacao_codigo,
         categoria,
         data_conclusao,
         data_vencimento,
         validade_meses,
         instrutor,
         tipo_treinamento,
         observacoes,
         status,
         renovada,
         carga_horaria,
         empresa_id,
         created_at,
         updated_at
       ) VALUES (?, ?, 'G1-SEM', ?, ?, ?, 6, ?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      params.funcionarioId,
      qualificacaoIdFinal,
      categoriaFinal,
      dataConclusao,
      dataVencimento,
      params.instrutor ?? null,
      tipoTreinamentoFinal,
      observacoes,
      statusFinal,
      params.cargaHoraria ?? null,
      empresaId,
    )
    .run();

  const insertedId = Number(result.meta.last_row_id || 0);

  if (insertedId > 0) {
    await marcarG1SemAnteriorComoRenovada(db, {
      funcionarioId: params.funcionarioId,
      empresaId,
      historicoAtualId: insertedId,
      dataConclusaoAtual: dataConclusao,
    });
    await linkG1SemRenovacaoDe(db, {
      empresaId,
      funcionarioId: params.funcionarioId,
      historicoAtualId: insertedId,
    });
  }

  return { id: insertedId, dataVencimento, action: 'insert' };
}

export async function garantirG1SemPlanejado(
  db: D1Database,
  params: EnsureG1SemParams,
): Promise<{
  action: 'insert' | 'reuse' | 'skip';
  id: number | null;
  dataVencimento: string | null;
}> {
  const dataConclusao = calcularDataPrevistaG1Sem(params.dataConclusaoG1);
  if (!dataConclusao) {
    return { action: 'skip', id: null, dataVencimento: null };
  }

  try {
    const result = await upsertG1SemConcluido(db, {
      funcionarioId: params.funcionarioId,
      dataConclusao,
      g1HistoricoId: params.g1HistoricoId,
      status: 'CONCLUIDA',
      tipoTreinamento: 'SEMESTRAL',
    });

    return { action: result.action, id: result.id, dataVencimento: result.dataVencimento };
  } catch {
    return { action: 'skip', id: null, dataVencimento: null };
  }
}

export async function realizarG1SemPendente(
  db: D1Database,
  params: RealizarG1SemParams,
): Promise<{ id: number; dataVencimento: string | null } | null> {
  const pendente = await buscarG1SemPendente(db, params.funcionarioId, params.dataConclusao);
  try {
    const result = await upsertG1SemConcluido(db, {
      funcionarioId: params.funcionarioId,
      qualificacaoId: params.qualificacaoId,
      qualificacaoCodigo: params.qualificacaoCodigo,
      categoria: params.categoria,
      dataConclusao: params.dataConclusao,
      observacoes: mergeObservacoes(pendente?.observacoes, [params.observacoes]),
      status: params.status,
      tipoTreinamento: params.tipoTreinamento,
      cargaHoraria: params.cargaHoraria,
      instrutor: params.instrutor,
      existingId: pendente?.id ?? null,
    });

    return { id: result.id, dataVencimento: result.dataVencimento };
  } catch {
    return null;
  }
}
