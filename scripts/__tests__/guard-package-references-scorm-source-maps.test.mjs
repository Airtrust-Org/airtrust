import { describe, expect, it } from 'vitest';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const sourceGuardPath = resolve('scripts/guard-package-references.mjs');

function runGuardFixture({ withSourceMap }) {
  const root = mkdtempSync(join(tmpdir(), 'airtrust-scorm-guard-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'course'), { recursive: true });
    copyFileSync(sourceGuardPath, join(root, 'scripts/guard-package-references.mjs'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {} }));

    const asset = withSourceMap ? 'app.js.map' : 'app.js';
    writeFileSync(
      join(root, 'course/imsmanifest.xml'),
      `<manifest><resources><resource><file href="${asset}" /></resource></resources></manifest>`,
    );
    writeFileSync(join(root, `course/${asset}`), 'fixture');

    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });

    return spawnSync(process.execPath, ['scripts/guard-package-references.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('SCORM source-map package guard', () => {
  it('accepts a tracked SCORM package without source maps', () => {
    const result = runGuardFixture({ withSourceMap: false });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1 manifest(s) SCORM sem source maps');
  });

  it('rejects tracked source maps and manifest references to them', () => {
    const result = runGuardFixture({ withSourceMap: true });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('SCORM_SOURCE_MAP: course/app.js.map');
    expect(output).toContain('SCORM_SOURCE_MAP_REF: app.js.map');
  });
});
