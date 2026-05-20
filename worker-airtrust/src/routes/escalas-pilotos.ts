/**
 * ESCALAS — Pilotos disponíveis
 * GET /api/escalas/funcionarios/pilotos
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdOptional } from './escalas-shared';

const pilotos = new Hono<{ Bindings: Env }>();

// GET /api/escalas/funcionarios/pilotos
// Aceita ?aeronave_id=X (filtra por modelo da aeronave) e ?modelo_id=Y (FK direto)
pilotos.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdOptional(c);
  const { aeronave_id, modelo_id } = c.req.query();

  const funcionariosCols = await db
    .prepare(`PRAGMA table_info(funcionarios)`)
    .all<{ name?: string }>();
  const cols = (funcionariosCols.results || []).map((col) => String(col.name || '').toLowerCase());

  const hasNome = cols.includes('nome');
  const hasNomeCompleto = cols.includes('nome_completo');
  const hasMatricula = cols.includes('matricula');
  const hasCargo = cols.includes('cargo');
  const hasFuncao = cols.includes('funcao');
  const hasFotoUrl = cols.includes('foto_url');
  const hasEmpresaId = cols.includes('empresa_id');
  const hasStatus = cols.includes('status');
  const hasAtivo = cols.includes('ativo');
  const hasModeloAeronaveId = cols.includes('modelo_aeronave_id');

  const nomeSelect = hasNome
    ? 'nome'
    : hasNomeCompleto
      ? 'nome_completo as nome'
      : `CAST(id AS TEXT) as nome`;
  const matriculaSelect = hasMatricula ? 'matricula' : 'NULL as matricula';
  const cargoSelect = hasCargo ? 'cargo' : 'NULL as cargo';
  const funcaoSelect = hasFuncao ? 'funcao' : 'NULL as funcao';
  const fotoSelect = hasFotoUrl ? 'foto_url' : 'NULL as foto_url';

  const isComandanteExpr = hasFuncao
    ? `CASE WHEN LOWER(COALESCE(funcao,'')) LIKE '%comandante%' THEN 1 ELSE 0 END`
    : hasCargo
      ? `CASE WHEN LOWER(COALESCE(cargo,'')) LIKE '%comandante%' THEN 1 ELSE 0 END`
      : '0';

  const baseWhere: string[] = ['deleted_at IS NULL'];
  const baseBinds: unknown[] = [];

  if (hasEmpresaId && empresaId !== undefined) {
    baseWhere.push('(empresa_id IS NULL OR empresa_id = ?)');
    baseBinds.push(empresaId);
  }

  if (hasStatus) {
    baseWhere.push("UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'");
  } else if (hasAtivo) {
    baseWhere.push('COALESCE(ativo, 1) = 1');
  }

  // ── Filtro por modelo de aeronave ────────────────────────────────────────
  if (hasModeloAeronaveId && (aeronave_id || modelo_id)) {
    try {
      let modeloTexto: string | null = null;
      let modeloIdStr: string | null = modelo_id || null;

      if (aeronave_id) {
        const aeronave = await db
          .prepare(
            `SELECT modelo FROM aeronaves
             WHERE id = ?
               AND deleted_at IS NULL
               AND (empresa_id IS NULL OR empresa_id = ?)`,
          )
          .bind(aeronave_id, empresaId)
          .first<{ modelo: string }>();
        if (aeronave) {
          modeloTexto = aeronave.modelo;
          const ma = await db
            .prepare(
              `SELECT CAST(id AS TEXT) as id FROM modelos_aeronave
               WHERE UPPER(modelo) = UPPER(?) OR UPPER(codigo) = UPPER(?)
               LIMIT 1`,
            )
            .bind(aeronave.modelo, aeronave.modelo)
            .first<{ id: string }>();
          if (ma) modeloIdStr = ma.id;
        }
      } else if (modelo_id) {
        const ma = await db
          .prepare(`SELECT modelo, codigo FROM modelos_aeronave WHERE id = ? LIMIT 1`)
          .bind(modelo_id)
          .first<{ modelo: string; codigo: string }>();
        if (ma) modeloTexto = ma.modelo || ma.codigo;
      }

      const modeloConditions: string[] = [];
      const modeloBinds: unknown[] = [];
      if (modeloIdStr) {
        modeloConditions.push('modelo_aeronave_id = ?');
        modeloBinds.push(modeloIdStr);
        modeloConditions.push(`(',' || REPLACE(COALESCE(modelo_aeronave_id, ''), ' ', '') || ',') LIKE ?`);
        modeloBinds.push(`%,${modeloIdStr},%`);
      }
      if (modeloTexto) {
        modeloConditions.push('UPPER(modelo_aeronave_id) = UPPER(?)');
        modeloBinds.push(modeloTexto);
        modeloConditions.push(
          `UPPER(',' || REPLACE(COALESCE(modelo_aeronave_id, ''), ' ', '') || ',') LIKE UPPER(?)`,
        );
        modeloBinds.push(`%,${modeloTexto},%`);
      }
      if (modeloConditions.length > 0) {
        baseWhere.push(`(${modeloConditions.join(' OR ')})`);
        baseBinds.push(...modeloBinds);
      }
    } catch {
      /* ignora erro de modelo, segue sem filtro */
    }
  }

  try {
    const whereCargo = [...baseWhere];
    const roleFilters: string[] = [];
    if (hasCargo) {
      roleFilters.push(
        `LOWER(COALESCE(cargo,'')) LIKE '%piloto%'`,
        `UPPER(COALESCE(cargo,'')) LIKE '%PIC%'`,
        `UPPER(COALESCE(cargo,'')) LIKE '%SIC%'`,
        `LOWER(COALESCE(cargo,'')) LIKE '%comandante%'`,
        `LOWER(COALESCE(cargo,'')) LIKE '%copiloto%'`,
        `LOWER(COALESCE(cargo,'')) LIKE '%tripulante%'`,
      );
    }
    if (hasFuncao) {
      roleFilters.push(
        `LOWER(COALESCE(funcao,'')) LIKE '%piloto%'`,
        `LOWER(COALESCE(funcao,'')) LIKE '%comandante%'`,
        `LOWER(COALESCE(funcao,'')) LIKE '%copiloto%'`,
        `LOWER(COALESCE(funcao,'')) LIKE '%tripulante%'`,
      );
    }
    if (roleFilters.length > 0) whereCargo.push(`(${roleFilters.join(' OR ')})`);

    const orderExpr = hasFuncao
      ? `CASE WHEN LOWER(COALESCE(funcao,'')) LIKE '%comandante%' THEN 0 ELSE 1 END, nome`
      : 'nome';

    const queryPilotos = [
      'SELECT id,',
      nomeSelect + ',',
      matriculaSelect + ',',
      cargoSelect + ',',
      funcaoSelect + ',',
      fotoSelect + ',',
      `${isComandanteExpr} as is_comandante`,
      'FROM funcionarios',
      `WHERE ${whereCargo.join(' AND ')}`,
      `ORDER BY ${orderExpr}`,
    ].join(' ');

    const resultPilotos = await db
      .prepare(queryPilotos)
      .bind(...baseBinds)
      .all();

    if ((resultPilotos.results || []).length > 0) {
      return c.json({ success: true, data: resultPilotos.results });
    }

    // Fallback: todos os ativos sem filtro de cargo
    const queryAll = [
      'SELECT id,',
      nomeSelect + ',',
      matriculaSelect + ',',
      cargoSelect + ',',
      funcaoSelect + ',',
      fotoSelect + ',',
      `${isComandanteExpr} as is_comandante`,
      'FROM funcionarios',
      `WHERE ${baseWhere.join(' AND ')}`,
      `ORDER BY ${orderExpr}`,
    ].join(' ');

    const resultAll = await db
      .prepare(queryAll)
      .bind(...baseBinds)
      .all();

    return c.json({ success: true, data: resultAll.results });
  } catch {
    const fallbackWhere = ['deleted_at IS NULL'];
    const fallbackBinds: unknown[] = [];

    if (hasEmpresaId && empresaId !== undefined) {
      fallbackWhere.push('(empresa_id IS NULL OR empresa_id = ?)');
      fallbackBinds.push(empresaId);
    }

    const result = await db
      .prepare(
        [
          'SELECT id,',
          nomeSelect + ',',
          matriculaSelect + ',',
          cargoSelect + ',',
          funcaoSelect + ',',
          `${fotoSelect}, 0 as is_comandante`,
          'FROM funcionarios',
          `WHERE ${fallbackWhere.join(' AND ')}`,
          'ORDER BY nome',
        ].join(' '),
      )
      .bind(...fallbackBinds)
      .all();
    return c.json({ success: true, data: result.results });
  }
});

export default pilotos;
