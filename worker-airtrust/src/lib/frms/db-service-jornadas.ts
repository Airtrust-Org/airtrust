/**
 * FRMS — CRUD de jornadas, pipeline de cálculo e reprocessamento (D1)
 */

import { LIMITES_DEFAULT, type FrmsJornada, type LimitesMap, type FrmsFatorizacao } from './types';
import {
  calcFatorizacao,
  calcEffectiveness,
  calcAcumuloRolling,
  calcDuracaoJornada,
  calcDuracaoMinutos,
  validarRepousoPlataforma,
  diasNoMes,
} from './calculos';
import type { AcumuloRollingResult } from './calculos';
import { processarAlertas, deveBloquearLancamento } from './alertas';
import type { AlertaGerado } from './alertas';
import { calcularLinhaFadigaAcumulada } from './fadiga-acumulada-legal';
import { generateId, now, logAuditoria, buscarHistoricoJornadas } from './db-service-shared';
import { despacharNotificacoes } from './db-service-notificacoes';
import { resolveFrmsOperationalContext } from './parameter-governance';
import { resolveFrmsSourceStatus, shouldUseForOperationalFrms } from './frms-source-policy';
import { resolveFuncionarioActiveFortnightForDate } from '../escalas/active-fortnight';
import {
  runFrmsIogpShadowForJornada,
  type FrmsIogpShadowCallerEnv,
} from './frms-iogp-shadow-caller';
// ────────────────────────────────────────────────────────
// Período embarcado
// ────────────────────────────────────────────────────────

export interface PeriodoEmbarcadoCalculado {
  dia: number;
  total: number;
}

interface PeriodoEmbarcadoFonte {
  data_inicio: string | null;
  data_fim: string | null;
  quinzena_data_inicio?: string | null;
  quinzena_data_fim?: string | null;
}

export function calcularPeriodoEmbarcadoPorFaixa(
  dataReferencia: string,
  fonte: PeriodoEmbarcadoFonte | null | undefined,
): PeriodoEmbarcadoCalculado | null {
  if (!fonte) return null;

  const hasQuinzenaRange = Boolean(fonte.quinzena_data_inicio && fonte.quinzena_data_fim);
  const hasAlocacaoRange = Boolean(fonte.data_inicio && fonte.data_fim);

  const dataInicio = hasQuinzenaRange ? fonte.quinzena_data_inicio : fonte.data_inicio;
  const dataFim = hasQuinzenaRange ? fonte.quinzena_data_fim : fonte.data_fim;

  if (
    (!hasQuinzenaRange && !hasAlocacaoRange) ||
    !dataInicio ||
    !dataFim ||
    dataReferencia < dataInicio ||
    dataReferencia > dataFim
  ) {
    return null;
  }

  const inicio = new Date(dataInicio + 'T00:00:00');
  const fim = new Date(dataFim + 'T00:00:00');
  const ref = new Date(dataReferencia + 'T00:00:00');

  const total = Math.floor((fim.getTime() - inicio.getTime()) / 86400000) + 1;
  const dia = Math.floor((ref.getTime() - inicio.getTime()) / 86400000) + 1;

  if (total < 1 || dia < 1 || dia > total) return null;

  return { dia, total };
}

// ────────────────────────────────────────────────────────
// Interfaces públicas
// ────────────────────────────────────────────────────────

export interface SalvarJornadaInput {
  tripulante_id: string;
  empresa_id?: number | null;
  data: string;
  status: string;
  hora_apresentacao?: string | null;
  hora_termino?: string | null;
  horas_voo_minutos?: number | null;
  hora_primeiro_acionamento?: string | null;
  hora_primeira_decolagem?: string | null;
  hora_ultimo_pouso?: string | null;
  hora_corte_motor?: string | null;
  hora_dormiu?: string | null;
  repouso_plataforma_inicio?: string | null;
  repouso_plataforma_fim?: string | null;
  observacao?: string | null;
  registrado_por: string;
  origem?: string;
  local_base?: string | null;
  // Campos avançados (migration 0216)
  tipo_base?: 'HOME' | 'AWAY' | null;
  tripulacao_aumentada?: number | null;
  classe_cabine?: 'ECONOMY' | 'BUSINESS' | null;
  aclimatado?: number | null;
}

export interface SalvarJornadaResult {
  jornada: FrmsJornada;
  fatorizacao: FatorizacaoRow;
  acumulo: AcumuloRollingResult;
  alertas: AlertaGerado[];
  bloqueado: boolean;
}

