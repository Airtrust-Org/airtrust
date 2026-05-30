import { horasSonoParaMinutos } from './fadiga-score';
import { carregarLimites } from './db-service-config';
import { resolverFrmsConfig } from './frms-config';
import { calcEffectiveness, hhmmToMinutes, minutesToHhmm } from './calculos';

export interface SyncResult {
  sincronizado: boolean;
  jornada_id?: string;
  effectiveness_anterior?: number | null;
  effectiveness_nova?: number | null;
  delta_effectiveness?: number | null;
}

// Kept for backwards-compatibility with external consumers.
export function calcularNivelEffectiveness(effectivenessPct: number): string {
  if (effectivenessPct >= 90) return 'VERDE';
  if (effectivenessPct >= 65) return 'AMARELO';
  return 'VERMELHO';
}

type JornadaRow = {
  id: string;
  hora_apresentacao: string | null;
  hora_primeira_decolagem: string | null;
  hora_ultimo_pouso: string | null;
  hora_corte_motor: string | null;
  hora_termino: string | null;
};

type FatorizacaoRow = {
  id: string;
  fator_basica_pct: number;
  fator_apresentacao_pct: number;
  fator_duracao_pct: number;
  fator_repouso_pct: number;
  fator_noturno_dep_pct: number;
  fator_noturno_arr_pct: number;
  fator_ciclo_embarcado_pct: number;
  fator_base_away_pct: number | null;
  fator_aclimatacao_pct: number | null;
  total_fatorizado_jornada: number;
  fator_hv_basica_pct: number | null;
  fator_hv_quantidade_pct: number | null;
  fator_hv_noturno_dep_pct: number | null;
  fator_hv_noturno_arr_pct: number | null;
  total_fatorizado_hv: number | null;
  effectiveness_pct: number | null;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
};

