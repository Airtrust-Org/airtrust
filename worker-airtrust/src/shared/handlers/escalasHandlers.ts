import type { D1Database } from '@cloudflare/workers-types';
import { registerHandler } from '../eventProcessor';

async function escalasAtivasDoTripulante(db: D1Database, funcionarioId: string, empresaId: string) {
  return db
    .prepare(
      `SELECT DISTINCT em.id, em.mes, em.ano
       FROM escala_tripulacoes et
       JOIN escalas_mensais em ON em.id = et.escala_id
       WHERE (et.pic_id = ? OR et.sic_id = ?)
         AND em.empresa_id = ?
         AND em.status NOT IN ('arquivada')
         AND em.deleted_at IS NULL
         AND et.deleted_at IS NULL`,
    )
    .bind(funcionarioId, funcionarioId, Number(empresaId))
    .all<{ id: string; mes: number; ano: number }>();
}

async function inserirAlertaEscala(
  db: D1Database,
  escalaId: string,
  empresaId: string,
  tipo: string,
  funcionarioId: string,
  mensagem: string,
) {
  await db
    .prepare(
      `INSERT INTO escala_alertas
        (id, escala_id, empresa_id, tipo, funcionario_id, mensagem, resolvido, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(crypto.randomUUID(), escalaId, Number(empresaId), tipo, funcionarioId, mensagem)
    .run();
}

registerHandler('escalas', 'CMA_REVOGADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  const escalas = await escalasAtivasDoTripulante(
    db,
    payload.funcionario_id,
    String(payload.empresa_id),
  );
  for (const escala of escalas.results || []) {
    await inserirAlertaEscala(
      db,
      escala.id,
      String(payload.empresa_id),
      'TRIPULANTE_BLOQUEADO',
      payload.funcionario_id,
      `CMA revogado — tripulante não pode operar em ${escala.mes}/${escala.ano}`,
    );
  }
});

registerHandler('escalas', 'CMA_RENOVADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  await db
    .prepare(
      `UPDATE escala_alertas
       SET resolvido = 1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE funcionario_id = ?
         AND empresa_id = ?
         AND tipo IN ('TRIPULANTE_BLOQUEADO', 'CMA_VENCENDO')
         AND resolvido = 0
         AND deleted_at IS NULL`,
    )
    .bind(payload.funcionario_id, Number(payload.empresa_id))
    .run();
});

registerHandler('escalas', 'CMA_VENCENDO_30D', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  const escalas = await escalasAtivasDoTripulante(
    db,
    payload.funcionario_id,
    String(payload.empresa_id),
  );
  for (const escala of escalas.results || []) {
    await inserirAlertaEscala(
      db,
      escala.id,
      String(payload.empresa_id),
      'CMA_VENCENDO',
      payload.funcionario_id,
      `CMA vencendo em ${payload.dias_restantes ?? '?'} dias`,
    );
  }
});

registerHandler('escalas', 'CMA_VENCENDO_7D', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  const escalas = await escalasAtivasDoTripulante(
    db,
    payload.funcionario_id,
    String(payload.empresa_id),
  );
  for (const escala of escalas.results || []) {
    await inserirAlertaEscala(
      db,
      escala.id,
      String(payload.empresa_id),
      'CMA_VENCENDO',
      payload.funcionario_id,
      `CMA vencendo em ${payload.dias_restantes ?? '?'} dias`,
    );
  }
});

registerHandler('escalas', 'FRMS_STATUS_CRITICO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  const escalas = await escalasAtivasDoTripulante(
    db,
    payload.funcionario_id,
    String(payload.empresa_id),
  );
  for (const escala of escalas.results || []) {
    await inserirAlertaEscala(
      db,
      escala.id,
      String(payload.empresa_id),
      'FRMS_CRITICO',
      payload.funcionario_id,
      `FRMS crítico (indicador legado: ${payload.frms_score ?? '?'}) — confirmação obrigatória para operar`,
    );
  }
});

registerHandler('escalas', 'FRMS_STATUS_NORMAL', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  await db
    .prepare(
      `UPDATE escala_alertas
       SET resolvido = 1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE funcionario_id = ?
         AND empresa_id = ?
         AND tipo = 'FRMS_CRITICO'
         AND resolvido = 0
         AND deleted_at IS NULL`,
    )
    .bind(payload.funcionario_id, Number(payload.empresa_id))
    .run();
});

registerHandler('escalas', 'FRMS_STATUS_NORMALIZADO', async (db, tipo, payload) => {
  if (tipo !== 'FRMS_STATUS_NORMALIZADO') return;
  if (!payload.funcionario_id) return;
  await db
    .prepare(
      `UPDATE escala_alertas
       SET resolvido = 1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE funcionario_id = ?
         AND empresa_id = ?
         AND tipo = 'FRMS_CRITICO'
         AND resolvido = 0
         AND deleted_at IS NULL`,
    )
    .bind(payload.funcionario_id, Number(payload.empresa_id))
    .run();
});

registerHandler('escalas', 'FUNCIONARIO_INATIVADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  await db
    .prepare(
      `UPDATE escala_tripulacoes
       SET observacoes = COALESCE(observacoes,'') || ' [INATIVO desde ' || date('now') || ']',
           updated_at = CURRENT_TIMESTAMP
       WHERE (pic_id = ? OR sic_id = ?)
         AND deleted_at IS NULL
         AND escala_id IN (
           SELECT id FROM escalas_mensais
           WHERE empresa_id = ? AND status != 'arquivada' AND deleted_at IS NULL
         )`,
    )
    .bind(payload.funcionario_id, payload.funcionario_id, Number(payload.empresa_id))
    .run();
});

registerHandler('escalas', 'SIMULADOR_PENDENTE_VENCENDO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  const escalas = await escalasAtivasDoTripulante(
    db,
    payload.funcionario_id,
    String(payload.empresa_id),
  );
  for (const escala of escalas.results || []) {
    await inserirAlertaEscala(
      db,
      escala.id,
      String(payload.empresa_id),
      'SIMULADOR_PENDENTE',
      payload.funcionario_id,
      `Sessão de simulador pendente vencendo em ${payload.dias_restantes ?? '?'} dias`,
    );
  }
});

registerHandler('escalas', 'HOSPEDAGEM_RESERVADA', async (db, _tipo, payload) => {
  if (!payload.escala_tripulacao_id) return;
  await db
    .prepare(
      `UPDATE escala_tripulacoes
       SET observacoes = COALESCE(observacoes,'') || ' [Hospedagem: ' || ? || ']',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(String(payload.hospedagem_nome ?? 'reservada'), String(payload.escala_tripulacao_id))
    .run();
});

registerHandler('escalas', 'HOSPEDAGEM_CANCELADA', async (db, _tipo, payload) => {
  if (!payload.escala_tripulacao_id) return;
  await db
    .prepare(
      `UPDATE escala_tripulacoes
       SET observacoes = REPLACE(COALESCE(observacoes,''), ' [Hospedagem: reservada]', ' [Hospedagem: cancelada]'),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(String(payload.escala_tripulacao_id))
    .run();
});
