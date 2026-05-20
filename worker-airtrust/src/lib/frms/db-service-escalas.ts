/**
 * FRMS — Escalas quinzenais (CRUD).
 */

import type { FrmsEscala } from './types';
import { generateId, now, logAuditoria, diffDays } from './db-service-shared';

export interface SalvarEscalaInput {
  tripulante_id: string;
  ano: number;
  ciclo: number;
  data_inicio_embarque: string;
  data_fim_embarque: string;
  data_inicio_folga: string;
  data_fim_folga: string;
  observacao?: string | null;
}

export async function salvarEscala(db: D1Database, input: SalvarEscalaInput): Promise<FrmsEscala> {
  const id = generateId();
  const timestamp = now();

  const diasEmb = diffDays(input.data_inicio_embarque, input.data_fim_embarque) + 1;
  const diasFolga = diffDays(input.data_inicio_folga, input.data_fim_folga) + 1;

  await db
    .prepare(
      `INSERT INTO frms_escala_quinzenal (
        id, tripulante_id, ano, ciclo,
        data_inicio_embarque, data_fim_embarque,
        data_inicio_folga, data_fim_folga,
        dias_embarcado, dias_folga, status_ciclo,
        observacao, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, ?, ?)`,
    )
    .bind(
      id,
      input.tripulante_id,
      input.ano,
      input.ciclo,
      input.data_inicio_embarque,
      input.data_fim_embarque,
      input.data_inicio_folga,
      input.data_fim_folga,
      diasEmb,
      diasFolga,
      input.observacao ?? null,
      timestamp,
      timestamp,
    )
    .run();

  await logAuditoria(db, 'frms_escala_quinzenal', id, 'INSERT', null, input);

  return {
    id,
    tripulante_id: Number(input.tripulante_id),
    ano: input.ano,
    ciclo: input.ciclo,
    data_inicio_embarque: input.data_inicio_embarque,
    data_fim_embarque: input.data_fim_embarque,
    data_inicio_folga: input.data_inicio_folga,
    data_fim_folga: input.data_fim_folga,
    dias_embarcado: diasEmb,
    dias_folga: diasFolga,
    status_ciclo: 'ATIVO',
    observacao: input.observacao ?? null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };
}

export async function buscarEscalas(db: D1Database, tripulanteId: string): Promise<FrmsEscala[]> {
  const rows = await db
    .prepare(
      'SELECT * FROM frms_escala_quinzenal WHERE tripulante_id = ? AND deleted_at IS NULL ORDER BY ano DESC, ciclo DESC',
    )
    .bind(tripulanteId)
    .all<FrmsEscala>();
  return rows.results || [];
}

export async function atualizarEscala(
  db: D1Database,
  id: string,
  input: Partial<SalvarEscalaInput> & { status_ciclo?: string },
): Promise<FrmsEscala> {
  const existing = await db
    .prepare('SELECT * FROM frms_escala_quinzenal WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<FrmsEscala>();

  if (!existing) throw new Error('Escala não encontrada');

  const timestamp = now();
  const merged = {
    ...existing,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    updated_at: timestamp,
  };

  if (merged.data_inicio_embarque && merged.data_fim_embarque) {
    merged.dias_embarcado = diffDays(merged.data_inicio_embarque, merged.data_fim_embarque) + 1;
  }
  if (merged.data_inicio_folga && merged.data_fim_folga) {
    merged.dias_folga = diffDays(merged.data_inicio_folga, merged.data_fim_folga) + 1;
  }

  await db
    .prepare(
      `UPDATE frms_escala_quinzenal SET
        tripulante_id = ?, ano = ?, ciclo = ?,
        data_inicio_embarque = ?, data_fim_embarque = ?,
        data_inicio_folga = ?, data_fim_folga = ?,
        dias_embarcado = ?, dias_folga = ?,
        status_ciclo = ?, observacao = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(
      merged.tripulante_id,
      merged.ano,
      merged.ciclo,
      merged.data_inicio_embarque,
      merged.data_fim_embarque,
      merged.data_inicio_folga,
      merged.data_fim_folga,
      merged.dias_embarcado,
      merged.dias_folga,
      merged.status_ciclo,
      merged.observacao ?? null,
      timestamp,
      id,
    )
    .run();

  await logAuditoria(db, 'frms_escala_quinzenal', id, 'UPDATE', existing, merged);

  return merged as FrmsEscala;
}

export async function deletarEscala(db: D1Database, id: string): Promise<void> {
  const existing = await db
    .prepare('SELECT * FROM frms_escala_quinzenal WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<FrmsEscala>();

  if (!existing) {
    throw new Error('Escala não encontrada');
  }

  const timestamp = now();
  await db
    .prepare('UPDATE frms_escala_quinzenal SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .bind(timestamp, timestamp, id)
    .run();

  await logAuditoria(db, 'frms_escala_quinzenal', id, 'SOFT_DELETE', existing, null);
}
