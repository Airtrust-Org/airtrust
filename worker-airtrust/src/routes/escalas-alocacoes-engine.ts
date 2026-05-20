/**
 * Engine de cobertura e desalocação para escalas.
 * Extraído de escalas-alocacoes.ts para reduzir tamanho do arquivo principal.
 *
 * Exporta:
 *   desalocarAeronaveInativa        — soft-delete em massa ao inativar aeronave
 *   recalcularCoberturaAeronave     — recalcula escala_cobertura_diaria
 *   regenerarEventosAutomaticosFuncionarioEscala — regera plano VOO/FOL
 *   removerFolgaAutomaticaOrfa      — limpa folga automática quando não há mais alocações
 */

import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { publishDomainEvent } from '../shared/domainEvents';

// ─────────────────────────────────────────────────────────────────────────────
// removerFolgaAutomaticaOrfa
// ─────────────────────────────────────────────────────────────────────────────

export async function removerFolgaAutomaticaOrfa(
  db: D1Database,
  params: {
    escalaId: string;
    funcionarioId: string;
    quinzenaId: number | null;
  },
): Promise<boolean> {
  if (!params.quinzenaId) return false;

  // Descobrir número da quinzena da alocação removida
  const quinzenaRemovida = await db
    .prepare(`SELECT numero, empresa_id, ano, mes FROM escalas_quinzenas WHERE id = ? LIMIT 1`)
    .bind(params.quinzenaId)
    .first<{ numero: number; empresa_id: number; ano: number; mes: number }>();

  if (!quinzenaRemovida) return false;

  const numeroOposto = quinzenaRemovida.numero === 1 ? 2 : 1;

  // Buscar quinzena oposta
  const quinzenaOposta = await db
    .prepare(
      `SELECT id FROM escalas_quinzenas
       WHERE empresa_id = ? AND ano = ? AND mes = ? AND numero = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(quinzenaRemovida.empresa_id, quinzenaRemovida.ano, quinzenaRemovida.mes, numeroOposto)
    .first<{ id: number }>();

  if (!quinzenaOposta) return false;

  // Verificar se existe folga automática na quinzena oposta
  const folgaAuto = await db
    .prepare(
      `SELECT id FROM escala_alocacoes
       WHERE funcionario_id = ? AND escala_id = ?
         AND quinzena_id = ? AND deleted_at IS NULL
         AND status != 'cancelado'
         AND auto_gerado = 1 AND situacao_tipo = 'FOLGA'
       LIMIT 1`,
    )
    .bind(params.funcionarioId, params.escalaId, quinzenaOposta.id)
    .first<{ id: string }>();

  if (!folgaAuto) return false;

  // Verificar se o tripulante ainda tem alguma alocação real (não auto) na quinzena original
  const alocacaoReal = await db
    .prepare(
      `SELECT id FROM escala_alocacoes
       WHERE funcionario_id = ? AND escala_id = ?
         AND quinzena_id = ? AND deleted_at IS NULL
         AND status != 'cancelado'
         AND (auto_gerado = 0 OR auto_gerado IS NULL)
       LIMIT 1`,
    )
    .bind(params.funcionarioId, params.escalaId, params.quinzenaId)
    .first<{ id: string }>();

  // Se ainda tem alocação real na quinzena original → manter a folga
  if (alocacaoReal) return false;

  // Nenhuma alocação real restante → remover folga automática órfã
  await db
    .prepare(
      `UPDATE escala_alocacoes SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(folgaAuto.id)
    .run();

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// atualizarAlertasCoberturaBatch
// Replaces the old per-day atualizarAlertasCobertura that ran 28-62 queries.
// This version runs exactly 2 queries (1 SELECT + 1 batch) for the entire month.
// ─────────────────────────────────────────────────────────────────────────────

async function atualizarAlertasCoberturaBatch(
  db: D1Database,
  params: {
    escalaId: string;
    empresaId: number;
    aeronaveId: number;
    statusPorDia: Array<{ data: string; status: string }>;
  },
): Promise<void> {
  const tipoPorStatus: Record<string, string | null> = {
    gap_total: 'COBERTURA_GAP_TOTAL',
    gap_pic: 'COBERTURA_GAP_PIC',
    gap_sic: 'COBERTURA_GAP_SIC',
    excesso: 'COBERTURA_EXCESSO',
    ok: null,
  };

  // 1) Fetch all existing unresolved COBERTURA_* alerts for this escala+aeronave (1 query)
  const existingAlerts = await db
    .prepare(
      `SELECT id, tipo, mensagem
         FROM escala_alertas
        WHERE escala_id = ?
          AND empresa_id = ?
          AND tipo LIKE 'COBERTURA_%'
          AND deleted_at IS NULL
          AND COALESCE(resolvido, 0) = 0`,
    )
    .bind(params.escalaId, params.empresaId)
    .all<{ id: string; tipo: string; mensagem: string }>();

  const existingByMsg = new Map<string, string>(); // mensagem → id
  for (const alerta of existingAlerts.results ?? []) {
    existingByMsg.set(alerta.mensagem, alerta.id);
  }

  // 2) Compute which alerts to resolve and which to insert
  const toResolveIds: string[] = [];
  const toInsert: Array<{ tipo: string; mensagem: string }> = [];

  for (const { data, status } of params.statusPorDia) {
    const tipo = tipoPorStatus[status] ?? null;
    const mensagem = `Cobertura ${status} na aeronave ${params.aeronaveId} em ${data}`;

    if (!tipo) {
      // Status is OK — resolve any existing alert for this message
      const id = existingByMsg.get(mensagem);
      if (id) toResolveIds.push(id);
    } else {
      // Problem status — insert if not already open
      if (!existingByMsg.has(mensagem)) {
        toInsert.push({ tipo, mensagem });
      }
    }
  }

  // 3) Batch all mutations (1 batch call)
  const stmts = [];

  for (const id of toResolveIds) {
    stmts.push(
      db
        .prepare(
          `UPDATE escala_alertas
              SET resolvido = 1, resolved_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?`,
        )
        .bind(id),
    );
  }

  for (const { tipo, mensagem } of toInsert) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO escala_alertas (id, escala_id, empresa_id, tipo, mensagem, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(crypto.randomUUID(), params.escalaId, params.empresaId, tipo, mensagem),
    );
  }

  if (stmts.length > 0) {
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// regenerarEventosAutomaticosFuncionarioEscala
// ─────────────────────────────────────────────────────────────────────────────

interface RegenerarEventosFuncionarioParams {
  db: D1Database;
  empresa_id?: string | number | null;
  escala_id: string;
  funcionario_id: string;
  created_by: string;
}

/**
 * Regera o plano automático VOO/FOL do funcionário para o mês inteiro da escala.
 */
export async function regenerarEventosAutomaticosFuncionarioEscala(
  params: RegenerarEventosFuncionarioParams,
): Promise<number> {
  const { db, escala_id, funcionario_id, created_by } = params;

  const escala = await db
    .prepare(`SELECT ano, mes FROM escalas_mensais WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(escala_id)
    .first<{ ano: number; mes: number }>();

  if (!escala) return 0;

  await db
    .prepare(
      `UPDATE escala_eventos
          SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE escala_id = ?
          AND funcionario_id = ?
          AND gerado_automaticamente = 1
          AND tipo_evento IN ('voo', 'folga', 'standby', 'ferias', 'treinamento_simulador', 'licenca')
          AND deleted_at IS NULL`,
    )
    .bind(escala_id, funcionario_id)
    .run();

  const alocacoesAtivas = await db
    .prepare(
      `SELECT ea.id, ea.data_inicio, ea.data_fim, ea.base, ea.situacao_tipo,
              a.prefixo AS aeronave_prefixo,
              a.modelo AS aeronave_modelo
         FROM escala_alocacoes ea
         LEFT JOIN aeronaves a ON a.id = ea.aeronave_id
        WHERE ea.escala_id = ?
          AND ea.funcionario_id = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
        ORDER BY ea.data_inicio, ea.created_at, ea.id`,
    )
    .bind(escala_id, funcionario_id)
    .all<{
      id: string;
      data_inicio: string;
      data_fim: string;
      base: string | null;
      situacao_tipo: string | null;
      aeronave_prefixo: string | null;
      aeronave_modelo: string | null;
    }>();

  const alocacoes = alocacoesAtivas.results || [];
  if (alocacoes.length === 0) return 0;

  // Qualquer evento já existente do funcionário deve prevalecer sobre os
  // placeholders automáticos gerados pela escala naquele dia.
  const existingRows = await db
    .prepare(
      `SELECT data_inicio, data_fim FROM escala_eventos
        WHERE escala_id = ? AND funcionario_id = ?
          AND deleted_at IS NULL
          AND status != 'cancelado'`,
    )
    .bind(escala_id, funcionario_id)
    .all<{ data_inicio: string; data_fim: string }>();

  const manualDates = new Set<string>();
  for (const row of existingRows.results || []) {
    const s = new Date(row.data_inicio + 'T00:00:00Z');
    const e = new Date(row.data_fim + 'T00:00:00Z');
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      manualDates.add(d.toISOString().slice(0, 10));
    }
  }

  const monthStart = new Date(Date.UTC(Number(escala.ano), Number(escala.mes) - 1, 1, 12, 0, 0));
  const monthEnd = new Date(Date.UTC(Number(escala.ano), Number(escala.mes), 0, 12, 0, 0));

  const stmts: D1PreparedStatement[] = [];

  for (let d = new Date(monthStart); d <= monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (manualDates.has(dateStr)) continue;

    const alocacaoDoDia = alocacoes.find(
      (alocacao) => dateStr >= alocacao.data_inicio && dateStr <= alocacao.data_fim,
    );

    let tipoEvento = 'folga';
    let motivo = 'Auto-gerado — FOL em dia sem alocação operacional';

    if (alocacaoDoDia) {
      if (alocacaoDoDia.situacao_tipo === 'FOLGA') {
        tipoEvento = 'folga';
        motivo = 'Auto-gerado — FOL (Alocação de folga)';
      } else if (alocacaoDoDia.situacao_tipo === 'FERIAS') {
        tipoEvento = 'ferias';
        motivo = 'Auto-gerado — FÉRIAS (Alocação de férias)';
      } else if (alocacaoDoDia.situacao_tipo === 'STB') {
        tipoEvento = 'standby';
        motivo = 'Auto-gerado — STB (Alocação de standby)';
      } else if (alocacaoDoDia.situacao_tipo === 'SIM') {
        tipoEvento = 'treinamento_simulador';
        motivo = 'Auto-gerado — SIM (Alocação de simulador)';
      } else if (alocacaoDoDia.situacao_tipo === 'AFT') {
        tipoEvento = 'licenca';
        motivo = 'Auto-gerado — AFT (Alocação de afastamento)';
      } else {
        tipoEvento = 'voo';
        motivo = 'Auto-gerado — VOO dentro de alocação operacional ativa';
      }
    }

    const aeronave = alocacaoDoDia
      ? [alocacaoDoDia.aeronave_prefixo, alocacaoDoDia.aeronave_modelo]
          .filter(Boolean)
          .join(' ')
          .trim() || null
      : null;
    const base = alocacaoDoDia?.base || null;
    const alocacaoId = alocacaoDoDia?.id || null;

    stmts.push(
      db
        .prepare(
          `INSERT INTO escala_eventos
         (id, escala_id, tripulacao_id, funcionario_id, tipo_evento, data_inicio, data_fim,
          turno, local, aeronave, gerado_automaticamente, motivo_automatico, status,
          alocacao_id, created_by, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 'dia_todo', ?, ?, 1, ?, 'confirmado', ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          crypto.randomUUID(),
          escala_id,
          funcionario_id,
          tipoEvento,
          dateStr,
          dateStr,
          base,
          aeronave,
          motivo,
          alocacaoId,
          created_by,
        ),
    );
  }

  if (!stmts.length) return 0;

  // D1 batch tem limite de 100 statements
  let total = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    const batch = stmts.slice(i, i + 100);
    await db.batch(batch);
    total += batch.length;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// recalcularCoberturaAeronave
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recalcula escala_cobertura_diaria para uma aeronave específica.
 * Chamado após cada mutação de alocação.
 */
export async function recalcularCoberturaAeronave(
  db: D1Database,
  escalaId: string,
  aeronaveId: number,
  mes: number,
  ano: number,
  empresaId?: number,
): Promise<void> {
  // Dias do mês
  const diasDoMes: string[] = [];
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let dia = 1; dia <= ultimoDia; dia++) {
    diasDoMes.push(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
  }

  // Buscar todas as alocações ativas da aeronave nesta escala (1 query)
  const alocacoes = await db
    .prepare(
      `SELECT funcao, data_inicio, data_fim FROM escala_alocacoes
       WHERE escala_id = ? AND aeronave_id = ? AND deleted_at IS NULL
         AND status != 'cancelado'`,
    )
    .bind(escalaId, aeronaveId)
    .all<{ funcao: string; data_inicio: string; data_fim: string }>();

  // Calcular contagens por dia em memória (zero queries adicionais)
  const stmts: D1PreparedStatement[] = [];
  const statusPorDia: Array<{ data: string; status: string }> = [];

  for (const data of diasDoMes) {
    let qtdPic = 0;
    let qtdSic = 0;

    for (const a of alocacoes.results || []) {
      if (a.data_inicio <= data && a.data_fim >= data) {
        if (a.funcao === 'PIC' || a.funcao === 'PIC_CHK') qtdPic++;
        else if (a.funcao === 'SIC' || a.funcao === 'SIC_CHK') qtdSic++;
      }
    }

    let statusCobertura: string;
    if (qtdPic === 0 && qtdSic === 0) statusCobertura = 'gap_total';
    else if (qtdPic === 0) statusCobertura = 'gap_pic';
    else if (qtdSic === 0) statusCobertura = 'gap_sic';
    else if (qtdPic > 1 || qtdSic > 1) statusCobertura = 'excesso';
    else statusCobertura = 'ok';

    statusPorDia.push({ data, status: statusCobertura });

    stmts.push(
      db
        .prepare(
          `INSERT INTO escala_cobertura_diaria (escala_id, aeronave_id, data, qtd_pic, qtd_sic, status_cobertura, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(escala_id, aeronave_id, data) DO UPDATE SET
           qtd_pic = excluded.qtd_pic,
           qtd_sic = excluded.qtd_sic,
           status_cobertura = excluded.status_cobertura,
           updated_at = excluded.updated_at`,
        )
        .bind(escalaId, aeronaveId, data, qtdPic, qtdSic, statusCobertura),
    );
  }

  if (stmts.length > 0) {
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100));
    }
  }

  if (empresaId) {
    // Batch all alert updates in 2 queries instead of 28-62 sequential calls
    await atualizarAlertasCoberturaBatch(db, {
      escalaId,
      empresaId,
      aeronaveId,
      statusPorDia,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// desalocarAeronaveInativa
// ─────────────────────────────────────────────────────────────────────────────

export async function desalocarAeronaveInativa(
  db: D1Database,
  params: {
    empresaId: number;
    aeronaveId: number;
    userId?: string | null;
    motivo?: string | null;
  },
): Promise<{ alocacoesRemovidas: number; escalasAfetadas: number; funcionariosAfetados: number }> {
  const alocacoes = await db
    .prepare(
      `SELECT ea.id,
              ea.escala_id,
              ea.funcionario_id,
              ea.funcao,
              ea.quinzena_id,
              em.mes,
              em.ano
         FROM escala_alocacoes ea
         JOIN escalas_mensais em ON em.id = ea.escala_id
        WHERE ea.aeronave_id = ?
          AND ea.deleted_at IS NULL
          AND em.deleted_at IS NULL
          AND em.empresa_id = ?
          AND em.status != 'arquivada'`,
    )
    .bind(params.aeronaveId, params.empresaId)
    .all<{
      id: string;
      escala_id: string;
      funcionario_id: string;
      funcao: string | null;
      quinzena_id: number | null;
      mes: number;
      ano: number;
    }>();

  const rows = alocacoes.results || [];
  if (rows.length === 0) {
    await db
      .prepare(`DELETE FROM escala_cobertura_diaria WHERE aeronave_id = ?`)
      .bind(params.aeronaveId)
      .run();
    return { alocacoesRemovidas: 0, escalasAfetadas: 0, funcionariosAfetados: 0 };
  }

  const escalaMeta = new Map<string, { mes: number; ano: number }>();
  const funcionariosPorEscala = new Set<string>();
  const motivo = params.motivo || 'Aeronave inativada';

  // Batch: soft-delete em escala_alocacoes (todas de uma vez)
  const alocacaoIds = rows.map((r: any) => r.id as string);
  const alocacaoChanges = alocacaoIds.map((id: string) =>
    db
      .prepare(
        `UPDATE escala_alocacoes
            SET deleted_at = datetime('now'),
                updated_at = datetime('now'),
                observacoes = TRIM(COALESCE(observacoes || ' ', '') || '[' || ? || ']')
          WHERE id = ?`,
      )
      .bind(motivo, id),
  );
  if (alocacaoChanges.length > 0) {
    for (let i = 0; i < alocacaoChanges.length; i += 50) {
      await db.batch(alocacaoChanges.slice(i, i + 50));
    }
  }

  // Batch: soft-delete em escala_eventos vinculados (todos de uma vez)
  if (alocacaoIds.length > 0) {
    const eventosChanges = alocacaoIds.map((id: string) =>
      db
        .prepare(
          `UPDATE escala_eventos
              SET deleted_at = datetime('now'), updated_at = datetime('now')
            WHERE alocacao_id = ?
              AND gerado_automaticamente = 1
              AND deleted_at IS NULL`,
        )
        .bind(id),
    );
    for (let i = 0; i < eventosChanges.length; i += 50) {
      await db.batch(eventosChanges.slice(i, i + 50));
    }
  }

  // Processamento por linha: folga automática e domain events (não batchável)
  for (const row of rows) {
    if (row.quinzena_id) {
      await removerFolgaAutomaticaOrfa(db, {
        escalaId: row.escala_id,
        funcionarioId: row.funcionario_id,
        quinzenaId: row.quinzena_id,
      });
    }

    try {
      await publishDomainEvent(db, 'escalas', 'TRIPULANTE_REMOVIDO', {
        empresa_id: params.empresaId,
        origem_modulo: 'aeronaves',
        origem_usuario_id: params.userId || undefined,
        funcionario_id: row.funcionario_id,
        escala_id: row.escala_id,
        alocacao_id: row.id,
        papel: row.funcao,
      });
    } catch (error) {
      console.error('[alocacoes] inativacao aeronave domain_event error:', error);
    }

    escalaMeta.set(row.escala_id, { mes: Number(row.mes), ano: Number(row.ano) });
    funcionariosPorEscala.add(`${row.escala_id}::${row.funcionario_id}`);
  }

  for (const entry of funcionariosPorEscala) {
    const [escalaId, funcionarioId] = entry.split('::');
    await regenerarEventosAutomaticosFuncionarioEscala({
      db,
      empresa_id: params.empresaId,
      escala_id: escalaId,
      funcionario_id: funcionarioId,
      created_by: params.userId || 'system',
    });
  }

  for (const [escalaId, meta] of escalaMeta.entries()) {
    await db
      .prepare(`DELETE FROM escala_cobertura_diaria WHERE escala_id = ? AND aeronave_id = ?`)
      .bind(escalaId, params.aeronaveId)
      .run();

    await recalcularCoberturaAeronave(
      db,
      escalaId,
      params.aeronaveId,
      Number(meta.mes),
      Number(meta.ano),
      params.empresaId,
    );
  }

  return {
    alocacoesRemovidas: rows.length,
    escalasAfetadas: escalaMeta.size,
    funcionariosAfetados: new Set(rows.map((row) => row.funcionario_id)).size,
  };
}
