#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildCliContext,
  buildPdfPayload,
  createDisposableDatabase,
  ensureWorkspaceNodeModules,
  finalizeArtifacts,
  inspectGeneratedPdf,
  ROOT,
  runValidationCycle,
  verifyManifest,
  writeGateArtifacts,
  writePdfValidationReportV2,
  writeScopeArtifacts,
} from './sonnet-curriculum-lib.mjs';

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function writePdfReport(pdfResults, outputDir) {
  const lines = [
    '# PDF_VALIDATION_REPORT',
    '',
    ...pdfResults.map((result) =>
      `- ${result.codigo_sessao}: ${result.status}${result.file ? ` (${result.file})` : ''}${result.error ? ` — ${result.error}` : ''}`,
    ),
    '',
  ];
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'PDF_VALIDATION_REPORT.md'), `${lines.join('\n')}\n`);
}

function main() {
  const context = buildCliContext(process.argv.slice(2));
  writeScopeArtifacts(context.bundle, context.scopeRows, context.outputDir);
  const manifest = verifyManifest(context.bundle, context.outputDir);
  const database = createDisposableDatabase(context.bundle, {
    dbPath: context.dbPath,
    snapshotPath: context.snapshotPath,
  });

  ensureWorkspaceNodeModules(context.sourceDir);
  const validation = runValidationCycle(context.bundle, context.scopeRows, {
    dbPath: database.dbPath,
    snapshotPath: database.snapshotPath,
    outputDir: context.outputDir,
  });
  validation.manifestStatus = manifest.status;

  const pdfResults = [];
  fs.mkdirSync(context.pdfDir, { recursive: true });
  for (const scopeRow of context.scopeRows.filter((row) => row.acao === 'IMPLEMENTAR')) {
    const payload = buildPdfPayload(context.bundle, scopeRow.codigo_sessao);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-sonnet-pdf-'));
    const inputJson = path.join(tempDir, 'payload.json');
    const outputPdf = path.join(context.pdfDir, `${scopeRow.codigo_sessao}.pdf`);
    fs.writeFileSync(inputJson, JSON.stringify(payload));
    const pdfRun = runCommand(
      'node',
      ['--experimental-strip-types', 'scripts/simuladores/render-ficha-pdf-sonnet-20260713.mjs', inputJson, outputPdf],
      { cwd: ROOT },
    );
    if (pdfRun.status === 0 && fs.existsSync(outputPdf)) {
      const inspection = inspectGeneratedPdf(outputPdf);
      pdfResults.push({
        codigo_sessao: scopeRow.codigo_sessao,
        status: 'OK',
        file: outputPdf,
        inspection,
      });
    } else {
      pdfResults.push({
        codigo_sessao: scopeRow.codigo_sessao,
        status: 'FALHA',
        error: (pdfRun.stderr || pdfRun.stdout || 'pdf_generation_failed').trim(),
      });
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const typecheck = runCommand('npm', ['run', 'typecheck:worker'], { cwd: ROOT });
  const scriptTests = runCommand('node', ['scripts/__tests__/curriculum-sonnet-20260713.test.mjs'], {
    cwd: ROOT,
  });
  const pdfGateOk = pdfResults.every(
    (result) =>
      result.status === 'OK' &&
      result.inspection &&
      Number(result.inspection.pages || 0) > 0 &&
      result.inspection.a4_confirmed,
  );

  writePdfReport(
    pdfResults,
    context.outputDir,
  );
  writePdfValidationReportV2(pdfResults, context.outputDir);

  finalizeArtifacts(
    context.bundle,
    context.scopeRows,
    validation,
    {
      status: pdfGateOk ? 'ok' : 'failed',
      items: pdfResults,
    },
    context.outputDir,
  );
  const gateArtifacts = writeGateArtifacts({
    bundle: context.bundle,
    scopeRows: context.scopeRows,
    validation,
    pdfReport: {
      status: pdfGateOk ? 'ok' : 'failed',
      items: pdfResults,
    },
    typecheck: {
      status: typecheck.status,
      stderr: typecheck.stderr.trim(),
      stdout: typecheck.stdout.trim(),
    },
    outputDir: context.outputDir,
  });
  const finalStatus =
    Object.values(gateArtifacts.gates).every((value) => value !== 'FAIL')
      ? gateArtifacts.typecheckStatus === 'baseline_only'
        ? 'GO_COM_RESSALVAS_DOCUMENTADAS'
        : 'PRONTO_PARA_PR'
      : 'NO_GO_COMMIT';

  process.stdout.write(
    `${JSON.stringify(
      {
        status: finalStatus,
        manifest,
        database,
        validation,
        pdfResults,
        typecheck: {
          status: typecheck.status,
          stdout: typecheck.stdout.trim(),
          stderr: typecheck.stderr.trim(),
        },
        scriptTests: {
          status: scriptTests.status,
          stderr: scriptTests.stderr.trim(),
        },
      },
      null,
      2,
    )}\n`,
  );
}

main();
