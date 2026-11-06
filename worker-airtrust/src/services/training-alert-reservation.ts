import type { D1Database } from '@cloudflare/workers-types';

export type TrainingAlertTarget = {
  funcionario_id: number;
  qualificacao_tipo_id?: number | null;
  curso_id?: number | null;
};

export type TrainingAlertChannel = 'EMAIL' | 'WHATSAPP';

const saoPauloParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getSaoPauloDateString(value: Date = new Date()): string {
  const parts = saoPauloParts.formatToParts(value);
  const get = (name: string) => parts.find((p) => p.type === name)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function buildTrainingAlertReservationKey(params: {
  target: TrainingAlertTarget;
  channel: TrainingAlertChannel;
  diaOperacional?: string;
}): string {
  const day = params.diaOperacional || getSaoPauloDateString();
  const funcId = Number(params.target.funcionario_id);
  const qualifId = Number(params.target.qualificacao_tipo_id);
  const cursoId = Number(params.target.curso_id);

  const targetToken =
    Number.isInteger(qualifId) && qualifId > 0
      ? `q:${qualifId}`
      : Number.isInteger(cursoId) && cursoId > 0
        ? `c:${cursoId}`
        : 'unknown';

  return `TRAINING_ALERT:${day}:${funcId}:${targetToken}:${params.channel}`;
}

export function isUniqueConstraintError(error: unknown): boolean {
  const text = String(error instanceof Error ? error.message : error || '');
  return /unique|constraint/i.test(text);
}

export interface ReserveTrainingAlertParams {
  empresaId: number;
  target: TrainingAlertTarget;
  channel: TrainingAlertChannel;
  reenviarHoje?: boolean;
  destinatarioMascarado?: string | null;
  diaOperacional?: string;
  origem: 'LMS_ALERTA' | 'COMPLIANCE';
}

export type ReservationOutcome =
  | { reserved: true; reservationId: number; key: string; isResend: boolean }
  | {
      reserved: false;
      key: string;
      reason: 'already_sent' | 'pending_indeterminate' | 'concurrent_conflict';
      existingStatus: string;
    };

export async function reserveTrainingAlert(
  db: D1Database,
  params: ReserveTrainingAlertParams,
): Promise<ReservationOutcome> {
  const key = buildTrainingAlertReservationKey({
    target: params.target,
    channel: params.channel,
    diaOperacional: params.diaOperacional,
  });

  const bodyPayload = JSON.stringify({
    funcionario_id: params.target.funcionario_id,
    qualificacao_tipo_id: params.target.qualificacao_tipo_id ?? null,
    curso_id: params.target.curso_id ?? null,
    channel: params.channel,
    origem: params.origem,
    reserved_at: new Date().toISOString(),
  });

  const assunto =
    params.origem === 'COMPLIANCE'
      ? `[COMPLIANCE_TREINAMENTO:RESERVA:${key}]`
      : `[LMS_MATRICULA_RESERVA:${key}]`;

  const tipo =
    params.origem === 'COMPLIANCE'
      ? `${params.channel}_COMPLIANCE`
      : `LMS_MATRICULA_ALERTA_${params.channel}`;

  // Tentativa 1: Inserção atômica com chave de unicidade no banco (D1)
  try {
    const insertResult = await db
      .prepare(
        `INSERT INTO notificacoes_log (
           empresa_id,
           funcionario_id,
           notification_key,
           tipo,
           destinatario,
           assunto,
           corpo,
           status,
           tentativas_envio,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', 1, datetime('now'), datetime('now'))`,
      )
      .bind(
        params.empresaId,
        params.target.funcionario_id,
        key,
        tipo,
        params.destinatarioMascarado || null,
        assunto,
        bodyPayload,
      )
      .run();

    const reservationId = Number(insertResult.meta?.last_row_id || 0);
    return {
      reserved: true,
      reservationId,
      key,
      isResend: false,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  // Se a inserção falhou por restrição de unicidade, a reserva já existe para esse dia/canal.
  const existing = await db
    .prepare(
      `SELECT id, status, tentativas_envio
         FROM notificacoes_log
        WHERE empresa_id = ?
          AND notification_key = ?
        LIMIT 1`,
    )
    .bind(params.empresaId, key)
    .first<{ id: number; status: string | null; tentativas_envio: number | null }>();

  if (!existing) {
    // Corrida atômica transitória entre deletes ou falha de leitura
    return {
      reserved: false,
      key,
      reason: 'concurrent_conflict',
      existingStatus: 'desconhecido',
    };
  }

  const currentStatus = String(existing.status || '').toLowerCase();
  // Snapshot/version is part of every CAS. Status alone has an ABA race:
  // enviada -> pendente -> enviada may happen between read and update.
  const observedAttempts = Number(existing.tentativas_envio || 0);

  // 1. Intenção pendente / em processamento / indeterminada bloqueia QUALQUER despacho,
  // mesmo que o operador marque reenviar_hoje (conforme regra de ouro da #1959 e #1968).
  if (currentStatus === 'pendente' || currentStatus === 'processando') {
    return {
      reserved: false,
      key,
      reason: 'pending_indeterminate',
      existingStatus: 'pendente',
    };
  }

  // 2. Já enviada hoje com sucesso: só autoriza reenvio com consentimento explícito.
  if (currentStatus === 'enviada') {
    if (!params.reenviarHoje) {
      return {
        reserved: false,
        key,
        reason: 'already_sent',
        existingStatus: 'enviada',
      };
    }

    // Com consentimento explícito, adquire lock atômico de reenvio via CAS no banco.
    // Garante que entre N requisições simultâneas com reenvio_hoje=true, apenas UMA ganha.
    const casUpdate = await db
      .prepare(
        `UPDATE notificacoes_log
            SET status = 'pendente',
                tentativas_envio = COALESCE(tentativas_envio, 0) + 1,
                updated_at = datetime('now')
          WHERE empresa_id = ?
            AND notification_key = ?
            AND status = 'enviada'
            AND COALESCE(tentativas_envio, 0) = ?`,
      )
      .bind(params.empresaId, key, observedAttempts)
      .run();

    if (Number(casUpdate.meta?.changes || 0) > 0) {
      return {
        reserved: true,
        reservationId: Number(existing.id),
        key,
        isResend: true,
      };
    }

    return {
      reserved: false,
      key,
      reason: 'concurrent_conflict',
      existingStatus: 'pendente',
    };
  }

  // 3. Erro ou ausência confirmada de contato: nenhum despacho foi aceito.
  // A atualização do contato pode permitir a primeira entrega no mesmo dia.
  if (currentStatus === 'erro' || currentStatus === 'sem_contato') {
    const casUpdate = await db
      .prepare(
        `UPDATE notificacoes_log
            SET status = 'pendente',
                tentativas_envio = COALESCE(tentativas_envio, 0) + 1,
                updated_at = datetime('now')
          WHERE empresa_id = ?
            AND notification_key = ?
            AND status = ?
            AND COALESCE(tentativas_envio, 0) = ?`,
      )
      .bind(params.empresaId, key, currentStatus, observedAttempts)
      .run();

    if (Number(casUpdate.meta?.changes || 0) > 0) {
      return {
        reserved: true,
        reservationId: Number(existing.id),
        key,
        isResend: params.reenviarHoje === true,
      };
    }

    return {
      reserved: false,
      key,
      reason: 'concurrent_conflict',
      existingStatus: 'pendente',
    };
  }

  return {
    reserved: false,
    key,
    reason: 'already_sent',
    existingStatus: currentStatus,
  };
}

export interface CommitTrainingAlertParams {
  empresaId: number;
  notificationKey: string;
  outcome: 'enviada' | 'erro' | 'sem_contato' | 'resultado_indeterminado';
  providerMessageId?: string | null;
  errorMessage?: string | null;
  destinatarioMascarado?: string | null;
}

export async function commitTrainingAlertReservation(
  db: D1Database,
  params: CommitTrainingAlertParams,
): Promise<void> {
  // Se o resultado for indeterminado, preserva status durável 'pendente'
  if (params.outcome === 'resultado_indeterminado') {
    await db
      .prepare(
        `UPDATE notificacoes_log
            SET status = 'pendente',
                erro_mensagem = COALESCE(?, erro_mensagem),
                updated_at = datetime('now')
          WHERE empresa_id = ?
            AND notification_key = ?`,
      )
      .bind(params.errorMessage || 'Resultado indeterminado pendente de auditoria', params.empresaId, params.notificationKey)
      .run();
    return;
  }

  const setClauses = [
    'status = ?',
    'erro_mensagem = ?',
    'provedor_mensagem_id = ?',
    "updated_at = datetime('now')",
  ];
  const bindings: unknown[] = [
    params.outcome,
    params.errorMessage ?? null,
    params.providerMessageId ?? null,
  ];

  if (params.outcome === 'enviada') {
    setClauses.push("enviado_em = datetime('now')");
  }

  if (params.destinatarioMascarado) {
    setClauses.push('destinatario = ?');
    bindings.push(params.destinatarioMascarado);
  }

  bindings.push(params.empresaId, params.notificationKey);

  await db
    .prepare(
      `UPDATE notificacoes_log
          SET ${setClauses.join(', ')}
        WHERE empresa_id = ?
          AND notification_key = ?`,
    )
    .bind(...bindings)
    .run();
}
