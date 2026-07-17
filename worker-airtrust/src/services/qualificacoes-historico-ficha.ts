import {
  garantirG1SemPlanejado,
  isG1QualificacaoCode,
  isG1SemQualificacaoCode,
  realizarG1SemPendente,
} from './qualificacoes-g1-sem';
import {
  normalizeCompletedStatusForNewWrites,
  normalizePlannedStatusForNewWrites,
  normalizeQualificationStatusForCompatibility,
  QUALIFICACAO_STATUS,
} from '../lib/status/status-codes';

export type UpsertQualificacaoHistoricoDaFichaParams = {
  fichaId: string | number;
  funcionarioId: string | number;
  qualificacaoId: number | null;
  qualificacaoCodigo?: string | null;
  dataConclusao: string;
  dataVencimento: string;
  observacoes: string;
  empresaId: number | null;
  status?: string; // Optional: defaults to 'CONCLUIDA' if not provided
};

export type UpsertQualificacaoHistoricoDaFichaResult = {
  id: number;
  action: 'insert' | 'update' | 'reuse';
  row: Record<string, unknown> | null;
};

type QualificacaoHistoricoRow = {
  id: number;
  qualificacao_id?: number | null;
  qualificacao_codigo?: string | null;
  data_conclusao?: string | null;
  data_vencimento?: string | null;
  observacoes?: string | null;
  empresa_id?: number | null;
  renovada?: number | null;
  status?: string | null;
};

type FindQualificacaoHistoricoParams = {
  funcionarioId: string | number;
  empresaId: number | null;
  qualificacaoId: number | null;
  qualificacaoCodigo: string | null;
  dataConclusao: string;
};

type SameDateLookupMode = 'strict' | 'by-qualificacao-id';

const schemaColumnsCache = new WeakMap<object, Promise<Set<string>>>();

function normalizeCodigo(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function splitObservacoes(value?: string | null): string[] {
  return String(value || '')
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function joinObservacoes(segments: string[]): string {
  return segments.filter(Boolean).join(' | ');
}

function appendObservacaoIfMissing(value: string | null | undefined, addition: string): string {
  const segments = splitObservacoes(value);
  if (!segments.includes(addition)) {
    segments.push(addition);
  }
  return joinObservacoes(segments);
}

function normalizeObservacoesAtivas(
  value: string | null | undefined,
  observacaoBase: string,
  marcadorRenovacao: string,
): string {
  const segments = splitObservacoes(value).filter((segment) => segment !== marcadorRenovacao);
  if (!segments.includes(observacaoBase)) {
    segments.unshift(observacaoBase);
  }
  return joinObservacoes(segments);
}

const QUALIFICACAO_MATCH_SQL = `
  funcionario_id = ?
  AND deleted_at IS NULL
  AND (
    (? IS NOT NULL AND qualificacao_codigo = ?)
    OR (? IS NULL AND qualificacao_id = ? AND qualificacao_codigo IS NULL)
  )
`;

async function getQualificacaoHistoricoById(
  db: D1Database,
  id: number,
  empresaId: number | null,
): Promise<Record<string, unknown> | null> {
  return db
    .prepare('SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL AND empresa_id=?')
    .bind(id, empresaId)
    .first<Record<string, unknown>>();
}

async function getSchemaColumns(db: D1Database, tableName: string): Promise<Set<string>> {
  const cacheKey = db as unknown as object;
  const cached = schemaColumnsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columnsPromise = db
    .prepare(`PRAGMA table_info('${tableName}')`)
    .bind()
    .all<{ name?: string }>()
    .then((result) => new Set((result.results || []).map((row) => String(row.name || ''))));

  schemaColumnsCache.set(cacheKey, columnsPromise);
  return columnsPromise;
}

async function findQualificacaoHistoricoMesmaData(
  db: D1Database,
  params: FindQualificacaoHistoricoParams,
  mode: SameDateLookupMode = 'strict',
): Promise<QualificacaoHistoricoRow | null> {
  const query =
    mode === 'by-qualificacao-id'
      ? `SELECT id, qualificacao_id, qualificacao_codigo, data_conclusao, data_vencimento, observacoes, empresa_id, renovada, status
         FROM qualificacoes_historico
         WHERE funcionario_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL
           AND qualificacao_id = ?
           AND data_conclusao = ?
         ORDER BY CASE WHEN qualificacao_codigo IS NULL OR TRIM(qualificacao_codigo) = '' THEN 1 ELSE 0 END,
                  id DESC
         LIMIT 1`
      : `SELECT id, qualificacao_id, qualificacao_codigo, data_conclusao, data_vencimento, observacoes, empresa_id, renovada, status
         FROM qualificacoes_historico
         WHERE ${QUALIFICACAO_MATCH_SQL}
           AND empresa_id = ?
           AND data_conclusao = ?
         ORDER BY id DESC
         LIMIT 1`;

  if (mode === 'by-qualificacao-id') {
    if (params.qualificacaoId == null) {
      return null;
    }

    return db
      .prepare(query)
      .bind(params.funcionarioId, params.empresaId, params.qualificacaoId, params.dataConclusao)
      .first<QualificacaoHistoricoRow>();
  }

  return db
    .prepare(query)
    .bind(
      params.funcionarioId,
      params.qualificacaoCodigo,
      params.qualificacaoCodigo,
      params.qualificacaoCodigo,
      params.qualificacaoId,
      params.empresaId,
      params.dataConclusao,
    )
    .first<QualificacaoHistoricoRow>();
}

async function findQualificacaoHistoricoMesmaDataComFallback(
  db: D1Database,
  params: FindQualificacaoHistoricoParams,
): Promise<QualificacaoHistoricoRow | null> {
  const sameDate = await findQualificacaoHistoricoMesmaData(db, params);
  if (sameDate) {
    return sameDate;
  }

  if (params.qualificacaoId == null) {
    return null;
  }

  return findQualificacaoHistoricoMesmaData(db, params, 'by-qualificacao-id');
}

function isQualificacoesHistoricoUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('UNIQUE constraint failed') &&
    message.includes('qualificacoes_historico.funcionario_id') &&
    message.includes('qualificacoes_historico.data_conclusao')
  );
}

