import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeScormUploadFilename,
  parseStoredScormValidation,
  readScormUploadFilename,
  withScormUploadMetadata,
} from '../../lib/lms/lms-scorm-package-filename';

describe('SCORM package filename metadata', () => {
  it('normalizes browser fake paths and unsafe control characters', () => {
    expect(normalizeScormUploadFilename(' C:\\fakepath\\MEL_R7.zip ')).toBe('MEL_R7.zip');
    expect(normalizeScormUploadFilename('/tmp/HUMS_R7.zip')).toBe('HUMS_R7.zip');
    expect(normalizeScormUploadFilename('PT6\u0000_R7.zip')).toBe('PT6_R7.zip');
    expect(normalizeScormUploadFilename('   ')).toBeNull();
  });

  it('caps the visible filename and round-trips it inside validation metadata', () => {
    const longName = `${'A'.repeat(300)}.zip`;
    const stored = withScormUploadMetadata({ publishable: true }, longName);
    const filename = readScormUploadFilename(stored);

    expect(filename).not.toBeNull();
    expect(filename?.length).toBe(255);
    expect(readScormUploadFilename(parseStoredScormValidation(JSON.stringify(stored)))).toBe(filename);
  });

  it('tolerates legacy or malformed validation JSON without inventing a filename', () => {
    expect(parseStoredScormValidation(null)).toBeNull();
    expect(parseStoredScormValidation('{broken')).toBeNull();
    expect(readScormUploadFilename({ validatorVersion: 'v1' })).toBeNull();
  });
});

describe('SCORM filename lifecycle wiring', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/lib/lms/lms-scorm-package-version-service.ts'),
    'utf8',
  );

  it('stores upload filename metadata with the candidate and preserves it through conformance', () => {
    expect(source).toContain('const storedQuality = withScormUploadMetadata(quality, originalFilename);');
    expect(source).toContain('JSON.stringify(storedQuality)');
    expect(source).toContain('const storedResult = withScormUploadMetadata({ ...result, runtime }, originalFilename);');
    expect(source).toContain('JSON.stringify(storedResult)');
  });

  it('updates the course visible filename only when the exact package becomes ACTIVE', () => {
    const activateBody = source.slice(
      source.indexOf('export async function activateScormPackageVersion'),
      source.indexOf('async function candidateAssets'),
    );
    expect(activateBody).toContain("conteudo_arquivo_nome = COALESCE(?, conteudo_arquivo_nome)");
    expect(activateBody).toContain('readScormUploadFilename(quality)');
    expect(activateBody).toContain("status = 'ACTIVE'");
  });

  it('keeps exact-SHA reuploads truthful when the package is already ACTIVE', () => {
    const createBody = source.slice(
      source.indexOf('export async function createScormPackageCandidate'),
      source.indexOf('export function packageReadModel'),
    );
    expect(createBody).toContain("existing.status === 'ACTIVE'");
    expect(createBody).toContain('SET conteudo_arquivo_nome = ?, updated_at = datetime');
  });
});
