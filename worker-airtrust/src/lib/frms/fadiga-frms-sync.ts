import { LIMITES_DEFAULT, type FrmsJornada } from './types';
import { recalcularPipeline } from './db-service-jornadas';


export interface SyncResult {
  sincronizado: boolean;
  jornada_id?: string;
  effectiveness_anterior?: number | null;
  effectiveness_nova?: number | null;
  delta_effectiveness?: number | null;
}

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
  hora_acordou: string | null;
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

const EVENTOS_DIAGNOSTICOS_PERMITIDOS = new Set([
  'CHECKIN_SEM_JORNADA',
  'FRMS_SYNC_SEM_FATORIZACAO',
  'FRMS_RECALCULO_NECESSARIO',
]);

async function registrarEventoUnico(
  db: D1Database,
  empresaId: number,
  checkinId: string,
  tipo: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!EVENTOS_DIAGNOSTICOS_PERMITIDOS.has(tipo)) {
    throw new Error('FRMS_EVENT_TYPE_NOT_ALLOWED');
  }
  const existente = await db
    .prepare(
      `SELECT id FROM frms_fadiga_evento
       WHERE empresa_id = ? AND checkin_id = ? AND tipo = ?
       LIMIT 1`,
    )
    .bind(empresaId, checkinId, tipo)
    .first<{ id: string }>();
  if (existente?.id) return;
  await db
    .prepare(
      `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
       VALUES (?, ?, ?, '${tipo}', ?, datetime('now'))`,
    )
    .bind(crypto.randomUUID(), empresaId, checkinId, JSON.stringify(payload))
    .run();
}

export async function sincronizarCheckinComFrms(
  db: D1Database,
  checkinId: string,
  funcionarioId: number,
  dataCheckin: string,
  horasSono: number,
  empresaId: number,
  wakeTimeReal?: string | null,
  presentationTimeReal?: string | null,
): Promise<SyncResult> {
  const jornada = await db
    .prepare(
      `SELECT *
         FROM frms_jornada
        WHERE tripulante_id = ?
          AND data = ?
          AND deleted_at IS NULL
          AND status IN ('ES','TS','TV','EX','RE','SA')
        ORDER BY updated_at DESC
        LIMIT 1`,
    )
    .bind(funcionarioId, dataCheckin)
    .first<FrmsJornada>();

  if (!jornada?.id) {
    await registrarEventoUnico(db, empresaId, checkinId, 'CHECKIN_SEM_JORNADA', {
      funcionario_id: funcionarioId,
      data_checkin: dataCheckin,
    });
    return { sincronizado: false };
  }

  if (
    !presentationTimeReal ||
    !wakeTimeReal ||
    !Number.isFinite(Number(horasSono)) ||
    Number(horasSono) <= 0
  ) {
    await registrarEventoUnico(db, empresaId, checkinId, 'FRMS_RECALCULO_NECESSARIO', {
      jornada_id: jornada.id,
      motivo: 'checkin_diario_incompleto',
    });
    return { sincronizado: false, jornada_id: jornada.id };
  }

  const previous = await db
    .prepare(
      `SELECT effectiveness_pct
         FROM frms_fatorizacao_jornada
        WHERE jornada_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
    )
    .bind(jornada.id)
    .first<{ effectiveness_pct: number | null }>();

  // O pipeline canônico lê apresentação, despertar e sono diretamente do
  // check-in persistido e aplica a regra tenant-scoped de encerramento da jornada.
  // Não há mais fallback de apresentação nem de 8 h de sono.
  const result = await recalcularPipeline(db, jornada, LIMITES_DEFAULT);
  const effectivenessNova = result.fatorizacao.effectiveness_pct ?? null;
  const effectivenessAnterior = previous?.effectiveness_pct ?? null;

  const syncPayload = {
    formula_version: 'FRMS_DAILY_CHECKIN_AUTHORITY_V1',
    jornada_id: jornada.id,
    checkin_id: checkinId,
    presentation_time_source: 'CREW_REPORTED',
    wake_time_source: 'CREW_REPORTED',
    sleep_source: 'CREW_REPORTED',
    hora_apresentacao_efetiva: presentationTimeReal,
    hora_despertar_real: wakeTimeReal,
    horas_sono_24h: Number(horasSono),
    effectiveness_anterior: effectivenessAnterior,
    effectiveness_nova: effectivenessNova,
    delta_effectiveness:
      effectivenessAnterior == null || effectivenessNova == null
        ? null
        : effectivenessNova - effectivenessAnterior,
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
        `INSERT INTO frms_fadiga_evento
          (id, empresa_id, checkin_id, tipo, payload_json, created_at)
        VALUES (?, ?, ?, 'FRMS_SYNC', ?, datetime('now'))`,
      )
      .bind(crypto.randomUUID(), empresaId, checkinId, JSON.stringify(syncPayload))
      .run();
  }

  return {
    sincronizado: effectivenessNova != null,
    jornada_id: jornada.id,
    effectiveness_anterior: effectivenessAnterior,
    effectiveness_nova: effectivenessNova,
    delta_effectiveness:
      effectivenessAnterior == null || effectivenessNova == null
        ? null
        : effectivenessNova - effectivenessAnterior,
  };
}
