/**
 * FRMS — Limites e configurações (D1)
 *
 * Operational values must come from persisted configuration. LIMITES_DEFAULT
 * is a bootstrap/reference catalogue only; it is never substituted silently
 * when D1 is unavailable or a required configured key is missing.
 */

import type { LimitesMap, FrmsConfigLimite } from './types';
import { LIMITES_DEFAULT } from './types';
import { generateId, now, logAuditoria } from './db-service-shared';
export {
  createRevisionAndRecalcRun,
  loadFrmsRecalcRun,
  loadResolvedFrmsParameters,
  type CreateFrmsRevisionInput,
  type FrmsConfigParameter,
  type FrmsConfigRevision,
  type FrmsRecalcRun,
  type ResolvedFrmsParameterSet,
} from './parameter-governance';
export { runGovernedRecalc } from './governed-recalc';

export async function carregarLimites(db: D1Database): Promise<LimitesMap> {
  const rows = await db
    .prepare(
      'SELECT nome, valor_numerico FROM frms_configuracao_limites WHERE ativo = 1 AND deleted_at IS NULL',
    )
    .all<FrmsConfigLimite>();

  const map: Record<string, number> = {};
  for (const row of rows.results || []) {
    const value = Number(row.valor_numerico);
    if (Number.isFinite(value)) map[row.nome] = value;
  }

  const keys = Object.keys(LIMITES_DEFAULT) as (keyof LimitesMap)[];
  const missing = keys.filter((key) => !Object.hasOwn(map, key));
  if (missing.length > 0) {
    throw new Error(`FRMS_OPERATIONAL_PARAMETER_MISSING:${missing.join(',')}`);
  }

  // LIMITES_DEFAULT supplies the required-key catalogue/type shape only. No
  // operational numeric value is copied from code into the returned set.
  const result: Partial<LimitesMap> = {};
  for (const key of keys) {
    result[key] = map[key];
  }
  return result as LimitesMap;
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
      await db
        .prepare(
          'UPDATE frms_configuracao_limites SET valor_numerico = ?, updated_at = ? WHERE nome = ? AND deleted_at IS NULL',
        )
        .bind(cfg.valor_numerico, timestamp, cfg.nome)
        .run();
    } else {
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

/**
 * Historical helper retained for API compatibility. A restore is an explicit
 * administrative operation, not a runtime fallback. The values are the
 * reviewed bootstrap/reference baseline and are always written/audited in D1
 * before they can become operational.
 */
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
