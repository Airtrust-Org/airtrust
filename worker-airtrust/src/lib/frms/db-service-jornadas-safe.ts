/**
 * FRMS — mutações de jornadas com persistência verificada.
 *
 * Mantém o pipeline canônico em db-service-jornadas.ts, mas fecha três falhas de
 * confiabilidade do CRUD legado:
 * - data e tripulante_id aceitos pela API agora são realmente persistidos;
 * - jornadas históricas continuam editáveis/excluíveis após o desligamento do tripulante;
 * - a resposta só é devolvida depois de reler a linha efetivamente gravada.
 */

import type { FrmsJornada, LimitesMap } from './types';
import type { SalvarJornadaInput, SalvarJornadaResult } from './db-service-jornadas';
import { calcDuracaoJornada, validarRepousoPlataforma } from './calculos';
import { logAuditoria, now } from './db-service-shared';
import { recalcularPipeline, recalcularPipelineCascataDesdeData } from './db-service-jornadas';

interface FuncionarioTenantRow {
  empresa_id: number | null;
}

async function resolveJornadaEmpresaId(db: D1Database, existing: FrmsJornada): Promise<number> {
  if (existing.empresa_id != null && Number(existing.empresa_id) > 0) {
    return Number(existing.empresa_id);
  }

  const funcionario = await db
    .prepare('SELECT empresa_id FROM funcionarios WHERE id = ? LIMIT 1')
    .bind(existing.tripulante_id)
    .first<FuncionarioTenantRow>();

  if (!funcionario?.empresa_id) {
    throw new Error('FRMS_TENANT_NOT_FOUND');
  }

  return Number(funcionario.empresa_id);
}