export async function sincronizarCheckinComFrms(
  db: D1Database,
  checkinId: string,
  funcionarioId: number,
  dataCheckin: string,
  horasSono: number,
  empresaId: number,
  wakeTimeReal?: string | null,
): Promise<SyncResult> {
  const jornada = await db
    .prepare(
      `SELECT fj.id, fj.hora_apresentacao,
              fj.hora_primeira_decolagem, fj.hora_ultimo_pouso,
              fj.hora_corte_motor, fj.hora_termino
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
    .first<JornadaRow>();

  if (!jornada?.id) {
    const existing = await db
      .prepare(
        `SELECT id FROM frms_fadiga_evento
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
      `SELECT id,
              fator_basica_pct, fator_apresentacao_pct, fator_duracao_pct,
              fator_repouso_pct, fator_noturno_dep_pct, fator_noturno_arr_pct,
              fator_ciclo_embarcado_pct, fator_base_away_pct, fator_aclimatacao_pct,
              total_fatorizado_jornada,
              fator_hv_basica_pct, fator_hv_quantidade_pct,
              fator_hv_noturno_dep_pct, fator_hv_noturno_arr_pct,
              total_fatorizado_hv,
              effectiveness_pct,
              dia_periodo_embarcado, total_dias_periodo
       FROM frms_fatorizacao_jornada
       WHERE jornada_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(jornada.id)
    .first<FatorizacaoRow>();

  if (!fatorizacao?.id) {
    const existing = await db
      .prepare(
        `SELECT id FROM frms_fadiga_evento
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

  // Without hora_apresentacao the circadian model cannot anchor wake time — do not invent effectiveness.
  if (!jornada.hora_apresentacao) {
    const existing = await db
      .prepare(
        `SELECT id FROM frms_fadiga_evento
         WHERE empresa_id = ? AND checkin_id = ? AND tipo = 'FRMS_RECALCULO_NECESSARIO'
         LIMIT 1`,
      )
      .bind(empresaId, checkinId)
      .first<{ id: string }>();

    if (!existing?.id) {
      await db
        .prepare(
          `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
           VALUES (?, ?, ?, 'FRMS_RECALCULO_NECESSARIO', ?, datetime('now'))`,
        )
        .bind(
          crypto.randomUUID(),
          empresaId,
          checkinId,
          JSON.stringify({ jornada_id: jornada.id, motivo: 'hora_apresentacao_ausente' }),
        )
        .run();
    }

    return { sincronizado: false, jornada_id: jornada.id };
  }

  const limites = await carregarLimites(db);
  const cfgSono = resolverFrmsConfig(limites);

  const duracaoSonoMin = horasSonoParaMinutos(horasSono);

  // Anchor hora_dormiu to the model's standard wake time so that calcEffectiveness
  // receives exactly the reported sleep duration as sonoEfetivoMin.
  const apresentacaoMin = hhmmToMinutes(jornada.hora_apresentacao);
  const standardWakeMin = apresentacaoMin - cfgSono.minutosAntesApresentacao;
  const hora_dormiu = minutesToHhmm(standardWakeMin - duracaoSonoMin);

  const fatResult = {
    fator_basica_pct: fatorizacao.fator_basica_pct,
    fator_apresentacao_pct: fatorizacao.fator_apresentacao_pct,
    fator_duracao_pct: fatorizacao.fator_duracao_pct,
    fator_repouso_pct: fatorizacao.fator_repouso_pct,
    fator_noturno_dep_pct: fatorizacao.fator_noturno_dep_pct,
    fator_noturno_arr_pct: fatorizacao.fator_noturno_arr_pct,
    fator_ciclo_embarcado_pct: fatorizacao.fator_ciclo_embarcado_pct,
    fator_base_away_pct: fatorizacao.fator_base_away_pct ?? 0,
    fator_aclimatacao_pct: fatorizacao.fator_aclimatacao_pct ?? 0,
    total_fatorizado_jornada: fatorizacao.total_fatorizado_jornada,
    fator_hv_basica_pct: fatorizacao.fator_hv_basica_pct ?? 0,
    fator_hv_quantidade_pct: fatorizacao.fator_hv_quantidade_pct ?? 0,
    fator_hv_noturno_dep_pct: fatorizacao.fator_hv_noturno_dep_pct ?? 0,
    fator_hv_noturno_arr_pct: fatorizacao.fator_hv_noturno_arr_pct ?? 0,
    total_fatorizado_hv: fatorizacao.total_fatorizado_hv ?? 0,
  };

  const effectResult = calcEffectiveness(fatResult, limites, {
    hora_apresentacao: jornada.hora_apresentacao,
    hora_primeira_decolagem: jornada.hora_primeira_decolagem ?? null,
    hora_ultimo_pouso: jornada.hora_ultimo_pouso ?? null,
    hora_corte_motor: jornada.hora_corte_motor ?? null,
    hora_termino: jornada.hora_termino ?? null,
    hora_dormiu,
    dia_periodo_embarcado: fatorizacao.dia_periodo_embarcado ?? null,
    total_dias_periodo: fatorizacao.total_dias_periodo ?? null,
  });

  await db
    .prepare(
      `UPDATE frms_fatorizacao_jornada
       SET duracao_sono_efetiva_min  = ?,
           hora_despertar_estimada   = ?,
           hora_inicio_sono_estimado = ?,
           fator_repouso_pct         = ?,
           effectiveness_pct         = ?,
           effectiveness_nivel       = ?,
           effectiveness_componentes_json = ?,
           processado_com_bug        = 0,
           updated_at                = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      effectResult.duracao_sono_efetiva_min,
      effectResult.hora_despertar,
      effectResult.hora_inicio_sono,
      effectResult.fator_repouso_calibrado_pct,
      effectResult.effectiveness_pct,
      effectResult.nivel,
      JSON.stringify(effectResult.componentes),
      fatorizacao.id,
    )
    .run();

  try {
    await db
      .prepare(
        `UPDATE frms_jornada
         SET hora_acordou    = ?,
             sono_efetivo_min = ?,
             fonte_sono       = ?,
             acordou_na_wocl  = ?,
             updated_at       = datetime('now')
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(
        wakeTimeReal ?? effectResult.hora_despertar,
        effectResult.duracao_sono_efetiva_min,
        effectResult.fonte_sono,
        effectResult.acordou_na_wocl ? 1 : 0,
        jornada.id,
      )
      .run();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error ?? '');
    if (!msg.includes('no such column')) throw error;
  }

  const syncPayload = {
    jornada_id: jornada.id,
    effectiveness_anterior: fatorizacao.effectiveness_pct,
    effectiveness_nova: effectResult.effectiveness_pct,
    delta_effectiveness:
      fatorizacao.effectiveness_pct == null
        ? null
        : effectResult.effectiveness_pct - fatorizacao.effectiveness_pct,
    duracao_sono_min: duracaoSonoMin,
    wake_time_source: wakeTimeReal ? 'CREW_REPORTED' : 'FALLBACK_APRESENTACAO_MINUS_CONFIG',
    wake_time_fallback_minutos_antes_apresentacao: wakeTimeReal
      ? null
      : cfgSono.minutosAntesApresentacao,
    hora_dormiu_calculado: hora_dormiu,
    hora_despertar_modelo: effectResult.hora_despertar,
    acordou_na_wocl: effectResult.acordou_na_wocl,
    nivel: effectResult.nivel,
    componentes: effectResult.componentes,
  };

  const existingSyncEvent = await db
    .prepare(
      `SELECT id FROM frms_fadiga_evento
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

  const effectivenessAnterior = fatorizacao.effectiveness_pct ?? null;
  return {
    sincronizado: true,
    jornada_id: jornada.id,
    effectiveness_anterior: effectivenessAnterior,
    effectiveness_nova: effectResult.effectiveness_pct,
    delta_effectiveness:
      effectivenessAnterior == null
        ? null
        : effectResult.effectiveness_pct - effectivenessAnterior,
  };
}
