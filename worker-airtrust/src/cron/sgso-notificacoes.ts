import type { Env } from '../types';

type SgsoQueueRow = {
  id: number;
  relato_id: string;
  empresa_id: number;
  template_codigo: string;
  destino_tipo: 'RELATOR' | 'GSO' | 'GESTOR_OPERACIONAL' | 'SISTEMA';
  payload_json: string | null;
  numero_protocolo: string | null;
  relato_status: string | null;
  relator_id: number | null;
  anonimo: number | null;
  clareza_status: string | null;
  sinal_tendencia: string | null;
};

type NotificationContent = {
  tipo: string;
  titulo: string;
  mensagem: string;
};

const GSO_ROLE_CANDIDATES = [
  'GSO',
  'SMS',
  'SGSO',
  'SEGURANCA OPERACIONAL',
  'SAFETY',
  'SAFETY MANAGER',
  'GERENTE SMS',
  'COORDENADOR SMS',
];

const OPS_MANAGER_ROLE_CANDIDATES = [
  'GESTOR OPERACIONAL',
  'GESTOR_OPERACIONAL',
  'GERENTE OPERACIONAL',
  'COORDENADOR OPERACIONAL',
  'DIRETOR OPERACIONAL',
  'SUPERVISOR OPERACIONAL',
];

function uuid(): string {
  return crypto.randomUUID();
}

