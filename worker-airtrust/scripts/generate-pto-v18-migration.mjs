#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCanonicalPtoV18Plan,
  buildPtoV18CanonicalMigrationStatements,
  buildPtoV18CanonicalRollbackStatements,
  PTO_V18_APPROVED_SOURCE_SHA,
  PTO_V18_MATRIX_VERSION,
} from './lib/pto-v18-canonical-migration.mjs';

function arg(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

const outDir = path.resolve(arg(process.argv, '--out-dir', '/tmp/pto-v18-migration'));
const empresaId = Number(arg(process.argv, '--empresa-id', '6'));

const plan = buildCanonicalPtoV18Plan();
const migrationStatements = buildPtoV18CanonicalMigrationStatements({ empresaId });
const rollbackStatements = buildPtoV18CanonicalRollbackStatements({ empresaId });

fs.mkdirSync(outDir, { recursive: true });
const applyPath = path.join(outDir, 'pto_v18_canonical_apply.sql');
const rollbackPath = path.join(outDir, 'pto_v18_canonical_rollback.sql');
const summaryPath = path.join(outDir, 'pto_v18_canonical_summary.json');

fs.writeFileSync(
  applyPath,
  `-- PTO Rev.10 V18 Canonical Migration (${PTO_V18_MATRIX_VERSION})\n-- Source SHA-256: ${PTO_V18_APPROVED_SOURCE_SHA}\n\n${migrationStatements.join('\n\n')}\n`,
  'utf8',
);
fs.writeFileSync(
  rollbackPath,
  `-- PTO Rev.10 V18 Canonical Rollback (${PTO_V18_MATRIX_VERSION})\n\n${rollbackStatements.join('\n\n')}\n`,
  'utf8',
);
fs.writeFileSync(
  summaryPath,
  JSON.stringify(
    {
      versao_matriz: PTO_V18_MATRIX_VERSION,
      approved_source_sha256: PTO_V18_APPROVED_SOURCE_SHA,
      empresa_id: empresaId,
      models: plan.models.length,
      items: plan.items.length,
      maneuvers: plan.maneuvers.length,
      notechs: plan.notechs.length,
      statements: migrationStatements.length,
      apply_sql: applyPath,
      rollback_sql: rollbackPath,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log(fs.readFileSync(summaryPath, 'utf8'));
