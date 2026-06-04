type OrigemEventoExterno = 'simuladores' | 'funcionario_ferias';

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

export async function removeManagedEscalaEvents(
  params: RemoveManagedEscalaEventsParams,
): Promise<number> {
  const now = new Date().toISOString();
  const result = await params.db
    .prepare(
      `UPDATE escala_eventos
          SET deleted_at = ?, updated_at = ?
        WHERE funcionario_id = ?
          AND origem = ?
          AND tripulacao_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(now, now, String(params.funcionarioId), params.origem, params.linkId)
    .run();

  return result.meta?.changes ?? 0;
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
      .prepare(
        `INSERT INTO escala_eventos
         (id, escala_id, tripulacao_id, funcionario_id, tipo_evento, data_inicio, data_fim,
          turno, local, aeronave, simulador_id, gerado_automaticamente, motivo_automatico, status,
          origem, observacoes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'dia_todo', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
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
