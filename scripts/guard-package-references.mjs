#!/usr/bin/env node
/**
 * guard:package-references
 *
 * Verifica que todos os scripts referenciados no package.json existem
 * como arquivos no sistema de arquivos, que os caminhos usados em
 * workflows do GitHub Actions também existem e que pacotes SCORM
 * rastreados não voltem a carregar source maps de debug.
 *
 * Saída:
 *   exit 0  → todas as referências válidas
 *   exit 1  → referências quebradas ou source maps SCORM encontrados
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, posix as pathPosix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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

// ─── Impede regressão de source maps em pacotes SCORM rastreados ────────────
let trackedFiles = [];
try {
  trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
} catch (error) {
  console.error('[guard:package-references] BROKEN: não foi possível listar arquivos rastreados');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  violations++;
}

const scormManifests = trackedFiles.filter(
  (file) => file === 'imsmanifest.xml' || file.endsWith('/imsmanifest.xml'),
);
const scormPackageDirs = new Set(scormManifests.map((file) => pathPosix.dirname(file)));

for (const file of trackedFiles) {
  if (!file.toLowerCase().endsWith('.map')) continue;
  const belongsToScormPackage = [...scormPackageDirs].some(
    (dir) => dir === '.' ? !file.includes('/') : file.startsWith(`${dir}/`),
  );
  if (!belongsToScormPackage) continue;

  console.error(`[guard:package-references] SCORM_SOURCE_MAP: ${file}`);
  console.error('  Source maps de debug não devem ser rastreados dentro de pacotes SCORM.');
  violations++;
}

for (const manifestPath of scormManifests) {
  const manifest = readFileSync(resolve(ROOT, manifestPath), 'utf8');
  const hrefPattern = /<file\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  let match;
  while ((match = hrefPattern.exec(manifest)) !== null) {
    const href = String(match[2] || '').trim();
    const hrefPath = href.split(/[?#]/, 1)[0].toLowerCase();
    if (!hrefPath.endsWith('.map')) continue;

    console.error(`[guard:package-references] SCORM_SOURCE_MAP_REF: ${href}`);
    console.error(`  Referenced in: ${manifestPath}`);
    violations++;
  }
}

// ─── Resultado ───────────────────────────────────────────────────────────────
if (violations === 0) {
  console.log(
    `[guard:package-references] OK — ${checked.size} referência(s) verificada(s), ${scormManifests.length} manifest(s) SCORM sem source maps`,
  );
  process.exit(0);
} else {
  console.error(`\n[guard:package-references] ${violations} violação(ões) encontrada(s).`);
  console.error('Restaure/remova referências quebradas ou retire source maps dos pacotes SCORM.');
  process.exit(1);
}
