#!/usr/bin/env node

// source_reference: remove tudo criado por provision-controle-voos-e2e-fixtures.mjs
// e por run-controle-voos-e2e.mjs (voos/rdv/etc criados durante o teste),
// usando o mesmo manifest.json gerado no provisionamento.
// operational_decision: hard delete fail-closed (nao soft-delete) — dados 100% sinteticos
// e descartaveis, sem valor de auditoria a preservar. Falhas abortam imediatamente
// e preservam o manifest para nova tentativa.
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

function execD1(dbName, sql, label) {
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      dbName,
      '--env',
      'staging',
      '--remote',
      '--command',
      sql,
      '--json',
    ],
    { cwd: WORKER_DIR, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `D1 execute falhou [${label}]: ${result.stderr || result.stdout || `exit=${result.status}`}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`D1 execute invalid JSON [${label}]: ${error.message}`);
  }
}

function queryD1(dbName, sql, label) {
  const parsed = execD1(dbName, sql, label);
  return parsed?.[0]?.results ?? [];
}

function assertNumericIds(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label}: empty id list`);
  for (const value of values) {
    if (!Number.isInteger(Number(value)) || Number(value) <= 0)
      throw new Error(`${label}: invalid id ${value}`);
  }
  return values.map(Number);
}

async function main() {
  const manifestPath = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error('Uso: cleanup-controle-voos-e2e-fixtures.mjs <manifest.json> [--apply]');
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const dbName = String(manifest.dbName || '');
  if (dbName !== ALLOWED_D1_NAME || /prod|production/i.test(dbName)) {
    throw new Error(`D1 alvo nao permitido: ${dbName}`);
  }

  const empresaIds = assertNumericIds([manifest.empresaA?.id, manifest.empresaB?.id], 'empresaIds');
  const userIds = assertNumericIds(
    Object.values(manifest.users || {}).map((u) => u?.id),
    'userIds',
  );
  log(
    `Limpando runId=${manifest.runId} empresas=${empresaIds.join(',')} users=${userIds.length} apply=${apply}`,
  );

  const empresaIdList = empresaIds.join(', ');
  const userIdList = userIds.join(', ');

  // Ordem estrita de delecao por dependencias FK (filhos antes de pais):
  // 1. cv_voo_* e cv_rdv_* (filhos de cv_voos e cv_rdv_operacional)
  // 2. cv_rdv_operacional e cv_voos
  // 3. catalogos de controle de voos (cv_aeroportos, cv_tipos_voo, etc.)
  // 4. aeronaves e modelos_aeronave (pertencentes aos tenants sinteticos)
  // 5. auditoria avancada v2, auditoria legada e domain_events (gerados pelas APIs)
  // 6. refresh_tokens (FK user_id -> usuarios.id — causa raiz da falha FK no run 33705562073)
  // 7. convites_usuarios, usuarios_empresas e usuarios (usuarios possui FK funcionario_id -> funcionarios.id)
  // 8. funcionarios (possui FK setor_id -> setores.id)
  // 9. setores (pertencentes aos tenants sinteticos)
  // 10. empresas por ultimo (todas as tabelas filhas com FK empresa_id ja foram removidas)
  const statements = [
    ['cv_voo_eventos', `DELETE FROM cv_voo_eventos WHERE empresa_id IN (${empresaIdList});`],
    ['cv_rdv_aprovacoes', `DELETE FROM cv_rdv_aprovacoes WHERE empresa_id IN (${empresaIdList});`],
    ['cv_rdv_revisoes', `DELETE FROM cv_rdv_revisoes WHERE empresa_id IN (${empresaIdList});`],
    ['cv_rdv_alertas', `DELETE FROM cv_rdv_alertas WHERE empresa_id IN (${empresaIdList});`],
    [
      'cv_voo_abastecimentos',
      `DELETE FROM cv_voo_abastecimentos WHERE empresa_id IN (${empresaIdList});`,
    ],
    [
      'cv_voo_tripulantes',
      `DELETE FROM cv_voo_tripulantes WHERE empresa_id IN (${empresaIdList});`,
    ],
    ['cv_voo_etapas', `DELETE FROM cv_voo_etapas WHERE empresa_id IN (${empresaIdList});`],
    [
      'cv_rdv_operacional',
      `DELETE FROM cv_rdv_operacional WHERE empresa_id IN (${empresaIdList});`,
    ],
    ['cv_voos', `DELETE FROM cv_voos WHERE empresa_id IN (${empresaIdList});`],
    ['cv_aeroportos', `DELETE FROM cv_aeroportos WHERE empresa_id IN (${empresaIdList});`],
    ['cv_tipos_voo', `DELETE FROM cv_tipos_voo WHERE empresa_id IN (${empresaIdList});`],
    ['cv_naturezas_voo', `DELETE FROM cv_naturezas_voo WHERE empresa_id IN (${empresaIdList});`],
    [
      'cv_motivos_operacionais',
      `DELETE FROM cv_motivos_operacionais WHERE empresa_id IN (${empresaIdList});`,
    ],
    ['aeronaves', `DELETE FROM aeronaves WHERE empresa_id IN (${empresaIdList});`],
    ['modelos_aeronave', `DELETE FROM modelos_aeronave WHERE empresa_id IN (${empresaIdList});`],
    [
      'auditoria_avancada_v2',
      `DELETE FROM auditoria_avancada_v2
       WHERE usuario_id IN (${userIdList})
          OR (tabela = 'domain_events' AND registro_id IN (
                SELECT id FROM domain_events WHERE empresa_id IN (${empresaIdList})
             ));`,
    ],
    [
      'auditoria',
      `DELETE FROM auditoria WHERE usuario_id IN (${userIdList}) OR empresa_id IN (${empresaIdList});`,
    ],
    ['domain_events', `DELETE FROM domain_events WHERE empresa_id IN (${empresaIdList});`],
    ['refresh_tokens', `DELETE FROM refresh_tokens WHERE user_id IN (${userIdList});`],
    [
      'convites_usuarios',
      `DELETE FROM convites_usuarios WHERE empresa_id IN (${empresaIdList}) OR usuario_id IN (${userIdList});`,
    ],
    [
      'usuarios_empresas',
      `DELETE FROM usuarios_empresas WHERE empresa_id IN (${empresaIdList}) OR usuario_id IN (${userIdList});`,
    ],
    ['usuarios', `DELETE FROM usuarios WHERE id IN (${userIdList});`],
    ['funcionarios', `DELETE FROM funcionarios WHERE empresa_id IN (${empresaIdList});`],
    ['setores', `DELETE FROM setores WHERE empresa_id IN (${empresaIdList});`],
    ['empresas', `DELETE FROM empresas WHERE id IN (${empresaIdList});`],
  ];

  if (!apply) {
    for (const [label, sql] of statements) {
      log(`[dry-run:${label}] ${sql.replace(/\s+/g, ' ').trim()}`);
    }
    log('dry-run concluido — nenhuma escrita realizada.');
    return;
  }

  for (const [label, sql] of statements) {
    log(`delete:${label}`);
    execD1(dbName, sql, label);
  }

  const verification = queryD1(
    dbName,
    `SELECT
       (SELECT COUNT(*) FROM empresas WHERE id IN (${empresaIdList})) AS empresas_restantes,
       (SELECT COUNT(*) FROM usuarios WHERE id IN (${userIdList})) AS usuarios_restantes,
       (SELECT COUNT(*) FROM domain_events WHERE empresa_id IN (${empresaIdList})) AS domain_events_restantes;`,
    'verify',
  )[0];

  const remaining = {
    empresas: Number(verification?.empresas_restantes ?? -1),
    usuarios: Number(verification?.usuarios_restantes ?? -1),
    domainEvents: Number(verification?.domain_events_restantes ?? -1),
  };
  log(
    `verify empresas=${remaining.empresas} usuarios=${remaining.usuarios} domain_events=${remaining.domainEvents}`,
  );
  if (remaining.empresas !== 0 || remaining.usuarios !== 0 || remaining.domainEvents !== 0) {
    throw new Error(`CLEANUP_POSTCONDITION_FAILED:${JSON.stringify(remaining)}`);
  }

  rmSync(dirname(manifestPath), { recursive: true, force: true });
  log(`Manifest removido: ${manifestPath}`);
  log('Cleanup concluido.');
}

main().catch((err) => {
  log(`ERRO: ${err.message}`);
  process.exitCode = 1;
});
