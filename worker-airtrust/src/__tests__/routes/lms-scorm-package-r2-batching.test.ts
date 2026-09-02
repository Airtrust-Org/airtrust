import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SCORM package candidate R2 batching', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/lib/lms/lms-scorm-package-version-service.ts'),
    'utf8',
  );

  it('uses the established bounded R2 batch size for candidate storage', () => {
    const createBody = source.slice(
      source.indexOf('export async function createScormPackageCandidate'),
      source.indexOf('export function packageReadModel'),
    );

    expect(source).toContain('const SCORM_PACKAGE_R2_BATCH_SIZE = 10;');
    expect(createBody).toContain(
      'for (let index = 0; index < pkg.entries.length; index += SCORM_PACKAGE_R2_BATCH_SIZE)',
    );
    expect(createBody).toContain('await Promise.all(');
    expect(createBody).toContain('params.bucket.put(');
  });

  it('uses the same bounded concurrency when reading candidate assets for conformance', () => {
    const readBody = source.slice(
      source.indexOf('async function candidateAssets'),
      source.indexOf('export async function runScormPackageConformance'),
    );

    expect(readBody).toContain(
      'for (let index = 0; index < page.objects.length; index += SCORM_PACKAGE_R2_BATCH_SIZE)',
    );
    expect(readBody).toContain('await Promise.all(');
    expect(readBody).toContain('const object = await bucket.get(item.key);');
  });
});
