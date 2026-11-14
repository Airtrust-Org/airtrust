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

export interface SyncTreinamentosPlanejadosForMonthParams {
  db: D1Database;
  empresaId: string | number | null | undefined;
  ano: number;
  mes: number;
  escalaId?: string | null;
}

const TREINAMENTO_CHUNK_SIZE = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Reconcile pre-existing PLANEJADO/CONFIRMADO trainings into a monthly schedule.
 *
 * Non-destructive and idempotent: never soft-deletes or overwrites existing
 * confirmed/manually edited events, only materializes missing events inside
 * the target tenant and month.
 */
export async function syncTreinamentosPlanejadosForMonth(
  params: SyncTreinamentosPlanejadosForMonthParams,
): Promise<number> {
  const { db, empresaId, ano, mes, escalaId } = params;
  if (empresaId === null || empresaId === undefined || empresaId === '') {
    return 0;
  }

  const targetEscalaId = escalaId || (await getEscalaMensalId(db, empresaId, ano, mes));
  if (!targetEscalaId) {
    return 0;
  }

  const { start, end } = getMonthBounds(ano, mes);
  const dataInicioMes = formatIsoDate(start);
  const dataFimMes = formatIsoDate(end);

  const trainingsRes = await db
    .prepare(
      `SELECT tp.id,
              tp.status,
              tp.titulo,
              tp.codigo_turma,
              tp.data_inicio,
              tp.data_fim,
              tp.data_prevista,
              tp.instrutor_id,
              tp.created_by
         FROM treinamentos_planejados tp
        WHERE tp.empresa_id = ?
          AND tp.deleted_at IS NULL
          AND tp.status IN ('PLANEJADO', 'CONFIRMADO')
          AND (
            EXISTS (
              SELECT 1
                FROM treinamentos_dias td
               WHERE td.treinamento_id = tp.id
                 AND td.empresa_id = tp.empresa_id
                 AND td.deleted_at IS NULL
                 AND td.status = 'ATIVO'
                 AND td.data BETWEEN ? AND ?
            )
            OR (
              NOT EXISTS (
                SELECT 1
                  FROM treinamentos_dias td
                 WHERE td.treinamento_id = tp.id
                   AND td.empresa_id = tp.empresa_id
                   AND td.deleted_at IS NULL
                   AND td.status = 'ATIVO'
              )
              AND COALESCE(tp.data_fim, tp.data_prevista) >= ?
              AND COALESCE(tp.data_inicio, tp.data_prevista) <= ?
            )
          )`,
    )
    .bind(empresaId, dataInicioMes, dataFimMes, dataInicioMes, dataFimMes)
    .all<{
      id: number;
      status: string;
      titulo: string | null;
      codigo_turma: string | null;
      data_inicio: string | null;
      data_fim: string | null;
      data_prevista: string | null;
      instrutor_id: number | null;
      created_by: string | number | null;
    }>();

  const trainings = trainingsRes.results || [];
  if (trainings.length === 0) {
    return 0;
  }

  const peopleByTraining = new Map<number, Set<number>>();
  const daysByTraining = new Map<number, string[]>();
  const existingByKey = new Map<string, Array<{ data_inicio: string; data_fim: string }>>();

  for (const tp of trainings) {
    const people = new Set<number>();
    if (tp.instrutor_id) people.add(Number(tp.instrutor_id));
    peopleByTraining.set(tp.id, people);
  }

  for (const chunk of chunkArray(
    trainings.map((t) => t.id),
    TREINAMENTO_CHUNK_SIZE,
  )) {
    const placeholders = chunk.map(() => '?').join(', ');
    const linkIds = chunk.map((id) => `treinamento:${id}`);

    const [partRes, instRes, diasRes, existingRes] = await Promise.all([
      db
        .prepare(
          `SELECT treinamento_id, funcionario_id
             FROM treinamentos_participantes
            WHERE treinamento_id IN (${placeholders})
              AND COALESCE(status_participacao, 'MATRICULADO') != 'CANCELADO'`,
        )
        .bind(...chunk)
        .all<{ treinamento_id: number; funcionario_id: number }>(),
      db
        .prepare(
          `SELECT treinamento_id, funcionario_id
             FROM treinamentos_instrutores
            WHERE treinamento_id IN (${placeholders})
              AND empresa_id = ?`,
        )
        .bind(...chunk, empresaId)
        .all<{ treinamento_id: number; funcionario_id: number }>(),
      db
        .prepare(
          `SELECT treinamento_id, data
             FROM treinamentos_dias
            WHERE treinamento_id IN (${placeholders})
              AND empresa_id = ?
              AND deleted_at IS NULL
              AND status = 'ATIVO'
              AND data BETWEEN ? AND ?
            ORDER BY data`,
        )
        .bind(...chunk, empresaId, dataInicioMes, dataFimMes)
        .all<{ treinamento_id: number; data: string }>(),
      db
        .prepare(
          `SELECT tripulacao_id, funcionario_id, data_inicio, data_fim
             FROM escala_eventos
            WHERE escala_id = ?
              AND deleted_at IS NULL
              AND tripulacao_id IN (${placeholders})`,
        )
        .bind(targetEscalaId, ...linkIds)
        .all<{
          tripulacao_id: string;
          funcionario_id: string;
          data_inicio: string;
          data_fim: string;
        }>(),
    ]);

    for (const row of [...(partRes.results || []), ...(instRes.results || [])]) {
      const idNum = Number(row.funcionario_id);
      if (idNum) {
        peopleByTraining.get(row.treinamento_id)?.add(idNum);
      }
    }
    for (const row of diasRes.results || []) {
      const list = daysByTraining.get(row.treinamento_id) || [];
      list.push(row.data);
      daysByTraining.set(row.treinamento_id, list);
    }
    for (const row of existingRes.results || []) {
      const key = `${row.tripulacao_id}::${String(row.funcionario_id)}`;
      const list = existingByKey.get(key) || [];
      list.push({ data_inicio: row.data_inicio, data_fim: row.data_fim });
      existingByKey.set(key, list);
    }
  }

  const now = new Date().toISOString();
  const motivoAutomatico =
    'Gerado automaticamente a partir do treinamento planejado. Gerencie no módulo Treinamentos.';
  const insertStmts: ReturnType<D1Database['prepare']>[] = [];
  const seenKeys = new Set<string>();

  for (const tp of trainings) {
    const people = peopleByTraining.get(tp.id);
    if (!people || people.size === 0) continue;

    const linkId = `treinamento:${tp.id}`;
    const observacoes =
      [tp.titulo, tp.codigo_turma ? `[${tp.codigo_turma}]` : null].filter(Boolean).join(' ') || null;
    const statusEvento: 'confirmado' | 'pendente' =
      tp.status === 'CONFIRMADO' ? 'confirmado' : 'pendente';
    const createdBy = String(tp.created_by || 'system');

    const dias = daysByTraining.get(tp.id);
    const segments: Array<{ dataInicio: string; dataFim: string }> =
      dias && dias.length > 0
        ? dias.map((d) => ({ dataInicio: d, dataFim: d }))
        : (() => {
            const startDate = tp.data_inicio || tp.data_prevista;
            const endDate = tp.data_fim || tp.data_prevista;
            if (!startDate || !endDate) return [];
            const seg = getSegmentBounds(startDate, endDate, ano, mes);
            return seg ? [seg] : [];
          })();

    for (const seg of segments) {
      for (const funcionarioId of people) {
        const funcKey = String(funcionarioId);
        const dedupKey = `${linkId}::${funcKey}::${seg.dataInicio}::${seg.dataFim}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        const existing = existingByKey.get(`${linkId}::${funcKey}`) || [];
        const alreadyCovered = existing.some(
          (row) => !(row.data_fim < seg.dataInicio || row.data_inicio > seg.dataFim),
        );
        if (alreadyCovered) continue;

        insertStmts.push(
          db
            .prepare(INSERT_ESCALA_EVENTO_SQL)
            .bind(
              crypto.randomUUID(),
              targetEscalaId,
              linkId,
              funcKey,
              'treinamento_solo',
              seg.dataInicio,
              seg.dataFim,
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

  if (insertStmts.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < insertStmts.length; i += BATCH_SIZE) {
      await db.batch(insertStmts.slice(i, i + BATCH_SIZE) as Parameters<typeof db.batch>[0]);
    }
  }

  return insertStmts.length;
}
