#!/usr/bin/env node
/**
 * Layer-boundary guard for the Worker (worker-airtrust/src).
 *
 * The Worker has route handlers, services, lib, repositories, utils, shared and
 * middleware, but nothing stopped an inner layer from importing an outer one.
 * This guard enforces the dependency direction as a ratchet:
 *
 *   - Violations that already existed when the guard was introduced are listed
 *     in scripts/layer-boundaries-baseline.json and are tolerated.
 *   - Any NEW violation fails `npm run lint`.
 *   - Baseline entries that no longer occur are reported so the baseline can
 *     only shrink (`node scripts/guard-layer-boundaries.mjs --write-baseline`).
 *
 * Rules (importer layer -> forbidden target):
 *   no-inner-to-routes   services|lib|repositories|utils|shared|middleware -> routes
 *   no-low-to-services   repositories|utils|shared                         -> services
 *   no-hono-in-core      services|lib|repositories                         -> 'hono'
 *
 * Only relative imports are resolved. Test files are ignored. The check is
 * import-statement based (import / export-from / dynamic import / require), not
 * a substring search, so comments and strings do not cause false positives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'worker-airtrust/src');
const BASELINE_PATH = path.join(ROOT, 'scripts/layer-boundaries-baseline.json');

export const RULES = [
  {
    id: 'no-inner-to-routes',
    from: ['services', 'lib', 'repositories', 'utils', 'shared', 'middleware'],
    toLayer: 'routes',
    why: 'Inner layers must not depend on HTTP route modules. Move the shared helper/type to services, lib, types or utils.',
  },
  {
    id: 'no-low-to-services',
    from: ['repositories', 'utils', 'shared'],
    toLayer: 'services',
    why: 'Repositories, utils and shared sit below services. Move the shared piece down (lib/utils) instead of importing up.',
  },
  {
    id: 'no-hono-in-core',
    from: ['services', 'lib', 'repositories'],
    toModule: 'hono',
    why: 'Core layers must not depend on the HTTP framework. Resolve { db, empresaId, userId } in the route and pass them in.',
  },
];

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;

export function layerOf(absFile, srcRoot = SRC) {
  const rel = path.relative(srcRoot, absFile);
  if (rel.startsWith('..')) return null;
  const first = rel.split(path.sep)[0];
  return first.includes('.') ? null : first;
}

/** Returns the list of specifiers imported by `source` (comments stripped). */
export function extractImports(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const specs = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(stripped)) !== null) specs.push(m[1] || m[2] || m[3]);
  return specs;
}

/** Violation keys for one file: `rule|from-file|target`. Paths are repo-relative, posix style. */
export function findViolationsInFile(absFile, source, srcRoot = SRC, repoRoot = ROOT) {
  const fromLayer = layerOf(absFile, srcRoot);
  if (!fromLayer) return [];
  const out = [];
  const fromRel = path.relative(repoRoot, absFile).split(path.sep).join('/');
  for (const spec of extractImports(source)) {
    for (const rule of RULES) {
      if (!rule.from.includes(fromLayer)) continue;
      if (rule.toModule) {
        if (spec === rule.toModule || spec.startsWith(`${rule.toModule}/`)) {
          out.push(`${rule.id}|${fromRel}|${spec}`);
        }
        continue;
      }
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(absFile), spec);
      if (layerOf(target, srcRoot) === rule.toLayer) {
        const targetRel = path.relative(repoRoot, target).split(path.sep).join('/');
        out.push(`${rule.id}|${fromRel}|${targetRel}`);
      }
    }
  }
  return out;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, files);
    } else if (/\.tsx?$/.test(entry.name) && !TEST_FILE_RE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export function collectViolations() {
  const all = new Set();
  for (const file of walk(SRC)) {
    for (const key of findViolationsInFile(file, fs.readFileSync(file, 'utf8'))) all.add(key);
  }
  return [...all].sort();
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).violations);
}

function main() {
  const current = collectViolations();

  if (process.argv.includes('--write-baseline')) {
    fs.writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          comment:
            'Known layer-boundary violations tolerated by scripts/guard-layer-boundaries.mjs. This list may only shrink.',
          violations: current,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`layer-boundaries: baseline written with ${current.length} violation(s).`);
    return;
  }

  const baseline = readBaseline();
  const fresh = current.filter((v) => !baseline.has(v));
  const fixed = [...baseline].filter((v) => !current.includes(v));

  if (fixed.length > 0) {
    console.log(
      `layer-boundaries: ${fixed.length} baseline violation(s) no longer occur. Shrink the baseline with:\n` +
        '  node scripts/guard-layer-boundaries.mjs --write-baseline',
    );
  }

  if (fresh.length > 0) {
    console.error(`layer-boundaries: ${fresh.length} NEW layer violation(s):\n`);
    for (const key of fresh) {
      const [ruleId, from, target] = key.split('|');
      const rule = RULES.find((r) => r.id === ruleId);
      console.error(`  [${ruleId}] ${from}\n      imports ${target}\n      ${rule?.why ?? ''}\n`);
    }
    process.exit(1);
  }

  console.log(
    `layer-boundaries: OK (${current.length} known violation(s) in baseline, 0 new).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
