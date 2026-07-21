/**
 * Fluxo Piloto -> Coordenação do RDV (Relatório de Voo): envio, revisão,
 * devolução, correção, aprovação, finalização, reabertura, cancelamento;
 * tripulação e abastecimentos; fila da Coordenação; relatório Petrobras em
 * PDF. Extraído de `routes/controle-voos.ts` para manter aquele arquivo
 * restrito ao CRUD original de voos/RDV que já existia antes desta
 * entrega. Montado no mesmo prefixo `/api/controle-voos`.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  getEmpresaIdSafe,
  getActorId,
  getFlightOrThrow,
  getActiveRdvByFlight,
  getRdvOrThrow,
  buildMergedRdv,
  getFuncionarioIdForUser,
  recordFlightEvent,
  buildFlightEventStatement,
  maybeRecordSystemAudit,
  allowedRdvFields,
  type RdvInput,
} from '../repositories/controle-voos/rdv-repository';
import {
  RDV_CAPABILITIES,
  requireRdvCapability,
  requireAnyRdvAccess,
  assertRdvSelfScope,
  assertNotSelfApproval,
  assertFuncionarioBelongsToEmpresa,
  assertRdvWorkflowTransition,
  assertRdvVersion,
  requireExpectedRdvVersion,
  assertCasApplied,
  requireNonEmptyText,
  recordRdvFieldRevisions,
} from '../services/controle-voos/rdv-workflow';
import { syncRdvAlerts } from '../services/controle-voos/rdv-alertas';
import {
  gerarRelatorioPetrobrasPdf,
  computeIntegrityHash,
  type RelatorioPetrobrasData,
  type RelatorioPetrobrasEtapa,
} from '../services/controle-voos/rdv-pdf';

const rdvWorkflow = new Hono<{ Bindings: Env }>();

// Reaproveita as mesmas regras de validação de RDV (horários/combustível)
// do CRUD original — mantidas ali por já existirem antes desta entrega.
async function parseJsonPayload(
  c: import('hono').Context<{ Bindings: Env }>,
): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
}

function assertPayloadFields(payload: Record<string, unknown>, allowed: Set<string>): void {
  for (const field of Object.keys(payload)) {
    if (!allowed.has(field)) {
      throw new ApiError(`Campo nao permitido: ${field}`, 400, 'CONTROLE_VOOS_FORBIDDEN_FIELD');
    }
  }
}

function normalizeRdvInputPartial(payload: Record<string, unknown>): RdvInput {
  const input: RdvInput = {};
  const numeric = new Set([
    'horas_voadas',
    'numero_pousos',
    'ciclos',
    'combustivel_decolagem',
    'combustivel_pouso',
    'combustivel_consumo',
    'pob',
    'carga_kg',
  ]);
  for (const field of allowedRdvFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const raw = payload[field];
    if (numeric.has(field)) {
      (input as Record<string, unknown>)[field] = raw === null || raw === '' ? null : Number(raw);
    } else {
      (input as Record<string, unknown>)[field] = raw === null ? null : String(raw);
    }
  }
  return input;
}

function assertRdvRulesPartial(input: RdvInput): void {
  if (
    input.horario_decolagem_real &&
    input.horario_pouso_real &&
    input.horario_pouso_real < input.horario_decolagem_real
  ) {
    throw new ApiError(
      'Horario de pouso anterior a decolagem',
      400,
      'CONTROLE_VOOS_INVALID_RDV_TIME',
    );
  }
  if (input.combustivel_decolagem != null && input.combustivel_pouso != null) {
    if (input.combustivel_pouso > input.combustivel_decolagem) {
      throw new ApiError('Combustivel incoerente', 400, 'CONTROLE_VOOS_INVALID_RDV_FUEL');
    }
    if (input.combustivel_consumo != null) {
      const expected = Number((input.combustivel_decolagem - input.combustivel_pouso).toFixed(3));
      const actual = Number(input.combustivel_consumo.toFixed(3));
      if (Math.abs(expected - actual) > 0.01) {
        throw new ApiError('Combustivel incoerente', 400, 'CONTROLE_VOOS_INVALID_RDV_FUEL');
      }
    }
  }
}

// ===========================================================================
// Fluxo Piloto -> Coordenação
// ===========================================================================

rdvWorkflow.get('/voos/meus', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const funcionarioId = await getFuncionarioIdForUser(c.env.DB, userId);
  if (!funcionarioId) {
    return c.json({ success: true, data: [], meta: { count: 0 } });
  }

  const { results } = await c.env.DB.prepare(
    `
      SELECT
        v.id, v.empresa_id, v.prefixo, v.data_programacao, v.origem_id, v.destino_id,
        v.tipo_voo_id, v.natureza_voo_id, v.aeronave_id,
        v.horario_previsto_partida, v.horario_previsto_chegada,
        v.horario_real_partida, v.horario_real_chegada,
        v.status, v.observacoes, v.cancelado_motivo_id, v.alternado_destino_id,
        v.created_at, v.updated_at
      FROM cv_voos v
      WHERE v.empresa_id = ?
        AND v.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM cv_voo_tripulantes t
          WHERE t.voo_id = v.id AND t.empresa_id = v.empresa_id
            AND t.funcionario_id = ? AND t.deleted_at IS NULL
        )
      ORDER BY v.data_programacao DESC, v.id DESC
      LIMIT 100
    `,
  )
    .bind(empresaId, funcionarioId)
    .all();

  return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
});

rdvWorkflow.get('/voos/:id/rdv/alertas', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) {
    return c.json({ success: true, data: [] });
  }
  const alerts = await syncRdvAlerts(c.env.DB, empresaId, voo, rdv);
  return c.json({ success: true, data: alerts });
});

rdvWorkflow.get('/voos/:id/rdv/revisoes', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) return c.json({ success: true, data: [] });

  const { results } = await c.env.DB.prepare(
    `
      SELECT id, versao, entidade, registro_id, campo, valor_anterior, valor_novo,
             usuario_id, justificativa, estado_anterior, estado_novo, created_at
      FROM cv_rdv_revisoes
      WHERE rdv_id = ? AND empresa_id = ?
      ORDER BY created_at DESC, id DESC
    `,
  )
    .bind(rdv.id, empresaId)
    .all();
  return c.json({ success: true, data: results || [] });
});

rdvWorkflow.get('/voos/:id/rdv/aprovacoes', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) return c.json({ success: true, data: [] });

  const { results } = await c.env.DB.prepare(
    `
      SELECT id, versao, tipo_aprovacao, status, usuario_id, funcionario_id,
             observacao, justificativa, created_at
      FROM cv_rdv_aprovacoes
      WHERE rdv_id = ? AND empresa_id = ?
      ORDER BY created_at DESC, id DESC
    `,
  )
    .bind(rdv.id, empresaId)
    .all();
  return c.json({ success: true, data: results || [] });
});

rdvWorkflow.get(
  '/voos/:id/rdv/relatorio-petrobras',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.exportarPetrobras),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.exportarPetrobras);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    const [empresa, aeronave, tripulantes, etapas, abastecimentos, aprovacoes] = await Promise.all([
      c.env.DB.prepare('SELECT razao_social, nome_fantasia FROM empresas WHERE id = ? LIMIT 1')
        .bind(empresaId)
        .first<{ razao_social: string; nome_fantasia: string | null }>(),
      voo.aeronave_id
        ? c.env.DB.prepare('SELECT modelo FROM aeronaves WHERE id = ? LIMIT 1')
            .bind(voo.aeronave_id)
            .first<{ modelo: string }>()
        : Promise.resolve(null),
      c.env.DB.prepare(
        `
          SELECT f.nome, f.codigo_anac, t.funcao
          FROM cv_voo_tripulantes t
          LEFT JOIN funcionarios f ON f.id = t.funcionario_id AND f.empresa_id = t.empresa_id
          WHERE t.voo_id = ? AND t.empresa_id = ? AND t.deleted_at IS NULL
          ORDER BY t.funcao ASC
        `,
      )
        .bind(voo.id, empresaId)
        .all<{ nome: string | null; codigo_anac: string | null; funcao: string }>(),
      c.env.DB.prepare(
        `
          SELECT numero_etapa, origem_icao, destino_icao, horario_motor_ligado, horario_decolagem,
                 horario_pouso, horario_motor_desligado, tempo_decolagem_pouso, tempo_total,
                 pousos_diurnos, pousos_noturnos, pax, payload, combustivel_inicio, combustivel_fim
          FROM cv_voo_etapas
          WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
          ORDER BY numero_etapa ASC
        `,
      )
        .bind(voo.id, empresaId)
        .all<RelatorioPetrobrasEtapa>(),
      c.env.DB.prepare(
        `
          SELECT fornecedor, localidade, combustivel_abastecido, unidade, numero_ce, data_hora
          FROM cv_voo_abastecimentos
          WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
          ORDER BY data_hora ASC
        `,
      )
        .bind(voo.id, empresaId)
        .all<{
          fornecedor: string | null;
          localidade: string | null;
          combustivel_abastecido: number | null;
          unidade: string;
          numero_ce: string | null;
          data_hora: string;
        }>(),
      c.env.DB.prepare(
        `SELECT tipo_aprovacao, status, created_at FROM cv_rdv_aprovacoes WHERE rdv_id = ? AND empresa_id = ? ORDER BY created_at ASC`,
      )
        .bind(rdv.id, empresaId)
        .all<{ tipo_aprovacao: string; status: string; created_at: string }>(),
    ]);

    const identificadorInterno = `RDV-${empresaId}-${rdv.id}-v${rdv.versao}`;
    const geradoEm = new Date().toISOString();
    const hashIntegridade = await computeIntegrityHash({
      rdv_id: rdv.id,
      versao: rdv.versao,
      workflow_status: rdv.workflow_status,
      numero: rdv.numero,
      totais: {
        horas_voadas: rdv.horas_voadas,
        combustivel_consumo: rdv.combustivel_consumo,
      },
      gerado_em: geradoEm,
    });

    const data: RelatorioPetrobrasData = {
      empresa_nome: empresa?.nome_fantasia || empresa?.razao_social || 'AirTrust',
      base: null,
      contrato: null,
      cliente: null,
      data_voo: rdv.data_voo,
      prefixo: voo.prefixo,
      modelo_aeronave: aeronave?.modelo ?? null,
      numero_voo: null,
      numero_relatorio: rdv.numero,
      numero_sap: null,
      tripulantes: (tripulantes.results || []).map((t) => ({
        nome: t.nome || 'Tripulante nao identificado',
        codigo_anac: t.codigo_anac,
        funcao: t.funcao,
      })),
      etapas: etapas.results || [],
      abastecimentos: abastecimentos.results || [],
      totais: {
        horas_voadas: rdv.horas_voadas,
        numero_pousos: rdv.numero_pousos,
        ciclos: rdv.ciclos,
        combustivel_decolagem: rdv.combustivel_decolagem,
        combustivel_pouso: rdv.combustivel_pouso,
        combustivel_consumo: rdv.combustivel_consumo,
        pob: rdv.pob,
        carga_kg: rdv.carga_kg,
      },
      ocorrencias: rdv.ocorrencias,
      divergencias: rdv.divergencias,
      aprovacoes: aprovacoes.results || [],
      status_workflow: rdv.workflow_status,
      versao: rdv.versao,
      gerado_em: geradoEm,
      identificador_interno: identificadorInterno,
      hash_integridade: hashIntegridade,
    };

    const pdfBytes = await gerarRelatorioPetrobrasPdf(data);

    await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'UPDATE', rdv.id, null, {
      action: 'exportar_relatorio_petrobras',
      identificador_interno: identificadorInterno,
    });

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${identificadorInterno}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  },
);

rdvWorkflow.get(
  '/rdv/fila',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.visualizarTodos),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const workflowStatus = c.req.query('status');
    const dataInicio = c.req.query('data_inicio');
    const dataFim = c.req.query('data_fim');
    const aeronaveId = c.req.query('aeronave_id');
    const pilotoFuncionarioId = c.req.query('piloto_funcionario_id');

    const filters = ['r.empresa_id = ?', 'r.deleted_at IS NULL'];
    const values: unknown[] = [empresaId];

    if (workflowStatus) {
      filters.push('r.workflow_status = ?');
      values.push(workflowStatus);
    }
    if (dataInicio) {
      filters.push('r.data_voo >= ?');
      values.push(dataInicio);
    }
    if (dataFim) {
      filters.push('r.data_voo <= ?');
      values.push(dataFim);
    }
    if (aeronaveId) {
      filters.push('v.aeronave_id = ?');
      values.push(Number(aeronaveId));
    }
    if (pilotoFuncionarioId) {
      filters.push(
        'EXISTS (SELECT 1 FROM cv_voo_tripulantes t WHERE t.voo_id = v.id AND t.empresa_id = v.empresa_id AND t.funcionario_id = ? AND t.deleted_at IS NULL)',
      );
      values.push(Number(pilotoFuncionarioId));
    }

    const { results } = await c.env.DB.prepare(
      `
      SELECT
        r.id, r.voo_id, r.numero, r.data_voo, r.status, r.workflow_status, r.versao,
        r.responsavel_preenchimento_id, r.enviado_em, r.devolvido_em, r.aprovado_coordenacao_em,
        r.finalizado_workflow_em, r.reaberto_em, r.motivo_devolucao,
        v.prefixo, v.aeronave_id, v.data_programacao
      FROM cv_rdv_operacional r
      INNER JOIN cv_voos v ON v.id = r.voo_id AND v.empresa_id = r.empresa_id
      WHERE ${filters.join(' AND ')}
      ORDER BY r.data_voo DESC, r.id DESC
      LIMIT 100
    `,
    )
      .bind(...values)
      .all();

    return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
  },
);

rdvWorkflow.post('/voos/:id/rdv/enviar', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.enviar);

  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  if (rdv.status !== 'preenchimento_finalizado') {
    throw new ApiError(
      'Finalize o preenchimento do RDV antes de enviar',
      409,
      'CONTROLE_VOOS_RDV_PREENCHIMENTO_INCOMPLETO',
    );
  }
  assertRdvWorkflowTransition(rdv.workflow_status, 'enviado');

  const payload = await parseJsonPayload(c);
  const expectedVersion = requireExpectedRdvVersion(payload);
  assertRdvVersion(rdv, expectedVersion);

  const alerts = await syncRdvAlerts(c.env.DB, empresaId, voo, rdv);
  const blocking = alerts.filter((a) => a.severidade === 'IMPEDE_ENVIO');
  if (blocking.length > 0) {
    throw new ApiError(
      `Envio bloqueado por alertas: ${blocking.map((a) => a.mensagem).join('; ')}`,
      409,
      'CONTROLE_VOOS_RDV_BLOQUEADO_POR_ALERTA',
    );
  }

  const novaVersao = rdv.versao + 1;
  const updateResult = await c.env.DB.prepare(
    `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'enviado', versao = ?, enviado_por = ?, enviado_em = datetime('now'),
          updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
  )
    .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
    .run();
  assertCasApplied(updateResult);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `
        INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, created_at)
        VALUES (?, ?, ?, 'COORDENACAO', 'ENVIADO', ?, datetime('now'))
      `,
    ).bind(empresaId, rdv.id, novaVersao, userId),
    buildFlightEventStatement(c.env.DB, {
      empresaId,
      vooId: voo.id,
      tipoEvento: 'rdv',
      statusAnterior: voo.status,
      statusNovo: voo.status,
      descricao: 'RDV enviado para revisao da Coordenacao',
      metadata: { action: 'enviar', rdv_id: rdv.id, versao: novaVersao },
      usuarioId: userId,
    }),
  ]);

  const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
  return c.json({ success: true, data: updated });
});

rdvWorkflow.post(
  '/voos/:id/rdv/iniciar-revisao',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.revisar),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    assertRdvWorkflowTransition(rdv.workflow_status, 'em_revisao');
    const payload = await parseJsonPayload(c);
    const expectedVersion = requireExpectedRdvVersion(payload);
    assertRdvVersion(rdv, expectedVersion);

    const novaVersao = rdv.versao + 1;
    const updateResult = await c.env.DB.prepare(
      `
        UPDATE cv_rdv_operacional
        SET workflow_status = 'em_revisao', versao = ?, revisao_iniciada_por = ?,
            revisao_iniciada_em = datetime('now'), updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
    )
      .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
      .run();
    assertCasApplied(updateResult);

    await c.env.DB.prepare(
      `
        INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, created_at)
        VALUES (?, ?, ?, 'COORDENACAO', 'REVISAO_INICIADA', ?, datetime('now'))
      `,
    )
      .bind(empresaId, rdv.id, novaVersao, userId)
      .run();

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

rdvWorkflow.post(
  '/voos/:id/rdv/devolver',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.devolver),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    assertRdvWorkflowTransition(rdv.workflow_status, 'devolvido');
    const payload = await parseJsonPayload(c);
    const expectedVersion = requireExpectedRdvVersion(payload);
    assertRdvVersion(rdv, expectedVersion);
    const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');

    const novaVersao = rdv.versao + 1;
    const updateResult = await c.env.DB.prepare(
      `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'devolvido', status = 'rascunho', versao = ?,
          devolvido_por = ?, devolvido_em = datetime('now'),
          motivo_devolucao = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
    )
      .bind(novaVersao, userId, justificativa, userId, rdv.id, empresaId, rdv.versao)
      .run();
    assertCasApplied(updateResult);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `
        INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, justificativa, created_at)
        VALUES (?, ?, ?, 'COORDENACAO', 'DEVOLVIDO', ?, ?, datetime('now'))
      `,
      ).bind(empresaId, rdv.id, novaVersao, userId, justificativa),
      buildFlightEventStatement(c.env.DB, {
        empresaId,
        vooId: voo.id,
        tipoEvento: 'rdv',
        statusAnterior: voo.status,
        statusNovo: voo.status,
        descricao: 'RDV devolvido ao piloto pela Coordenacao',
        metadata: { action: 'devolver', rdv_id: rdv.id, versao: novaVersao, justificativa },
        usuarioId: userId,
      }),
    ]);

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

rdvWorkflow.post(
  '/voos/:id/rdv/corrigir',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.corrigir),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    if (rdv.workflow_status !== 'em_revisao') {
      throw new ApiError(
        'Correcao da Coordenacao permitida apenas durante revisao',
        409,
        'CONTROLE_VOOS_RDV_CORRECAO_FORA_DE_REVISAO',
      );
    }

    const payload = await parseJsonPayload(c);
    const expectedVersion = requireExpectedRdvVersion(payload);
    assertRdvVersion(rdv, expectedVersion);
    const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');
    const campos = (
      payload.campos && typeof payload.campos === 'object' ? payload.campos : {}
    ) as Record<string, unknown>;
    assertPayloadFields(campos, allowedRdvFields);

    const input = normalizeRdvInputPartial(campos);
    const merged = buildMergedRdv(rdv, input);
    assertRdvRulesPartial(merged);

    const fields: string[] = [];
    const values: unknown[] = [];
    for (const field of allowedRdvFields) {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        fields.push(`${field} = ?`);
        values.push(input[field as keyof RdvInput] ?? null);
      }
    }

    const novaVersao = rdv.versao + 1;
    let updateResult: D1Result;
    if (fields.length > 0) {
      fields.push('versao = ?', 'updated_by = ?', 'updated_at = datetime("now")');
      values.push(novaVersao, userId, rdv.id, empresaId, rdv.versao);

      updateResult = await c.env.DB.prepare(
        `
        UPDATE cv_rdv_operacional
        SET ${fields.join(', ')}
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
      )
        .bind(...values)
        .run();
    } else {
      updateResult = await c.env.DB.prepare(
        `UPDATE cv_rdv_operacional SET versao = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND versao = ?`,
      )
        .bind(novaVersao, userId, rdv.id, empresaId, rdv.versao)
        .run();
    }
    assertCasApplied(updateResult);

    const changedFields = await recordRdvFieldRevisions({
      db: c.env.DB,
      empresaId,
      rdvId: rdv.id,
      versao: novaVersao,
      before: rdv,
      after: merged,
      usuarioId: userId,
      justificativa,
      estadoAnterior: rdv.workflow_status,
      estadoNovo: rdv.workflow_status,
    });

    await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'UPDATE', rdv.id, rdv, merged);

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated, meta: { campos_alterados: changedFields } });
  },
);

rdvWorkflow.post(
  '/voos/:id/rdv/aprovar',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.aprovarCoordenacao),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    await assertNotSelfApproval(c, c.env.DB, rdv);

    assertRdvWorkflowTransition(rdv.workflow_status, 'aprovado_coordenacao');
    const payload = await parseJsonPayload(c);
    const expectedVersion = requireExpectedRdvVersion(payload);
    assertRdvVersion(rdv, expectedVersion);

    const alerts = await syncRdvAlerts(c.env.DB, empresaId, voo, rdv);
    const blocking = alerts.filter((a) => a.severidade === 'IMPEDE_APROVACAO');
    if (blocking.length > 0) {
      throw new ApiError(
        `Aprovacao bloqueada por alertas: ${blocking.map((a) => a.mensagem).join('; ')}`,
        409,
        'CONTROLE_VOOS_RDV_BLOQUEADO_POR_ALERTA',
      );
    }

    const novaVersao = rdv.versao + 1;
    const updateResult = await c.env.DB.prepare(
      `
        UPDATE cv_rdv_operacional
        SET workflow_status = 'aprovado_coordenacao', versao = ?, aprovado_coordenacao_por = ?,
            aprovado_coordenacao_em = datetime('now'), updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
    )
      .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
      .run();
    assertCasApplied(updateResult);

    const observacao = typeof payload.observacao === 'string' ? payload.observacao : null;
    const funcionarioId = await getFuncionarioIdForUser(c.env.DB, userId);
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
        INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, funcionario_id, observacao, created_at)
        VALUES (?, ?, ?, 'COORDENACAO', 'APROVADO', ?, ?, ?, datetime('now'))
      `,
      ).bind(empresaId, rdv.id, novaVersao, userId, funcionarioId, observacao),
      buildFlightEventStatement(c.env.DB, {
        empresaId,
        vooId: voo.id,
        tipoEvento: 'rdv',
        statusAnterior: voo.status,
        statusNovo: voo.status,
        descricao: 'RDV aprovado pela Coordenacao',
        metadata: { action: 'aprovar', rdv_id: rdv.id, versao: novaVersao },
        usuarioId: userId,
      }),
    ]);

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

rdvWorkflow.post(
  '/voos/:id/rdv/finalizar',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.aprovarCoordenacao),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    assertRdvWorkflowTransition(rdv.workflow_status, 'finalizado');
    const payload = await parseJsonPayload(c);
    const expectedVersion = requireExpectedRdvVersion(payload);
    assertRdvVersion(rdv, expectedVersion);

    const novaVersao = rdv.versao + 1;
    const updateResult = await c.env.DB.prepare(
      `
        UPDATE cv_rdv_operacional
        SET workflow_status = 'finalizado', versao = ?, finalizado_workflow_em = datetime('now'),
            updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
    )
      .bind(novaVersao, userId, rdv.id, empresaId, rdv.versao)
      .run();
    assertCasApplied(updateResult);

    await recordFlightEvent({
      db: c.env.DB,
      empresaId,
      vooId: voo.id,
      tipoEvento: 'rdv',
      statusAnterior: voo.status,
      statusNovo: voo.status,
      descricao: 'RDV finalizado',
      metadata: { action: 'finalizar', rdv_id: rdv.id, versao: novaVersao },
      usuarioId: userId,
    });

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

rdvWorkflow.post(
  '/voos/:id/rdv/reabrir',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.reabrir),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    assertRdvWorkflowTransition(rdv.workflow_status, 'reaberto');
    const payload = await parseJsonPayload(c);
    const expectedVersion = requireExpectedRdvVersion(payload);
    assertRdvVersion(rdv, expectedVersion);
    const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');

    const novaVersao = rdv.versao + 1;
    const updateResult = await c.env.DB.prepare(
      `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'reaberto', status = 'rascunho', versao = ?,
          reaberto_por = ?, reaberto_em = datetime('now'), updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
    )
      .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
      .run();
    assertCasApplied(updateResult);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, justificativa, created_at)
      VALUES (?, ?, ?, 'COORDENACAO', 'REABERTO', ?, ?, datetime('now'))
    `,
      ).bind(empresaId, rdv.id, novaVersao, userId, justificativa),
      buildFlightEventStatement(c.env.DB, {
        empresaId,
        vooId: voo.id,
        tipoEvento: 'rdv',
        statusAnterior: voo.status,
        statusNovo: voo.status,
        descricao: 'RDV reaberto pela Coordenacao',
        metadata: { action: 'reabrir', rdv_id: rdv.id, versao: novaVersao, justificativa },
        usuarioId: userId,
      }),
    ]);

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

rdvWorkflow.post('/voos/:id/rdv/cancelar', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.cancelar);

  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

  assertRdvWorkflowTransition(rdv.workflow_status, 'cancelado');
  const payload = await parseJsonPayload(c);
  const expectedVersion = requireExpectedRdvVersion(payload);
  assertRdvVersion(rdv, expectedVersion);
  const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');

  const novaVersao = rdv.versao + 1;
  const updateResult = await c.env.DB.prepare(
    `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'cancelado', status = 'cancelado', versao = ?,
          motivo_cancelamento = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
  )
    .bind(novaVersao, justificativa, userId, rdv.id, empresaId, rdv.versao)
    .run();
  assertCasApplied(updateResult);

  await c.env.DB.prepare(
    `
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, justificativa, created_at)
      VALUES (?, ?, ?, 'COORDENACAO', 'CANCELADO', ?, ?, datetime('now'))
    `,
  )
    .bind(empresaId, rdv.id, novaVersao, userId, justificativa)
    .run();

  const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
  return c.json({ success: true, data: updated });
});

// ===========================================================================
// Tripulação (cv_voo_tripulantes)
// ===========================================================================

const allowedCrewFuncoes = new Set(['PIC', 'SIC', 'COM', 'MEC', 'OUTRO']);

function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

function parseOptionalPositiveInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  return parsePositiveInteger(value, field);
}

rdvWorkflow.get('/voos/:id/tripulantes', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);

  const { results } = await c.env.DB.prepare(
    `
      SELECT t.id, t.voo_id, t.etapa_id, t.funcionario_id, t.funcao,
             t.horario_apresentacao, t.horario_dispensa, t.observacoes,
             f.nome AS funcionario_nome, f.codigo_anac AS funcionario_codigo_anac
      FROM cv_voo_tripulantes t
      LEFT JOIN funcionarios f ON f.id = t.funcionario_id AND f.empresa_id = t.empresa_id
      WHERE t.voo_id = ? AND t.empresa_id = ? AND t.deleted_at IS NULL
      ORDER BY t.funcao ASC, t.id ASC
    `,
  )
    .bind(voo.id, empresaId)
    .all();

  return c.json({ success: true, data: results || [] });
});

rdvWorkflow.post('/voos/:id/tripulantes', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.editarRascunhoProprio);
  const payload = await parseJsonPayload(c);

  const funcionarioId = parsePositiveInteger(payload.funcionario_id, 'funcionario_id');
  const funcao = String(payload.funcao || '').trim();
  if (!allowedCrewFuncoes.has(funcao)) {
    throw new ApiError('funcao invalida', 400, 'CONTROLE_VOOS_TRIPULANTE_FUNCAO_INVALIDA');
  }
  await assertFuncionarioBelongsToEmpresa(c.env.DB, funcionarioId, empresaId);

  const horarioApresentacao = payload.horario_apresentacao
    ? String(payload.horario_apresentacao)
    : null;
  const horarioDispensa = payload.horario_dispensa ? String(payload.horario_dispensa) : null;
  if (horarioApresentacao && horarioDispensa && horarioDispensa < horarioApresentacao) {
    throw new ApiError(
      'Horario de dispensa anterior a apresentacao',
      400,
      'CONTROLE_VOOS_TRIPULANTE_HORARIO_INVALIDO',
    );
  }
  const observacoes = payload.observacoes ? String(payload.observacoes) : null;
  const etapaId = parseOptionalPositiveInteger(payload.etapa_id, 'etapa_id');

  const result = await c.env.DB.prepare(
    `
      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, etapa_id, funcionario_id, funcao,
        horario_apresentacao, horario_dispensa, observacoes,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
  )
    .bind(
      empresaId,
      voo.id,
      etapaId,
      funcionarioId,
      funcao,
      horarioApresentacao,
      horarioDispensa,
      observacoes,
      userId,
      userId,
    )
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: voo.id,
    tipoEvento: 'tripulacao',
    statusAnterior: voo.status,
    statusNovo: voo.status,
    descricao: 'Tripulante adicionado',
    metadata: { action: 'create', tripulante_id: Number(result.meta.last_row_id), funcao },
    usuarioId: userId,
  });

  return c.json({ success: true, data: { id: Number(result.meta.last_row_id) } }, 201);
});

rdvWorkflow.put('/voos/:id/tripulantes/:tripulanteId', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const tripulanteId = parsePositiveInteger(c.req.param('tripulanteId'), 'tripulanteId');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.editarRascunhoProprio);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM cv_voo_tripulantes WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
  )
    .bind(tripulanteId, voo.id, empresaId)
    .first();
  if (!existing)
    throw new ApiError('Tripulante nao encontrado', 404, 'CONTROLE_VOOS_TRIPULANTE_NOT_FOUND');

  const payload = await parseJsonPayload(c);
  const sets: string[] = [];
  const values: unknown[] = [];

  if (payload.funcao !== undefined) {
    const funcao = String(payload.funcao || '').trim();
    if (!allowedCrewFuncoes.has(funcao)) {
      throw new ApiError('funcao invalida', 400, 'CONTROLE_VOOS_TRIPULANTE_FUNCAO_INVALIDA');
    }
    sets.push('funcao = ?');
    values.push(funcao);
  }
  if (payload.horario_apresentacao !== undefined) {
    sets.push('horario_apresentacao = ?');
    values.push(payload.horario_apresentacao ? String(payload.horario_apresentacao) : null);
  }
  if (payload.horario_dispensa !== undefined) {
    sets.push('horario_dispensa = ?');
    values.push(payload.horario_dispensa ? String(payload.horario_dispensa) : null);
  }
  if (payload.observacoes !== undefined) {
    sets.push('observacoes = ?');
    values.push(payload.observacoes ? String(payload.observacoes) : null);
  }

  if (sets.length > 0) {
    sets.push('updated_by = ?', 'updated_at = datetime("now")');
    values.push(userId, tripulanteId, empresaId);
    await c.env.DB.prepare(
      `UPDATE cv_voo_tripulantes SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`,
    )
      .bind(...values)
      .run();
  }

  return c.json({ success: true, data: { id: tripulanteId } });
});

rdvWorkflow.delete(
  '/voos/:id/tripulantes/:tripulanteId',
  auth(),
  requireAnyRdvAccess(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const tripulanteId = parsePositiveInteger(c.req.param('tripulanteId'), 'tripulanteId');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.editarRascunhoProprio,
    );

    const result = await c.env.DB.prepare(
      `
        UPDATE cv_voo_tripulantes
        SET deleted_at = datetime('now'), updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      `,
    )
      .bind(userId, tripulanteId, voo.id, empresaId)
      .run();

    if (!result.meta.changes) {
      throw new ApiError('Tripulante nao encontrado', 404, 'CONTROLE_VOOS_TRIPULANTE_NOT_FOUND');
    }

    return c.json({ success: true, data: { id: tripulanteId } });
  },
);

// ===========================================================================
// Abastecimentos (cv_voo_abastecimentos)
// ===========================================================================

rdvWorkflow.get('/voos/:id/abastecimentos', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);

  const { results } = await c.env.DB.prepare(
    `
      SELECT id, voo_id, etapa_id, fornecedor, localidade, combustivel_solicitado, unidade,
             combustivel_abastecido, numero_ce, anexo_r2_key, responsavel_id, data_hora, observacoes
      FROM cv_voo_abastecimentos
      WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      ORDER BY data_hora ASC, id ASC
    `,
  )
    .bind(voo.id, empresaId)
    .all();

  return c.json({ success: true, data: results || [] });
});

rdvWorkflow.post('/voos/:id/abastecimentos', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.editarRascunhoProprio);
  const payload = await parseJsonPayload(c);

  const dataHora = String(payload.data_hora || '').trim();
  if (!dataHora) throw new ApiError('data_hora invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  const fornecedor = payload.fornecedor ? String(payload.fornecedor) : null;
  const localidade = payload.localidade ? String(payload.localidade) : null;
  const unidade = payload.unidade ? String(payload.unidade) : 'L';
  const combustivelSolicitado =
    payload.combustivel_solicitado != null && payload.combustivel_solicitado !== ''
      ? Number(payload.combustivel_solicitado)
      : null;
  const combustivelAbastecido =
    payload.combustivel_abastecido != null && payload.combustivel_abastecido !== ''
      ? Number(payload.combustivel_abastecido)
      : null;
  const numeroCe = payload.numero_ce ? String(payload.numero_ce) : null;
  const anexoR2Key = payload.anexo_r2_key ? String(payload.anexo_r2_key) : null;
  const responsavelId = parseOptionalPositiveInteger(payload.responsavel_id, 'responsavel_id');
  const etapaId = parseOptionalPositiveInteger(payload.etapa_id, 'etapa_id');
  const observacoes = payload.observacoes ? String(payload.observacoes) : null;

  const result = await c.env.DB.prepare(
    `
        INSERT INTO cv_voo_abastecimentos (
          empresa_id, voo_id, etapa_id, fornecedor, localidade,
          combustivel_solicitado, unidade, combustivel_abastecido, numero_ce,
          anexo_r2_key, responsavel_id, data_hora, observacoes,
          created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
  )
    .bind(
      empresaId,
      voo.id,
      etapaId,
      fornecedor,
      localidade,
      combustivelSolicitado,
      unidade,
      combustivelAbastecido,
      numeroCe,
      anexoR2Key,
      responsavelId,
      dataHora,
      observacoes,
      userId,
      userId,
    )
    .run();

  return c.json({ success: true, data: { id: Number(result.meta.last_row_id) } }, 201);
});

rdvWorkflow.delete(
  '/voos/:id/abastecimentos/:abastecimentoId',
  auth(),
  requireAnyRdvAccess(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const abastecimentoId = parsePositiveInteger(c.req.param('abastecimentoId'), 'abastecimentoId');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.editarRascunhoProprio,
    );

    const result = await c.env.DB.prepare(
      `
        UPDATE cv_voo_abastecimentos
        SET deleted_at = datetime('now'), updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      `,
    )
      .bind(userId, abastecimentoId, voo.id, empresaId)
      .run();

    if (!result.meta.changes) {
      throw new ApiError(
        'Abastecimento nao encontrado',
        404,
        'CONTROLE_VOOS_ABASTECIMENTO_NOT_FOUND',
      );
    }

    return c.json({ success: true, data: { id: abastecimentoId } });
  },
);

export default rdvWorkflow;
