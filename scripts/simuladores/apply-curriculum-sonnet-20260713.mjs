#!/usr/bin/env node

import {
  applyCurriculum,
  buildCliContext,
  writeScopeArtifacts,
  verifyManifest,
} from './sonnet-curriculum-lib.mjs';

function main() {
  const context = buildCliContext(process.argv.slice(2));
  writeScopeArtifacts(context.bundle, context.scopeRows, context.outputDir);
  const manifest = verifyManifest(context.bundle, context.outputDir);
  const result = applyCurriculum(context.bundle, context.scopeRows, {
    empresaId: context.empresaId,
    dbPath: context.dbPath,
    dryRun: !!context.args['dry-run'],
    outputDir: context.outputDir,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        status: result.status,
        manifest,
        dbPath: context.dbPath,
        errors: result.errors || [],
        changes: result.changes || [],
        summary: result.summary || null,
      },
      null,
      2,
    )}\n`,
  );
  if (result.status === 'blocked') {
    process.exit(1);
  }
}

main();
