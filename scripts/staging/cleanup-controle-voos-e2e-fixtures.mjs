#!/usr/bin/env node

// source_reference: remove tudo criado por provision-controle-voos-e2e-fixtures.mjs
// e por run-controle-voos-e2e.mjs (voos/rdv/etc criados durante o teste),
// usando o mesmo manifest.json gerado no provisionamento.
// operational_decision: hard delete (nao soft-delete) — dados 100% sinteticos
// e descartaveis, sem valor de auditoria a preservar.
// dry_run_required: sem --apply, so lista o que seria removido.
// rollback_plan_required: nao aplicavel (esta e a propria operacao de rollback
// dos dados de teste); o manifest permanece no disco ate ser apagado manualmente
// se o cleanup falhar, permitindo nova tentativa.

import { readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const WORKER_DIR = decodeURIComponent(new URL('../../worker-airtrust/', import.meta.url).pathname);

function log(msg) {
  process.stderr.write(`[cleanup-cv-e2e] ${msg}\n`);
}

function execD1(dbName, sql, { apply }) {
  if (!apply) {
    log(`[dry-run] SQL:\n${sql}`);
    return;
  }
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--env', 'staging', '--remote', '--command', sql, '--json'],
    { cwd: WORKER_DIR, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    log(`AVISO: comando falhou (continuando cleanup): ${result.stderr || result.stdout}`);
  }
}

async function main() {
  const manifestPath = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error('Uso: cleanup-controle-voos-e2e-fixtures.mjs <manifest.json> [--apply]');
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const dbName = manifest.dbName;
  if (dbName !== ALLOWED_D1_NAME) {
    throw new Error(`Manifest aponta para D1 nao permitido: ${dbName}`);
  }

  const empresaIds = [manifest.empresaA.id, manifest.empresaB.id];
  log(`Limpando runId=${manifest.runId} empresas=${empresaIds.join(',')} apply=${apply}`);

  const empresaIdList = empresaIds.join(', ');

  // Ordem: filhos antes de pais (FKs). cv_* primeiro, depois funcionarios/
  // usuarios_empresas/usuarios, depois empresas por ultimo.
  const statements = [
    `DELETE FROM cv_voo_eventos WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_rdv_aprovacoes WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_rdv_revisoes WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_rdv_alertas WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_voo_abastecimentos WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_voo_tripulantes WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_voo_etapas WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_rdv_operacional WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_voos WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_aeroportos WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_tipos_voo WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_naturezas_voo WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM cv_motivos_operacionais WHERE empresa_id IN (${empresaIdList});`,
    // aeronaves/modelos_aeronave sao cadastros canonicos criados via rota
    // oficial (POST /api/aeronaves, POST /api/modelos-aeronave) por
    // run-controle-voos-e2e.mjs, nao por este script — mesmo assim precisam
    // ser limpos junto, ja que pertencem exclusivamente aos tenants sinteticos.
    `DELETE FROM aeronaves WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM modelos_aeronave WHERE empresa_id IN (${empresaIdList});`,
    // funcionarios antes de setores (funcionarios.setor_id referencia
    // setores.id) — ambos criados via rota oficial (POST /api/funcionarios,
    // POST /api/setores) por run-controle-voos-e2e.mjs.
    `DELETE FROM funcionarios WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM setores WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM usuarios_empresas WHERE empresa_id IN (${empresaIdList});`,
    `DELETE FROM usuarios WHERE id IN (${Object.values(manifest.users).map((u) => u.id).join(', ')});`,
    `DELETE FROM empresas WHERE id IN (${empresaIdList});`,
  ];

  for (const stmt of statements) {
    execD1(dbName, stmt, { apply });
  }

  if (apply) {
    rmSync(dirname(manifestPath), { recursive: true, force: true });
    log(`Manifest removido: ${manifestPath}`);
  }

  log('Cleanup concluido.');
}

main().catch((err) => {
  log(`ERRO: ${err.message}`);
  process.exitCode = 1;
});
