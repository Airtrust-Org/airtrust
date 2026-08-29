import type { Env } from '../types';
import { processarNotificacoes } from './notificacoes';
import { enviarEmailAlert } from './notificacoes';
import { alertasDiariosHandler } from './alertasDiarios';
import { frmsDailyCheck } from './frms-daily-check';
import { frmsFadigaReminder } from './frms-fadiga-reminder';
import { processarNotificacoesSgso, enqueueSlaAlerts } from './sgso-notificacoes';
import { createStructuredConsole } from '../utils/logger';
import { processarEventosParaModulo } from '../shared/handlers';
import { CANCELLED_STATUS_VALUES, sqlStatusNotEqualsAny } from '../lib/status/status-codes';
import { getQualificacoesVencimentoExpr } from '../utils/qualificacoes-alerta-config';
import { sendEmail } from '../lib/email';
import { ensureMatriculaCycle } from '../services/lms-matricula-cycle';
import {
  getSigvoosConfig,
  syncSigvoosForFrms,
  upsertSigvoosConfig,
} from '../services/sigvoos-frms';
import { LIMITES_DEFAULT } from '../lib/frms/types';
import { reprocessarTripulanteCompleto } from '../lib/frms/db-service';
import { fetchControleVoosOperationalRecords } from '../lib/frms/controle-voos-source';
import {
  compareControleVoosWithLegacyJornada,
  type FrmsJornadaLegacyRow,
} from '../lib/frms/controle-voos-shadow-comparator';
import { isControleVoosShadowModeEnabledForEmpresa } from '../lib/frms/controle-voos-shadow-flag';
import { cleanupExpiredRefreshTokens } from '../services/auth-refresh-token';

function buildDailyNotificationId(parts: Array<string | number>) {
  return [...parts, new Date().toISOString().slice(0, 10)].join(':');
}

function isMatriculaUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('UNIQUE constraint failed') && message.includes('lms_matriculas');
}

export const LMS_RENOVACAO_EAD_JANELA_DIAS = 30;

export function buildQualificacoesEadRenovacaoAutomaticaQuery() {
  const vencExpr = getQualificacoesVencimentoExpr();
  const vencExprQh2 = getQualificacoesVencimentoExpr('qh2', 'qt');
  return `SELECT DISTINCT
           qh.id AS qualificacao_historico_id,
           qh.funcionario_id,
           qh.empresa_id,
           qt.id AS qualificacao_id,
           lc.id        AS curso_id,
           lc.titulo    AS curso_titulo
         FROM qualificacoes_historico qh
         JOIN qualificacoes_tipos qt
           ON qt.empresa_id = qh.empresa_id
          AND qt.deleted_at IS NULL
          AND (
            qt.id = qh.qualificacao_id
            OR (
              qh.qualificacao_id IS NULL
              AND UPPER(TRIM(COALESCE(qh.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))
            )
          )
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = COALESCE(qh.formato_id, qt.formato_id)
          AND qf.deleted_at IS NULL
         JOIN lms_cursos lc
           ON lc.qualificacao_tipo_id = qt.id
          AND lc.ativo = 1
          AND lc.publicado = 1
          AND lc.deleted_at IS NULL
          AND lc.empresa_id = qh.empresa_id
         JOIN funcionarios f
           ON f.id = qh.funcionario_id
          AND f.empresa_id = qh.empresa_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        WHERE qh.deleted_at IS NULL
          AND (
            UPPER(TRIM(COALESCE(qf.codigo, ''))) = 'EAD'
            OR UPPER(TRIM(COALESCE(qt.categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
          )
           AND COALESCE(qh.renovada, 0) = 0
           AND (qh.data_vencimento IS NOT NULL OR qh.data_conclusao IS NOT NULL)
           AND NOT EXISTS (
             SELECT 1
               FROM qualificacoes_historico qh2
              WHERE qh2.empresa_id = qh.empresa_id
                AND qh2.funcionario_id = qh.funcionario_id
                AND qh2.id <> qh.id
                AND qh2.deleted_at IS NULL
                AND COALESCE(qh2.renovada, 0) = 0
                AND (qh2.data_vencimento IS NOT NULL OR qh2.data_conclusao IS NOT NULL)
                AND (
                  qh2.qualificacao_id = qt.id
                  OR UPPER(TRIM(COALESCE(qh2.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))
                )
                AND date(${vencExprQh2}) > date(${vencExpr})
           )
           AND date(${vencExpr}) <= date('now', '+' || ? || ' days')`;
}

async function registrarEventoSigvoosFalha(
  db: D1Database,
  empresaId: number | null,
  tipo: 'CRON_FALHA' | 'CRON_ZERO_ETAPAS',
  mensagem: string,
  erro: Error | unknown,
): Promise<void> {
  const id = `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const agora = new Date().toISOString();
  const erroMsg = erro instanceof Error ? erro.message : String(erro);

  try {
    await db
      .prepare(
        `INSERT INTO integracoes_sigvoos_eventos (
           id, empresa_id, tipo_evento, status, payload_json, erro_ultima, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        empresaId,
        tipo,
        'FALHA',
        JSON.stringify({ mensagem, timestamp: agora }),
        erroMsg,
        agora,
        agora,
      )
      .run();
  } catch (dbErr) {
    console.error('[SIGVOOS_CRON] Erro ao registrar evento de falha:', dbErr);
  }
}

