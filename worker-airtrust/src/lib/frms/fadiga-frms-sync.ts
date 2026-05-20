import { calcularFatorRepouso, horasSonoParaMinutos } from './fadiga-score';

export interface SyncResult {
  sincronizado: boolean;
  jornada_id?: string;
  effectiveness_anterior?: number | null;
  effectiveness_nova?: number | null;
  delta_effectiveness?: number | null;
}

function parseTimeToMinutes(value: string): number | null {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function minutesToTime(value: number): string {
  const normalized = ((value % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function calcularNivelEffectiveness(effectivenessPct: number): string {
  if (effectivenessPct >= 90) return 'VERDE';
  if (effectivenessPct >= 65) return 'AMARELO';
  return 'VERMELHO';
}

export async function sincronizarCheckinComFrms(
  db: D1Database,
  checkinId: string,
  funcionarioId: number,
  dataCheckin: string,
  horasSono: number,
  empresaId: number,
): Promise<SyncResult> {
  const jornada = await db
    .prepare(
      `SELECT fj.id, fj.hora_apresentacao
       FROM frms_jornada fj
       JOIN funcionarios f ON f.id = fj.tripulante_id AND f.deleted_at IS NULL
       WHERE fj.tripulante_id = ?
         AND fj.data = ?
         AND fj.deleted_at IS NULL
         AND f.empresa_id = ?
         AND fj.status IN ('ES','TS','TV','EX','RE','SA')
       LIMIT 1`,
    )
    .bind(funcionarioId, dataCheckin, empresaId)
    .first<{ id: string; hora_apresentacao: string | null }>();

  if (!jornada?.id) {
    const existing = await db
      .prepare(
        `SELECT id
         FROM frms_fadiga_evento
         WHERE empresa_id = ? AND checkin_id = ? AND tipo = 'CHECKIN_SEM_JORNADA'
         LIMIT 1`,
      )
      .bind(empresaId, checkinId)
      .first<{ id: string }>();

    if (!existing?.id) {
      await db
        .prepare(
          `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
           VALUES (?, ?, ?, 'CHECKIN_SEM_JORNADA', ?, datetime('now'))`,
        )
        .bind(
          crypto.randomUUID(),
          empresaId,
          checkinId,
          JSON.stringify({ funcionario_id: funcionarioId, data_checkin: dataCheckin }),
        )
        .run();
    }

    return { sincronizado: false };
  }

  const fatorizacao = await db
    .prepare(
      `SELECT id, fator_repouso_pct, effectiveness_pct
       FROM frms_fatorizacao_jornada
       WHERE jornada_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(jornada.id)
    .first<{ id: string; fator_repouso_pct: number | null; effectiveness_pct: number | null }>();

  if (!fatorizacao?.id) {
    const existing = await db
      .prepare(
        `SELECT id
         FROM frms_fadiga_evento
         WHERE empresa_id = ? AND checkin_id = ? AND tipo = 'FRMS_SYNC_SEM_FATORIZACAO'
         LIMIT 1`,
      )
      .bind(empresaId, checkinId)
      .first<{ id: string }>();

    if (!existing?.id) {
      await db
        .prepare(
          `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
           VALUES (?, ?, ?, 'FRMS_SYNC_SEM_FATORIZACAO', ?, datetime('now'))`,
        )
        .bind(crypto.randomUUID(), empresaId, checkinId, JSON.stringify({ jornada_id: jornada.id }))
        .run();
    }

    return { sincronizado: false, jornada_id: jornada.id };
  }

  const duracaoSonoMin = horasSonoParaMinutos(horasSono);
  const fatorRepousoNovo = calcularFatorRepouso(duracaoSonoMin);
  const fatorRepousoAnterior = fatorizacao.fator_repouso_pct ?? 0;
  const effectivenessAnterior = fatorizacao.effectiveness_pct ?? null;

  let effectivenessNova = effectivenessAnterior;
  if (typeof effectivenessAnterior === 'number') {
    effectivenessNova = Math.max(
      0,
      Math.min(100, effectivenessAnterior - fatorRepousoAnterior * 100 + fatorRepousoNovo * 100),
    );
  }

  const startMinutes = parseTimeToMinutes(jornada.hora_apresentacao ?? '00:00') ?? 0;
  const wakeMinutes = startMinutes - 60;
  const sleepStartMinutes = wakeMinutes - duracaoSonoMin;

  await db
    .prepare(
      `UPDATE frms_fatorizacao_jornada
       SET duracao_sono_efetiva_min = ?,
           hora_despertar_estimada = ?,
           hora_inicio_sono_estimado = ?,
           fator_repouso_pct = ?,
           effectiveness_pct = ?,
           effectiveness_nivel = ?,
           processado_com_bug = 0,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      duracaoSonoMin,
      minutesToTime(wakeMinutes),
      minutesToTime(sleepStartMinutes),
      fatorRepousoNovo,
      effectivenessNova,
      effectivenessNova == null ? null : calcularNivelEffectiveness(effectivenessNova),
      fatorizacao.id,
    )
    .run();

  const syncPayload = {
    jornada_id: jornada.id,
    fator_anterior: fatorRepousoAnterior,
    fator_novo: fatorRepousoNovo,
    effectiveness_anterior: effectivenessAnterior,
    effectiveness_nova: effectivenessNova,
    duracao_sono_min: duracaoSonoMin,
  };

  const existingSyncEvent = await db
    .prepare(
      `SELECT id
       FROM frms_fadiga_evento
       WHERE empresa_id = ? AND checkin_id = ? AND tipo = 'FRMS_SYNC'
       LIMIT 1`,
    )
    .bind(empresaId, checkinId)
    .first<{ id: string }>();

  if (existingSyncEvent?.id) {
    await db
      .prepare(
        `UPDATE frms_fadiga_evento
         SET payload_json = ?, created_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(JSON.stringify(syncPayload), existingSyncEvent.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
         VALUES (?, ?, ?, 'FRMS_SYNC', ?, datetime('now'))`,
      )
      .bind(crypto.randomUUID(), empresaId, checkinId, JSON.stringify(syncPayload))
      .run();
  }

  return {
    sincronizado: true,
    jornada_id: jornada.id,
    effectiveness_anterior: effectivenessAnterior,
    effectiveness_nova: effectivenessNova,
    delta_effectiveness:
      effectivenessAnterior == null || effectivenessNova == null
        ? null
        : effectivenessNova - effectivenessAnterior,
  };
}