interface FatorizacaoRow extends FrmsFatorizacao {
  /** Canonical effectiveness result, adapted by the IOGP observer only. */
  effectiveness_nivel?: string | null;
  effectiveness_pct?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface JornadaFatigueSnapshot {
  pct_jornada_diaria: number | null;
  pct_voo_diaria: number | null;
  pct_jornada_mes: number | null;
  pct_voo_mes: number | null;
  integridade_status: 'OK' | 'INCONSISTENTE';
  integridade_codigo: string | null;
  integridade_codigos: string[];
  integridade_mensagem: string | null;
  inconsistencias: string[];
}

async function resolveTripulanteEmpresaId(
  db: D1Database,
  tripulanteId: string | number,
  empresaId?: number | null,
): Promise<number> {
  if (empresaId != null && Number.isFinite(Number(empresaId)) && Number(empresaId) > 0) {
    return Number(empresaId);
  }

  const row = await db
    .prepare(
      `SELECT empresa_id
         FROM funcionarios
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(tripulanteId)
    .first<{ empresa_id: number | null }>();

  if (!row?.empresa_id) {
    throw new Error(`FRMS_TENANT_NOT_FOUND tripulante_id=${tripulanteId}`);
  }

  return Number(row.empresa_id);
}

// ────────────────────────────────────────────────────────
// Pipeline de recálculo (interna, exported for cross-module use)
// ────────────────────────────────────────────────────────

export async function recalcularPipeline(
  db: D1Database,
  jornada: FrmsJornada,
  limites: LimitesMap,
  provenance?: { configRevisionId: string; modelVersion: string },
): Promise<{
  fatorizacao: FatorizacaoRow;
  acumulo: AcumuloRollingResult;
  alertas: AlertaGerado[];
  bloqueado: boolean;
}> {
  if (!shouldUseForOperationalFrms(jornada)) {
    const acumuloVazio: AcumuloRollingResult = {
      hv_7_dias_min: 0,
      hv_28_dias_min: 0,
      hv_365_dias_min: 0,
      hv_mes_calendario_min: 0,
      hv_dia_min: 0,
      pct_limite_7d: 0,
      pct_limite_28d: 0,
      pct_limite_mes_calendario: 0,
      pct_limite_365d: 0,
      pct_limite_dia: 0,
      repouso_anterior_min: -1,
      repouso_suficiente: 1,
    };
    const timestamp = now();
    const fatorizacao: FatorizacaoRow = {
      id: `non-operational-${jornada.id}`,
      jornada_id: jornada.id,
      processado_com_bug: 0,
      fator_basica_pct: 0,
      fator_apresentacao_pct: 0,
      fator_duracao_pct: 0,
      fator_repouso_pct: 0,
      fator_noturno_dep_pct: 0,
      fator_noturno_arr_pct: 0,
      fator_ciclo_embarcado_pct: 0,
      fator_base_away_pct: 0,
      fator_aclimatacao_pct: 0,
      total_fatorizado_jornada: 0,
      fator_hv_basica_pct: 0,
      fator_hv_quantidade_pct: 0,
      fator_hv_noturno_dep_pct: 0,
      fator_hv_noturno_arr_pct: 0,
      total_fatorizado_hv: 0,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };
    return { fatorizacao, acumulo: acumuloVazio, alertas: [], bloqueado: false };
  }

  const operationalContext = await resolveFrmsOperationalContext(db, {
    empresaId: await resolveTripulanteEmpresaId(db, jornada.tripulante_id),
    referenceAt: jornada.data,
    jornadaId: jornada.id,
  });
  limites = operationalContext.parameters as unknown as LimitesMap;
  provenance = {
    configRevisionId: operationalContext.configRevisionId,
    modelVersion: operationalContext.modelVersion,
  };

  // Garantir consistência pós-regra de almoço: duração sempre recalculada pelos horários
  const duracaoRecalculada = calcDuracaoJornada(jornada);
  if (jornada.duracao_jornada_minutos !== duracaoRecalculada) {
    await db
      .prepare(
        `UPDATE frms_jornada
         SET duracao_jornada_minutos = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(duracaoRecalculada, now(), jornada.id)
      .run();
    jornada.duracao_jornada_minutos = duracaoRecalculada;
  }

  // 1. Buscar histórico para fatorização (repouso anterior)
  const historico = await buscarHistoricoJornadas(db, jornada.tripulante_id, jornada.data, 365);

  // 2. Calcular repouso anterior
  const acumulo = calcAcumuloRolling({
    tripulanteId: jornada.tripulante_id,
    dataReferencia: jornada.data,
    jornadasHistorico: historico,
    limites,
  });

  // 3. Calcular dia do ciclo embarcado (buscar escala ativa)
  const periodoEmbarcado = await calcularDiaDoCiclo(db, jornada.tripulante_id, jornada.data);

  // 4. Calcular fatorização
  const [ano, mes] = jornada.data.split('-').map(Number);
  const dias = diasNoMes(ano, mes);

  const fatResult = calcFatorizacao({
    jornada,
    repousoAnteriorMin: acumulo.repouso_anterior_min >= 0 ? acumulo.repouso_anterior_min : null,
    limites,
    diasDoMes: dias,
    diaDoCiclo: periodoEmbarcado?.dia ?? null,
  });

  // 4b. Calcular índice estimado de effectiveness (proxy local)
  const effectResult = calcEffectiveness(fatResult, limites, {
    hora_apresentacao: jornada.hora_apresentacao,
    hora_primeira_decolagem: jornada.hora_primeira_decolagem,
    hora_ultimo_pouso: jornada.hora_ultimo_pouso,
    hora_corte_motor: jornada.hora_corte_motor,
    hora_termino: jornada.hora_termino,
    hora_dormiu: jornada.hora_dormiu ?? null,
    dia_periodo_embarcado: periodoEmbarcado?.dia ?? null,
    total_dias_periodo: periodoEmbarcado?.total ?? null,
  });

  const timestamp = now();

  try {
    await db
      .prepare(
        `UPDATE frms_jornada
            SET hora_acordou = ?,
                sono_efetivo_min = ?,
                fonte_sono = ?,
                acordou_na_wocl = ?,
                repouso_regulatorio_min = ?,
                updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(
        // D-02: `hora_acordou` guarda apenas despertar real. A estimativa vive em
        // `frms_fatorizacao_jornada.hora_despertar_estimada`, e é assim que
        // `frms.ts` distingue `wakeTime` de `wakeTimeEstimated`.
        effectResult.despertar_estimado ? null : effectResult.hora_despertar,
        effectResult.duracao_sono_efetiva_min,
        effectResult.fonte_sono,
        effectResult.acordou_na_wocl ? 1 : 0,
        acumulo.repouso_anterior_min >= 0 ? acumulo.repouso_anterior_min : null,
        timestamp,
        jornada.id,
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!message.includes('no such column')) {
      throw error;
    }
  }

  // 5. Persistir fatorização (upsert)
  const fatId = generateId();

  // Delete existing (if updating)
  await db
    .prepare(
      'UPDATE frms_fatorizacao_jornada SET deleted_at = ? WHERE jornada_id = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, jornada.id)
    .run();

  await db
    .prepare(
      `INSERT INTO frms_fatorizacao_jornada (
        id, jornada_id,
        processado_com_bug,
        fator_basica_pct, fator_apresentacao_pct, fator_duracao_pct,
        fator_repouso_pct, fator_noturno_dep_pct, fator_noturno_arr_pct,
        fator_ciclo_embarcado_pct,
        fator_base_away_pct, fator_aclimatacao_pct,
        total_fatorizado_jornada,
        fator_hv_basica_pct, fator_hv_quantidade_pct,
        fator_hv_noturno_dep_pct, fator_hv_noturno_arr_pct,
        total_fatorizado_hv,
        effectiveness_pct, effectiveness_nivel, effectiveness_componentes_json,
        hora_despertar_estimada, hora_inicio_sono_estimado, duracao_sono_efetiva_min,
        tempo_abaixo_limiar_min,
        dia_periodo_embarcado, total_dias_periodo,
        config_revision_id, model_version, recalc_state,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      fatId,
      jornada.id,
      0,
      effectResult.fator_basica_calibrado_pct,
      effectResult.fator_apresentacao_calibrado_pct,
      fatResult.fator_duracao_pct,
      effectResult.fator_repouso_calibrado_pct,
      fatResult.fator_noturno_dep_pct,
      fatResult.fator_noturno_arr_pct,
      fatResult.fator_ciclo_embarcado_pct,
      fatResult.fator_base_away_pct,
      fatResult.fator_aclimatacao_pct,
      effectResult.total_fatorizado_calibrado_jornada,
      fatResult.fator_hv_basica_pct,
      fatResult.fator_hv_quantidade_pct,
      fatResult.fator_hv_noturno_dep_pct,
      fatResult.fator_hv_noturno_arr_pct,
      fatResult.total_fatorizado_hv,
      effectResult.effectiveness_pct,
      effectResult.nivel,
      JSON.stringify(effectResult.componentes),
      effectResult.hora_despertar,
      effectResult.hora_inicio_sono,
      effectResult.duracao_sono_efetiva_min,
      effectResult.tempo_abaixo_limiar_pct,
      effectResult.dia_periodo_embarcado ?? null,
      effectResult.total_dias_periodo ?? null,
      provenance?.configRevisionId ?? null,
      provenance?.modelVersion ?? null,
      provenance ? 'CURRENT' : 'CURRENT',
      timestamp,
      timestamp,
    )
    .run();

  const fatorizacao: FatorizacaoRow = {
    id: fatId,
    jornada_id: jornada.id,
    ...fatResult,
    fator_basica_pct: effectResult.fator_basica_calibrado_pct,
    fator_apresentacao_pct: effectResult.fator_apresentacao_calibrado_pct,
    fator_repouso_pct: effectResult.fator_repouso_calibrado_pct,
    total_fatorizado_jornada: effectResult.total_fatorizado_calibrado_jornada,
    effectiveness_nivel: effectResult.nivel,
    effectiveness_pct: effectResult.effectiveness_pct,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };

  // 6. Persistir acúmulo rolling (upsert)
  await persistirAcumuloRolling(db, jornada.tripulante_id, jornada.data, acumulo);

  // 7. Gerar alertas
  const alertas = processarAlertas({
    tripulanteId: jornada.tripulante_id,
    jornadaId: jornada.id,
    jornada: {
      duracao_jornada_minutos: jornada.duracao_jornada_minutos,
      horas_voo_minutos: jornada.horas_voo_minutos,
      status: jornada.status,
      tripulacao_aumentada: jornada.tripulacao_aumentada,
    },
    acumulo,
    limites,
  });

  // 8. Persistir alertas
  await db
    .prepare(
      'UPDATE frms_alerta SET deleted_at = ?, updated_at = ? WHERE jornada_id = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, timestamp, jornada.id)
    .run();

  for (const a of alertas) {
    await persistirAlerta(db, a);
  }

  const bloqueado = deveBloquearLancamento(alertas);

  return { fatorizacao, acumulo, alertas, bloqueado };
}

/**
 * Calcula dia do ciclo embarcado para um tripulante numa data.
 * Busca a escala quinzenal ativa que abrange a data.
 * Retorna null se não houver escala ou se a data está em período de folga.
 */
export async function calcularDiaDoCiclo(
  db: D1Database,
  tripulanteId: number,
  data: string,
): Promise<{ dia: number; total: number } | null> {
  try {
    const periodoEscalas = await db
      .prepare(
        `SELECT
           ea.data_inicio,
           ea.data_fim,
           eq.data_inicio AS quinzena_data_inicio,
           eq.data_fim AS quinzena_data_fim
         FROM escala_alocacoes ea
         LEFT JOIN escalas_quinzenas eq
           ON eq.id = ea.quinzena_id
          AND eq.deleted_at IS NULL
         WHERE CAST(ea.funcionario_id AS TEXT) = ?
           AND ea.data_inicio <= ?
           AND ea.data_fim >= ?
           AND ea.deleted_at IS NULL
           AND ea.status != 'cancelado'
           AND (
             ea.aeronave_id IS NOT NULL
             OR ea.quinzena_id IS NOT NULL
             OR (ea.situacao_tipo IS NOT NULL AND UPPER(ea.situacao_tipo) != 'FOLGA')
           )
         ORDER BY
           CASE WHEN ea.quinzena_id IS NOT NULL THEN 0 ELSE 1 END,
           CASE WHEN ea.aeronave_id IS NOT NULL THEN 0 ELSE 1 END,
           ea.data_inicio DESC,
           ea.created_at DESC
         LIMIT 1`,
      )
      .bind(String(tripulanteId), data, data)
      .first<{
        data_inicio: string | null;
        data_fim: string | null;
        quinzena_data_inicio?: string | null;
        quinzena_data_fim?: string | null;
      }>();

    const periodoCalculadoEscalas = calcularPeriodoEmbarcadoPorFaixa(data, periodoEscalas);
    if (periodoCalculadoEscalas) return periodoCalculadoEscalas;

    const quinzenaBase = await resolveFuncionarioActiveFortnightForDate(db, tripulanteId, data);
    const periodoCalculadoBase = calcularPeriodoEmbarcadoPorFaixa(data, quinzenaBase);
    if (periodoCalculadoBase) return periodoCalculadoBase;

    const escala = await db
      .prepare(
        `SELECT data_inicio_embarque, data_fim_embarque, dias_embarcado
         FROM frms_escala_quinzenal
         WHERE tripulante_id = ? AND status_ciclo = 'ATIVO'
           AND data_inicio_embarque <= ? AND data_fim_embarque >= ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(String(tripulanteId), data, data)
      .first<{ data_inicio_embarque: string; data_fim_embarque: string; dias_embarcado: number }>();

    if (!escala) return null;

    const periodoCalculadoFrms = calcularPeriodoEmbarcadoPorFaixa(data, {
      data_inicio: escala.data_inicio_embarque,
      data_fim: escala.data_fim_embarque,
    });
    if (!periodoCalculadoFrms) return null;

    return {
      dia: periodoCalculadoFrms.dia,
      total: escala.dias_embarcado > 0 ? escala.dias_embarcado : periodoCalculadoFrms.total,
    };
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────
// Acúmulo Rolling — persistência
// ────────────────────────────────────────────────────────

export async function persistirAcumuloRolling(
  db: D1Database,
  tripulanteId: number,
  dataRef: string,
  acumulo: AcumuloRollingResult,
): Promise<void> {
  const timestamp = now();

  // Soft-delete anterior do mesmo dia
  await db
    .prepare(
      'UPDATE frms_acumulo_rolling SET deleted_at = ? WHERE tripulante_id = ? AND data_referencia = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, String(tripulanteId), dataRef)
    .run();

  await db
    .prepare(
      `INSERT INTO frms_acumulo_rolling (
        id, tripulante_id, data_referencia,
        hv_7_dias_min, hv_28_dias_min, hv_365_dias_min,
        hv_mes_calendario_min, hv_dia_min,
        pct_limite_7d, pct_limite_28d, pct_limite_mes_calendario, pct_limite_365d, pct_limite_dia,
        repouso_anterior_min, repouso_suficiente,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      generateId(),
      String(tripulanteId),
      dataRef,
      acumulo.hv_7_dias_min,
      acumulo.hv_28_dias_min,
      acumulo.hv_365_dias_min,
      acumulo.hv_mes_calendario_min,
      acumulo.hv_dia_min,
      acumulo.pct_limite_7d,
      acumulo.pct_limite_28d,
      acumulo.pct_limite_mes_calendario,
      acumulo.pct_limite_365d,
      acumulo.pct_limite_dia,
      acumulo.repouso_anterior_min,
      acumulo.repouso_suficiente,
      timestamp,
      timestamp,
    )
    .run();
}

// ────────────────────────────────────────────────────────
// Recalcular acúmulo rolling (standalone, para delete/cron)
// ────────────────────────────────────────────────────────

export async function recalcularAcumuloRolling(
  db: D1Database,
  tripulanteId: number,
  dataRef: string,
  limites: LimitesMap,
): Promise<AcumuloRollingResult> {
  const historico = await buscarHistoricoJornadas(db, tripulanteId, dataRef, 365);
  const acumulo = calcAcumuloRolling({
    tripulanteId,
    dataReferencia: dataRef,
    jornadasHistorico: historico,
    limites,
  });
  await persistirAcumuloRolling(db, tripulanteId, dataRef, acumulo);
  return acumulo;
}

export async function recalcularPipelineCascataDesdeData(
  db: D1Database,
  tripulanteId: number,
  dataRef: string,
  limites: LimitesMap,
): Promise<void> {
  const jornadasFuturas = await db
    .prepare(
      `SELECT *
         FROM frms_jornada
        WHERE tripulante_id = ?
          AND data > ?
          AND deleted_at IS NULL
        ORDER BY data ASC`,
    )
    .bind(String(tripulanteId), dataRef)
    .all<FrmsJornada>();

  for (const jornada of jornadasFuturas.results || []) {
    await recalcularPipeline(db, jornada, limites);
  }
}

// ────────────────────────────────────────────────────────
// Alertas — persistência
// ────────────────────────────────────────────────────────

export async function persistirAlerta(db: D1Database, alerta: AlertaGerado): Promise<string> {
  const id = generateId();
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO frms_alerta (
        id, tripulante_id, jornada_id, tipo_limite, nivel,
        percentual_atingido, valor_atual_min, valor_limite_min,
        mensagem, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      String(alerta.tripulante_id),
      alerta.jornada_id ?? null,
      alerta.tipo_limite,
      alerta.nivel,
      alerta.percentual_atingido,
      alerta.valor_atual_min,
      alerta.valor_limite_min,
      alerta.mensagem,
      timestamp,
      timestamp,
    )
    .run();

  // Despachar notificações por cargo — resolve empresa do tripulante
  const alertaEmpresa = await db
    .prepare(`SELECT empresa_id FROM funcionarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(alerta.tripulante_id)
    .first<{ empresa_id: number | null }>();
  await despacharNotificacoes(
    db,
    id,
    alerta.nivel,
    alerta.tripulante_id,
    alertaEmpresa?.empresa_id ?? null,
  );

  return id;
}

// ────────────────────────────────────────────────────────
// CRUD de jornadas
// ────────────────────────────────────────────────────────

export async function salvarJornada(
  db: D1Database,
  input: SalvarJornadaInput,
  legacyLimites: LimitesMap,
): Promise<SalvarJornadaResult> {
  const id = generateId();
  const timestamp = now();
  const empresaId = await resolveTripulanteEmpresaId(db, input.tripulante_id, input.empresa_id);

  // `legacyLimites` is accepted for call-site compatibility but never used:
  // pre-pipeline validation (validarRepousoPlataforma) and recalcularPipeline
  // both require the governed context, resolved fresh here per tenant/date.
  const operationalContext = await resolveFrmsOperationalContext(db, {
    empresaId,
    referenceAt: input.data,
    funcionarioId: Number(input.tripulante_id),
  });
  const limites = operationalContext.parameters as unknown as LimitesMap;
  void legacyLimites;

  // Calcular duração da jornada
  const duracaoMinutos =
    input.hora_apresentacao && input.hora_termino
      ? (() => {
          const tempJ = {
            hora_apresentacao: input.hora_apresentacao,
            hora_termino: input.hora_termino,
            status: input.status,
          } as FrmsJornada;
          return calcDuracaoJornada(tempJ);
        })()
      : 0;

  // Validar repouso na plataforma
  const repousoValido = validarRepousoPlataforma(
    input.repouso_plataforma_inicio ?? null,
    input.repouso_plataforma_fim ?? null,
    limites,
  )
    ? 1
    : 0;

  // Inserir jornada
  await db
    .prepare(
      `INSERT INTO frms_jornada (
        id, tripulante_id, empresa_id, data, status,
        hora_apresentacao, hora_termino, duracao_jornada_minutos,
        horas_voo_minutos, hora_primeiro_acionamento, hora_primeira_decolagem,
        hora_ultimo_pouso, hora_corte_motor, hora_dormiu,
        repouso_plataforma_inicio, repouso_plataforma_fim, repouso_plataforma_valido,
        observacao, registrado_por, origem, local_base,
        tipo_base, tripulacao_aumentada, classe_cabine, aclimatado,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.tripulante_id,
      empresaId,
      input.data,
      input.status,
      input.hora_apresentacao ?? null,
      input.hora_termino ?? null,
      duracaoMinutos,
      input.horas_voo_minutos ?? null,
      input.hora_primeiro_acionamento ?? null,
      input.hora_primeira_decolagem ?? null,
      input.hora_ultimo_pouso ?? null,
      input.hora_corte_motor ?? null,
      input.hora_dormiu ?? null,
      input.repouso_plataforma_inicio ?? null,
      input.repouso_plataforma_fim ?? null,
      repousoValido,
      input.observacao ?? null,
      input.registrado_por,
      input.origem ?? 'MANUAL',
      input.local_base ?? null,
      input.tipo_base ?? 'HOME',
      input.tripulacao_aumentada ?? 0,
      input.classe_cabine ?? null,
      input.aclimatado ?? 1,
      timestamp,
      timestamp,
    )
    .run();

  const jornada: FrmsJornada = {
    id,
    empresa_id: empresaId,
    tripulante_id: Number(input.tripulante_id),
    data: input.data,
    status: input.status as FrmsJornada['status'],
    hora_apresentacao: input.hora_apresentacao ?? null,
    hora_termino: input.hora_termino ?? null,
    duracao_jornada_minutos: duracaoMinutos,
    horas_voo_minutos: input.horas_voo_minutos ?? null,
    hora_primeiro_acionamento: input.hora_primeiro_acionamento ?? null,
    hora_primeira_decolagem: input.hora_primeira_decolagem ?? null,
    hora_ultimo_pouso: input.hora_ultimo_pouso ?? null,
    hora_corte_motor: input.hora_corte_motor ?? null,
    hora_dormiu: input.hora_dormiu ?? null,
    repouso_plataforma_inicio: input.repouso_plataforma_inicio ?? null,
    repouso_plataforma_fim: input.repouso_plataforma_fim ?? null,
    repouso_plataforma_valido: repousoValido,
    observacao: input.observacao ?? null,
    registrado_por: input.registrado_por,
    origem: (input.origem ?? 'MANUAL') as FrmsJornada['origem'],
    tipo_base: (input.tipo_base ?? 'HOME') as FrmsJornada['tipo_base'],
    tripulacao_aumentada: input.tripulacao_aumentada ?? 0,
    classe_cabine: (input.classe_cabine ?? null) as FrmsJornada['classe_cabine'],
    aclimatado: input.aclimatado ?? 1,
    local_base: input.local_base ?? null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };

  // Pipeline: fatorizar → acumular → alertar
  const result = await recalcularPipeline(db, jornada, limites);

  // Recalcular jornadas futuras (quando lançamento é retroativo)
  await recalcularPipelineCascataDesdeData(db, jornada.tripulante_id, jornada.data, limites);

  // Auditoria
  await logAuditoria(db, 'frms_jornada', id, 'INSERT', null, jornada);

  return {
    jornada,
    ...result,
  };
}

export async function atualizarJornada(
  db: D1Database,
  id: string,
  input: Partial<SalvarJornadaInput>,
  legacyLimites: LimitesMap,
): Promise<SalvarJornadaResult> {
  void legacyLimites;
  const existing = await db
    .prepare(
      `SELECT fj.* FROM frms_jornada fj
       JOIN funcionarios f ON f.id = fj.tripulante_id AND f.deleted_at IS NULL
       WHERE fj.id = ? AND fj.deleted_at IS NULL`,
    )
    .bind(id)
    .first<FrmsJornada>();

  if (!existing) {
    throw new Error('Jornada não encontrada');
  }

  const timestamp = now();

  // Merge campos
  const merged = {
    ...existing,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    updated_at: timestamp,
  };
  const empresaId = await resolveTripulanteEmpresaId(
    db,
    merged.tripulante_id ?? existing.tripulante_id,
    input.empresa_id ?? merged.empresa_id ?? null,
  );
  merged.empresa_id = empresaId;

  // Recalcular duração
  if (merged.hora_apresentacao && merged.hora_termino) {
    merged.duracao_jornada_minutos = calcDuracaoJornada(merged as FrmsJornada);
  }

  const operationalContext = await resolveFrmsOperationalContext(db, {
    empresaId,
    referenceAt: merged.data ?? existing.data,
    funcionarioId: Number(merged.tripulante_id ?? existing.tripulante_id),
    jornadaId: id,
  });
  const limites = operationalContext.parameters as unknown as LimitesMap;

  // Revalidar repouso plataforma
  merged.repouso_plataforma_valido = validarRepousoPlataforma(
    merged.repouso_plataforma_inicio ?? null,
    merged.repouso_plataforma_fim ?? null,
    limites,
  )
    ? 1
    : 0;

  await db
    .prepare(
      `UPDATE frms_jornada SET
        data = ?, tripulante_id = ?,
        status = ?, hora_apresentacao = ?, hora_termino = ?,
        duracao_jornada_minutos = ?, horas_voo_minutos = ?,
        hora_primeiro_acionamento = ?, hora_primeira_decolagem = ?,
        hora_ultimo_pouso = ?, hora_corte_motor = ?, hora_dormiu = ?,
        repouso_plataforma_inicio = ?, repouso_plataforma_fim = ?,
        repouso_plataforma_valido = ?, observacao = ?, origem = ?, local_base = ?,
        empresa_id = COALESCE(empresa_id, ?),
        tipo_base = ?, tripulacao_aumentada = ?, classe_cabine = ?, aclimatado = ?,
        updated_at = ?
       WHERE id = ?
         AND (empresa_id = ? OR empresa_id IS NULL)
         AND deleted_at IS NULL`,
    )
    .bind(
      merged.data,
      merged.tripulante_id,
      merged.status,
      merged.hora_apresentacao ?? null,
      merged.hora_termino ?? null,
      merged.duracao_jornada_minutos ?? 0,
      merged.horas_voo_minutos ?? null,
      merged.hora_primeiro_acionamento ?? null,
      merged.hora_primeira_decolagem ?? null,
      merged.hora_ultimo_pouso ?? null,
      merged.hora_corte_motor ?? null,
      merged.hora_dormiu ?? null,
      merged.repouso_plataforma_inicio ?? null,
      merged.repouso_plataforma_fim ?? null,
      merged.repouso_plataforma_valido ?? 0,
      merged.observacao ?? null,
      merged.origem ?? 'MANUAL',
      merged.local_base ?? null,
      empresaId,
      merged.tipo_base ?? 'HOME',
      merged.tripulacao_aumentada ?? 0,
      merged.classe_cabine ?? null,
      merged.aclimatado ?? 1,
      timestamp,
      id,
      empresaId,
    )
    .run();

  const jornada = merged as FrmsJornada;
  const result = await recalcularPipeline(db, jornada, limites);

  // Se data ou tripulante mudaram, a série anterior também precisa ser recomposta.
  if (existing.tripulante_id !== jornada.tripulante_id || existing.data !== jornada.data) {
    await recalcularPipelineCascataDesdeData(db, existing.tripulante_id, existing.data, limites);
  }

  // Recalcular jornadas futuras para manter acumulados rolling consistentes.
  await recalcularPipelineCascataDesdeData(db, jornada.tripulante_id, jornada.data, limites);

  await logAuditoria(db, 'frms_jornada', id, 'UPDATE', existing, jornada);

  return { jornada, ...result };
}

export async function deletarJornada(
  db: D1Database,
  id: string,
  limites: LimitesMap,
): Promise<void> {
  const existing = await db
    .prepare(
      `SELECT fj.* FROM frms_jornada fj
       JOIN funcionarios f ON f.id = fj.tripulante_id AND f.deleted_at IS NULL
       WHERE fj.id = ? AND fj.deleted_at IS NULL`,
    )
    .bind(id)
    .first<FrmsJornada>();

  if (!existing) {
    throw new Error('Jornada não encontrada');
  }

  const timestamp = now();

  await db
    .prepare('UPDATE frms_jornada SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .bind(timestamp, timestamp, id)
    .run();

  // Soft delete fatorização associada
  await db
    .prepare(
      'UPDATE frms_fatorizacao_jornada SET deleted_at = ?, updated_at = ? WHERE jornada_id = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, timestamp, id)
    .run();

  // Soft delete dos alertas vinculados à jornada removida
  await db
    .prepare(
      'UPDATE frms_alerta SET deleted_at = ?, updated_at = ? WHERE jornada_id = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, timestamp, id)
    .run();

  // Remover snapshots rolling possivelmente afetados a partir da data deletada
  await db
    .prepare(
      `UPDATE frms_acumulo_rolling
          SET deleted_at = ?, updated_at = ?
        WHERE tripulante_id = ?
          AND data_referencia >= ?
          AND deleted_at IS NULL`,
    )
    .bind(timestamp, timestamp, String(existing.tripulante_id), existing.data)
    .run();

  // Recalcular em cascata todas as jornadas futuras impactadas
  await recalcularPipelineCascataDesdeData(db, existing.tripulante_id, existing.data, limites);

  await logAuditoria(db, 'frms_jornada', id, 'SOFT_DELETE', existing, null);
}

// ────────────────────────────────────────────────────────
// Queries de leitura
// ────────────────────────────────────────────────────────

export async function buscarJornadas(
  db: D1Database,
  tripulanteId: string,
  filtro: {
    mes?: string;
    data_inicio?: string;
    data_fim?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{
  data: Array<FrmsJornada & { fatorizacao?: FrmsFatorizacao }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, filtro.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filtro.pageSize ?? 31));
  const offset = (page - 1) * pageSize;

  let whereExtra = '';
  const binds: string[] = [tripulanteId];

  if (filtro.mes) {
    const mesInput = filtro.mes.trim();
    const matchMes = mesInput.match(/^(\d{4})-(\d{1,2})$/);

    if (matchMes) {
      const ano = Number(matchMes[1]);
      const mes = Number(matchMes[2]);
      if (mes >= 1 && mes <= 12) {
        const mesStr = String(mes).padStart(2, '0');
        const mesSemPad = String(mes);
        const prefixPad = `${ano}-${mesStr}`;
        const prefixSemPad = `${ano}-${mesSemPad}`;
        const dataInicio = `${ano}-${mesStr}-01`;
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const dataFim = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

        whereExtra +=
          " AND (j.data LIKE ? || '%' OR j.data LIKE ? || '%' OR (date(j.data) >= date(?) AND date(j.data) <= date(?)))";
        binds.push(prefixPad, prefixSemPad, dataInicio, dataFim);
      } else {
        whereExtra += " AND j.data LIKE ? || '%'";
        binds.push(mesInput);
      }
    } else {
      whereExtra += " AND j.data LIKE ? || '%'";
      binds.push(mesInput);
    }
  } else if (filtro.data_inicio && filtro.data_fim) {
    whereExtra += ' AND date(j.data) >= date(?) AND date(j.data) <= date(?)';
    binds.push(filtro.data_inicio, filtro.data_fim);
  }

  // COUNT query
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as total FROM frms_jornada j WHERE j.tripulante_id = ? AND j.deleted_at IS NULL${whereExtra}`,
    )
    .bind(...binds)
    .first<{ total: number }>();
  const total = countRow?.total ?? 0;

  const rows = await db
    .prepare(
      `SELECT j.*,
        f.id as fat_id,
        f.fator_basica_pct, f.fator_apresentacao_pct, f.fator_duracao_pct,
        f.fator_repouso_pct, f.fator_noturno_dep_pct, f.fator_noturno_arr_pct,
        f.fator_ciclo_embarcado_pct,
        f.fator_base_away_pct, f.fator_aclimatacao_pct,
        f.total_fatorizado_jornada,
        f.fator_hv_basica_pct, f.fator_hv_quantidade_pct,
        f.fator_hv_noturno_dep_pct, f.fator_hv_noturno_arr_pct,
        f.total_fatorizado_hv
      FROM frms_jornada j
      LEFT JOIN frms_fatorizacao_jornada f ON f.jornada_id = j.id AND f.deleted_at IS NULL
      WHERE j.tripulante_id = ? AND j.deleted_at IS NULL${whereExtra}
      ORDER BY j.data DESC
      LIMIT ? OFFSET ?`,
    )
    .bind(...binds, pageSize, offset)
    .all();

  const data = (rows.results || []).map((row: Record<string, unknown>) => {
    const jornada = { ...row } as unknown as FrmsJornada & { fatorizacao?: FrmsFatorizacao };
    if (row.fat_id && shouldUseForOperationalFrms(jornada)) {
      jornada.fatorizacao = {
        id: row.fat_id as string,
        jornada_id: row.id as string,
        fator_basica_pct: row.fator_basica_pct as number,
        fator_apresentacao_pct: row.fator_apresentacao_pct as number,
        fator_duracao_pct: row.fator_duracao_pct as number,
        fator_repouso_pct: row.fator_repouso_pct as number,
        fator_noturno_dep_pct: row.fator_noturno_dep_pct as number,
        fator_noturno_arr_pct: row.fator_noturno_arr_pct as number,
        fator_ciclo_embarcado_pct: (row.fator_ciclo_embarcado_pct as number) ?? 0,
        fator_base_away_pct: (row.fator_base_away_pct as number) ?? 0,
        fator_aclimatacao_pct: (row.fator_aclimatacao_pct as number) ?? 0,
        total_fatorizado_jornada: row.total_fatorizado_jornada as number,
        fator_hv_basica_pct: row.fator_hv_basica_pct as number,
        fator_hv_quantidade_pct: row.fator_hv_quantidade_pct as number,
        fator_hv_noturno_dep_pct: row.fator_hv_noturno_dep_pct as number,
        fator_hv_noturno_arr_pct: row.fator_hv_noturno_arr_pct as number,
        total_fatorizado_hv: row.total_fatorizado_hv as number,
      };
    }
    return jornada;
  });

  const canonicalDates = new Set(
    data.filter((jornada) => shouldUseForOperationalFrms(jornada)).map((jornada) => jornada.data),
  );

  for (const jornada of data) {
    Object.assign(
      jornada as FrmsJornada & Record<string, unknown>,
      resolveFrmsSourceStatus(jornada, {
        hasCanonicalForSameDay: canonicalDates.has(jornada.data),
      }),
    );
  }

  const fatigueByJornadaId = new Map<string, JornadaFatigueSnapshot>();
  const orderedJornadas = [...data].sort((a, b) => {
    const byDate = String(a.data || '').localeCompare(String(b.data || ''));
    if (byDate !== 0) return byDate;
    const byCreatedAt = String((a as { created_at?: string }).created_at || '').localeCompare(
      String((b as { created_at?: string }).created_at || ''),
    );
    if (byCreatedAt !== 0) return byCreatedAt;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const acumuladoPorMes = new Map<string, { jornada: number; voo: number }>();

  for (const jornada of orderedJornadas) {
    if (!shouldUseForOperationalFrms(jornada)) {
      fatigueByJornadaId.set(String(jornada.id), {
        pct_jornada_diaria: null,
        pct_voo_diaria: null,
        pct_jornada_mes: null,
        pct_voo_mes: null,
        integridade_status: 'INCONSISTENTE',
        integridade_codigo: 'FONTE_NAO_CANONICA',
        integridade_codigos: ['FONTE_NAO_CANONICA'],
        integridade_mensagem:
          'Fonte nao canonica para FRMS operacional. Aguardando SIGVOOS para calcular percentuais, rolling e alertas.',
        inconsistencias: ['FONTE_NAO_CANONICA'],
      });
      continue;
    }

    const monthKey = String(jornada.data || '').slice(0, 7);
    const acumuladoAnterior = acumuladoPorMes.get(monthKey) ?? { jornada: 0, voo: 0 };
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: jornada.data,
        duracao_jornada_minutos: jornada.duracao_jornada_minutos,
        horas_voo_minutos: jornada.horas_voo_minutos,
        hora_apresentacao: jornada.hora_apresentacao,
        hora_termino: jornada.hora_termino,
      },
      acumuladoJornadaMinAnterior: acumuladoAnterior.jornada,
      acumuladoVooMinAnterior: acumuladoAnterior.voo,
    });

    fatigueByJornadaId.set(String(jornada.id), {
      pct_jornada_diaria: linha.pct_jornada_diaria,
      pct_voo_diaria: linha.pct_voo_diaria,
      pct_jornada_mes: linha.pct_jornada_mes,
      pct_voo_mes: linha.pct_voo_mes,
      integridade_status: linha.integridade_status,
      integridade_codigo: linha.integridade_codigo,
      integridade_codigos: linha.integridade_codigos,
      integridade_mensagem: linha.integridade_mensagem,
      inconsistencias: linha.inconsistencias,
    });

    acumuladoPorMes.set(monthKey, {
      jornada: linha.jornada_acumulada_min,
      voo: linha.voo_acumulado_min,
    });
  }

  for (const jornada of data) {
    const fatigue = fatigueByJornadaId.get(String(jornada.id));
    if (!fatigue) continue;
    Object.assign(jornada as FrmsJornada & Record<string, unknown>, fatigue);
  }

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ────────────────────────────────────────────────────────
// Importação APUS (lote)
// ────────────────────────────────────────────────────────

export async function importarApus(
  db: D1Database,
  jornadas: SalvarJornadaInput[],
  legacyLimites: LimitesMap,
): Promise<{ importadas: number; alertas: AlertaGerado[]; erros: string[] }> {
  void legacyLimites;
  const alertasAll: AlertaGerado[] = [];
  const erros: string[] = [];

  if (jornadas.length === 0) return { importadas: 0, alertas: [], erros: [] };

  const timestamp = now();

  // ── Phase 1: Batch INSERT OR IGNORE all jornadas ──
  const prepared: Array<{ jornada: FrmsJornada }> = [];

  for (const input of jornadas) {
    try {
      const id = generateId();
      const empresaId = await resolveTripulanteEmpresaId(db, input.tripulante_id, input.empresa_id);
      const duracaoMinutos =
        input.hora_apresentacao && input.hora_termino
          ? calcDuracaoMinutos(input.hora_apresentacao, input.hora_termino)
          : 0;
      // Each row can belong to a different tripulante/tenant/date — resolve the
      // governed context per row rather than sharing one snapshot across the batch.
      const operationalContext = await resolveFrmsOperationalContext(db, {
        empresaId,
        referenceAt: input.data,
        funcionarioId: Number(input.tripulante_id),
      });
      const limites = operationalContext.parameters as unknown as LimitesMap;
      const repousoValido = validarRepousoPlataforma(
        input.repouso_plataforma_inicio ?? null,
        input.repouso_plataforma_fim ?? null,
        limites,
      )
        ? 1
        : 0;

      const jornada: FrmsJornada = {
        id,
        empresa_id: empresaId,
        tripulante_id: Number(input.tripulante_id),
        data: input.data,
        status: input.status as FrmsJornada['status'],
        hora_apresentacao: input.hora_apresentacao ?? null,
        hora_termino: input.hora_termino ?? null,
        duracao_jornada_minutos: duracaoMinutos,
        horas_voo_minutos: input.horas_voo_minutos ?? null,
        hora_primeiro_acionamento: input.hora_primeiro_acionamento ?? null,
        hora_primeira_decolagem: input.hora_primeira_decolagem ?? null,
        hora_ultimo_pouso: input.hora_ultimo_pouso ?? null,
        hora_corte_motor: input.hora_corte_motor ?? null,
        repouso_plataforma_inicio: input.repouso_plataforma_inicio ?? null,
        repouso_plataforma_fim: input.repouso_plataforma_fim ?? null,
        repouso_plataforma_valido: repousoValido,
        observacao: input.observacao ?? null,
        registrado_por: input.registrado_por,
        origem: (input.origem ?? 'APUS') as FrmsJornada['origem'],
        tipo_base: (input.tipo_base ?? 'HOME') as FrmsJornada['tipo_base'],
        tripulacao_aumentada: input.tripulacao_aumentada ?? 0,
        classe_cabine: (input.classe_cabine ?? null) as FrmsJornada['classe_cabine'],
        aclimatado: input.aclimatado ?? 1,
        local_base: input.local_base ?? null,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      };
      prepared.push({ jornada });
    } catch (e) {
      erros.push(`Linha ${jornadas.indexOf(input) + 1}: ${(e as Error).message}`);
    }
  }

  // Batch INSERT — single round-trip to D1
  if (prepared.length > 0) {
    const stmtIns = db.prepare(
      `INSERT OR IGNORE INTO frms_jornada (
        id, tripulante_id, empresa_id, data, status,
        hora_apresentacao, hora_termino, duracao_jornada_minutos,
        horas_voo_minutos, hora_primeiro_acionamento, hora_primeira_decolagem,
        hora_ultimo_pouso, hora_corte_motor,
        repouso_plataforma_inicio, repouso_plataforma_fim, repouso_plataforma_valido,
        observacao, registrado_por, origem,
        tipo_base, tripulacao_aumentada, classe_cabine, aclimatado,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await db.batch(
      prepared.map(({ jornada }) =>
        stmtIns.bind(
          jornada.id,
          String(jornada.tripulante_id),
          jornada.empresa_id ?? null,
          jornada.data,
          jornada.status,
          jornada.hora_apresentacao,
          jornada.hora_termino,
          jornada.duracao_jornada_minutos ?? 0,
          jornada.horas_voo_minutos,
          jornada.hora_primeiro_acionamento,
          jornada.hora_primeira_decolagem,
          jornada.hora_ultimo_pouso,
          jornada.hora_corte_motor,
          jornada.repouso_plataforma_inicio,
          jornada.repouso_plataforma_fim,
          jornada.repouso_plataforma_valido,
          jornada.observacao,
          jornada.registrado_por,
          'APUS',
          jornada.tipo_base,
          jornada.tripulacao_aumentada,
          jornada.classe_cabine,
          jornada.aclimatado,
          timestamp,
          timestamp,
        ),
      ),
    );
  }

  // ── Phase 2: Per tripulante, recalculate pipeline in date order ──
  const byTripulante = new Map<string, FrmsJornada[]>();
  for (const { jornada } of prepared) {
    const tripId = String(jornada.tripulante_id);
    if (!byTripulante.has(tripId)) byTripulante.set(tripId, []);
    byTripulante.get(tripId)!.push(jornada);
  }

  let importadas = 0;
  for (const [, tripJornadas] of byTripulante) {
    const sorted = tripJornadas.sort((a, b) => a.data.localeCompare(b.data));
    for (const jornada of sorted) {
      try {
        const result = await recalcularPipeline(db, jornada, legacyLimites);
        alertasAll.push(...result.alertas);
        importadas++;
      } catch (e) {
        erros.push(`${jornada.data}: ${(e as Error).message}`);
      }
    }
  }

  return { importadas, alertas: alertasAll, erros };
}

// ────────────────────────────────────────────────────────
// Importação Simulador
// ────────────────────────────────────────────────────────

export async function importarSimulador(
  db: D1Database,
  params: {
    sessao_simulador_id: string;
    tripulante_id: string;
    data: string;
    duracao_minutos: number;
  },
  limites: LimitesMap,
  registradoPor: string,
): Promise<SalvarJornadaResult> {
  return salvarJornada(
    db,
    {
      tripulante_id: params.tripulante_id,
      data: params.data,
      status: 'TS', // Treinamento de Solo — status correto para simulador
      hora_apresentacao: null,
      hora_termino: null,
      horas_voo_minutos: 0, // simulador não conta HV regulatórias
      observacao: `Sessão simulador: ${params.sessao_simulador_id}`,
      registrado_por: registradoPor,
      origem: 'SIMULADOR',
    },
    limites,
  );
}

// ────────────────────────────────────────────────────────
// Tripulantes ativos (para cron)
// ────────────────────────────────────────────────────────

export async function listarTripulantesAtivos(
  db: D1Database,
  empresaId?: number,
): Promise<Array<{ id: number; nome: string; empresa_id: number | null }>> {
  // Buscar tripulantes que têm jornadas FRMS registradas,
  // incluindo empresa_id do funcionário como fonte autoritativa de tenant
  const rows = await db
    .prepare(
      `SELECT DISTINCT j.tripulante_id as id,
              COALESCE(p.nome, 'Tripulante #' || j.tripulante_id) as nome,
              p.empresa_id
       FROM frms_jornada j
       LEFT JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER) AND p.deleted_at IS NULL
       WHERE j.deleted_at IS NULL
         AND (? IS NULL OR p.empresa_id = ?)
       ORDER BY nome`,
    )
    .bind(empresaId ?? null, empresaId ?? null)
    .all<{ id: number; nome: string; empresa_id: number | null }>();
  return rows.results || [];
}

// ────────────────────────────────────────────────────────
// Reprocessamento completo (quando configurações mudam)
// ────────────────────────────────────────────────────────

/**
 * Reprocessa todas as jornadas de um tripulante em ordem cronológica.
 * Recalcula: duração, fatorização, acúmulo rolling e alertas com os limites atuais.
 */
export async function reprocessarTripulanteCompleto(
  db: D1Database,
  tripulanteId: number,
  limites: LimitesMap,
  shadowOptions?: { env: FrmsIogpShadowCallerEnv; empresaId: number | null },
): Promise<number> {
  const jornadas = await db
    .prepare(
      `SELECT * FROM frms_jornada
       WHERE tripulante_id = ? AND deleted_at IS NULL
         AND data >= date('now', '-24 months')
       ORDER BY data ASC
       LIMIT 1000`,
    )
    .bind(String(tripulanteId))
    .all<FrmsJornada>();
  const lista = jornadas.results ?? [];
  for (const j of lista) {
    const result = await recalcularPipeline(db, j, limites);
    if (shadowOptions?.empresaId && shadowOptions.env) {
      // Must not block or affect the canonical pipeline
      await runFrmsIogpShadowForJornada(
        db,
        j,
        result,
        shadowOptions.env,
        shadowOptions.empresaId,
      ).catch((err) => {
        console.warn(`[FRMS] Shadow pipeline failed for jornada ${j.id}:`, err);
      });
    }
  }
  return lista.length;
}

/**
 * Reprocessa todos os tripulantes com os limites atuais do banco.
 * Chamado automaticamente quando configurações são alteradas.
 * Garante que fatorização, acúmulo rolling e alertas reflitam os novos parâmetros.
 */
export async function reprocessarTodosTripulantes(
  db: D1Database,
  empresaId?: number,
): Promise<{
  tripulantes: number;
  jornadas: number;
  erros: number;
}> {
  // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
  const tripulantes = await listarTripulantesAtivos(db, empresaId);
  let totalJornadas = 0;
  let erros = 0;
  for (const trip of tripulantes) {
    try {
      const count = await reprocessarTripulanteCompleto(db, trip.id, LIMITES_DEFAULT);
      totalJornadas += count;
    } catch (e) {
      console.error(`[FRMS] Erro ao reprocessar tripulante ${trip.id}:`, (e as Error).message);
      erros++;
    }
  }
  return { tripulantes: tripulantes.length, jornadas: totalJornadas, erros };
}
