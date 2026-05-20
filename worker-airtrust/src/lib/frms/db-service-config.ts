/**
 * FRMS — Limites e configurações (D1)
 */

import type { LimitesMap, FrmsConfigLimite } from './types';
import { LIMITES_DEFAULT } from './types';
import { generateId, now, logAuditoria } from './db-service-shared';

export async function carregarLimites(db: D1Database): Promise<LimitesMap> {
  try {
    const rows = await db
      .prepare(
        'SELECT nome, valor_numerico FROM frms_configuracao_limites WHERE ativo = 1 AND deleted_at IS NULL',
      )
      .all<FrmsConfigLimite>();

    const map: Record<string, number> = {};
    for (const r of rows.results || []) {
      map[r.nome] = r.valor_numerico;
    }

    // Build all keys from LIMITES_DEFAULT as fallback
    const result = { ...LIMITES_DEFAULT } as LimitesMap;
    for (const key of Object.keys(LIMITES_DEFAULT) as (keyof LimitesMap)[]) {
      if (map[key] !== undefined) {
        (result as unknown as Record<string, number>)[key] = map[key];
      }
    }
    return result;
  } catch {
    console.warn('[FRMS] Falha ao carregar limites do DB, usando defaults');
    return { ...LIMITES_DEFAULT };
  }
}

export async function buscarConfiguracoes(db: D1Database): Promise<FrmsConfigLimite[]> {
  const rows = await db
    .prepare('SELECT * FROM frms_configuracao_limites WHERE deleted_at IS NULL ORDER BY nome ASC')
    .all<FrmsConfigLimite>();
  return rows.results || [];
}

export async function atualizarConfiguracao(
  db: D1Database,
  configs: Array<{ nome: string; valor_numerico: number }>,
): Promise<void> {
  const timestamp = now();
  for (const cfg of configs) {
    const anterior = await db
      .prepare('SELECT * FROM frms_configuracao_limites WHERE nome = ? AND deleted_at IS NULL')
      .bind(cfg.nome)
      .first();

    if (anterior) {
      // Atualiza linha existente
      await db
        .prepare(
          'UPDATE frms_configuracao_limites SET valor_numerico = ?, updated_at = ? WHERE nome = ? AND deleted_at IS NULL',
        )
        .bind(cfg.valor_numerico, timestamp, cfg.nome)
        .run();
    } else {
      // Linha não existe (nova chave adicionada ao LIMITES_DEFAULT) — cria via UPSERT
      console.warn(
        `[FRMS] atualizarConfiguracao: chave '${cfg.nome}' não encontrada no banco, criando novo registro.`,
      );
      await db
        .prepare(
          `INSERT INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, ativo, created_at, updated_at)
           VALUES (?, ?, ?, 'PARAMETRO', 1, ?, ?)`,
        )
        .bind(generateId(), cfg.nome, cfg.valor_numerico, timestamp, timestamp)
        .run();
    }

    await logAuditoria(db, 'frms_configuracao_limites', cfg.nome, 'UPDATE', anterior, {
      nome: cfg.nome,
      valor_numerico: cfg.valor_numerico,
    });
  }
}

export async function restaurarConfiguracoesPadrao(db: D1Database): Promise<void> {
  const timestamp = now();
  for (const [nome, valor] of Object.entries(LIMITES_DEFAULT)) {
    await db
      .prepare(
        'UPDATE frms_configuracao_limites SET valor_numerico = ?, updated_at = ? WHERE nome = ? AND deleted_at IS NULL',
      )
      .bind(valor, timestamp, nome)
      .run();
  }
  await logAuditoria(
    db,
    'frms_configuracao_limites',
    'ALL',
    'RESTAURAR_PADRAO',
    null,
    LIMITES_DEFAULT,
  );
}
