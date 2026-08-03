type OrigemEventoExterno = 'simuladores' | 'funcionario_ferias' | 'treinamento';

interface ReplaceManagedEscalaEventsParams {
  db: D1Database;
  empresaId?: string | number | null;
  funcionarioId: string | number;
  origem: OrigemEventoExterno;
  linkId: string;
  tipoEvento: string;
  dataInicio: string;
  dataFim: string;
  createdBy: string;
  status?: 'confirmado' | 'pendente' | 'cancelado';
  local?: string | null;
  aeronave?: string | null;
  simuladorId?: string | number | null;
  observacoes?: string | null;
  motivoAutomatico: string;
  replaceAutoTipos?: string[];
}

interface RemoveManagedEscalaEventsParams {
  db: D1Database;
  funcionarioId: string | number;
  origem: OrigemEventoExterno;
  linkId: string;
}

interface SyncFuncionarioFeriasForMonthParams {
  db: D1Database;
  empresaId?: string | number | null;
  ano: number;
  mes: number;
}

function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getMonthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  return { start, end };
}

function getSegmentBounds(dataInicio: string, dataFim: string, year: number, month: number) {
  const { start, end } = getMonthBounds(year, month);
  const rangeStart = parseIsoDate(dataInicio);
  const rangeEnd = parseIsoDate(dataFim);
  const segmentStart = rangeStart > start ? rangeStart : start;
  const segmentEnd = rangeEnd < end ? rangeEnd : end;

  if (segmentStart > segmentEnd) {
    return null;
  }

  return {
    dataInicio: formatIsoDate(segmentStart),
    dataFim: formatIsoDate(segmentEnd),
  };
}

