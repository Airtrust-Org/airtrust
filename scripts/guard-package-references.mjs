#!/usr/bin/env node
/**
 * guard:package-references
 *
 * Verifica que todos os scripts referenciados no package.json existem
 * como arquivos no sistema de arquivos, e que os caminhos usados em
 * workflows do GitHub Actions também existem.
 *
 * Saída:
 *   exit 0  → todas as referências válidas
 *   exit 1  → referências quebradas encontradas
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Lê package.json ─────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};

// ─── Extrai referências a scripts shell/node dos valores ────────────────────
// Captura padrões como: bash scripts/foo.sh, node scripts/foo.mjs, etc.
const SCRIPT_REF_PATTERNS = [
  /\bbash\s+(scripts\/[^\s"'&|;)]+)/g,
  /\bsh\s+(scripts\/[^\s"'&|;)]+)/g,
  /\bnode\s+(scripts\/[^\s"'&|;)]+)/g,
  /\bnpx\s+(?:tsc|vitest|playwright|wrangler)[^\s]*/g, // npx commands - skip path check
];

// Pattern para extrair apenas o caminho (sem argumentos)
const PATH_EXTRACT = /^(scripts\/[^\s"'&|;)]+)/;

let violations = 0;
const checked = new Set();

function checkPath(scriptPath, source) {
  if (checked.has(scriptPath)) return;
  checked.add(scriptPath);

  // Remove argumentos após o caminho
  const cleanPath = scriptPath.split(/\s+/)[0].replace(/['"]/g, '');
  if (!cleanPath.startsWith('scripts/')) return;

  const fullPath = resolve(ROOT, cleanPath);
  if (!existsSync(fullPath)) {
    console.error(`[guard:package-references] BROKEN: ${cleanPath}`);
    console.error(`  Referenced in: ${source}`);
    violations++;
  }
}

// ─── Verifica scripts no package.json ────────────────────────────────────────
for (const [name, value] of Object.entries(scripts)) {
  // Extrai todas as referências bash/sh/node
  for (const pattern of SCRIPT_REF_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(value)) !== null) {
      if (match[1]) {
        // Extrai apenas o caminho (sem argumentos que possam vir depois)
        const raw = match[1].trim();
        // Remove trailing characters que não fazem parte do caminho
        const cleanPath = raw.split(/[\s'"&|;)]/)[0];
        if (cleanPath.startsWith('scripts/')) {
          checkPath(cleanPath, `npm run ${name}`);
        }
      }
    }
  }
}

// ─── Verifica scripts de workflow do GitHub Actions ──────────────────────────
const workflowDir = resolve(ROOT, '.github/workflows');
if (existsSync(workflowDir)) {
  const files = readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    const content = readFileSync(resolve(workflowDir, file), 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      // Procura padrões: run: bash scripts/... ou run: node scripts/...
      const m = line.match(/(?:bash|sh|node)\s+(scripts\/[^\s"'&#]+)/);
      if (m && m[1]) {
        const cleanPath = m[1].split(/[\s'"&|;)]/)[0];
        if (cleanPath.startsWith('scripts/')) {
          checkPath(cleanPath, `workflow: ${file}`);
        }
      }
    }
  }
}

// ─── Resultado ───────────────────────────────────────────────────────────────
if (violations === 0) {
  console.log(`[guard:package-references] OK — ${checked.size} referência(s) verificada(s), nenhuma quebrada`);
  process.exit(0);
} else {
  console.error(`\n[guard:package-references] ${violations} referência(s) quebrada(s) encontrada(s).`);
  console.error('Restaure os arquivos ausentes ou remova as referências do package.json/workflows.');
  process.exit(1);
}
