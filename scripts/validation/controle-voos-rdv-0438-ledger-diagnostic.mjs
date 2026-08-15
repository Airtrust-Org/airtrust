#!/usr/bin/env node

// source_reference: incidente de staging 2026-07-21 — migration 0438 foi
// aplicada em airtrust-db-staging-baseline-20260701 via `wrangler d1 execute
// --file` (fluxo manual documentado no CLAUDE.md), que não escreve em
// `d1_migrations`. Este script apenas DIAGNOSTICA essa divergência; não a
// corrige.
// operational_decision: 100% read-only. Nenhum statement de escrita, nenhum
// --apply, nenhuma opção de inserir no ledger. A reconciliação (se
// necessária) é manual, documentada no bloco de comentário abaixo, e requer
// autorização separada.
// dry_run_required: nao aplicavel — o script inteiro e um dry-run permanente.
// rollback_plan_required: nao aplicavel — nao escreve nada.
//
// Uso:
//   node scripts/validation/controle-voos-rdv-0438-ledger-diagnostic.mjs
//   node scripts/validation/controle-voos-rdv-0438-ledger-diagnostic.mjs --json
//
// ============================================================================
// PROCEDIMENTO DE RECONCILIAÇÃO MANUAL (a ser executado em sessão separada,
// com autorização explícita — este script NÃO faz nenhum dos passos abaixo)
// ============================================================================
// 1. Backup: `wrangler d1 export <db> --remote --output=<arquivo>.sql` antes
//    de qualquer escrita no ledger.
// 2. Verificação integral do schema: rodar este diagnóstico e confirmar
//    diagnosis=SCHEMA_APLICADO_LEDGER_AUSENTE (nunca reconciliar sobre
//    SCHEMA_PARCIAL — isso indica aplicação incompleta, não apenas ledger
//    desalinhado).
// 3. Inspecionar a estrutura real de `d1_migrations` (`PRAGMA table_info` +
//    `SELECT * FROM d1_migrations ORDER BY id DESC LIMIT 10`) para replicar
//    o formato exato de `name`/`applied_at` usado pelas entradas vizinhas.
// 4. Registrar a migration no ledger SOMENTE se o passo 2 confirmou schema
//    integralmente aplicado — um único `INSERT INTO d1_migrations (name,
//    applied_at) VALUES ('0438_controle_voos_rdv_coordenacao_workflow.sql',
//    datetime('now'))` (ou equivalente ao formato real observado no passo 3),
//    executado manualmente, fora deste script.
// 5. Nova leitura do ledger (`SELECT * FROM d1_migrations WHERE name LIKE
//    '%0438%'`) para confirmar exatamente uma entrada nova.
// 6. Teste de não-reaplicação: rodar `wrangler d1 migrations list <db>
//    --remote` (ou o runner de migrations equivalente) e confirmar que
//    `0438_controle_voos_rdv_coordenacao_workflow.sql` NÃO aparece mais na
//    lista de "to be applied".
// ============================================================================

import { spawnSync } from 'node:child_process';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const BLOCKED_D1_NAMES = ['airtrust-db', 'airtrust-db-staging', 'airtrust-db-prod', 'airtrust-db-production'];

const MIGRATION_FILENAME = '0438_controle_voos_rdv_coordenacao_workflow.sql';

// Marcadores de schema que só existem depois da 0438 aplicada (aditivos,
// nunca presentes em versões anteriores do schema real) — ver
// migrations/0438_controle_voos_rdv_coordenacao_workflow.sql.
const EXPECTED_SCHEMA_MARKERS = [
  { label: 'cv_rdv_operacional.workflow_status', check: 'column', table: 'cv_rdv_operacional', column: 'workflow_status' },
  { label: 'cv_rdv_operacional.versao', check: 'column', table: 'cv_rdv_operacional', column: 'versao' },
  { label: 'tabela cv_rdv_aprovacoes', check: 'table', table: 'cv_rdv_aprovacoes' },
  { label: 'tabela cv_rdv_revisoes', check: 'table', table: 'cv_rdv_revisoes' },
  { label: 'tabela cv_rdv_alertas', check: 'table', table: 'cv_rdv_alertas' },
  {
    label: 'indice unico idx_cv_voo_etapas_empresa_voo_numero_unique',
    check: 'index',
    index: 'idx_cv_voo_etapas_empresa_voo_numero_unique',
  },
];

