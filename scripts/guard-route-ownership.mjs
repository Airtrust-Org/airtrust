#!/usr/bin/env node
/**
 * Detects accidental Worker route shadowing.
 *
 * Multiple `app.route('/same-prefix', module)` mounts are legitimate Hono
 * composition and are not collisions by themselves. A collision is the same
 * HTTP method plus the same fully resolved path registered as a terminal handler
 * in more than one place, unless the pair is listed in LEGACY_ALLOWED_COLLISIONS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'worker-airtrust/src/index.ts');

const METHOD_RE = /\.(get|post|put|patch|delete)\(\s*(['"`])(\/[^'"`]*)\2/g;
const ROUTE_MOUNT_RE = /\.route\(\s*(['"`])([^'"`]+)\1\s*,\s*([A-Za-z_][\w]*)/g;
const IMPORT_RE = /import\s+([\w*{}\s,]+)\s+from\s+['"](\.[^'"]+)['"]/g;

/** Documented prefix-sharing mounts. Not terminal collisions. */
const LEGACY_ALLOWED_PREFIX_MOUNTS = new Set([
  '/api/frms',
  '/api/controle-voos',
  '/api/lms',
  '/api/lms/matriculas',
  '/api/sgso',
  '/api/sgso/next',
  '/api/escalas',
  '/api/notificacoes',
  '/api/compliance',
  '/api/certificados',
  '/api/treinamentos',
  '/api',
]);

/**
 * Exact method+path pairs that already coexist and must be retired explicitly,
 * not silently reintroduced as new collisions.
 */
const LEGACY_ALLOWED_COLLISIONS = new Set([
  'GET /api/qualificacoes',
]);

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function parseImports(filePath, source) {
  const map = new Map();
  for (const match of source.matchAll(IMPORT_RE)) {
    const binding = match[1].trim();
    const specifier = match[2];
    const resolved = resolveImport(filePath, specifier);
    if (!resolved) continue;
    if (binding.startsWith('{')) {
      const names = binding
        .replace(/[{}]/g, '')
        .split(',')
        .map((part) => part.trim().split(/\s+as\s+/).pop())
        .filter(Boolean);
      for (const name of names) map.set(name, resolved);
    } else if (binding.startsWith('* as ')) {
      map.set(binding.slice(5).trim(), resolved);
    } else {
      map.set(binding.split(/\s+/)[0], resolved);
    }
  }
  return map;
}

function joinPath(prefix, routePath) {
  if (!routePath || routePath === '/') return prefix || '/';
  if (routePath.startsWith('http')) return routePath;
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const right = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${left}${right}`.replace(/\/{2,}/g, '/') || '/';
}

function collectTerminals(filePath, source, prefix) {
  const terminals = [];
  for (const match of source.matchAll(METHOD_RE)) {
    const method = match[1].toUpperCase();
    const routePath = match[3];
    terminals.push({
      method,
      path: joinPath(prefix, routePath),
      file: path.relative(ROOT, filePath),
    });
  }
  return terminals;
}

function inspect() {
  const indexSource = fs.readFileSync(INDEX, 'utf8');
  const imports = parseImports(INDEX, indexSource);
  const terminals = collectTerminals(INDEX, indexSource, '');
  const prefixCounts = new Map();

  for (const match of indexSource.matchAll(ROUTE_MOUNT_RE)) {
    const prefix = match[2];
    const binding = match[3];
    prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
    const filePath = imports.get(binding);
    if (!filePath) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    terminals.push(...collectTerminals(filePath, source, prefix));
  }

  const collisions = [];
  const seen = new Map();
  for (const terminal of terminals) {
    const key = `${terminal.method} ${terminal.path}`;
    const previous = seen.get(key);
    if (previous) {
      if (!LEGACY_ALLOWED_COLLISIONS.has(key)) {
        collisions.push({ key, previous, current: terminal });
      }
    } else {
      seen.set(key, terminal);
    }
  }

  return { terminals, collisions, prefixCounts };
}

export function findRouteOwnershipViolations() {
  return inspect().collisions;
}

function main() {
  const { collisions, prefixCounts } = inspect();
  const sharedPrefixes = [...prefixCounts.entries()].filter(([, count]) => count > 1);
  for (const [prefix] of sharedPrefixes) {
    if (!LEGACY_ALLOWED_PREFIX_MOUNTS.has(prefix)) {
      console.error(`Undocumented shared Hono prefix mount: ${prefix}`);
      process.exit(1);
    }
  }
  if (collisions.length > 0) {
    for (const collision of collisions) {
      console.error(
        `Route collision ${collision.key}: ${collision.previous.file} and ${collision.current.file}`,
      );
    }
    process.exit(1);
  }
  console.log(
    `Route ownership guard OK (${inspect().terminals.length} terminal handlers; shared prefixes documented).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
