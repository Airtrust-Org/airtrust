#!/usr/bin/env node
/**
 * apply-to-r2.mjs — Aplica o isolamento de localStorage SCORM aos pacotes no R2.
 *
 * Baixa app.js + scorm_api.js de cada pacote no R2, aplica o patch de
 * isolamento por matrícula/ciclo e faz upload de volta.
 *
 * ORDEM DE DEPLOY OBRIGATÓRIA:
 *   1) Primeiro faça deploy do worker com a exposição de MATRICULA_ID/CICLO_ID
 *      no window (worker-airtrust/src/services/lms-scorm-local-resume.ts). Sem
 *      isso os pacotes lêem `window.parent.MATRICULA_ID === undefined` e caem
 *      no namespace `:standalone`.
 *   2) Só depois rode este script para re-enviar os pacotes.
 *
 * Uso (dry-run por padrão):
 *   node scripts/scorm-storage-isolation/apply-to-r2.mjs --bucket airtrust-storage-staging
 *   node scripts/scorm-storage-isolation/apply-to-r2.mjs --bucket airtrust-storage --confirm
 *
 * Requer CLOUDFLARE_API_TOKEN com permissão de leitura/escrita no R2.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchJsSource } from './patch-package.mjs';

// nome -> chave R2 (prefixo do pacote no bucket).
// Manutenção (empresa 6). Ajuste conforme o ambiente/empresa.
const PACKAGES = {
  'HUMS-VXP': 'lms/scorm/6/25/_candidates/e62d0d51-97d6-42a8-b0ae-c776ee3db7e9/',
  'MGM': 'lms/scorm/6/26/_candidates/eda9633d-0213-4d14-bb14-e3a738cced67/',
  'MCQ': 'lms/scorm/6/27/_candidates/9775909e-5122-4c54-b3db-d0b30dafdcec/',
  'SGSO': 'lms/scorm/6/28/_candidates/aa990feb-bfdd-4200-8d39-a94948ad274a/',
  'MOM': 'lms/scorm/6/29/_candidates/9f5fa025-fee5-446a-9c5c-3b0f2301950d/',
  'PT6C': 'lms/scorm/6/34/_candidates/6cdccd78-a409-4348-9886-1a8539442f35/',
  'MEL': 'lms/scorm/6/43/_versions/f5eeb1596ba7ed890a5c77b1da4666c760c423bf/',
};

const FILES = ['app.js', 'scorm_api.js'];

function wrangler(args, cwd) {
  return execFileSync('npx', ['wrangler', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function parseArgs(argv) {
  const out = { bucket: 'airtrust-storage-staging', confirm: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bucket' && argv[i + 1]) out.bucket = argv[++i];
    if (argv[i] === '--confirm') out.confirm = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = !args.confirm;
if (dryRun) {
  console.log(`DRY-RUN (nenhuma escrita). Para aplicar de fato use --confirm.`);
}

const cwd = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'scorm-r2-fix-'));
const results = [];

try {
  for (const [name, prefix] of Object.entries(PACKAGES)) {
    for (const file of FILES) {
      const key = `${prefix}${file}`;
      const local = join(tmp, `${name}-${file}`);
      let original;
      try {
        wrangler(['r2', 'object', 'get', '--remote', `${args.bucket}/${key}`, '-f', local], cwd);
        original = readFileSync(local, 'utf8');
      } catch {
        results.push({ name, file, action: 'skip', detail: 'objeto não encontrado (app.js pode não ter storage)' });
        continue;
      }

      const { changed, matched } = patchJsSource(original, file);
      if (!matched) {
        results.push({ name, file, action: 'no-storage-key', detail: 'sem chave de storage (ex.: PT6C app.js)' });
        continue;
      }
      if (!changed) {
        results.push({ name, file, action: 'already-patched', detail: '' });
        continue;
      }

      writeFileSync(local, patchJsSource(original, file).source, 'utf8');
      if (!dryRun) {
        wrangler(['r2', 'object', 'put', '--remote', `${args.bucket}/${key}`, '--file', local], cwd);
      }
      results.push({ name, file, action: dryRun ? 'would-upload' : 'uploaded', detail: key });
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nbucket=${args.bucket} dryRun=${dryRun}\n`);
for (const r of results) console.log(`${r.name}/${r.file}: ${r.action}${r.detail ? ' — ' + r.detail : ''}`);