function getMonthsBetween(dataInicio: string, dataFim: string) {
  const cursor = parseIsoDate(dataInicio);
  const end = parseIsoDate(dataFim);
  cursor.setUTCDate(1);
  end.setUTCDate(1);

  const months: Array<{ ano: number; mes: number }> = [];
  while (cursor <= end) {
    months.push({ ano: cursor.getUTCFullYear(), mes: cursor.getUTCMonth() + 1 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function monthKey(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function monthKeyFromDate(dateIso: string): string {
  const d = parseIsoDate(dateIso);
  return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

async function getEscalaMensalId(
  db: D1Database,
  empresaId: string | number | null | undefined,
  ano: number,
  mes: number,
) {
  const row = await db
    .prepare(
      `SELECT id
         FROM escalas_mensais
        WHERE ano = ?
          AND mes = ?
          AND deleted_at IS NULL
          AND (? IS NULL OR empresa_id = ?)
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
    )
    .bind(ano, mes, empresaId ?? null, empresaId ?? null)
    .first<{ id: string }>();

  return row?.id || null;
}

/**
 * Pre-fetch all escala IDs needed for a set of dates (Fix R3: N+1 elimination).
 * Returns a Map keyed by 'yyyy-MM' → escalaId | null.
 */
async function buildMonthEscalaMap(
  db: D1Database,
  empresaId: string | number | null | undefined,
  dates: string[],
): Promise<Map<string, string | null>> {
  const uniqueKeys = new Set(dates.map(monthKeyFromDate));
  const map = new Map<string, string | null>();

  await Promise.all(
    [...uniqueKeys].map(async (key) => {
      const [ano, mes] = key.split('-').map(Number);
      const id = await getEscalaMensalId(db, empresaId, ano, mes);
      map.set(key, id);
    }),
  );

  return map;
}

const INSERT_ESCALA_EVENTO_SQL = `
  INSERT INTO escala_eventos
  (id, escala_id, tripulacao_id, funcionario_id, tipo_evento, data_inicio, data_fim,
   turno, local, aeronave, simulador_id, gerado_automaticamente, motivo_automatico, status,
   origem, observacoes, created_by, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'dia_todo', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
`;

export async function removeManagedEscalaEvents(
  params: RemoveManagedEscalaEventsParams,
): Promise<number> {
  const now = new Date().toISOString();
  const statement = params.db
    .prepare(
      `UPDATE escala_eventos
          SET deleted_at = ?, updated_at = ?
        WHERE funcionario_id = ?
          AND origem = ?
          AND tripulacao_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(now, now, String(params.funcionarioId), params.origem, params.linkId);
  const [result] = await params.db.batch([statement] as Parameters<typeof params.db.batch>[0]);

  return result?.meta?.changes ?? 0;
}

export async function replaceManagedEscalaEvents(
  params: ReplaceManagedEscalaEventsParams,
): Promise<number> {
  await removeManagedEscalaEvents({
    db: params.db,
    funcionarioId: params.funcionarioId,
    origem: params.origem,
    linkId: params.linkId,
  });

  const now = new Date().toISOString();
  const months = getMonthsBetween(params.dataInicio, params.dataFim);
  const replaceAutoTipos = params.replaceAutoTipos || [];
  let totalEventos = 0;

  for (const monthRef of months) {
    const escalaId = await getEscalaMensalId(
      params.db,
      params.empresaId,
      monthRef.ano,
      monthRef.mes,
    );

    if (!escalaId) {
      continue;
    }

    const segment = getSegmentBounds(params.dataInicio, params.dataFim, monthRef.ano, monthRef.mes);
    if (!segment) {
      continue;
    }

    if (replaceAutoTipos.length > 0) {
      const placeholders = replaceAutoTipos.map(() => '?').join(', ');
      await params.db
        .prepare(
          `UPDATE escala_eventos
              SET deleted_at = ?, updated_at = ?
            WHERE escala_id = ?
              AND funcionario_id = ?
              AND gerado_automaticamente = 1
              AND deleted_at IS NULL
              AND tipo_evento IN (${placeholders})
              AND NOT (data_fim < ? OR data_inicio > ?)`,
        )
        .bind(
          now,
          now,
          escalaId,
          String(params.funcionarioId),
          ...replaceAutoTipos,
          segment.dataInicio,
          segment.dataFim,
        )
        .run();
    }

    await params.db
      .prepare(INSERT_ESCALA_EVENTO_SQL)
      .bind(
        crypto.randomUUID(),
        escalaId,
        params.linkId,
        String(params.funcionarioId),
        params.tipoEvento,
        segment.dataInicio,
        segment.dataFim,
        params.local || null,
        params.aeronave || null,
        params.simuladorId != null ? String(params.simuladorId) : null,
        params.motivoAutomatico,
        params.status || 'confirmado',
        params.origem,
        params.observacoes || null,
        params.createdBy,
        now,
        now,
      )
      .run();

    totalEventos += 1;
  }

  return totalEventos;
}

export async function syncFuncionarioFeriasForMonth(
  params: SyncFuncionarioFeriasForMonthParams,
): Promise<number> {
  const { db, empresaId, ano, mes } = params;
  const { start, end } = getMonthBounds(ano, mes);
  const dataInicioMes = formatIsoDate(start);
  const dataFimMes = formatIsoDate(end);

  const rows = await db
    .prepare(
      `SELECT
         ff.id,
         ff.funcionario_id,
         ff.data_inicio,
         ff.data_fim,
         ff.tipo,
         ff.observacoes,
         COALESCE(ff.criado_por, 'system') AS criado_por
       FROM funcionario_ferias ff
       JOIN funcionarios f ON f.id = ff.funcionario_id AND f.deleted_at IS NULL
       WHERE ff.deleted_at IS NULL
         AND NOT (ff.data_fim < ? OR ff.data_inicio > ?)
         AND (? IS NULL OR f.empresa_id = ?)`,
    )
    .bind(dataInicioMes, dataFimMes, empresaId ?? null, empresaId ?? null)
    .all<{
      id: string;
      funcionario_id: string | number;
      data_inicio: string;
      data_fim: string;
      tipo: string | null;
      observacoes: string | null;
      criado_por: string | null;
    }>();

  let total = 0;

  for (const row of rows.results || []) {
    total += await replaceManagedEscalaEvents({
      db,
      empresaId,
      funcionarioId: row.funcionario_id,
      origem: 'funcionario_ferias',
      linkId: `func_ferias:${row.id}`,
      tipoEvento: (row.tipo || 'FERIAS').toUpperCase() === 'AFT' ? 'licenca' : 'ferias',
      dataInicio: row.data_inicio,
      dataFim: row.data_fim,
      createdBy: row.criado_por || 'system',
      status: 'confirmado',
      observacoes: row.observacoes,
      motivoAutomatico:
        'Gerado automaticamente a partir do lançamento global de férias/afastamento.',
      replaceAutoTipos: ['voo', 'folga'],
    });
  }

  return total;
}

/**
 * Sync a treinamentos_planejados record into escala_eventos so it appears in
 * the monthly crew grid (GradeTripulantes via buildSyntheticAlocacoesFromEventos).
 *
 * Covers participants AND instructors (Fix R1).
 * Uses per-day events when diasEfetivos are supplied (Fix R2).
 * Pre-caches escala IDs and batches INSERTs (Fix R3 — N+1 elimination).
 *
 * Called after every POST/PATCH/cancellation in the training module.
 */
export async function syncTreinamentoToEscalaEventos(params: {
  db: D1Database;
  empresaId: string | number | null | undefined;
  treinamentoId: number;
  /** Fallback date range when diasEfetivos is absent (legacy single-day trainings). */
  dataInicio: string;
  dataFim: string;
  /**
   * Specific effective days from treinamentos_dias. When provided the sync
   * creates one event PER DAY instead of a continuous range — avoids marking
   * gaps between days as CURSO in the monthly grid. (Fix R2)
   */
  diasEfetivos?: string[];
  status: string;
  titulo: string | null;
  codigoTurma: string | null;
  /** Enrolled participants. */
  participanteIds: number[];
  /** Instructors from treinamentos_instrutores + legacy instrutor_id. (Fix R1) */
  instrutorIds?: number[];
  removedParticipantIds?: number[];
  /** Instructors removed from the training. (Fix R1) */
  removedInstrutorIds?: number[];
  createdBy: string;
}): Promise<void> {
  const {
    db,
    empresaId,
    treinamentoId,
    dataInicio,
    dataFim,
    diasEfetivos,
    status,
    titulo,
    codigoTurma,
    participanteIds,
    instrutorIds = [],
    removedParticipantIds = [],
    removedInstrutorIds = [],
    createdBy,
  } = params;

  const linkId = `treinamento:${treinamentoId}`;
  const observacoes =
    [titulo, codigoTurma ? `[${codigoTurma}]` : null].filter(Boolean).join(' ') || null;

  // Deduplicate: a person who is both participant and instructor needs only one event.
  const allCurrentIds = [...new Set([...participanteIds, ...instrutorIds])];
  const allRemovedIds = [...new Set([...removedParticipantIds, ...removedInstrutorIds])];

  // --- Step 1: Remove events for people who left the training (Fix R1 includes instructors) ---
  await Promise.all(
    allRemovedIds.map((funcionarioId) =>
      removeManagedEscalaEvents({ db, funcionarioId, origem: 'treinamento', linkId }),
    ),
  );

  if (status === 'CANCELADO') {
    await Promise.all(
      allCurrentIds.map((funcionarioId) =>
        removeManagedEscalaEvents({ db, funcionarioId, origem: 'treinamento', linkId }),
      ),
    );
    return;
  }

  if (allCurrentIds.length === 0) return;

  const statusEvento: 'confirmado' | 'pendente' =
    status === 'CONFIRMADO' || status === 'EM_ANDAMENTO' || status === 'CONCLUIDO'
      ? 'confirmado'
      : 'pendente';

  // --- Step 2: Remove existing events for all current people (before re-creating) ---
  await Promise.all(
    allCurrentIds.map((funcionarioId) =>
      removeManagedEscalaEvents({ db, funcionarioId, origem: 'treinamento', linkId }),
    ),
  );

  // --- Step 3: Pre-cache escala IDs (Fix R3 — one DB round-trip per month, not N×M) ---
  const effectiveDates: string[] =
    diasEfetivos && diasEfetivos.length > 0 ? diasEfetivos : buildRangeDates(dataInicio, dataFim);

  if (effectiveDates.length === 0) return;

  const monthEscalaMap = await buildMonthEscalaMap(db, empresaId, effectiveDates);

  // --- Step 4: Collect INSERT statements for every (person × date) pair ---
  const now = new Date().toISOString();
  const motivoAutomatico =
    'Gerado automaticamente a partir do treinamento planejado. Gerencie no módulo Treinamentos.';

  const insertStmts: ReturnType<D1Database['prepare']>[] = [];

  if (diasEfetivos && diasEfetivos.length > 0) {
    // Per-day events: one event per person per effective day (Fix R2)
    for (const data of diasEfetivos) {
      const escalaId = monthEscalaMap.get(monthKeyFromDate(data));
      if (!escalaId) continue;

      for (const funcionarioId of allCurrentIds) {
        insertStmts.push(
          db
            .prepare(INSERT_ESCALA_EVENTO_SQL)
            .bind(
              crypto.randomUUID(),
              escalaId,
              linkId,
              String(funcionarioId),
              'treinamento_solo',
              data,
              data,
              null,
              null,
              null,
              motivoAutomatico,
              statusEvento,
              'treinamento',
              observacoes,
              createdBy,
              now,
              now,
            ),
        );
      }
    }
  } else {
    // Range events: one event per month per person (legacy / single-day trainings)
    const months = getMonthsBetween(dataInicio, dataFim);
    for (const monthRef of months) {
      const escalaId = monthEscalaMap.get(monthKey(monthRef.ano, monthRef.mes));
      if (!escalaId) continue;

      const segment = getSegmentBounds(dataInicio, dataFim, monthRef.ano, monthRef.mes);
      if (!segment) continue;

      for (const funcionarioId of allCurrentIds) {
        insertStmts.push(
          db
            .prepare(INSERT_ESCALA_EVENTO_SQL)
            .bind(
              crypto.randomUUID(),
              escalaId,
              linkId,
              String(funcionarioId),
              'treinamento_solo',
              segment.dataInicio,
              segment.dataFim,
              null,
              null,
              null,
              motivoAutomatico,
              statusEvento,
              'treinamento',
              observacoes,
              createdBy,
              now,
              now,
            ),
        );
      }
    }
  }

  // --- Step 5: Batch-execute all INSERTs (Fix R3 — single round-trip) ---
  if (insertStmts.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < insertStmts.length; i += BATCH_SIZE) {
      await db.batch(insertStmts.slice(i, i + BATCH_SIZE) as Parameters<typeof db.batch>[0]);
    }
  }
}

/**
 * Expand a date range into individual ISO-date strings.
 * Used as fallback when no explicit diasEfetivos are provided.
 */
function buildRangeDates(dataInicio: string, dataFim: string): string[] {
  const dates: string[] = [];
  const cursor = parseIsoDate(dataInicio);
  const end = parseIsoDate(dataFim);
  while (cursor <= end) {
    dates.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
