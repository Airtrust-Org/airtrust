import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LMS_PACKAGE_LIMITS } from '../../../lib/lms/lms-package-validator';

const WORKER_ISOLATE_MEMORY_BYTES = 128 * 1024 * 1024;

describe('LMS package Worker memory budget', () => {
  it('never permits the compressed request itself to consume the isolate budget', () => {
    expect(LMS_PACKAGE_LIMITS.maxCompressedBytes).toBe(32 * 1024 * 1024);
    expect(LMS_PACKAGE_LIMITS.maxCompressedBytes).toBeLessThan(WORKER_ISOLATE_MEMORY_BYTES / 2);
  });

  it('leaves explicit headroom while unzipSync holds compressed and expanded bytes', () => {
    expect(LMS_PACKAGE_LIMITS.maxUncompressedBytes).toBe(64 * 1024 * 1024);
    expect(LMS_PACKAGE_LIMITS.maxFileBytes).toBe(32 * 1024 * 1024);
    expect(
      LMS_PACKAGE_LIMITS.maxCompressedBytes + LMS_PACKAGE_LIMITS.maxUncompressedBytes,
    ).toBeLessThanOrEqual(WORKER_ISOLATE_MEMORY_BYTES * 0.75);
  });

  it('keeps browser preflight synchronized with the authoritative Worker limits', () => {
    const browserSource = readFileSync(
      resolve(process.cwd(), '../src/react-app/pages/lms/lmsPackageValidator.ts'),
      'utf8',
    );
    expect(browserSource).toContain('maxCompressedBytes: 32 * 1024 * 1024');
    expect(browserSource).toContain('maxUncompressedBytes: 64 * 1024 * 1024');
    expect(browserSource).toContain('maxFileBytes: 32 * 1024 * 1024');
  });
});
