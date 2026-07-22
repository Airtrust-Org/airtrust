#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  defaultContractPath,
  loadSessionContract,
  validateSessionContract,
} from './lib/matriz-session-contract.mjs';
import { resolveGuiaLinks } from './lib/matriz-guia-resolution.mjs';

function fail(message) {
  throw new Error(`Relink de guias recusado: ${message}`);
}
function arg(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function refuseRemote(argv = process.argv) {
  const joined = argv.join(' ').toLowerCase();
  if (
    argv.includes('--remote') ||
    joined.includes('--env production') ||
    joined.includes('--env staging')
  ) {
    fail('indicação de remoto/staging/produção');
  }
}
function sqlite(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-bail', dbPath], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(result.stderr || result.stdout || 'falha sqlite');
  return result.stdout.trim();
}
function sqliteJson(dbPath, sql) {
  const raw = spawnSync('sqlite3', ['-json', dbPath], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (raw.status !== 0) fail(raw.stderr || raw.stdout || 'falha sqlite json');
  const trimmed = raw.stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

export function relinkGuias({ dbPath, empresaId, versaoMatriz = 'M2026.07', contract }) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) fail('empresa_id inválido');

  const guias = sqliteJson(
    dbPath,
    `SELECT g.id, g.codigo, g.programa, g.ciclo, g.sessao_numero, g.sessao_total, ma.codigo AS aeronave
     FROM simuladores_guias_instrutor g
     LEFT JOIN modelos_aeronave ma ON ma.id = g.modelo_aeronave_id
     WHERE g.empresa_id=${empresaId} AND g.deleted_at IS NULL`,
  );
  const resolutions = resolveGuiaLinks({ sessions: contract.sessions, guias });
  if (resolutions.length !== contract.sessions.length) fail('resolução incompleta');

  const currentModels = sqliteJson(
    dbPath,
    `SELECT modelo_id, codigo_canonico FROM modelos_sessao_versionamento
     WHERE empresa_id=${empresaId} AND is_current=1 AND versao_matriz='${versaoMatriz.replace(/'/g, "''")}'`,
  );
  const currentByCode = new Map(currentModels.map((m) => [m.codigo_canonico, m.modelo_id]));

  const sql = ['BEGIN IMMEDIATE;'];
  let created = 0;
  let deactivatedStale = 0;
  for (const { codigo_canonico, guia_id } of resolutions) {
    const modeloId = currentByCode.get(codigo_canonico);
    if (!modeloId) fail(`${codigo_canonico}: nenhuma versão corrente ${versaoMatriz}`);

    const alreadyLinked = sqliteJson(
      dbPath,
      `SELECT id FROM simuladores_modelos_sessao_guias
       WHERE empresa_id=${empresaId} AND guia_id=${Number(guia_id)} AND modelo_sessao_id=${Number(modeloId)} AND deleted_at IS NULL`,
    );
    if (alreadyLinked.length) continue; // idempotent: correct link already active

    sql.push(`UPDATE simuladores_modelos_sessao_guias
      SET deleted_at=CURRENT_TIMESTAMP
      WHERE empresa_id=${empresaId} AND guia_id=${Number(guia_id)} AND modelo_sessao_id<>${Number(modeloId)} AND deleted_at IS NULL;`);
    sql.push(`INSERT INTO simuladores_modelos_sessao_guias(empresa_id, modelo_sessao_id, guia_id, principal, ordem, created_at, updated_at)
      VALUES(${empresaId}, ${Number(modeloId)}, ${Number(guia_id)}, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`);
    created += 1;
  }
  sql.push('COMMIT;');

  if (created > 0) {
    try {
      sqlite(dbPath, sql.join('\n'));
    } catch (error) {
      spawnSync('sqlite3', [dbPath], { input: 'ROLLBACK;', encoding: 'utf8' });
      throw error;
    }
  }

  const activeLinks = sqliteJson(
    dbPath,
    `SELECT g.modelo_sessao_id, v.codigo_canonico, ma.codigo AS aeronave
     FROM simuladores_modelos_sessao_guias g
     JOIN modelos_sessao_versionamento v ON v.modelo_id = g.modelo_sessao_id AND v.is_current=1
     JOIN modelos_sessao ms ON ms.id = g.modelo_sessao_id
     JOIN simuladores_guias_instrutor gi ON gi.id = g.guia_id
     LEFT JOIN modelos_aeronave ma ON ma.id = gi.modelo_aeronave_id
     WHERE g.empresa_id=${empresaId} AND g.deleted_at IS NULL AND v.versao_matriz='${versaoMatriz.replace(/'/g, "''")}'`,
  );
  if (activeLinks.length !== contract.sessions.length) {
    fail(`esperados ${contract.sessions.length} vínculos ativos; encontrados ${activeLinks.length}`);
  }
  const expectedByAeronave = {};
  for (const session of contract.sessions) {
    expectedByAeronave[session.aeronave] = (expectedByAeronave[session.aeronave] || 0) + 1;
  }
  const byAeronave = {};
  for (const row of activeLinks) byAeronave[row.aeronave] = (byAeronave[row.aeronave] || 0) + 1;
  for (const [aeronave, count] of Object.entries(expectedByAeronave)) {
    if (byAeronave[aeronave] !== count) {
      fail(`distribuição por aeronave incorreta: esperado ${JSON.stringify(expectedByAeronave)}; encontrado ${JSON.stringify(byAeronave)}`);
    }
  }
  const duplicateModel = activeLinks
    .map((r) => r.modelo_sessao_id)
    .filter((id, i, arr) => arr.indexOf(id) !== i);
  if (duplicateModel.length) fail('modelo corrente com mais de um guia principal ativo');

  return { ok: true, created, deactivatedStale, totalActiveLinks: activeLinks.length, byAeronave };
}

export function runRelinkCli(argv = process.argv) {
  refuseRemote(argv);
  const d1Local = arg('--d1-local', argv);
  const empresaId = Number(arg('--empresa-id', argv));
  const versaoMatriz = arg('--versao-matriz', argv) || 'M2026.07';
  if (!d1Local || !Number.isInteger(empresaId) || empresaId <= 0) {
    fail('uso: --d1-local <arquivo> --empresa-id <tenant> [--versao-matriz <versao>]');
  }
  if (!fs.existsSync(d1Local)) fail('D1 local inexistente');
  const contract = loadSessionContract(
    defaultContractPath(path.join(path.dirname(fileURLToPath(import.meta.url)), '..')),
  );
  validateSessionContract(contract);
  const result = relinkGuias({ dbPath: d1Local, empresaId, versaoMatriz, contract });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runRelinkCli(process.argv);
}
