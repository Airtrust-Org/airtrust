#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildRemediationRollbackStatements } from './lib/matriz-remediation-core.mjs';
import { sha256 } from './lib/matriz-import-plan.mjs';

function fail(message) {
  throw new Error(`Rollback de remediação recusado: ${message}`);
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
  if (hasFlag('--remote', argv) || joined.includes('--env production') || joined.includes('--env staging')) {
    fail('indicação de remoto/staging/produção');
  }
}
function sqlite(dbPath, sql) {
  const r = spawnSync('sqlite3', ['-bail', dbPath], { input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`, encoding: 'utf8' });
  if (r.status !== 0) fail(r.stderr || r.stdout || 'falha sqlite');
  return r.stdout.trim();
}
function sqliteJson(dbPath, sql) {
  const r = spawnSync('sqlite3', ['-json', dbPath], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
  if (r.status !== 0) fail(r.stderr || r.stdout || 'falha sqlite json');
  const t = r.stdout.trim();
  return t ? JSON.parse(t) : [];
}

export function runCompensatoryRollback({ d1Local, remediationUuid, empresaId, compensationUuid = `compensate-${remediationUuid}`, argv = process.argv }) {
  refuseRemote(argv);
  if (!d1Local || !remediationUuid || !Number.isInteger(empresaId) || empresaId <= 0) {
    fail('uso: --d1-local --remediation-uuid --empresa-id [--compensation-uuid]');
  }
  if (!fs.existsSync(d1Local)) fail('D1 local inexistente');

  const remediation = sqliteJson(
    d1Local,
    `SELECT * FROM simuladores_matriz_remediations WHERE remediation_uuid='${remediationUuid.replace(/'/g, "''")}' AND empresa_id=${empresaId}`,
  )[0];
  if (!remediation) fail('remediação não encontrada para o tenant');
  if (remediation.status === 'ROLLED_BACK' && remediation.rollback_uuid) {
    return { ok: true, idempotent: true, status: 'ROLLED_BACK', rollback_uuid: remediation.rollback_uuid };
  }
  if (remediation.status !== 'APPLIED') fail('somente APPLIED pode ser compensado');

  const changes = sqliteJson(
    d1Local,
    `SELECT * FROM simuladores_matriz_remediation_changes WHERE remediation_id=${Number(remediation.id)} ORDER BY change_order`,
  );
  const createChanges = changes.filter((c) => c.entity_type === 'modelos_sessao' && c.action_type === 'COMPENSATE_CREATE');
  if (!createChanges.length) fail('sem mudanças COMPENSATE_CREATE para compensar');
  const lastChangeOrder = changes.reduce((max, c) => Math.max(max, Number(c.change_order)), 0);

  const versaoMatriz = String(remediation.versao_matriz).replace('-REMEDIATION', '');
  const affectedModels = createChanges.map((change) => {
    const remediatedModeloId = Number(change.after_id);
    const version = sqliteJson(
      d1Local,
      `SELECT versao_numero FROM modelos_sessao_versionamento WHERE modelo_id=${remediatedModeloId} AND empresa_id=${empresaId}`,
    )[0];
    if (!version) fail(`versionamento ausente para modelo remediado ${remediatedModeloId}`);
    const originalModeloId = Number(change.before_id);
    const originalLinks = sqliteJson(
      d1Local,
      `SELECT id,manobra_id,ordem,obrigatoria,tripulante,observacoes FROM modelos_sessao_manobras WHERE modelo_id=${originalModeloId} AND deleted_at IS NULL ORDER BY ordem`,
    );
    if (originalLinks.length !== 18) fail(`modelo original ${originalModeloId}: esperados 18 vínculos; encontrados ${originalLinks.length}`);
    return {
      codigo_canonico: change.logical_code,
      remediated_modelo_id: remediatedModeloId,
      remediated_versao_numero: Number(version.versao_numero),
      original_links: originalLinks,
    };
  });

  const correctionRows = sqliteJson(
    d1Local,
    `SELECT id, codigo_canonico, corrected_manobra_id, original_manobra_id FROM simuladores_matriz_resolution_corrections
     WHERE remediation_id=${Number(remediation.id)} AND is_current=1`,
  );

  // The guide relink cannot be literally "undone": the matrix rollback above
  // mints new COMPENSATE model rows rather than reactivating the historical
  // ones, so the guides must be forward-relinked onto those new rows (see
  // the doc comment on buildRemediationRollbackStatements).
  const guideRelinkRollbackUuid = `${compensationUuid}-guide`;
  const guideLinkRows = sqliteJson(
    d1Local,
    `SELECT id,guia_id,modelo_sessao_id FROM simuladores_modelos_sessao_guias WHERE empresa_id=${empresaId} AND deleted_at IS NULL`,
  );
  const guideLinkByModel = new Map(guideLinkRows.map((r) => [Number(r.modelo_sessao_id), r]));
  const guideRelinkEntries = affectedModels.map((m) => {
    const currentLink = guideLinkByModel.get(m.remediated_modelo_id);
    if (!currentLink) fail(`${m.codigo_canonico}: sem guia ativo vinculado ao modelo remediado`);
    return {
      codigo_canonico: m.codigo_canonico,
      guia_id: currentLink.guia_id,
      aeronave: 'AW139',
      vinculo_antigo_id: currentLink.id,
      modelo_sessao_id_antigo: m.remediated_modelo_id,
      already_correct: false,
    };
  });

  const { statements } = buildRemediationRollbackStatements({
    empresaId,
    versaoMatriz,
    remediationUuid,
    compensationUuid,
    affectedModels,
    correctionRows,
    guideRelinkRollbackUuid,
    guideRelinkEntries,
    guideRelinkExpectedHash: sha256(guideRelinkEntries.map((e) => `${e.codigo_canonico}:${e.guia_id}`).join('|')),
    startChangeOrder: lastChangeOrder + 1,
  });

  const sql = ['BEGIN IMMEDIATE;', ...statements];
  sql.push(
    `UPDATE simuladores_matriz_guia_relink SET status='APPLIED', applied_at=CURRENT_TIMESTAMP WHERE uuid='${guideRelinkRollbackUuid.replace(/'/g, "''")}';`,
  );
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
  const remediationUuid = arg('--remediation-uuid', argv);
  const empresaId = Number(arg('--empresa-id', argv));
  const compensationUuid = arg('--compensation-uuid', argv) || `compensate-${remediationUuid}`;
  const result = runCompensatoryRollback({ d1Local, remediationUuid, empresaId, compensationUuid, argv });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runRollbackCli(process.argv);
}
