#!/usr/bin/env node
/**
 * Assert that a served HTML document carries the EXACT expected build-version.
 *
 * The production "Smoke Pages" step used to only check that a
 * `<meta name="build-version">` tag existed — so a deploy went green even when
 * the custom domain (airtrust.online) was still serving a stale build. This
 * makes the check strict: the meta must be present AND its content must equal
 * the expected release app_version.
 *
 * Usage:
 *   node scripts/ci/assert-pages-build-version.mjs --expected "<app_version>" --html-file <path>
 *   node scripts/ci/assert-pages-build-version.mjs --expected "<app_version>" --html "<string>"
 *
 * Exit codes:
 *   0  PAGES_BUILD_VERSION_OK        content === expected
 *   1  PAGES_BUILD_VERSION_MISSING   no build-version meta tag
 *   1  PAGES_BUILD_VERSION_MISMATCH  meta present, content !== expected
 *   2  usage / argument error
 */
import { readFileSync } from 'node:fs';

const META_RE = /<meta\s+name=["']build-version["']\s+content=["']([^"']*)["']\s*\/?>/i;

export function extractBuildVersion(html) {
  if (typeof html !== 'string') return null;
  const match = html.match(META_RE);
  return match ? match[1] : null;
}

/**
 * @returns {{ ok: boolean, code: string, observed: string|null }}
 */
export function assertBuildVersion({ expected, html }) {
  if (typeof expected !== 'string' || expected.trim().length === 0) {
    return { ok: false, code: 'EXPECTED_REQUIRED', observed: null };
  }
  const observed = extractBuildVersion(html);
  if (observed === null) {
    return { ok: false, code: 'PAGES_BUILD_VERSION_MISSING', observed: null };
  }
  if (observed !== expected) {
    return { ok: false, code: 'PAGES_BUILD_VERSION_MISMATCH', observed };
  }
  return { ok: true, code: 'PAGES_BUILD_VERSION_OK', observed };
}

function parseArgs(argv) {
  const args = { expected: null, html: null };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--expected') args.expected = argv[++i];
    else if (key === '--html') args.html = argv[++i];
    else if (key === '--html-file') args.html = readFileSync(argv[++i], 'utf8');
    else {
      process.stderr.write(`Unknown argument: ${key}\n`);
      process.exit(2);
    }
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { expected, html } = parseArgs(process.argv.slice(2));
  if (expected === null || html === null) {
    process.stderr.write(
      'Usage: node scripts/ci/assert-pages-build-version.mjs --expected <app_version> (--html-file <path> | --html <string>)\n',
    );
    process.exit(2);
  }
  const result = assertBuildVersion({ expected, html });
  if (result.ok) {
    process.stdout.write(`${result.code} build-version=${result.observed}\n`);
    process.exit(0);
  }
  process.stderr.write(
    `${result.code}: expected="${expected}" observed="${result.observed ?? '<none>'}"\n`,
  );
  process.exit(result.code === 'EXPECTED_REQUIRED' ? 2 : 1);
}
