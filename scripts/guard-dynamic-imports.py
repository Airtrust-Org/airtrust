#!/usr/bin/env python3
"""
Guard: verifies all dynamic imports in the built bundles resolve to existing files.

Run after `npm run build`. Fails with exit code 1 if any import points to a
missing asset — prevents deploying broken chunk graphs.

Usage:
  python3 scripts/guard-dynamic-imports.py [dist-dir]

Exit codes:
  0 — all imports resolve
  1 — one or more imports point to missing files
  2 — dist directory not found or empty
"""

import os, re, sys

DIST = sys.argv[1] if len(sys.argv) > 1 else "dist/client"
ASSETS = os.path.join(DIST, "assets")
INDEX_HTML = os.path.join(DIST, "index.html")

def fail(msg: str) -> None:
    print(f"❌ {msg}", file=sys.stderr)

def ok(msg: str) -> None:
    print(f"✅ {msg}")

def main() -> int:
    if not os.path.isdir(ASSETS):
        fail(f"Assets directory not found: {ASSETS}")
        return 2

    js_files = set(f for f in os.listdir(ASSETS) if f.endswith('.js'))
    css_files = set(f for f in os.listdir(ASSETS) if f.endswith('.css'))

    if not js_files:
        fail("No JS files found in dist — build may have failed silently")
        return 2

    # 1. Verify HTML references
    if not os.path.exists(INDEX_HTML):
        fail(f"index.html not found at {INDEX_HTML}")
        return 2

    with open(INDEX_HTML) as f:
        html = f.read()

    html_refs: set[str] = set()
    for m in re.finditer(r'(?:src|href)="/assets/([^"]+)"', html):
        html_refs.add(m.group(1))

    missing_html = [r for r in html_refs if r not in js_files and r not in css_files]
    if missing_html:
        for ref in missing_html:
            fail(f"HTML references missing file: /assets/{ref}")
        return 1
    ok(f"All {len(html_refs)} HTML references exist on disk")

    # 2. Scan every JS bundle for dynamic imports
    all_imports: set[str] = set()
    unresolved: list[tuple[str, str, str]] = []  # (source_file, import_expr, basename)

    for js_file in sorted(js_files):
        path = os.path.join(ASSETS, js_file)
        with open(path, 'rb') as f:
            content = f.read().decode('utf-8', errors='ignore')

        for m in re.finditer(r'import\s*\(\s*["\']([^"\']+)["\']', content):
            imp = m.group(1)
            if not (imp.startswith('./') or imp.startswith('/assets/')):
                continue  # skip external imports

            all_imports.add(imp)

            if imp.startswith('/assets/'):
                basename = imp.replace('/assets/', '')
            else:
                basename = imp.replace('./', '')

            if basename not in js_files and basename not in css_files:
                # Try prefix match (hash may differ due to race condition)
                prefix = re.sub(r'-[A-Za-z0-9_]+\.(js|css)$', '', basename)
                matches = [f for f in (js_files | css_files) if f.startswith(prefix + '-')]
                if not matches:
                    unresolved.append((js_file, imp, basename))

    if unresolved:
        for src, imp, base in unresolved:
            fail(f"In {src}: import('{imp}') → {base} NOT FOUND")
        return 1

    ok(f"All {len(all_imports)} dynamic imports resolve ({len(js_files)} bundles scanned)")
    return 0

if __name__ == '__main__':
    sys.exit(main())