async function runFrmsIntegrityAudit(db: D1Database): Promise<{
  jornadasSemFatorizacao: number;
  jornadasLancadasForaQuinzena: number;
  rollingSemJornadaRecente: number;
}> {
  const jornadasSemFatorizacao = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_jornada j
         LEFT JOIN frms_fatorizacao_jornada fj
           ON fj.jornada_id = j.id
          AND fj.deleted_at IS NULL
        WHERE j.deleted_at IS NULL
          AND fj.id IS NULL`,
    )
    .first<{ total: number }>();

  const jornadasLancadasForaQuinzena = await db
    .prepare(
      `WITH jornadas_lancadas AS (
         SELECT j.id, j.tripulante_id, j.data
           FROM frms_jornada j
          WHERE j.deleted_at IS NULL
            AND (
              j.hora_apresentacao IS NOT NULL
              OR j.hora_termino IS NOT NULL
              OR COALESCE(j.horas_voo_minutos, 0) > 0
              OR COALESCE(j.duracao_jornada_minutos, 0) > 0
            )
       ),
       jornadas_fora_faixa AS (
         SELECT jl.id
           FROM jornadas_lancadas jl
          WHERE NOT EXISTS (
            SELECT 1
              FROM escala_alocacoes ea
             WHERE CAST(ea.funcionario_id AS TEXT) = CAST(jl.tripulante_id AS TEXT)
               AND ea.deleted_at IS NULL
               AND ea.status != 'cancelado'
               AND (
                 ea.aeronave_id IS NOT NULL
                 OR ea.quinzena_id IS NOT NULL
                 OR (ea.situacao_tipo IS NOT NULL AND UPPER(ea.situacao_tipo) != 'FOLGA')
               )
               AND jl.data BETWEEN date(ea.data_inicio, '-2 day') AND date(ea.data_fim, '+2 day')
          )
       )
       SELECT COUNT(*) AS total FROM jornadas_fora_faixa`,
    )
    .first<{ total: number }>();

  const rollingSemJornadaRecente = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_acumulo_rolling ar
         LEFT JOIN frms_jornada j
           ON j.tripulante_id = ar.tripulante_id
          AND j.data = ar.data_referencia
          AND j.deleted_at IS NULL
        WHERE ar.deleted_at IS NULL
          AND j.id IS NULL
          AND ar.data_referencia >= date('now', '-120 days')`,
    )
    .first<{ total: number }>();

  return {
    jornadasSemFatorizacao: Number(jornadasSemFatorizacao?.total || 0),
    jornadasLancadasForaQuinzena: Number(jornadasLancadasForaQuinzena?.total || 0),
    rollingSemJornadaRecente: Number(rollingSemJornadaRecente?.total || 0),
  };
}

async function findLatestMatriculaForFuncionario(
  db: D1Database,
  params: { cursoId: number; funcionarioId: number; empresaId: number },
) {
  return db
    .prepare(
      `SELECT id, status, deleted_at
         FROM lms_matriculas
        WHERE curso_id = ?
          AND funcionario_id = ?
          AND empresa_id = ?
        ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
        LIMIT 1`,
    )
    .bind(params.cursoId, params.funcionarioId, params.empresaId)
    .first<{ id: number; status: string; deleted_at: string | null }>();
}

