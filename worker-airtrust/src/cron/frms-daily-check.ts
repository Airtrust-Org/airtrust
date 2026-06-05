/**
 * FRMS — Cron Job de Verificação Diária
 *
 * Executado todo dia às 06h00 America/Sao_Paulo (09h00 UTC).
 *
 * Para cada tripulante ativo:
 *   1. Recalcular acúmulo rolling para hoje
 *   2. Verificar todos os limites (7d, 28d, 365d, mês, repouso)
 *   3. Se percentual cruzou threshold desde ontem → criar alerta
 *   4. Se repouso < 12h → criar alerta REPOUSO
 *   5. Log de execução em auditoria_avancada_v2
 */

import type { Env } from '../types';
import {
  carregarLimites,
  listarTripulantesAtivos,
  recalcularAcumuloRolling,
  despacharNotificacoes,
} from '../lib/frms/db-service';
import { processarAlertas } from '../lib/frms/alertas';
import type { AlertaGerado } from '../lib/frms/alertas';

function getSaoPauloHour(now = new Date()): number {
  const value = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  return Number(value);
}

async function inserirAlertaComDedupe24h(
  db: D1Database,
  input: {
    tripulanteId: number;
    tipoLimite: string;
    nivel: 'AVISO' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';
    percentualAtingido: number;
    valorAtualMin: number;
    valorLimiteMin: number;
    mensagem: string;
  },
): Promise<boolean> {
  const existente = await db
    .prepare(
      `SELECT id
       FROM frms_alerta
       WHERE tripulante_id = ?
         AND tipo_limite = ?
         AND created_at >= datetime('now', '-24 hours')
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(String(input.tripulanteId), input.tipoLimite)
    .first<{ id: string }>();

  if (existente?.id) return false;

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
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
      String(input.tripulanteId),
      null,
      input.tipoLimite,
      input.nivel,
      input.percentualAtingido,
      input.valorAtualMin,
      input.valorLimiteMin,
      input.mensagem,
      timestamp,
      timestamp,
    )
    .run();

  await despacharNotificacoes(db, id, input.nivel, input.tripulanteId);
  return true;
}

export async function notificarCheckinFadigaPendente(
  db: D1Database,
  empresaId: number,
): Promise<number> {
  const hoje = new Date().toISOString().slice(0, 10);

  const pendentes = await db
    .prepare(
      `SELECT DISTINCT f.id, f.nome
       FROM frms_jornada fj
       JOIN funcionarios f ON f.id = fj.tripulante_id
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND fj.data = ?
         AND fj.deleted_at IS NULL
         AND fj.status IN ('ES','TS','TV','EX','RE','SA')
         AND NOT EXISTS (
           SELECT 1
           FROM frms_fadiga_checkin ch
           WHERE ch.empresa_id = ?
             AND ch.funcionario_id = f.id
             AND ch.data_checkin = ?
             AND ch.deleted_at IS NULL
         )`,
    )
    .bind(empresaId, hoje, empresaId, hoje)
    .all<{ id: number; nome: string }>();

  let created = 0;
  for (const trip of pendentes.results || []) {
    const jaExiste = await db
      .prepare(
        `SELECT id
         FROM notificacoes_sistema
         WHERE tipo = 'FADIGA_CHECKIN_PENDENTE'
           AND grupo = 'frms'
           AND date(created_at) = ?
           AND json_extract(dados, '$.empresa_id') = ?
           AND json_extract(dados, '$.funcionario_id') = ?
         LIMIT 1`,
      )
      .bind(hoje, empresaId, trip.id)
      .first<{ id: number }>();

    if (jaExiste?.id) continue;

    await db
      .prepare(
        `INSERT INTO notificacoes_sistema
         (tipo, prioridade, titulo, mensagem, grupo, dados, created_at, updated_at)
         VALUES ('FADIGA_CHECKIN_PENDENTE', 'MEDIA', 'Check-in de fadiga pendente', ?, 'frms', ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        `${trip.nome} (#${trip.id}) possui jornada hoje e ainda não realizou check-in de fadiga.`,
        JSON.stringify({ empresa_id: empresaId, funcionario_id: trip.id, data_checkin: hoje }),
      )
      .run();

    created += 1;
  }

  return created;
}