async function assertNovoTripulanteNoMesmoTenant(
  db: D1Database,
  tripulanteId: string | number,
  empresaId: number,
): Promise<void> {
  const funcionario = await db
    .prepare(
      `SELECT empresa_id
         FROM funcionarios
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(tripulanteId, empresaId)
    .first<FuncionarioTenantRow>();

  if (!funcionario) {
    throw new Error('Tripulante ativo não encontrado no tenant da jornada');
  }
}

export async function atualizarJornadaConfiavel(
  db: D1Database,
  id: string,
  input: Partial<SalvarJornadaInput>,
  limites: LimitesMap,
): Promise<SalvarJornadaResult> {
  const existing = await db
    .prepare(
      `SELECT fj.*
         FROM frms_jornada fj
        WHERE fj.id = ?
          AND fj.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(id)
    .first<FrmsJornada>();

  if (!existing) {
    throw new Error('Jornada não encontrada');
  }

  const empresaId = await resolveJornadaEmpresaId(db, existing);
  const novoTripulanteId = Number(input.tripulante_id ?? existing.tripulante_id);
  if (!Number.isFinite(novoTripulanteId) || novoTripulanteId <= 0) {
    throw new Error('Tripulante inválido');
  }

  if (novoTripulanteId !== Number(existing.tripulante_id)) {
    await assertNovoTripulanteNoMesmoTenant(db, novoTripulanteId, empresaId);
  }

  const timestamp = now();
  const merged = {
    ...existing,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    empresa_id: empresaId,
    tripulante_id: novoTripulanteId,
    updated_at: timestamp,
  } as FrmsJornada;

  if (!merged.data || !/^\d{4}-\d{2}-\d{2}$/.test(String(merged.data))) {
    throw new Error('Data da jornada inválida');
  }

  merged.duracao_jornada_minutos =
    merged.hora_apresentacao && merged.hora_termino ? calcDuracaoJornada(merged) : 0;
  merged.repouso_plataforma_valido = validarRepousoPlataforma(
    merged.repouso_plataforma_inicio ?? null,
    merged.repouso_plataforma_fim ?? null,
    limites,
  )
    ? 1
    : 0;

  const updateResult = await db
    .prepare(
      `UPDATE frms_jornada SET
        tripulante_id = ?, data = ?, status = ?,
        hora_apresentacao = ?, hora_termino = ?,
        duracao_jornada_minutos = ?, horas_voo_minutos = ?,
        hora_primeiro_acionamento = ?, hora_primeira_decolagem = ?,
        hora_ultimo_pouso = ?, hora_corte_motor = ?, hora_dormiu = ?,
        repouso_plataforma_inicio = ?, repouso_plataforma_fim = ?,
        repouso_plataforma_valido = ?, observacao = ?, origem = ?, local_base = ?,
        empresa_id = ?, tipo_base = ?, tripulacao_aumentada = ?,
        classe_cabine = ?, aclimatado = ?, updated_at = ?
       WHERE id = ?
         AND (empresa_id = ? OR empresa_id IS NULL)
         AND deleted_at IS NULL`,
    )
    .bind(
      merged.tripulante_id,
      merged.data,
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

  if ((updateResult.meta?.changes ?? 0) !== 1) {
    throw new Error('Jornada não foi atualizada');
  }

  const persisted = await db
    .prepare(
      `SELECT *
         FROM frms_jornada
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(id, empresaId)
    .first<FrmsJornada>();

  if (!persisted) {
    throw new Error('Jornada atualizada não pôde ser confirmada');
  }

  const result = await recalcularPipeline(db, persisted, limites);

  // Uma mudança de data ou tripulante impacta as duas cadeias históricas.
  await recalcularPipelineCascataDesdeData(
    db,
    Number(existing.tripulante_id),
    existing.data,
    limites,
  );
  if (
    Number(existing.tripulante_id) !== Number(persisted.tripulante_id) ||
    existing.data !== persisted.data
  ) {
    await recalcularPipelineCascataDesdeData(
      db,
      Number(persisted.tripulante_id),
      persisted.data,
      limites,
    );
  }

  await logAuditoria(db, 'frms_jornada', id, 'UPDATE', existing, persisted);

  return { jornada: persisted, ...result };
}

export async function deletarJornadaConfiavel(
  db: D1Database,
  id: string,
  limites: LimitesMap,
): Promise<void> {
  const existing = await db
    .prepare(
      `SELECT *
         FROM frms_jornada
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(id)
    .first<FrmsJornada>();

  if (!existing) {
    throw new Error('Jornada não encontrada');
  }

  const empresaId = await resolveJornadaEmpresaId(db, existing);
  const timestamp = now();

  const deleteResult = await db
    .prepare(
      `UPDATE frms_jornada
          SET deleted_at = ?, updated_at = ?
        WHERE id = ?
          AND (empresa_id = ? OR empresa_id IS NULL)
          AND deleted_at IS NULL`,
    )
    .bind(timestamp, timestamp, id, empresaId)
    .run();

  if ((deleteResult.meta?.changes ?? 0) !== 1) {
    throw new Error('Jornada não foi excluída');
  }

  await db.batch([
    db
      .prepare(
        `UPDATE frms_fatorizacao_jornada
            SET deleted_at = ?, updated_at = ?
          WHERE jornada_id = ? AND deleted_at IS NULL`,
      )
      .bind(timestamp, timestamp, id),
    db
      .prepare(
        `UPDATE frms_alerta
            SET deleted_at = ?, updated_at = ?
          WHERE jornada_id = ? AND deleted_at IS NULL`,
      )
      .bind(timestamp, timestamp, id),
    db
      .prepare(
        `UPDATE frms_acumulo_rolling
            SET deleted_at = ?, updated_at = ?
          WHERE tripulante_id = ?
            AND data_referencia >= ?
            AND deleted_at IS NULL`,
      )
      .bind(timestamp, timestamp, String(existing.tripulante_id), existing.data),
  ]);

  await recalcularPipelineCascataDesdeData(
    db,
    Number(existing.tripulante_id),
    existing.data,
    limites,
  );
  await logAuditoria(db, 'frms_jornada', id, 'SOFT_DELETE', existing, null);
}
