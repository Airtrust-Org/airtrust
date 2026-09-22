import type { Context } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  getActorId,
  getActiveRdvByFlight,
  getEmpresaIdSafe,
  getFlightOrThrow,
  getFuncionarioIdForUser,
  getRdvOrThrow,
  buildFlightEventStatement,
  buildRdvVersionGuardedInsert,
  buildRdvVersionGuardedUpdate,
  maybeRecordSystemAudit,
} from '../repositories/controle-voos/rdv-repository';
import { computeRdvAlertRules } from '../services/controle-voos/rdv-alertas';
import { computeEtapaTempos } from '../services/controle-voos/rdv-etapas';
import {
  assertCasApplied,
  assertRdvSelfScope,
  RDV_CAPABILITIES,
  requireExpectedRdvVersion,
} from '../services/controle-voos/rdv-workflow';


function parseHhMmMinutes(value: string | null | undefined): number {
  if (!value) return 0;
  const match = String(value).trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function plannedFlightMinutes(flight: { horario_previsto_partida?: string | null; horario_previsto_chegada?: string | null }): number {
  const start = Date.parse(String(flight.horario_previsto_partida || ''));
  const end = Date.parse(String(flight.horario_previsto_chegada || ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 60_000);
}

export async function assertPlanningDeviationJustified(
  db: D1Database,
  empresaId: number,
  flight: { id: number; horario_previsto_partida?: string | null; horario_previsto_chegada?: string | null },
): Promise<void> {
  const stages = await db
    .prepare(
      `SELECT horario_motor_ligado, horario_decolagem, horario_pouso, horario_motor_desligado
         FROM cv_voo_etapas
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        ORDER BY numero_etapa ASC, id ASC`,
    )
    .bind(empresaId, flight.id)
    .all<{
      horario_motor_ligado: string | null;
      horario_decolagem: string | null;
      horario_pouso: string | null;
      horario_motor_desligado: string | null;
    }>();

  let realizedMinutes = 0;
  for (const stage of stages.results || []) {
    const computed = computeEtapaTempos(
      stage.horario_decolagem,
      stage.horario_pouso,
      stage.horario_motor_ligado,
      stage.horario_motor_desligado,
    );
    realizedMinutes += parseHhMmMinutes(computed.tempo_total);
  }

  const requiredMinutes = Math.max(0, realizedMinutes - plannedFlightMinutes(flight));
  if (requiredMinutes <= 0) return;

  const sumRow = await db
    .prepare(
      `SELECT COALESCE(SUM(minutos), 0) AS total
         FROM cv_voo_justificativas
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`,
    )
    .bind(empresaId, flight.id)
    .first<{ total: number }>();
  const assignedMinutes = Number(sumRow?.total || 0);

  if (assignedMinutes !== requiredMinutes) {
    throw new ApiError(
      `Justificativas do desvio devem somar exatamente ${requiredMinutes} minuto(s); informado: ${assignedMinutes}.`,
      409,
      'CONTROLE_VOOS_RDV_PLANNING_DEVIATION_JUSTIFICATION_MISMATCH',
    );
  }
}

async function parseFinalizePayload(
  c: Context<{ Bindings: Env }>,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }

  const payload = body as Record<string, unknown>;
  for (const field of Object.keys(payload)) {
    if (field !== 'versao') {
      throw new ApiError(
        `Campo nao permitido: ${field}`,
        400,
        'CONTROLE_VOOS_FORBIDDEN_FIELD',
      );
    }
  }
  return payload;
}

export async function finalizeRdvPreenchimentoHandler(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  if (!vooId) {
    throw new ApiError('Voo nao informado', 400, 'CONTROLE_VOOS_INVALID_ID');
  }
  const flight = await getFlightOrThrow(c.env.DB, vooId, empresaId);

  // Confirmacao operacional do comandante: capability propria + vinculo de
  // tripulacao (ou Coordenacao com visualizar_todos). Nao e assinatura digital.
  await assertRdvSelfScope(
    c,
    c.env.DB,
    empresaId,
    flight.id,
    RDV_CAPABILITIES.editarRascunhoProprio,
  );

  const existing = await getActiveRdvByFlight(c.env.DB, flight.id, empresaId);
  if (!existing) {
    throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  }
  if (existing.status === 'preenchimento_finalizado') {
    throw new ApiError('RDV com preenchimento finalizado', 409, 'CONTROLE_VOOS_RDV_LOCKED');
  }
  if (!['rascunho', 'devolvido'].includes(existing.workflow_status)) {
    throw new ApiError(
      'Finalizacao de preenchimento permitida somente em rascunho ou devolvido',
      409,
      'CONTROLE_VOOS_RDV_FINALIZACAO_WORKFLOW_INVALID',
    );
  }

  const payload = await parseFinalizePayload(c);
  const expectedVersion = requireExpectedRdvVersion(payload);
  if (expectedVersion !== existing.versao) {
    throw new ApiError(
      'Versao do RDV desatualizada. Recarregue os dados antes de continuar.',
      409,
      'CONTROLE_VOOS_RDV_VERSION_CONFLICT',
    );
  }

  await assertPlanningDeviationJustified(c.env.DB, empresaId, flight);

  const alerts = await computeRdvAlertRules(c.env.DB, empresaId, flight, existing);
  const blocking = alerts.filter((alert) => alert.severidade === 'IMPEDE_ENVIO');
  if (blocking.length > 0) {
    throw new ApiError(
      `Preenchimento ainda incompleto: ${blocking.map((alert) => alert.mensagem).join('; ')}`,
      409,
      'CONTROLE_VOOS_RDV_FINALIZACAO_BLOQUEADA_POR_ALERTA',
    );
  }

  const novaVersao = existing.versao + 1;
  const guard = { rdvId: existing.id, empresaId, expectedVersion: novaVersao };
  const funcionarioId = await getFuncionarioIdForUser(c.env.DB, userId);

  const updateStatement = buildRdvVersionGuardedUpdate(c.env.DB, {
    table: 'cv_rdv_operacional',
    setSql: `
      status = 'preenchimento_finalizado',
      responsavel_preenchimento_id = COALESCE(responsavel_preenchimento_id, ?),
      preenchido_em = COALESCE(preenchido_em, datetime('now')),
      finalizado_operacionalmente_por = ?,
      finalizado_operacionalmente_em = datetime('now'),
      versao = versao + 1,
      updated_by = ?,
      updated_at = datetime('now')
    `,
    setBindValues: [userId, userId, userId],
    whereSql: `
      id = ? AND empresa_id = ? AND deleted_at IS NULL
      AND status = 'rascunho'
      AND workflow_status IN ('rascunho', 'devolvido')
    `,
    whereBindValues: [existing.id, empresaId],
    guard: { rdvId: existing.id, empresaId, expectedVersion },
  });

  const eventStatement = buildFlightEventStatement(
    c.env.DB,
    {
      empresaId,
      vooId: flight.id,
      tipoEvento: 'rdv',
      statusAnterior: flight.status,
      statusNovo: flight.status,
      descricao: 'RDV operacional com preenchimento finalizado',
      metadata: {
        action: 'finalize',
        rdv_id: existing.id,
        versao_anterior: existing.versao,
        versao_nova: novaVersao,
      },
      usuarioId: userId,
    },
    guard,
  );

  const approvalStatement = buildRdvVersionGuardedInsert(c.env.DB, {
    table: 'cv_rdv_aprovacoes',
    columns:
      'empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, funcionario_id, created_at',
    valuesSql: `?, ?, ?, 'COMANDANTE', 'APROVADO', ?, ?, datetime('now')`,
    bindValues: [empresaId, existing.id, novaVersao, userId, funcionarioId],
    guard,
  });

  const [updateResult] = await c.env.DB.batch([
    updateStatement,
    eventStatement,
    approvalStatement,
  ]);
  assertCasApplied(updateResult);

  await maybeRecordSystemAudit(
    c,
    'cv_rdv_operacional',
    'UPDATE',
    existing.id,
    {
      status: existing.status,
      versao: existing.versao,
      finalizado_operacionalmente_em: existing.finalizado_operacionalmente_em,
    },
    {
      status: 'preenchimento_finalizado',
      versao: novaVersao,
      finalizado_operacionalmente_por: userId,
    },
  );

  const updated = await getRdvOrThrow(c.env.DB, existing.id, empresaId);
  return c.json({ success: true, data: updated });
}