async function reconcileQualificacaoHistoricoExistente(
  db: D1Database,
  mesmaData: QualificacaoHistoricoRow,
  params: UpsertQualificacaoHistoricoDaFichaParams,
  qualificacaoCodigo: string | null,
  marcadorRenovacao: string,
  statusFinal?: string,
): Promise<UpsertQualificacaoHistoricoDaFichaResult> {
  const observacoesAtualizadas = normalizeObservacoesAtivas(
    mesmaData.observacoes,
    params.observacoes,
    marcadorRenovacao,
  );
  const precisaAtualizar =
    Number(mesmaData.qualificacao_id || 0) !== Number(params.qualificacaoId || 0) ||
    normalizeCodigo(mesmaData.qualificacao_codigo) !== qualificacaoCodigo ||
    String(mesmaData.data_conclusao || '') !== params.dataConclusao ||
    String(mesmaData.data_vencimento || '') !== params.dataVencimento ||
    Number(mesmaData.empresa_id || 0) !== Number(params.empresaId || 0) ||
    Number(mesmaData.renovada || 0) !== 0 ||
    normalizeQualificationStatusForCompatibility(mesmaData.status) !==
      normalizeQualificationStatusForCompatibility(statusFinal) ||
    String(mesmaData.observacoes || '') !== observacoesAtualizadas;

  if (precisaAtualizar) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
         SET qualificacao_id=?,
             qualificacao_codigo=?,
             data_conclusao=?,
             data_vencimento=?,
             observacoes=?,
             empresa_id=?,
             renovada=0,
             status=?,
             updated_at=datetime('now')
         WHERE id=?
           AND empresa_id=?`,
      )
      .bind(
        params.qualificacaoId,
        qualificacaoCodigo,
        params.dataConclusao,
        params.dataVencimento,
        observacoesAtualizadas,
        params.empresaId,
        statusFinal,
        mesmaData.id,
        params.empresaId,
      )
      .run();

    return {
      id: mesmaData.id,
      action: 'update',
      row: await getQualificacaoHistoricoById(db, mesmaData.id, params.empresaId),
    };
  }

  return {
    id: mesmaData.id,
    action: 'reuse',
    row: await getQualificacaoHistoricoById(db, mesmaData.id, params.empresaId),
  };
}

export async function upsertQualificacaoHistoricoDaFicha(
  db: D1Database,
  params: UpsertQualificacaoHistoricoDaFichaParams,
): Promise<UpsertQualificacaoHistoricoDaFichaResult> {
  const fichaId = String(params.fichaId);
  const qualificacaoCodigo = normalizeCodigo(params.qualificacaoCodigo);
  const marcadorRenovacao = `Renovada via ficha #${fichaId} em ${new Date().toISOString().slice(0, 10)}`;
  const statusFinal =
    normalizePlannedStatusForNewWrites(params.status) ||
    normalizeCompletedStatusForNewWrites(params.status) ||
    QUALIFICACAO_STATUS.CONCLUIDA;

  if (isG1SemQualificacaoCode(qualificacaoCodigo)) {
    const realizacaoPendente = await realizarG1SemPendente(db, {
      funcionarioId: Number(params.funcionarioId),
      qualificacaoId: params.qualificacaoId,
      qualificacaoCodigo,
      dataConclusao: params.dataConclusao,
      observacoes: params.observacoes,
      status: statusFinal,
    });

    if (realizacaoPendente) {
      return {
        id: realizacaoPendente.id,
        action: 'update',
        row: await getQualificacaoHistoricoById(db, realizacaoPendente.id, params.empresaId),
      };
    }
  }

  const schemaColumns = await getSchemaColumns(db, 'qualificacoes_historico');
  const hasRenovacaoDe = schemaColumns.has('renovacao_de');
  const findParams: FindQualificacaoHistoricoParams = {
    funcionarioId: params.funcionarioId,
    empresaId: params.empresaId,
    qualificacaoId: params.qualificacaoId,
    qualificacaoCodigo,
    dataConclusao: params.dataConclusao,
  };

  const mesmaData = await findQualificacaoHistoricoMesmaDataComFallback(db, findParams);

  const anteriorAtiva =
    statusFinal === QUALIFICACAO_STATUS.PLANEJADA
      ? null
      : await db
          .prepare(
            `SELECT id, observacoes
             FROM qualificacoes_historico
             WHERE ${QUALIFICACAO_MATCH_SQL}
               AND empresa_id = ?
               AND id <> ?
               AND COALESCE(renovada,0)=0
               AND COALESCE(data_conclusao, '') <> ?
             ORDER BY data_vencimento DESC, id DESC
             LIMIT 1`,
          )
          .bind(
            params.funcionarioId,
            qualificacaoCodigo,
            qualificacaoCodigo,
            qualificacaoCodigo,
            params.qualificacaoId,
            params.empresaId,
            mesmaData?.id ?? 0,
            params.dataConclusao,
          )
          .first<{ id: number; observacoes?: string | null }>();

  if (anteriorAtiva) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
         SET renovada=1,
             status='RENOVADA',
             deleted_at=NULL,
             updated_at=datetime('now'),
             observacoes=?
         WHERE id=?
           AND empresa_id=?`,
      )
      .bind(
        appendObservacaoIfMissing(anteriorAtiva.observacoes, marcadorRenovacao),
        anteriorAtiva.id,
        params.empresaId,
      )
      .run();
  }

  if (mesmaData) {
    return reconcileQualificacaoHistoricoExistente(
      db,
      mesmaData,
      params,
      qualificacaoCodigo,
      marcadorRenovacao,
      statusFinal,
    );
  }

  let insertResult: { meta: { last_row_id?: number | string } };
  try {
    const statusValue = statusFinal;
    if (hasRenovacaoDe) {
      insertResult = await db
        .prepare(
          `INSERT INTO qualificacoes_historico(
             funcionario_id,
             qualificacao_id,
             qualificacao_codigo,
             data_conclusao,
             data_vencimento,
             observacoes,
             empresa_id,
             status,
             renovacao_de
           ) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          params.funcionarioId,
          params.qualificacaoId,
          qualificacaoCodigo,
          params.dataConclusao,
          params.dataVencimento,
          params.observacoes,
          params.empresaId,
          statusValue,
          anteriorAtiva?.id ?? null,
        )
        .run();
    } else {
      insertResult = await db
        .prepare(
          `INSERT INTO qualificacoes_historico(
             funcionario_id,
             qualificacao_id,
             qualificacao_codigo,
             data_conclusao,
             data_vencimento,
             observacoes,
             empresa_id,
             status
           ) VALUES(?,?,?,?,?,?,?,?)`,
        )
        .bind(
          params.funcionarioId,
          params.qualificacaoId,
          qualificacaoCodigo,
          params.dataConclusao,
          params.dataVencimento,
          params.observacoes,
          params.empresaId,
          statusValue,
        )
        .run();
    }
  } catch (error) {
    if (!isQualificacoesHistoricoUniqueConstraintError(error)) {
      throw error;
    }

    const registroConcorrente = await findQualificacaoHistoricoMesmaDataComFallback(db, findParams);
    if (!registroConcorrente) {
      throw error;
    }

    return reconcileQualificacaoHistoricoExistente(
      db,
      registroConcorrente,
      params,
      qualificacaoCodigo,
      marcadorRenovacao,
      statusFinal,
    );
  }

  const id = insertResult.meta.last_row_id as number;

  if (isG1QualificacaoCode(qualificacaoCodigo)) {
    await garantirG1SemPlanejado(db, {
      funcionarioId: Number(params.funcionarioId),
      dataConclusaoG1: params.dataConclusao,
      g1HistoricoId: id,
    });
  }

  return {
    id,
    action: 'insert',
    row: await getQualificacaoHistoricoById(db, id, params.empresaId),
  };
}
