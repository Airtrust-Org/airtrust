#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function fail(message) {
  throw new Error(`Rollback de matriz recusado: ${message}`);
}
function arg(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function hasFlag(name, argv = process.argv) {
  return argv.includes(name);
}
function refuseRemote(argv = process.argv) {
  const joined = argv.join(' ').toLowerCase();
  if (
    hasFlag('--remote', argv) ||
    joined.includes('--env production') ||
    joined.includes('--env staging')
  ) {
    fail('indicação de remoto/staging/produção');
  }
}
function sqlite(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-bail', dbPath], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`,
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

export function runCompensatoryRollback({
  d1Local,
  importUuid,
  empresaId,
  compensationUuid = `compensate-${importUuid}`,
  argv = process.argv,
}) {
  refuseRemote(argv);
  if (!d1Local || !importUuid || !Number.isInteger(empresaId) || empresaId <= 0) {
    fail('uso: --d1-local --import-uuid --empresa-id [--compensation-uuid]');
  }
  if (!fs.existsSync(d1Local)) fail('D1 local inexistente');

  const imp = sqliteJson(
    d1Local,
    `SELECT * FROM simuladores_matriz_imports WHERE uuid='${importUuid.replace(/'/g, "''")}' AND empresa_id=${empresaId}`,
  )[0];
  if (!imp) fail('importação não encontrada para o tenant');
  if (imp.status === 'ROLLED_BACK' && imp.rollback_uuid) {
    return {
      ok: true,
      idempotent: true,
      status: 'ROLLED_BACK',
      rollback_uuid: imp.rollback_uuid,
    };
  }
  if (imp.status !== 'APPLIED') fail('somente APPLIED pode ser compensado');

  const changes = sqliteJson(
    d1Local,
    `SELECT * FROM simuladores_matriz_import_changes WHERE import_id=${Number(imp.id)} AND operacao='INSERT' AND entidade='modelos_sessao'`,
  );
  if (!changes.length) fail('sem mudanças INSERT para compensar');

  const importedIds = changes.map((row) => Number(row.entity_id)).filter(Boolean);
  const later = sqliteJson(
    d1Local,
    `SELECT v.modelo_id, v.codigo_canonico, v.versao_numero
     FROM modelos_sessao_versionamento v
     WHERE v.empresa_id=${empresaId}
       AND v.is_current=1
       AND v.modelo_id NOT IN (${importedIds.join(',') || '-1'})
       AND v.codigo_canonico IN (
         SELECT codigo_canonico FROM modelos_sessao_versionamento WHERE modelo_id IN (${importedIds.join(',') || '-1'})
       )
       AND v.versao_matriz NOT LIKE 'COMPENSATE%'
       AND v.versao_matriz <> 'LEGACY'
       AND v.modelo_id NOT IN (${importedIds.join(',') || '-1'})`,
  );
  if (later.length) fail('drift: versão corrente posterior detectada');

  const usedByFicha = sqliteJson(
    d1Local,
    `SELECT id FROM fichas_sessao WHERE modelo_id IN (${importedIds.join(',') || '-1'}) LIMIT 1`,
  );
  const usedByAgendamento = sqliteJson(
    d1Local,
    `SELECT id FROM simulador_agendamentos WHERE template_id IN (${importedIds.join(',') || '-1'}) LIMIT 1`,
  );
  if (usedByFicha.length || usedByAgendamento.length) {
    // Compensação append-only ainda é permitida; uso posterior não apaga histórico.
    // Drift de versão corrente é o bloqueio forte acima.
  }

  const sql = [];
  sql.push('BEGIN IMMEDIATE;');
  for (const change of changes) {
    const importedId = Number(change.entity_id);
    const version = sqliteJson(
      d1Local,
      `SELECT * FROM modelos_sessao_versionamento WHERE modelo_id=${importedId} AND empresa_id=${empresaId}`,
    )[0];
    if (!version) continue;
    const previous = version.modelo_anterior_id
      ? sqliteJson(
          d1Local,
          `SELECT * FROM modelos_sessao_versionamento WHERE modelo_id=${Number(version.modelo_anterior_id)} AND empresa_id=${empresaId}`,
        )[0]
      : null;
    if (!previous) fail(`predecessor ausente para modelo ${importedId}`);

    const existingCompensation = sqliteJson(
      d1Local,
      `SELECT modelo_id FROM modelos_sessao_versionamento
       WHERE empresa_id=${empresaId} AND codigo_canonico='${String(version.codigo_canonico).replace(/'/g, "''")}'
         AND modelo_anterior_id=${importedId} AND versao_matriz LIKE 'COMPENSATE%' LIMIT 1`,
    )[0];
    if (existingCompensation) continue;

    const nextVersao = Number(version.versao_numero) + 1;
    const codigoFisico = `${version.codigo_canonico}@COMPENSATE-V${nextVersao}`.replace(/'/g, "''");
    sql.push(`INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
      SELECT '${codigoFisico}', ms.nome, ms.empresa_id, ms.tipo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM modelos_sessao ms WHERE ms.id=${Number(previous.modelo_id)};`);
    sql.push(`INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at)
      SELECT (SELECT id FROM modelos_sessao WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId}),
             manobra_id, ordem, obrigatoria, tripulante, observacoes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM modelos_sessao_manobras WHERE modelo_id=${Number(previous.modelo_id)} AND deleted_at IS NULL;`);
    sql.push(`INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json)
      SELECT msm_new.id, ${empresaId}, COALESCE(ctx.metadados_json, json_object('source','compensate'))
      FROM modelos_sessao_manobras msm_new
      JOIN modelos_sessao ms_new ON ms_new.id = msm_new.modelo_id AND ms_new.codigo='${codigoFisico}'
      LEFT JOIN modelos_sessao_manobras msm_old
        ON msm_old.modelo_id=${Number(previous.modelo_id)} AND msm_old.ordem = msm_new.ordem AND msm_old.deleted_at IS NULL
      LEFT JOIN modelos_sessao_manobras_contexto ctx ON ctx.modelo_manobra_id = msm_old.id;`);
    sql.push(`UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP
      WHERE modelo_id=${importedId} AND empresa_id=${empresaId};`);
    sql.push(`INSERT INTO modelos_sessao_versionamento(
        modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate
      )
      SELECT id, ${empresaId}, '${String(version.codigo_canonico).replace(/'/g, "''")}', ${nextVersao},
             'COMPENSATE-${String(importUuid).replace(/'/g, "''")}', 1, ${importedId}, CURRENT_TIMESTAMP, NULL
      FROM modelos_sessao WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId};`);
    sql.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
      SELECT ${Number(imp.id)}, 'modelos_sessao', id, 'COMPENSATE',
             json_object('restores', ${Number(previous.modelo_id)}, 'from', ${importedId})
      FROM modelos_sessao WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId};`);
  }

  sql.push(`UPDATE simuladores_matriz_imports
    SET status='ROLLED_BACK', rolled_back_at=CURRENT_TIMESTAMP, rollback_uuid='${compensationUuid.replace(/'/g, "''")}'
    WHERE uuid='${importUuid.replace(/'/g, "''")}' AND empresa_id=${empresaId};`);
  sql.push('COMMIT;');

  try {
    sqlite(d1Local, sql.join('\n'));
  } catch (error) {
    spawnSync('sqlite3', [d1Local], { input: 'ROLLBACK;', encoding: 'utf8' });
    throw error;
  }

  return { ok: true, status: 'ROLLED_BACK', rollback_uuid: compensationUuid };
}

export function runRollbackCli(argv = process.argv) {
  refuseRemote(argv);
  const d1Local = arg('--d1-local', argv);
  const importUuid = arg('--import-uuid', argv);
  const empresaId = Number(arg('--empresa-id', argv));
  const compensationUuid = arg('--compensation-uuid', argv) || `compensate-${importUuid}`;
  const result = runCompensatoryRollback({
    d1Local,
    importUuid,
    empresaId,
    compensationUuid,
    argv,
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runRollbackCli(process.argv);
}