export async function runScheduledJobs(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const console = createStructuredConsole('ScheduledHandler', env.ENVIRONMENT);
  console.log('[CRON] Evento agendado executado:', event.cron);

  if (event.cron === '0 8 * * *') {
    ctx.waitUntil(alertasDiariosHandler(event, env));
    ctx.waitUntil(cleanupExpiredRefreshTokens(env.DB));
  }

  if (event.cron === '*/10 * * * *') {
    ctx.waitUntil(runSigvoosFrmsDailySync(env.DB, console, env));
  }

  if (event.cron === '0 8 * * *') {
    try {
      const lembretes = await env.DB.prepare(
        `SELECT
           m.id,
           m.funcionario_id,
           m.empresa_id,
           c.titulo,
           m.data_expiracao,
           CAST(julianday(date(m.data_expiracao)) - julianday(date('now')) AS INTEGER) AS dias_restantes
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id AND c.deleted_at IS NULL
         JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.empresa_id = m.empresa_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         WHERE m.deleted_at IS NULL
           AND m.status IN ('NAO_INICIADO', 'EM_ANDAMENTO')
           AND m.data_expiracao IS NOT NULL
           AND CAST(julianday(date(m.data_expiracao)) - julianday(date('now')) AS INTEGER) IN (1, 7)`,
      ).all<{
        id: number;
        funcionario_id: number;
        empresa_id: number;
        titulo: string;
        data_expiracao: string;
        dias_restantes: number;
      }>();

      for (const lembrete of lembretes.results || []) {
        const tipo =
          lembrete.dias_restantes === 1
            ? 'lms_prazo_conclusao_1_dia'
            : 'lms_prazo_conclusao_7_dias';
        const titulo =
          lembrete.dias_restantes === 1
            ? 'Prazo do treinamento vence amanhã'
            : 'Prazo do treinamento vence em 7 dias';
        const mensagem = `Conclua o treinamento ${lembrete.titulo} até ${new Date(`${lembrete.data_expiracao}T12:00:00`).toLocaleDateString('pt-BR')}.`;

        await env.DB.prepare(
          `INSERT OR IGNORE INTO notificacoes_inapp (
             id, funcionario_id, empresa_id, tipo, titulo, mensagem, referencia_id, referencia_tipo, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'lms_matricula', ?)`,
        )
          .bind(
            buildDailyNotificationId([
              'lms',
              tipo,
              lembrete.empresa_id,
              lembrete.funcionario_id,
              'lms_matricula',
              lembrete.id,
            ]),
            String(lembrete.funcionario_id),
            lembrete.empresa_id,
            tipo,
            titulo,
            mensagem,
            String(lembrete.id),
            new Date().toISOString(),
          )
          .run();
      }

      console.log(`[CRON] ✅ LMS lembretes processados: ${(lembretes.results || []).length}`);
    } catch (lmsReminderErr) {
      console.error('[CRON] ❌ Erro ao gerar lembretes LMS:', lmsReminderErr);
    }
  }

  // ── Bloco 4: Qualificação EAD vencida/vencendo → matrícula LMS automática ──
  // Alinha a automação com o mesmo conceito de status do módulo de qualificações:
  // vencida ou VENCENDO_30. Para não depender do próximo cron diário, também roda
  // no cron de 10 em 10 minutos e cria a matrícula assim que a qualificação entrar
  // na janela ou for encontrada atrasada.
  if (event.cron === '0 8 * * *' || event.cron === '*/10 * * * *') {
    try {
      const qualExpirando = await env.DB.prepare(buildQualificacoesEadRenovacaoAutomaticaQuery())
        .bind(LMS_RENOVACAO_EAD_JANELA_DIAS)
        .all<{
          qualificacao_historico_id: number;
          funcionario_id: number;
          empresa_id: number;
          qualificacao_id: number;
          curso_id: number;
          curso_titulo: string;
        }>();

      let matriculasCriadas = 0;
      for (const row of qualExpirando.results || []) {
        try {
          const existente = await findLatestMatriculaForFuncionario(env.DB, {
            cursoId: row.curso_id,
            funcionarioId: row.funcionario_id,
            empresaId: row.empresa_id,
          });

          if (existente) {
            continue;
          }

          const dataExpiracao = new Date();
          dataExpiracao.setDate(dataExpiracao.getDate() + LMS_RENOVACAO_EAD_JANELA_DIAS);
          const dataExpiracaoStr = dataExpiracao.toISOString().slice(0, 10);

          let matriculaId = 0;

          try {
            const insertResult = await env.DB.prepare(
              `INSERT INTO lms_matriculas (empresa_id, curso_id, funcionario_id, data_expiracao, observacoes)
               VALUES (?, ?, ?, ?, 'Matrícula automática: renovação de qualificação EAD vencendo')`,
            )
              .bind(row.empresa_id, row.curso_id, row.funcionario_id, dataExpiracaoStr)
              .run();

            matriculaId = Number(insertResult.meta.last_row_id);
            await ensureMatriculaCycle(env.DB, {
              matriculaId,
              origin: 'AUTO_RENOVACAO',
            });
          } catch (error) {
            if (!isMatriculaUniqueConstraintError(error)) {
              throw error;
            }

            const concorrente = await findLatestMatriculaForFuncionario(env.DB, {
              cursoId: row.curso_id,
              funcionarioId: row.funcionario_id,
              empresaId: row.empresa_id,
            });

            if (concorrente) {
              continue;
            }

            throw error;
          }

          // Notificar o funcionário via inapp
          await env.DB.prepare(
            `INSERT OR IGNORE INTO notificacoes_inapp (
               id, funcionario_id, empresa_id, tipo, titulo, mensagem, referencia_id, referencia_tipo, created_at
             ) VALUES (?, ?, ?, 'lms_renovacao_automatica',
               'Treinamento de renovação disponível',
               'Sua qualificação EAD vence em breve. Você foi matriculado automaticamente em: ' || ?,
               ?, 'lms_matricula', ?)`,
          )
            .bind(
              buildDailyNotificationId([
                'lms',
                'lms_renovacao_automatica',
                row.empresa_id,
                row.funcionario_id,
                'lms_matricula',
                matriculaId,
              ]),
              String(row.funcionario_id),
              row.empresa_id,
              row.curso_titulo,
              String(matriculaId),
              new Date().toISOString(),
            )
            .run();

          // Enviar email de notificação ao funcionário (fire-and-forget)
          try {
            const func = await env.DB.prepare(
              `SELECT nome, email FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
            )
              .bind(row.funcionario_id, row.empresa_id)
              .first<{ nome: string; email: string | null }>();

            if (func?.email) {
              const frontendUrl = String(env.FRONTEND_URL || 'https://airtrust.online').replace(
                /\/$/,
                '',
              );
              const cursoUrl = `${frontendUrl}/lms/cursos/${row.curso_id}`;
              const nomeAluno = func.nome || `Funcionário ${row.funcionario_id}`;

              await sendEmail(env, {
                to: [{ email: func.email, name: nomeAluno }],
                subject: `Treinamento disponível: ${row.curso_titulo}`,
                textContent: [
                  `Olá ${nomeAluno},`,
                  '',
                  `Sua qualificação EAD vence em breve. Você foi matriculado automaticamente no curso: ${row.curso_titulo}`,
                  '',
                  `Acesse: ${cursoUrl}`,
                  '',
                  'Este e-mail foi enviado automaticamente pela plataforma AirTrust.',
                ].join('\n'),
                htmlContent: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
                  <p>Olá <strong>${nomeAluno}</strong>,</p>
                  <p>Sua qualificação EAD vence em breve. Você foi matriculado automaticamente no curso:</p>
                  <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:12px 0;border-radius:4px">
                    <p style="font-size:16px;font-weight:600;margin:0;color:#1e3a5f">${row.curso_titulo}</p>
                  </div>
                  <p style="margin:24px 0"><a href="${cursoUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Acessar curso</a></p>
                  <p style="color:#6b7280;font-size:12px;margin-top:24px">Este e-mail foi enviado automaticamente pela plataforma AirTrust.</p>
                </div>`,
              });
            }
          } catch (emailErr) {
            console.warn('[CRON] ⚠️ Falha ao enviar email de renovação EAD:', emailErr);
          }

          matriculasCriadas++;
        } catch (err) {
          console.error('[CRON] ❌ Erro ao criar matrícula automática de renovação:', err);
        }
      }

      console.log(`[CRON] ✅ Matrículas de renovação EAD disponibilizadas: ${matriculasCriadas}`);
    } catch (renovacaoErr) {
      console.error('[CRON] ❌ Erro no processo de renovação automática LMS:', renovacaoErr);
    }
  }

  try {
    const hora = new Date().getUTCHours();
    const diaSemana = new Date().getUTCDay();
    const diaDoMes = new Date().getUTCDate();

    const { BackupOrchestrator } = await import('../services/backup/orchestrator');
    const orchestrator = new BackupOrchestrator(env);

    if (hora === 3) {
      console.log('[CRON] 📦 Iniciando backup diário...');
      await orchestrator.executarBackupAutomatico('DIARIO');
      console.log('[CRON] ✅ Backup diário concluído');
    } else if (hora === 4 && diaSemana === 0) {
      console.log('[CRON] 📦 Iniciando backup semanal...');
      await orchestrator.executarBackupAutomatico('SEMANAL');
      console.log('[CRON] ✅ Backup semanal concluído');
    } else if (hora === 5 && diaDoMes === 1) {
      console.log('[CRON] 📦 Iniciando backup mensal...');
      await orchestrator.executarBackupAutomatico('MENSAL');
      console.log('[CRON] ✅ Backup mensal concluído');
    }
  } catch (backupErr) {
    console.error('[CRON] ❌ Erro no backup automático:', backupErr);
  }

  try {
    const db = env.DB;
    let stats: {
      total: number;
      validas: number;
      vencendo: number;
      vencidas: number;
      indeterminadas: number;
    } | null = null;

    try {
      stats = await db
        .prepare(
          'SELECT total, validas, vencendo, vencidas, indeterminadas FROM qualificacoes_historico_stats_v LIMIT 1',
        )
        .first<{
          total: number;
          validas: number;
          vencendo: number;
          vencidas: number;
          indeterminadas: number;
        }>();
      console.log('[CRON] Snapshot qualificacoes:', stats);
    } catch (e) {
      console.warn('[CRON] View stats indisponível, ignorando snapshot:', (e as Error).message);
    }

    if (stats) {
      let materialized = false;
      try {
        await db
          .prepare(
            `INSERT OR IGNORE INTO qualificacoes_historico_stats_daily
             (snapshot_date, total, validas, vencendo, vencidas, indeterminadas)
             VALUES (date('now'), ?, ?, ?, ?, ?)`,
          )
          .bind(
            stats.total || 0,
            stats.validas || 0,
            stats.vencendo || 0,
            stats.vencidas || 0,
            stats.indeterminadas || 0,
          )
          .run();
        console.log('[CRON] Materialização diária (schema v2) registrada.');
        materialized = true;
      } catch (e) {
        try {
          await db
            .prepare(
              `INSERT OR IGNORE INTO qualificacoes_historico_stats_daily
               (day, scope_hash, total, validas, vencendo, vencidas, renovadas)
               VALUES (date('now'), 'GLOBAL', ?, ?, ?, ?, 0)`,
            )
            .bind(stats.total || 0, stats.validas || 0, stats.vencendo || 0, stats.vencidas || 0)
            .run();
          console.log('[CRON] Materialização diária (schema legacy) registrada.');
          materialized = true;
        } catch (e2) {
          console.warn(
            '[CRON] Falha ao materializar stats diária em ambos esquemas:',
            (e2 as Error).message,
            'Erro primário schema v2:',
            (e as Error).message,
          );
        }
      }

      if (!materialized) {
        console.warn('[CRON] Nenhuma materialização diária registrada.');
      }
    }

    try {
      const latencySamples = await db
        .prepare(
          `SELECT route, method, latency_ms FROM api_latency_samples WHERE snapshot_date = date('now')`,
        )
        .all<{ route: string; method: string; latency_ms: number }>();

      if (Array.isArray(latencySamples.results) && latencySamples.results.length) {
        const aggMap: Record<string, { route: string; method: string; durations: number[] }> = {};
        for (const sample of latencySamples.results) {
          const key = `${sample.route}__${sample.method}`;
          if (!aggMap[key]) {
            aggMap[key] = { route: sample.route, method: sample.method, durations: [] };
          }
          aggMap[key].durations.push(sample.latency_ms);
        }

        for (const key of Object.keys(aggMap)) {
          const { route, method, durations } = aggMap[key];
          durations.sort((a, b) => a - b);
          const calls = durations.length;
          const avg = durations.reduce((a, b) => a + b, 0) / calls;
          const percentile = (pct: number) => {
            const idx = Math.ceil((pct / 100) * calls) - 1;
            return durations[Math.max(0, Math.min(idx, calls - 1))];
          };

          await db
            .prepare(
              `INSERT OR REPLACE INTO api_latency_daily (day, route, method, calls, avg_ms, p95_ms, p99_ms, max_ms)
               VALUES (date('now'), ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(route, method, calls, avg, percentile(95), percentile(99), durations[calls - 1])
            .run();
        }
        console.log('[CRON] Agregação diária de latência registrada.');

        const p95ThresholdRaw =
          (env as unknown as Record<string, string>).LATENCY_P95_THRESHOLD || '800';
        const p99ThresholdRaw =
          (env as unknown as Record<string, string>).LATENCY_P99_THRESHOLD || '1500';
        const p95Threshold = parseInt(p95ThresholdRaw, 10);
        const p99Threshold = parseInt(p99ThresholdRaw, 10);

        try {
          const todayAgg = await db
            .prepare(
              `SELECT route, method, p95_ms, p99_ms, calls FROM api_latency_daily WHERE day = date('now') ORDER BY p95_ms DESC`,
            )
            .all<{
              route: string;
              method: string;
              p95_ms: number;
              p99_ms: number;
              calls: number;
            }>();

          if (todayAgg.results?.length) {
            for (const row of todayAgg.results) {
              if (row.p95_ms > p95Threshold || row.p99_ms > p99Threshold) {
                console.warn(
                  `[ALERTA_LATENCIA] Rota=${row.route} metodo=${row.method} calls=${row.calls} p95=${row.p95_ms}ms p99=${row.p99_ms}ms (thresholds p95>${p95Threshold} / p99>${p99Threshold})`,
                );
                const webhookUrl = (env as unknown as Record<string, string>).ALERT_WEBHOOK_URL;
                if (webhookUrl) {
                  const timeoutMsRaw =
                    (env as unknown as Record<string, string>).ALERT_WEBHOOK_TIMEOUT_MS || '4000';
                  const controller = new AbortController();
                  const timeout = setTimeout(() => controller.abort(), parseInt(timeoutMsRaw, 10));
                  const payload = {
                    text: `ALERTA LATENCIA: ${row.route} ${row.method} p95=${row.p95_ms}ms p99=${row.p99_ms}ms calls=${row.calls}`,
                    route: row.route,
                    method: row.method,
                    calls: row.calls,
                    p95_ms: row.p95_ms,
                    p99_ms: row.p99_ms,
                    thresholds: { p95: p95Threshold, p99: p99Threshold },
                    day: new Date().toISOString().substring(0, 10),
                  };

                  try {
                    await fetch(webhookUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                      signal: controller.signal,
                    });
                    console.log('[ALERTA_LATENCIA] Webhook enviado.');
                  } catch (whErr) {
                    console.warn('[ALERTA_LATENCIA] Falha webhook:', (whErr as Error).message);
                  } finally {
                    clearTimeout(timeout);
                  }
                }
              }
            }
          }
        } catch (alertErr) {
          console.warn('[CRON] Falha ao checar alertas latência:', (alertErr as Error).message);
        }
      } else {
        console.log('[CRON] Sem amostras de latência para agregar hoje.');
      }
    } catch (e) {
      console.warn('[CRON] Falha ao agregar latência diária:', (e as Error).message);
    }

    try {
      const purgeDaysRaw =
        (env as unknown as Record<string, string>).SOFT_DELETE_PURGE_DAYS || '90';
      const purgeDays = parseInt(purgeDaysRaw, 10);
      if (purgeDays > 0) {
        const tables = [
          'qualificacoes_historico',
          'funcionarios',
          'qualificacoes_tipos',
          'habilitacoes',
          'licencas',
        ];

        for (const tableName of tables) {
          try {
            const stmt = await db
              .prepare(
                `DELETE FROM ${tableName} WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) > ?`,
              )
              .bind(purgeDays)
              .run();
            if (stmt.meta.changes > 0) {
              console.log(`[PURGE] ${tableName} removidos definitivos: ${stmt.meta.changes}`);
            }
          } catch (purgeErr) {
            console.warn(`[PURGE] Falha em ${tableName}:`, (purgeErr as Error).message);
          }
        }
      }
    } catch (purgeGlobalErr) {
      console.warn('[PURGE] Erro geral na rotina de limpeza:', (purgeGlobalErr as Error).message);
    }

    try {
      console.log('[CRON] 🔔 Iniciando processamento de notificações...');
      await processarNotificacoes(env);
      console.log('[CRON] ✅ Notificações processadas com sucesso');
    } catch (notifErr) {
      console.error('[CRON] ❌ Erro ao processar notificações:', notifErr);
    }

    try {
      console.log('[CRON] 🛡️ Iniciando processamento de notificações SGSO...');
      const resultadoSgso = await processarNotificacoesSgso(env);
      console.log(
        `[CRON] ✅ SGSO notificações: ${resultadoSgso.processadas} processadas, ${resultadoSgso.enviadas} enviadas, ${resultadoSgso.falhas} falhas`,
      );
    } catch (sgsoNotifErr) {
      console.error('[CRON] ❌ Erro ao processar notificações SGSO:', sgsoNotifErr);
    }

    try {
      console.log('[CRON] ⏱️ Verificando violações de SLA SGSO...');
      const slaResult = await enqueueSlaAlerts(env);
      console.log(
        `[CRON] ✅ SLA SGSO: ${slaResult.alertasTriagem} alertas triagem, ${slaResult.alertasInvestigacao} alertas investigação, ${slaResult.alertasBarreiras} alertas barreiras`,
      );
    } catch (slaErr) {
      console.error('[CRON] ❌ Erro ao verificar SLAs SGSO:', slaErr);
    }

    try {
      const suspeitos = await env.DB.prepare(
        `
        SELECT
          qh.funcionario_id,
          f.nome,
          f.empresa_id,
          COUNT(*) as total_historico,
          SUM(CASE WHEN qh.deleted_at IS NULL THEN 1 ELSE 0 END) as ativos
        FROM qualificacoes_historico qh
        LEFT JOIN funcionarios f ON f.id = CAST(qh.funcionario_id AS INTEGER)
        WHERE f.deleted_at IS NULL
        GROUP BY qh.funcionario_id
        HAVING total_historico > 0 AND ativos = 0
      `,
      ).all<{
        funcionario_id: number;
        nome: string;
        empresa_id: number | null;
        total_historico: number;
        ativos: number;
      }>();

      if (suspeitos.results?.length) {
        const todosNomes = suspeitos.results
          .map((row) => `${row.nome} (#${row.funcionario_id}, ${row.total_historico} registros)`)
          .join('; ');
        console.warn(
          `[CRON] ⚠️ AUDITORIA SOFT-DELETE: ${suspeitos.results.length} funcionário(s) com qualificações todas deletadas: ${todosNomes}`,
        );

        // Contains employee names/PII — must be scoped per tenant, never a single
        // cross-tenant record. Group findings by empresa_id and emit one
        // notification per affected tenant.
        const porEmpresa = new Map<number, typeof suspeitos.results>();
        for (const row of suspeitos.results) {
          if (row.empresa_id == null) continue;
          const lista = porEmpresa.get(row.empresa_id) || [];
          lista.push(row);
          porEmpresa.set(row.empresa_id, lista);
        }

        for (const [empresaId, rows] of porEmpresa) {
          const nomes = rows
            .map((row) => `${row.nome} (#${row.funcionario_id}, ${row.total_historico} registros)`)
            .join('; ');

          await env.DB.prepare(
            `
            INSERT INTO notificacoes_sistema (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
            VALUES ('ALERTA_DADOS', 'ALTA', 'Auditoria: Qualificações removidas em massa', ?, 'auditoria', ?, ?, datetime('now'), datetime('now'))
          `,
          )
            .bind(
              `${rows.length} funcionário(s) com TODOS os registros de qualificações marcados como deletados. Verificar manualmente: ${nomes}`,
              JSON.stringify({ funcionarios: rows }),
              empresaId,
            )
            .run();
        }
      } else {
        console.log('[CRON] ✅ Auditoria soft-delete: nenhuma anomalia detectada');
      }
    } catch (auditErr) {
      console.error('[CRON] ❌ Erro na auditoria soft-delete:', auditErr);
    }

    // Reuse the daily 08:00 UTC trigger for FRMS to stay within Cloudflare's 5-cron limit.
    if (event.cron === '0 8 * * *') {
      try {
        const audit = await runFrmsIntegrityAudit(env.DB);
        const totalAnomalias =
          audit.jornadasSemFatorizacao +
          audit.jornadasLancadasForaQuinzena +
          audit.rollingSemJornadaRecente;

        if (totalAnomalias > 0) {
          // Global/platform audit notification: keep empresa_id NULL intentionally.
          // Unlike the soft-delete and weekly-qualifications audits below, this
          // payload carries only aggregate counts (no employee names or other
          // tenant-identifying records), so a single cross-tenant notification
          // does not leak PII.
          await env.DB.prepare(
            `INSERT INTO notificacoes_sistema (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
             VALUES ('ALERTA_DADOS', 'ALTA', 'Auditoria diária FRMS: inconsistências detectadas', ?, 'auditoria', ?, NULL, datetime('now'), datetime('now'))`,
          )
            .bind(
              `FRMS detectou inconsistências: ${audit.jornadasSemFatorizacao} jornada(s) sem fatorização, ${audit.jornadasLancadasForaQuinzena} jornada(s) lançada(s) fora da quinzena (tolerância ±2 dias), ${audit.rollingSemJornadaRecente} linha(s) de rolling sem jornada nos últimos 120 dias.`,
              JSON.stringify(audit),
            )
            .run();
          console.warn('[CRON] ⚠️ Auditoria diária FRMS detectou anomalias:', audit);
        } else {
          console.log('[CRON] ✅ Auditoria diária FRMS: sem inconsistências.');
        }
      } catch (frmsAuditErr) {
        console.error('[CRON] ❌ Erro na auditoria diária FRMS:', frmsAuditErr);
      }

      try {
        console.log('[CRON] ✈️ Iniciando checagem diária FRMS...');
        const frmsResult = await frmsDailyCheck(env);
        console.log(
          `[CRON] ✅ FRMS: ${frmsResult.tripulantesProcessados} tripulantes, ${frmsResult.alertasGerados} alertas`,
        );
      } catch (frmsErr) {
        console.error('[CRON] ❌ Erro no FRMS daily check:', frmsErr);
      }

      try {
        console.log('[CRON] 🌙 Iniciando reminders de check-in de fadiga...');
        const reminderResult = await frmsFadigaReminder(env);
        console.log(
          `[CRON] ✅ Reminder FRMS check-in: ${reminderResult.notificacoes} notificações`,
        );
      } catch (reminderErr) {
        console.error('[CRON] ❌ Erro no reminder de check-in de fadiga:', reminderErr);
      }
    }

    const diaSemanaHoje = new Date().getUTCDay();
    if (diaSemanaHoje === 1) {
      try {
        console.log('[CRON] 📅 Alerta semanal de qualificações ≤90 dias...');
        const vencExpr = getQualificacoesVencimentoExpr();
        const qualifs90 = await env.DB.prepare(
          `SELECT
                f.empresa_id AS empresa_id,
                f.nome AS funcionario_nome,
                COALESCE(qh.qualificacao_codigo, qt.codigo) AS codigo,
                qt.nome AS qualificacao_nome,
                qt.categoria,
                ${vencExpr} AS validade_fim,
                CAST(
                  JULIANDAY(${vencExpr}) - JULIANDAY('now') AS INTEGER
                ) AS dias_restantes
             FROM qualificacoes_historico qh
             JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
             LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.empresa_id = qh.empresa_id AND qt.deleted_at IS NULL
             WHERE qh.deleted_at IS NULL
               AND ${sqlStatusNotEqualsAny("UPPER(COALESCE(qh.status, 'CONCLUIDA'))", CANCELLED_STATUS_VALUES)}
               AND CAST(
                 JULIANDAY(${vencExpr}) - JULIANDAY('now') AS INTEGER
               ) BETWEEN 1 AND 90
               AND qh.id IN (
                 SELECT MAX(sub.id) FROM qualificacoes_historico sub
                 WHERE sub.deleted_at IS NULL
                 GROUP BY sub.empresa_id, sub.funcionario_id, COALESCE(sub.qualificacao_codigo, sub.qualificacao_id)
               )
             ORDER BY f.empresa_id ASC, dias_restantes ASC`,
        ).all<{
          empresa_id: number | null;
          funcionario_nome: string;
          codigo: string;
          qualificacao_nome: string;
          categoria: string;
          validade_fim: string;
          dias_restantes: number;
        }>();

        const items = qualifs90.results || [];
        if (items.length > 0) {
          // Contains employee names/PII — must be scoped per tenant, never a
          // single cross-tenant record. Group by empresa_id and emit one
          // notification per affected tenant, each with only that tenant's data.
          const porEmpresa = new Map<number, typeof items>();
          for (const item of items) {
            if (item.empresa_id == null) continue;
            const lista = porEmpresa.get(item.empresa_id) || [];
            lista.push(item);
            porEmpresa.set(item.empresa_id, lista);
          }

          for (const [empresaId, empresaItems] of porEmpresa) {
            const criticos = empresaItems.filter((item) => item.dias_restantes <= 30);
            const alertas = empresaItems.filter(
              (item) => item.dias_restantes > 30 && item.dias_restantes <= 60,
            );
            const avisos = empresaItems.filter((item) => item.dias_restantes > 60);
            const linhas = empresaItems
              .slice(0, 50)
              .map(
                (item) =>
                  `• ${item.funcionario_nome} — ${item.codigo} (${item.qualificacao_nome || ''}) — ${item.dias_restantes}d`,
              )
              .join('\n');

            await env.DB.prepare(
              `INSERT INTO notificacoes_sistema (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
                 VALUES ('ALERTA_SEMANAL_QUALIFICACOES', 'ALTA',
                   'Resumo semanal: qualificações expirando em ≤90 dias',
                   ?, 'qualificacoes',
                   ?, ?, datetime('now'), datetime('now'))`,
            )
              .bind(
                `${empresaItems.length} qualificações expiram nos próximos 90 dias (${criticos.length} críticas ≤30d, ${alertas.length} alerta ≤60d, ${avisos.length} aviso ≤90d).\n\n${linhas}`,
                JSON.stringify({
                  total: empresaItems.length,
                  criticos: criticos.length,
                  alertas: alertas.length,
                  avisos: avisos.length,
                }),
                empresaId,
              )
              .run();
          }
          console.log(`[CRON] ✅ Alerta semanal: ${items.length} qualificações ≤90d`);
        } else {
          console.log('[CRON] ✅ Alerta semanal: nenhuma qualificação ≤90d');
        }
      } catch (weeklyErr) {
        console.error('[CRON] ❌ Erro no alerta semanal qualificações:', weeklyErr);
      }
    }
  } catch (error) {
    console.error('[CRON] Erro ao executar job agendado:', error);
  }

  // Processar domain events pendentes para todas as empresas ativas
  // Garante que eventos publicados por cron jobs ou sem contexto de request sejam consumidos
  try {
    const MODULOS = [
      'escalas',
      'frms',
      'qualificacoes',
      'simuladores',
      'hospedagem',
      'pasta_virtual',
      'compliance',
    ] as const;

    const empresas = await env.DB.prepare(
      `SELECT DISTINCT id FROM empresas WHERE deleted_at IS NULL LIMIT 50`,
    ).all<{ id: number }>();

    const ids = (empresas.results || []).map((r) => String(r.id));

    let totalProcessados = 0;
    let totalErros = 0;
    for (const empresaId of ids) {
      for (const modulo of MODULOS) {
        try {
          const resultado = await processarEventosParaModulo(env.DB, empresaId, modulo, 50);
          totalProcessados += resultado.processados;
          totalErros += resultado.erros;
        } catch {
          // erros por módulo não impedim outros
        }
      }
    }

    if (totalProcessados > 0 || totalErros > 0) {
      console.log(
        `[CRON] Domain events: ${totalProcessados} processados, ${totalErros} erros (${ids.length} empresas)`,
      );
    }
  } catch (eventsErr) {
    console.error('[CRON] ❌ Erro ao processar domain events:', eventsErr);
  }
}

// ─── SIGVOOS Sync + FRMS Reprocess (hora UTC configurada por empresa) ─────
async function runSigvoosFrmsDailySync(
  db: D1Database,
  console: ReturnType<typeof createStructuredConsole>,
  env: Env,
): Promise<void> {
  console.log('[SIGVOOS_CRON] Iniciando sincronização automática SIGVOOS + FRMS...');
  const now = new Date();
  const currentUtcHour = now.getUTCHours();
  const currentUtcMinute = now.getUTCMinutes();

  // Find all empresas that have SIGVOOS credentials configured
  type ConfigRow = { empresa_id: number | null };
  const empresasResult = await db
    .prepare(
      `SELECT DISTINCT empresa_id
         FROM integracoes_sigvoos_config
        WHERE chave = 'username'
          AND valor IS NOT NULL
          AND valor != ''
          AND deleted_at IS NULL`,
    )
    .all<ConfigRow>();

  const empresas = empresasResult.results ?? [];
  if (empresas.length === 0) {
    console.log('[SIGVOOS_CRON] Nenhuma empresa com SIGVOOS configurado.');
    return;
  }

  for (const row of empresas) {
    const empresaId = row.empresa_id;
    try {
      const config = await getSigvoosConfig(db, empresaId, undefined, env);
      const autoSyncEnabled = config.auto_sync_enabled !== 'false';
      if (!autoSyncEnabled) {
        console.log(
          `[SIGVOOS_CRON] Empresa ${empresaId ?? 'global'}: auto_sync desabilitado, pulando.`,
        );
        continue;
      }

      if (!config.username || !config.password) {
        console.log(
          `[SIGVOOS_CRON] Empresa ${empresaId ?? 'global'}: credenciais ausentes, pulando.`,
        );
        continue;
      }

      const configHour = Number.parseInt(config.auto_sync_hora_utc ?? '19', 10);
      const targetHour = Number.isFinite(configHour) ? Math.max(0, Math.min(23, configHour)) : 19;

      const fmtSaoPauloDate = (date: Date): string =>
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(date);

      // Execucao estrita no horario UTC configurado, mas sincronizando o dia operacional atual em BRT.
      if (currentUtcHour !== targetHour || currentUtcMinute >= 10) {
        continue;
      }

      const operationalDate = fmtSaoPauloDate(now);

      // Já sincronizou o dia atual — nada a fazer.
      if (config.last_sync_to === operationalDate) {
        continue;
      }

      // Se houve dias sem sincronização (ex: falha de rede, cron miss), preenche o gap
      // começando do dia seguinte ao último sync bem-sucedido, limitado a 7 dias atrás.
      const addIsoDay = (iso: string, days: number): string => {
        const d = new Date(`${iso}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
      };

      let fromDate = operationalDate;
      if (config.last_sync_to) {
        const candidate = addIsoDay(config.last_sync_to, 1);
        const maxLookback = addIsoDay(operationalDate, -7);
        if (candidate < operationalDate && candidate >= maxLookback) {
          fromDate = candidate;
        }
      }

      const window = { from: fromDate, to: operationalDate };

      console.log(
        `[SIGVOOS_CRON] Empresa ${empresaId ?? 'global'}: sincronizando ${window.from} → ${window.to}`,
      );
      const result = await syncSigvoosForFrms(
        db,
        empresaId,
        'cron',
        {
          from: window.from,
          to: window.to,
          clearExisting: false,
        },
        env,
      );

      await upsertSigvoosConfig(db, 'last_sync_at', new Date().toISOString(), empresaId);
      await upsertSigvoosConfig(db, 'last_sync_from', result.periodo.from, empresaId);
      await upsertSigvoosConfig(db, 'last_sync_to', result.periodo.to, empresaId);
      await upsertSigvoosConfig(
        db,
        'last_sync_total_raw',
        String(result.totalRegistrosBrutos ?? 0),
        empresaId,
      );
      await upsertSigvoosConfig(
        db,
        'last_sync_total_importacoes',
        String(result.totalImportacoes ?? 0),
        empresaId,
      );

      // SHADOW-MODE (somente leitura/comparação): migração arquitetural
      // SIGVOOS → Controle de Voos → FRMS (ver docs/frms-controle-voos-migracao.md).
      // Desativado por padrão; não altera o caminho legado nem grava dados.
      if (empresaId !== null && isControleVoosShadowModeEnabledForEmpresa(empresaId, env)) {
        try {
          const [cvRecords, legacyJornadaRows] = await Promise.all([
            fetchControleVoosOperationalRecords(db, empresaId, window.from, window.to),
            db
              .prepare(
                `SELECT tripulante_id, data, empresa_id
                   FROM frms_jornada
                  WHERE empresa_id = ? AND data BETWEEN ? AND ?`,
              )
              .bind(empresaId, window.from, window.to)
              .all<FrmsJornadaLegacyRow>()
              .then((r) => r.results ?? []),
          ]);
          const shadowSummary = compareControleVoosWithLegacyJornada(
            cvRecords,
            legacyJornadaRows,
            window,
          );
          console.log(
            `[SIGVOOS_CRON] [SHADOW] Empresa ${empresaId}: legado=${shadowSummary.totalRegistrosLegado} controle_voos=${shadowSummary.totalRegistrosControleVoos} divergencias=${shadowSummary.totalDivergencias}`,
            { divergenciasPorTipo: shadowSummary.divergenciasPorTipo },
          );
        } catch (shadowErr) {
          console.warn(
            `[SIGVOOS_CRON] [SHADOW] Empresa ${empresaId}: erro na comparação Controle de Voos (não afeta o caminho legado):`,
            (shadowErr as Error).message,
          );
        }
      }

      console.log(
        `[SIGVOOS_CRON] Empresa ${empresaId ?? 'global'}: ${result.totalImportacoes ?? 0} voos importados. Iniciando reprocessamento FRMS...`,
      );

      // Reprocess FRMS for all active tripulantes affected in the sync window
      const tripulantesResult = await db
        .prepare(
          `SELECT DISTINCT tripulante_id
             FROM frms_jornada
            WHERE data BETWEEN ? AND ?
              ${empresaId !== null ? 'AND empresa_id = ?' : ''}
            LIMIT 200`,
        )
        .bind(
          ...(empresaId !== null
            ? [result.periodo.from, result.periodo.to, empresaId]
            : [result.periodo.from, result.periodo.to]),
        )
        .all<{ tripulante_id: number }>();

      const tripulanteIds = (tripulantesResult.results ?? []).map((r) => r.tripulante_id);

      if (tripulanteIds.length > 0) {
        // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
        for (const tripId of tripulanteIds) {
          try {
            await reprocessarTripulanteCompleto(db, tripId, LIMITES_DEFAULT);
          } catch (e) {
            console.warn(
              `[SIGVOOS_CRON] Falha ao reprocessar tripulante ${tripId}:`,
              (e as Error).message,
            );
          }
        }
        console.log(
          `[SIGVOOS_CRON] Empresa ${empresaId ?? 'global'}: FRMS reprocessado para ${tripulanteIds.length} tripulante(s).`,
        );
      } else {
        console.log(
          `[SIGVOOS_CRON] Empresa ${empresaId ?? 'global'}: nenhum tripulante afetado no período.`,
        );
      }
    } catch (err) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SIGVOOS_CRON] ❌ Erro empresa ${empresaId ?? 'global'}:`, err);

      // Registrar evento da falha no banco
      await registrarEventoSigvoosFalha(
        db,
        empresaId,
        'CRON_FALHA',
        'Sincronização SIGVOOS falhou durante execução automática',
        err,
      );

      // Tentar enviar email de alerta para o admin configurado
      try {
        const config = await getSigvoosConfig(db, empresaId, undefined, env);
        const emailAdmin = config.notificar_falha_email;
        if (emailAdmin && env.BREVO_API_KEY) {
          const dataEvento = new Date().toISOString().split('T')[0];
          const assunto = `[AirTrust] ⚠️ Falha na sincronização FRMS automática - ${dataEvento}`;
          const corpo = `A sincronização automática do SIGVOOS de ${dataEvento} falhou ou retornou 0 etapas. Os dados de fadiga do dia podem estar incompletos.\n\nDetalhes do erro: ${erroMsg}\n\nEmpresa: ${empresaId ?? 'Global'}\n\nPor favor, contate o suporte se o problema persistir.`;

          await enviarEmailAlert(env, [emailAdmin], assunto, corpo);
          console.log(`[SIGVOOS_CRON] Email de alerta enviado para ${emailAdmin}`);
        }
      } catch (emailErr) {
        console.warn(`[SIGVOOS_CRON] Erro ao enviar email de alerta:`, emailErr);
        // Não rethrow - continuamos mesmo se o email falhar
      }
    }
  }
}