function safeJsonParse(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return (JSON.parse(value) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

function buildNotificationContent(row: SgsoQueueRow): NotificationContent {
  const payload = safeJsonParse(row.payload_json);
  const numeroProtocolo = String(payload.numero_protocolo ?? row.numero_protocolo ?? row.relato_id);
  const status = String(payload.status ?? row.relato_status ?? 'ABERTO');
  const trendSignal = String(payload.trend_signal ?? row.sinal_tendencia ?? 'SEM_SINAL');
  const clarityStatus = String(payload.clarity_status ?? row.clareza_status ?? 'APROVADO');

  switch (row.template_codigo) {
    case 'RELPREV_RECEBIDO':
      return {
        tipo: 'sgso_relprev_recebido',
        titulo: 'Relato SGSO recebido',
        mensagem: `Protocolo ${numeroProtocolo} registrado com status ${status}.`,
      };
    case 'RELPREV_TRIAGEM_MANUAL':
      return {
        tipo: 'sgso_relprev_triagem_manual',
        titulo: 'Triagem SGSO requer revisao',
        mensagem: `Protocolo ${numeroProtocolo} entrou em revisao manual de triagem (${clarityStatus}).`,
      };
    case 'RELPREV_TENDENCIA':
      return {
        tipo: 'sgso_relprev_tendencia',
        titulo: 'Tendencia SGSO detectada',
        mensagem: `Protocolo ${numeroProtocolo} sinalizou tendencia ${trendSignal} e exige acompanhamento.`,
      };
    case 'RELPREV_SLA_TRIAGEM':
      return {
        tipo: 'sgso_sla_triagem',
        titulo: 'SLA de triagem vencido',
        mensagem: `Protocolo ${numeroProtocolo} ultrapassou o prazo de triagem (> 24h). Triagem imediata necessaria.`,
      };
    case 'RELPREV_SLA_INVESTIGACAO':
      return {
        tipo: 'sgso_sla_investigacao',
        titulo: 'SLA de investigacao vencido',
        mensagem: `Protocolo ${numeroProtocolo} ultrapassou o prazo de investigacao (> 72h). Acao do gestor operacional necessaria.`,
      };
    case 'BARREIRAS_DEGRADADAS_ALERTA':
      return {
        tipo: 'sgso_barreiras_degradadas',
        titulo: 'Barreiras de seguranca degradadas',
        mensagem: `${String(safeJsonParse(row.payload_json).count ?? '')} barreira(s) em estado DEGRADADA ou INOPERANTE por mais de 48h. Verificacao necessaria.`,
      };
    default:
      return {
        tipo: 'sgso_relato',
        titulo: 'Atualizacao SGSO',
        mensagem: `Protocolo ${numeroProtocolo} recebeu uma nova atualizacao.`,
      };
  }
}

async function resolveUsersByRole(
  db: D1Database,
  empresaId: number,
  candidates: string[],
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const placeholders = candidates.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id
       FROM funcionarios
       WHERE empresa_id = ?
         AND deleted_at IS NULL
         AND (COALESCE(ativo, 1) = 1 OR UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO')
         AND (
           UPPER(TRIM(COALESCE(cargo, ''))) IN (${placeholders})
           OR UPPER(TRIM(COALESCE(funcao, ''))) IN (${placeholders})
         )`,
    )
    .bind(empresaId, ...candidates, ...candidates)
    .all<{ id: number }>();

  return Array.from(new Set((rows.results || []).map((row) => String(row.id))));
}

async function resolveRecipients(db: D1Database, row: SgsoQueueRow): Promise<string[]> {
  if (row.destino_tipo === 'RELATOR') {
    if (row.anonimo === 1 || row.relator_id === null) return [];
    return [String(row.relator_id)];
  }

  if (row.destino_tipo === 'GSO') {
    return resolveUsersByRole(db, row.empresa_id, GSO_ROLE_CANDIDATES);
  }

  if (row.destino_tipo === 'GESTOR_OPERACIONAL') {
    return resolveUsersByRole(db, row.empresa_id, OPS_MANAGER_ROLE_CANDIDATES);
  }

  return [];
}

async function insertInAppNotification(
  db: D1Database,
  row: SgsoQueueRow,
  funcionarioId: string,
  content: NotificationContent,
) {
  const existing = await db
    .prepare(
      `SELECT id
       FROM notificacoes_inapp
       WHERE funcionario_id = ?
         AND empresa_id = ?
         AND tipo = ?
         AND referencia_id = ?
         AND referencia_tipo = 'sgso_relato'
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, row.empresa_id, content.tipo, row.relato_id)
    .first<{ id: string }>();

  if (existing?.id) return;

  await db
    .prepare(
      `INSERT INTO notificacoes_inapp
       (id, funcionario_id, empresa_id, tipo, titulo, mensagem, referencia_id, referencia_tipo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sgso_relato', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    )
    .bind(
      uuid(),
      funcionarioId,
      row.empresa_id,
      content.tipo,
      content.titulo,
      content.mensagem,
      row.relato_id,
    )
    .run();
}

export async function processarNotificacoesSgso(env: Env): Promise<{
  processadas: number;
  enviadas: number;
  falhas: number;
}> {
  const rows = await env.DB.prepare(
    `SELECT n.id, n.relato_id, n.empresa_id, n.template_codigo, n.destino_tipo, n.payload_json,
            r.numero_protocolo, r.status AS relato_status, r.relator_id, r.anonimo,
            ai.clareza_status, ai.sinal_tendencia
     FROM sgso_relato_notificacoes n
     JOIN sgso_relatos r ON r.id = n.relato_id AND r.empresa_id = n.empresa_id AND r.deleted_at IS NULL
     LEFT JOIN sgso_relato_ia_triagem ai ON ai.relato_id = r.id
     WHERE n.status = 'PENDENTE' AND n.canal = 'INAPP'
     ORDER BY n.created_at ASC
     LIMIT 100`,
  ).all<SgsoQueueRow>();

  let processadas = 0;
  let enviadas = 0;
  let falhas = 0;

  for (const row of rows.results || []) {
    processadas += 1;

    try {
      const recipients = await resolveRecipients(env.DB, row);
      if (recipients.length === 0) {
        await env.DB.prepare(
          `UPDATE sgso_relato_notificacoes
           SET status = 'FALHA', erro_ultimo_envio = ?, enviada_em = NULL
           WHERE id = ?`,
        )
          .bind('Nenhum destinatario elegivel encontrado para esta notificacao.', row.id)
          .run();
        falhas += 1;
        continue;
      }

      const content = buildNotificationContent(row);
      for (const recipient of recipients) {
        await insertInAppNotification(env.DB, row, recipient, content);
      }

      await env.DB.prepare(
        `UPDATE sgso_relato_notificacoes
         SET status = 'ENVIADA', enviada_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), erro_ultimo_envio = NULL
         WHERE id = ?`,
      )
        .bind(row.id)
        .run();
      enviadas += 1;
    } catch (error) {
      await env.DB.prepare(
        `UPDATE sgso_relato_notificacoes
         SET status = 'FALHA', erro_ultimo_envio = ?
         WHERE id = ?`,
      )
        .bind(error instanceof Error ? error.message : 'Erro ao processar notificacao SGSO', row.id)
        .run();
      falhas += 1;
    }
  }

  return { processadas, enviadas, falhas };
}

/**
 * Varre todos os tenants ativos e enfileira alertas autom\u00e1ticos para:
 * 1. Relatos ABERTO/EM_TRIAGEM com SLA de triagem vencido (sem notifica\u00e7\u00e3o j\u00e1 enviada)
 * 2. Relatos EM_TRIAGEM com SLA de investiga\u00e7\u00e3o vencido
 * 3. Barreiras DEGRADADA/INOPERANTE sem atualiza\u00e7\u00e3o h\u00e1 mais de 48h
 */
export async function enqueueSlaAlerts(env: Env): Promise<{
  alertasTriagem: number;
  alertasInvestigacao: number;
  alertasBarreiras: number;
}> {
  const db = env.DB;
  const nowTs = new Date().toISOString();
  let alertasTriagem = 0;
  let alertasInvestigacao = 0;
  let alertasBarreiras = 0;

  // 1. SLA triagem vencido (ABERTO > 24h sem triagem iniciada)
  const relatosSlaTriagem = await db
    .prepare(
      `SELECT r.id AS relato_id, r.empresa_id, r.numero_protocolo
       FROM sgso_relatos r
       WHERE r.deleted_at IS NULL
         AND r.status = 'ABERTO'
         AND r.sla_triagem_prazo IS NOT NULL
         AND r.sla_triagem_prazo < ?
         AND NOT EXISTS (
           SELECT 1 FROM sgso_relato_notificacoes n
           WHERE n.relato_id = r.id
             AND n.template_codigo = 'RELPREV_SLA_TRIAGEM'
             AND n.status IN ('PENDENTE', 'ENVIADA')
         )`,
    )
    .bind(nowTs)
    .all<{ relato_id: string; empresa_id: number; numero_protocolo: string }>();

  for (const row of relatosSlaTriagem.results ?? []) {
    await db
      .prepare(
        `INSERT INTO sgso_relato_notificacoes
         (relato_id, empresa_id, template_codigo, canal, destino_tipo, status, payload_json, created_at)
         VALUES (?, ?, 'RELPREV_SLA_TRIAGEM', 'INAPP', 'GSO', 'PENDENTE', ?, ?)`,
      )
      .bind(
        row.relato_id,
        row.empresa_id,
        JSON.stringify({ numero_protocolo: row.numero_protocolo }),
        nowTs,
      )
      .run();
    // Marca SLA violado
    await db
      .prepare(`UPDATE sgso_relatos SET sla_triagem_violado = 1 WHERE id = ? AND empresa_id = ?`)
      .bind(row.relato_id, row.empresa_id)
      .run();
    alertasTriagem += 1;
  }

  // 2. SLA investiga\u00e7\u00e3o vencido (EM_TRIAGEM/EM_INVESTIGACAO > prazo)
  const relatosSlaInv = await db
    .prepare(
      `SELECT r.id AS relato_id, r.empresa_id, r.numero_protocolo
       FROM sgso_relatos r
       WHERE r.deleted_at IS NULL
         AND r.status IN ('EM_TRIAGEM', 'EM_INVESTIGACAO')
         AND r.sla_investigacao_prazo IS NOT NULL
         AND r.sla_investigacao_prazo < ?
         AND NOT EXISTS (
           SELECT 1 FROM sgso_relato_notificacoes n
           WHERE n.relato_id = r.id
             AND n.template_codigo = 'RELPREV_SLA_INVESTIGACAO'
             AND n.status IN ('PENDENTE', 'ENVIADA')
         )`,
    )
    .bind(nowTs)
    .all<{ relato_id: string; empresa_id: number; numero_protocolo: string }>();

  for (const row of relatosSlaInv.results ?? []) {
    // GSO + GESTOR_OPERACIONAL ambos recebem
    for (const destino of ['GSO', 'GESTOR_OPERACIONAL'] as const) {
      await db
        .prepare(
          `INSERT INTO sgso_relato_notificacoes
           (relato_id, empresa_id, template_codigo, canal, destino_tipo, status, payload_json, created_at)
           VALUES (?, ?, 'RELPREV_SLA_INVESTIGACAO', 'INAPP', ?, 'PENDENTE', ?, ?)`,
        )
        .bind(
          row.relato_id,
          row.empresa_id,
          destino,
          JSON.stringify({ numero_protocolo: row.numero_protocolo }),
          nowTs,
        )
        .run();
    }
    await db
      .prepare(
        `UPDATE sgso_relatos SET sla_investigacao_violado = 1 WHERE id = ? AND empresa_id = ?`,
      )
      .bind(row.relato_id, row.empresa_id)
      .run();
    alertasInvestigacao += 1;
  }

  // 3. Barreiras degradadas/inoperantes por empresa, sem alerta recente (> 48h)
  const barreiras = await db
    .prepare(
      `SELECT b.empresa_id, COUNT(*) AS total
       FROM sgso_bowtie_barreiras b
       WHERE b.deleted_at IS NULL
         AND b.status_saude IN ('DEGRADADA', 'INOPERANTE')
         AND b.updated_at < datetime('now', '-48 hours')
       GROUP BY b.empresa_id`,
    )
    .all<{ empresa_id: number; total: number }>();

  for (const bRow of barreiras.results ?? []) {
    // Precisa de um relato_id para usar a tabela de notificacoes; usamos um registro virtual via id ficticio
    // Para barreiras sem relato, notificamos via notificacoes_sistema em vez de sgso_relato_notificacoes
    const jaNotificado = await db
      .prepare(
        `SELECT 1 FROM notificacoes_sistema
         WHERE tipo = 'ALERTA_SGSO_BARREIRAS'
           AND created_at > datetime('now', '-24 hours')
           AND dados LIKE '%"empresa_id":' || ? || '%'
         LIMIT 1`,
      )
      .bind(bRow.empresa_id)
      .first<{ 1: number }>();

    if (!jaNotificado) {
      await db
        .prepare(
          `INSERT INTO notificacoes_sistema
           (tipo, prioridade, titulo, mensagem, grupo, dados, created_at, updated_at)
           VALUES ('ALERTA_SGSO_BARREIRAS', 'ALTA',
                   'Barreiras de seguranca degradadas',
                   ?, 'sgso', ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          `${bRow.total} barreira(s) DEGRADADA/INOPERANTE sem atualiza\u00e7\u00e3o h\u00e1 mais de 48h (empresa ${bRow.empresa_id})`,
          JSON.stringify({ empresa_id: bRow.empresa_id, count: bRow.total }),
        )
        .run();
      alertasBarreiras += 1;
    }
  }

  return { alertasTriagem, alertasInvestigacao, alertasBarreiras };
}