export async function frmsDailyCheck(env: Env): Promise<{
  tripulantesProcessados: number;
  alertasGerados: number;
  erros: string[];
}> {
  const db = env.DB;
  const limites = await carregarLimites(db);
  const hoje = new Date().toISOString().slice(0, 10);
  const horaSaoPaulo = getSaoPauloHour();

  const tripulantes = await listarTripulantesAtivos(db);
  let alertasGerados = 0;
  const erros: string[] = [];

  for (const trip of tripulantes) {
    try {
      // 1. Recalcular acúmulo rolling
      const acumulo = await recalcularAcumuloRolling(db, trip.id, hoje, limites);

      // 2. Gerar alertas
      const alertas = processarAlertas({
        tripulanteId: trip.id,
        tripulanteNome: trip.nome,
        jornadaId: null,
        jornada: null,
        acumulo,
        limites,
      });

      // 3. Persistir alertas (sem duplicar se já existe alerta idêntico do mesmo dia)
      for (const alerta of alertas) {
        const existing = await db
          .prepare(
            `SELECT id FROM frms_alerta
             WHERE tripulante_id = ? AND tipo_limite = ?
               AND created_at >= ? AND deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(String(alerta.tripulante_id), alerta.tipo_limite, hoje + ' 00:00:00')
          .first();

        if (!existing) {
          const id = crypto.randomUUID();
          const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
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
              null,
              alerta.tipo_limite,
              alerta.nivel,
              alerta.percentual_atingido,
              alerta.valor_atual_min,
              alerta.valor_limite_min,
              `[CRON] ${alerta.mensagem}`,
              timestamp,
              timestamp,
            )
            .run();
          // Despachar notificações para responsáveis (piloto, supervisor, ops)
          await despacharNotificacoes(db, id, alerta.nivel, alerta.tripulante_id);
          alertasGerados++;
        }
      }

      // 4. Fadiga Acumulada Legal (PRC-OPS-012) — % do limite mensal
      const mesAtual = hoje.slice(0, 7);
      const totaisMes = await db
        .prepare(
          `SELECT COALESCE(SUM(duracao_jornada_minutos), 0) AS total_jornada,
                  COALESCE(SUM(horas_voo_minutos), 0) AS total_voo,
                  NULL AS dia_ciclo
           FROM frms_jornada
           WHERE tripulante_id = ? AND data LIKE ? AND deleted_at IS NULL`,
        )
        .bind(trip.id, `${mesAtual}-%`)
        .first<{ total_jornada: number; total_voo: number; dia_ciclo: number | null }>();

      if (totaisMes) {
        const pctJornada = (totaisMes.total_jornada / 60 / 176) * 100;
        const pctVoo = (totaisMes.total_voo / 60 / 90) * 100;
        const pctMax = Math.max(pctJornada, pctVoo);

        if (pctMax >= 80) {
          const nivel = pctMax >= 95 ? 'VERMELHO' : pctMax >= 90 ? 'AMARELO' : 'VERDE';
          const tipo = pctJornada >= pctVoo ? 'FADIGA_ACUMULADA_JORNADA' : 'FADIGA_ACUMULADA_VOO';

          const existeFadiga = await db
            .prepare(
              `SELECT id FROM frms_alerta
               WHERE tripulante_id = ? AND tipo_limite = ?
                 AND created_at >= ? AND deleted_at IS NULL
               LIMIT 1`,
            )
            .bind(String(trip.id), tipo, hoje + ' 00:00:00')
            .first();

          if (!existeFadiga) {
            const id = crypto.randomUUID();
            const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
            const tipoLbl = pctJornada >= pctVoo ? 'Jornada' : 'Voo';
            const valorAtual = pctJornada >= pctVoo ? totaisMes.total_jornada : totaisMes.total_voo;
            const valorLimite = pctJornada >= pctVoo ? 176 * 60 : 90 * 60;
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
                String(trip.id),
                null,
                tipo,
                nivel,
                +pctMax.toFixed(1),
                valorAtual,
                valorLimite,
                `[CRON] Fadiga acum. ${tipoLbl}: ${pctMax.toFixed(1)}% do limite mensal (dia ciclo: ${totaisMes.dia_ciclo || '?'})`,
                timestamp,
                timestamp,
              )
              .run();
            await despacharNotificacoes(db, id, nivel, trip.id);
            alertasGerados++;
          }
        }
      }

      // 5. Acumulo 7d > limite configurado (política interna FRMS) com deduplicacao de 24h
      const limite7dMin = Math.round(limites.HV_7_DIAS_HORAS * 60);
      if (acumulo.hv_7_dias_min > limite7dMin) {
        const pct7d = (acumulo.hv_7_dias_min / limite7dMin) * 100;
        const criouAlerta60h = await inserirAlertaComDedupe24h(db, {
          tripulanteId: trip.id,
          tipoLimite: 'HV_7D',
          nivel: 'CRITICO',
          percentualAtingido: Number(pct7d.toFixed(1)),
          valorAtualMin: acumulo.hv_7_dias_min,
          valorLimiteMin: limite7dMin,
          mensagem: `[CRON] Acumulo 7d acima de ${limites.HV_7_DIAS_HORAS}h: ${(acumulo.hv_7_dias_min / 60).toFixed(1)}h`,
        });
        if (criouAlerta60h) {
          alertasGerados++;
        }
      }

      // 6. Thresholds de effectiveness: <77 critico, 77-89 moderado
      const effectivenessHoje = await db
        .prepare(
          `SELECT effectiveness_pct
           FROM frms_jornada
           WHERE tripulante_id = ?
             AND data = ?
             AND effectiveness_pct IS NOT NULL
             AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT 1`,
        )
        .bind(trip.id, hoje)
        .first<{ effectiveness_pct: number | null }>();

      const effectivenessPct = effectivenessHoje?.effectiveness_pct;
      if (typeof effectivenessPct === 'number') {
        if (effectivenessPct < 77) {
          const criouCritico = await inserirAlertaComDedupe24h(db, {
            tripulanteId: trip.id,
            tipoLimite: 'EFFECTIVENESS',
            nivel: 'CRITICO',
            percentualAtingido: Number(effectivenessPct.toFixed(1)),
            valorAtualMin: Math.round(effectivenessPct * 10),
            valorLimiteMin: 770,
            mensagem: `[CRON] Effectiveness critico: ${effectivenessPct.toFixed(1)}% (<77%)`,
          });
          if (criouCritico) {
            alertasGerados++;
          }
        } else if (effectivenessPct <= 89) {
          const criouModerado = await inserirAlertaComDedupe24h(db, {
            tripulanteId: trip.id,
            tipoLimite: 'EFFECTIVENESS',
            nivel: 'ATENCAO',
            percentualAtingido: Number(effectivenessPct.toFixed(1)),
            valorAtualMin: Math.round(effectivenessPct * 10),
            valorLimiteMin: 890,
            mensagem: `[CRON] Effectiveness moderado: ${effectivenessPct.toFixed(1)}% (77-89%)`,
          });
          if (criouModerado) {
            alertasGerados++;
          }
        }
      }
    } catch (e) {
      const msg = `Tripulante ${trip.id} (${trip.nome}): ${(e as Error).message}`;
      console.error('[FRMS][CRON]', msg);
      erros.push(msg);
    }
  }

  // Log de execução auditoria
  try {
    await db
      .prepare(
        `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos)
         VALUES ('frms_cron', 'DAILY_CHECK', ?, ?)`,
      )
      .bind(
        hoje,
        JSON.stringify({
          tripulantes_processados: tripulantes.length,
          alertas_gerados: alertasGerados,
          erros: erros.length,
        }),
      )
      .run();
  } catch (e) {
    console.warn('[FRMS][CRON] Falha auditoria:', (e as Error).message);
  }

  console.log(
    `[FRMS][CRON] Concluído: ${tripulantes.length} tripulantes, ${alertasGerados} alertas, ${erros.length} erros`,
  );

  if (horaSaoPaulo >= 8) {
    try {
      const empresas = await db
        .prepare(
          `SELECT DISTINCT f.empresa_id
           FROM frms_jornada fj
           JOIN funcionarios f ON f.id = fj.tripulante_id
           WHERE fj.data = ?
             AND fj.deleted_at IS NULL
             AND f.deleted_at IS NULL`,
        )
        .bind(hoje)
        .all<{ empresa_id: number }>();

      let notificacoesPendentes = 0;
      for (const empresa of empresas.results || []) {
        notificacoesPendentes += await notificarCheckinFadigaPendente(db, empresa.empresa_id);
      }

      console.log(`[FRMS][CRON] Reminder pendente de check-in gerado: ${notificacoesPendentes}`);
    } catch (err) {
      console.warn('[FRMS][CRON] Falha no reminder de check-in pendente:', (err as Error).message);
    }
  }

  return {
    tripulantesProcessados: tripulantes.length,
    alertasGerados,
    erros,
  };
}
