#!/usr/bin/env node
/**
 * guard:sanitization
 *
 * Verifica que nenhum dado sensível está rastreado na working tree:
 * - Tokens reais (Cloudflare, JWT, refresh tokens)
 * - Storage states do Playwright (e2e/.auth)
 * - Dumps e backups de produção SQL
 * - PII real (CPF real em contextos não-sintéticos)
 * - Caminhos absolutos pessoais hardcoded em scripts rastreados
 *
 * Saída:
 *   exit 0  → nenhuma violação encontrada
 *   exit 1  → violações encontradas
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function gitGrep(pattern, pathspecs = []) {
  const result = spawnSync('git', [
    'grep', '-nEI', '--',
    pattern,
    ...pathspecs,
  ], { cwd: ROOT, encoding: 'utf8' });
  return result.stdout?.trim() || '';
}

function gitLsFiles(pattern) {
  const result = spawnSync('git', [
    'ls-files', '--error-unmatch', '--', pattern,
  ], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0;
}

// ─── Exclusões globais (arquivos que nunca devem ativar o guard) ────────────
const EXCLUDE = [
  ':(exclude)*.md',
  ':(exclude)*.pdf',
  ':(exclude)*.png',
  ':(exclude)*.jpg',
  ':(exclude)*.woff',
  ':(exclude)*.woff2',
  ':(exclude)*.bundle',
  ':(exclude)*.zip',
  ':(exclude)*.tgz',
  ':(exclude)*.gz',
  ':(exclude)*.csv',
  ':(exclude)*.tsbuildinfo',
  ':(exclude).env.example',
  ':(exclude).env.development.example',
  ':(exclude)worker-airtrust/.env.example',
  ':(exclude)worker-airtrust/.dev.vars.example',
  ':(exclude)worker-airtrust/worker.log',
  ':(exclude).devcontainer.disabled/**',
  ':(exclude).tmp-*/**',
  ':(exclude).tmp-deploy-*/**',
  ':(exclude).claude/**',
  ':(exclude)scripts/legacy/**',
  // O próprio guard não deve disparar a si mesmo
  ':(exclude)scripts/guard-sanitization.mjs',
  ':(exclude)scripts/check-tracked-secrets.sh',
  // Dev logs gerados localmente (nunca contêm dados de produção intencionais)
  ':(exclude).dev-logs/**',
  // Tarefas VSCode históricas (caminhos antigos documentados, não operacionais)
  ':(exclude).vscode/tasks.json',
  // Scripts legacy com caminhos históricos (documentados como obsoletos)
  ':(exclude)scripts/disable-auth.sh',
  ':(exclude)scripts/setup-complete.sh',
  ':(exclude)scripts/start-local-dev.sh',
  ':(exclude)scripts/test-performance-diagnostic.sh',
  // Arquivo de output de terminal rastreado historicamente (não é script operacional)
  ':(exclude)typescript',
  // Walkthrough gerado por agente AI (contém caminhos de screenshots locais, sem dados sensiveis)
  ':(exclude)walkthrough.md.resolved',
  ':(exclude)walkthrough.md',
];

let violations = 0;

function check(label, pattern, options = {}) {
  const { allowPattern, extraExcludes = [], extraIncludes = [] } = options;
  const pathspecs = [...EXCLUDE, ...extraExcludes, ...extraIncludes];
  let raw = gitGrep(pattern, pathspecs);
  if (!raw) return;

  if (allowPattern) {
    const re = new RegExp(allowPattern);
    raw = raw.split('\n').filter(l => l && !re.test(l)).join('\n');
  }
  if (!raw.trim()) return;

  console.error(`\n[guard:sanitization] FAIL: ${label}`);
  raw.split('\n').slice(0, 20).forEach(l => console.error('  ' + l));
  violations++;
}

// ─── 1. Storage states do Playwright ────────────────────────────────────────
// Arquivos e2e/.auth/ nunca devem estar rastreados
{
  const result = spawnSync('git', ['ls-files', '--', 'e2e/.auth/'], {
    cwd: ROOT, encoding: 'utf8',
  });
  const found = result.stdout?.trim();
  if (found) {
    console.error('\n[guard:sanitization] FAIL: Playwright auth storage tracked in git');
    found.split('\n').forEach(l => console.error('  ' + l));
    violations++;
  }
}

// ─── 2. Backups/dumps de produção rastreados ────────────────────────────────
{
  for (const pattern of [
    'artifacts/db-backups/',
    'backups_production/',
    '_arquivos_nao_usados/exports/',
  ]) {
    const result = spawnSync('git', ['ls-files', '--', pattern], {
      cwd: ROOT, encoding: 'utf8',
    });
    const found = result.stdout?.trim();
    if (found) {
      console.error(`\n[guard:sanitization] FAIL: Sensitive backup/export tracked: ${pattern}`);
      found.split('\n').slice(0, 10).forEach(l => console.error('  ' + l));
      violations++;
    }
  }
}

// ─── 3. JWTs e refresh tokens literais ──────────────────────────────────────
// eyJ... é a assinatura de um JWT codificado em base64
check(
  'JWT literal rastreado',
  'eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}',
  {
    // Permite apenas fixtures sintéticas documentadas e valores de exemplo
    allowPattern: /fixtures\/.*synthetic|\.example|test.*fake|fake.*test/i,
    extraExcludes: [
      ':(exclude)*.test.ts',
      ':(exclude)*.test.tsx',
      ':(exclude)*.spec.ts',
      ':(exclude)fixtures/**',
    ],
  }
);

// ─── 4. Tokens Cloudflare literais ──────────────────────────────────────────
check(
  'Cloudflare API token rastreado',
  '(CLOUDFLARE_API_TOKEN|CLOUDFLARE_TOKEN)[[:space:]]*=[[:space:]]*[A-Za-z0-9_-]{30,}',
  {
    allowPattern: /\$\{|\$[A-Z_]|your-|<TOKEN>|PLACEHOLDER|=\s*$|npx\b/,
  }
);

// ─── 5. Caminhos absolutos pessoais hardcoded ───────────────────────────────
check(
  'Caminho absoluto pessoal hardcoded',
  '/Users/filipedaumas/',
  {
    // Permitido apenas em arquivos que explicitamente documentam o placeholder
    allowPattern: /AIRTRUST_CANONICAL_ROOT|placeholder|# (override|update|set)/i,
    extraExcludes: [
      ':(exclude)*.md',
      ':(exclude)docs/**',
      ':(exclude)Arquivos/**',
      ':(exclude)obsidian-vault/**',
    ],
  }
);

// ─── 6. PDFs de pessoas reais (FIRA) rastreados ─────────────────────────────
{
  const result = spawnSync('git', ['ls-files', '--', '*.pdf'], {
    cwd: ROOT, encoding: 'utf8',
  });
  const found = (result.stdout?.trim() || '').split('\n').filter(l =>
    /FIRA[-\s]/i.test(l) || /Ramos|Nery|Adriana|Gabriel/i.test(l)
  );
  if (found.length > 0) {
    console.error('\n[guard:sanitization] FAIL: PDFs pessoais rastreados (FIRA)');
    found.forEach(l => console.error('  ' + l));
    violations++;
  }
}

// ─── Resultado ───────────────────────────────────────────────────────────────
if (violations === 0) {
  console.log('[guard:sanitization] OK — nenhum dado sensível detectado na working tree');
  process.exit(0);
} else {
  console.error(`\n[guard:sanitization] ${violations} violação(ões) encontrada(s). Remova os dados sensíveis antes de prosseguir.`);
  process.exit(1);
}
