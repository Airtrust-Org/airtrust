import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), '..', path), 'utf8')) as {
    dependencies?: Record<string, string>;
    packages?: Record<string, Record<string, unknown>>;
  };
}

describe('dependency security floors', () => {
  it('locks React Router on the reviewed safe 7.x floor', () => {
    const pkg = readJson('package.json');
    const lock = readJson('package-lock.json');
    expect(pkg.dependencies?.['react-router-dom']).toBe('^7.18.3');
    expect(lock.packages?.['node_modules/react-router-dom']?.version).toBe('7.18.3');
    expect(lock.packages?.['node_modules/react-router']?.version).toBe('7.18.3');
  });

  it('locks the Worker Hono runtime on 4.13.5', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    const lock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')) as { packages?: Record<string, Record<string, unknown>> };
    expect(pkg.dependencies?.hono).toBe('^4.13.5');
    expect(lock.packages?.['node_modules/hono']?.version).toBe('4.13.5');
  });
});