function validateD1Target(name) {
  const trimmed = String(name || ALLOWED_D1_NAME).trim();
  const lower = trimmed.toLowerCase();
  if (BLOCKED_D1_NAMES.includes(lower) || lower.includes('prod') || lower.includes('production')) {
    throw new Error(`D1 alvo "${trimmed}" esta na lista de bloqueio de producao. Permitido apenas "${ALLOWED_D1_NAME}".`);
  }
  if (trimmed !== ALLOWED_D1_NAME) {
    throw new Error(`D1 alvo "${trimmed}" nao e o staging esperado. Permitido apenas "${ALLOWED_D1_NAME}".`);
  }
  return trimmed;
}

function runReadOnlyQuery(dbName, sql) {
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      dbName,
      '--config',
      'wrangler.toml',
      '--env',
      'staging',
      '--remote',
      '--command',
      sql,
      '--json',
    ],
    { cwd: decodeURIComponent(new URL('../../worker-airtrust', import.meta.url).pathname), encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`Falha ao executar consulta read-only: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed[0]?.results ?? [];
}

async function checkMarker(dbName, marker) {
  if (marker.check === 'column') {
    const rows = runReadOnlyQuery(dbName, `PRAGMA table_info(${marker.table});`);
    return rows.some((r) => r.name === marker.column);
  }
  if (marker.check === 'table') {
    const rows = runReadOnlyQuery(
      dbName,
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${marker.table}';`,
    );
    return rows.length > 0;
  }
  if (marker.check === 'index') {
    const rows = runReadOnlyQuery(
      dbName,
      `SELECT name FROM sqlite_master WHERE type='index' AND name='${marker.index}';`,
    );
    return rows.length > 0;
  }
  throw new Error(`Tipo de marcador desconhecido: ${marker.check}`);
}

async function main() {
  const dbName = validateD1Target(process.env.STAGING_D1_NAME);
  const asJson = process.argv.includes('--json');

  const markerResults = [];
  for (const marker of EXPECTED_SCHEMA_MARKERS) {
    // eslint-disable-next-line no-await-in-loop -- consultas sequenciais deliberadas (uma invocacao wrangler por vez)
    const present = await checkMarker(dbName, marker);
    markerResults.push({ label: marker.label, present });
  }

  const presentCount = markerResults.filter((m) => m.present).length;
  const schemaState =
    presentCount === EXPECTED_SCHEMA_MARKERS.length
      ? 'COMPLETO'
      : presentCount === 0
        ? 'AUSENTE'
        : 'PARCIAL';

  let ledgerRows = [];
  try {
    ledgerRows = runReadOnlyQuery(
      dbName,
      `SELECT name FROM d1_migrations WHERE name LIKE '%0438%';`,
    );
  } catch (error) {
    // Tabela d1_migrations pode nao existir em ambientes muito antigos —
    // trata como ledger ausente, nao como erro fatal do diagnostico.
    ledgerRows = [];
  }
  const ledgerHasEntry = ledgerRows.some((r) => r.name === MIGRATION_FILENAME);

  let diagnosis;
  if (schemaState === 'COMPLETO' && ledgerHasEntry) {
    diagnosis = 'SCHEMA_E_LEDGER_PRESENTES';
  } else if (schemaState === 'COMPLETO' && !ledgerHasEntry) {
    diagnosis = 'SCHEMA_APLICADO_LEDGER_AUSENTE';
  } else if (schemaState === 'PARCIAL') {
    diagnosis = 'SCHEMA_PARCIAL';
  } else {
    diagnosis = 'SCHEMA_AUSENTE';
  }

  const report = {
    db: dbName,
    migration: MIGRATION_FILENAME,
    schema_state: schemaState,
    schema_markers: markerResults,
    ledger_has_entry: ledgerHasEntry,
    diagnosis,
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`[0438-ledger-diagnostic] DB=${dbName}\n`);
    for (const m of markerResults) {
      process.stdout.write(`[0438-ledger-diagnostic] marcador "${m.label}": ${m.present ? 'PRESENTE' : 'AUSENTE'}\n`);
    }
    process.stdout.write(`[0438-ledger-diagnostic] schema_state=${schemaState}\n`);
    process.stdout.write(`[0438-ledger-diagnostic] ledger_has_entry=${ledgerHasEntry}\n`);
    process.stdout.write(`[0438-ledger-diagnostic] DIAGNOSIS=${diagnosis}\n`);
  }

  if (diagnosis === 'SCHEMA_PARCIAL') {
    process.stderr.write(
      '[0438-ledger-diagnostic][ALERTA] Schema parcialmente aplicado — NAO reconciliar o ledger. Investigar manualmente antes de qualquer proxima acao.\n',
    );
    process.exitCode = 2;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[0438-ledger-diagnostic][ERROR] ${message}\n`);
  process.exitCode = 1;
});
