#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import { ROOT } from './sonnet-curriculum-lib.mjs';

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error('usage: render-ficha-pdf-sonnet-20260713.mjs <input-json> <output-pdf>');
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const servicePath = path.join(ROOT, 'worker-airtrust', 'src', 'services', 'pdf-ficha.service.ts');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-pdf-bundle-'));
  const bundlePath = path.join(tempDir, 'pdf-ficha.bundle.mjs');
  await build({
    entryPoints: [servicePath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    sourcemap: false,
    logLevel: 'silent',
  });
  const service = await import(pathToFileURL(bundlePath).href);
  const buffer = await service.gerarPDFFicha(payload);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
