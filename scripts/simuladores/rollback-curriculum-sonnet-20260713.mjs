#!/usr/bin/env node

import {
  buildCliContext,
  rollbackCurriculum,
  writeScopeArtifacts,
} from './sonnet-curriculum-lib.mjs';

function main() {
  const context = buildCliContext(process.argv.slice(2));
  writeScopeArtifacts(context.bundle, context.scopeRows, context.outputDir);
  const result = rollbackCurriculum(context.bundle, context.scopeRows, {
    empresaId: context.empresaId,
    dbPath: context.dbPath,
    snapshotPath: context.snapshotPath,
    dryRun: !!context.args['dry-run'],
    outputDir: context.outputDir,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'blocked') {
    process.exit(1);
  }
}

main();
