import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  extractAndValidateLmsPackage,
  LMS_PACKAGE_LIMITS,
  validateUploadedEntryDescriptors,
} from '../../../lib/lms/lms-package-validator';

function scormZip(extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    'imsmanifest.xml': strToU8(
      '<?xml version="1.0"?><manifest><resources><resource identifier="R1" href="index.html" /></resources></manifest>',
    ),
    'index.html': strToU8('<html>ok</html>'),
    ...extra,
  });
}

describe('LMS package validator', () => {
  it('aceita ZIP SCORM válido e confirma launch file', () => {
    const result = extractAndValidateLmsPackage(scormZip(), 'scorm');
    expect(result.launchFile).toBe('index.html');
    expect(result.scormVersao).toBe('1.2');
    expect(result.entries).toHaveLength(2);
  });

  it('rejeita ZIP corrompido', () => {
    expect(() => extractAndValidateLmsPackage(strToU8('not-a-zip'), 'scorm')).toThrow(
      /ZIP inválido|corrompido/i,
    );
  });

  it('rejeita zip bomb simulada por proporção de compressão', () => {
    const bytes = zipSync({
      'imsmanifest.xml': strToU8('<manifest><resources><resource href="index.html" /></resources></manifest>'),
      'index.html': new Uint8Array(2 * 1024 * 1024),
    }, { level: 9 });
    expect(() => extractAndValidateLmsPackage(bytes, 'scorm')).toThrow(/proporção de compressão/i);
  });

  it('rejeita excesso de entradas', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i <= LMS_PACKAGE_LIMITS.maxEntries; i += 1) entries[`f-${i}.txt`] = new Uint8Array();
    expect(() => extractAndValidateLmsPackage(zipSync(entries), 'scorm')).toThrow(/limite de 2000 entradas/i);
  });

  it('rejeita arquivo individual grande sem alocar o conteúdo', () => {
    expect(() =>
      validateUploadedEntryDescriptors([
        { path: 'video.mp4', size: LMS_PACKAGE_LIMITS.maxFileBytes + 1 },
      ]),
    ).toThrow(/limite individual/i);
  });

  it('rejeita path traversal', () => {
    expect(() => extractAndValidateLmsPackage(scormZip({ '../outside.js': strToU8('x') }), 'scorm')).toThrow(
      /path traversal/i,
    );
  });

  it('rejeita caminhos equivalentes após normalização case-insensitive', () => {
    expect(() =>
      extractAndValidateLmsPackage(scormZip({ 'Assets/App.js': strToU8('a'), 'assets/app.js': strToU8('b') }), 'scorm'),
    ).toThrow(/duplicados ou equivalentes/i);
  });

  it('rejeita pacote SCORM sem manifest', () => {
    expect(() => extractAndValidateLmsPackage(zipSync({ 'index.html': strToU8('ok') }), 'scorm')).toThrow(
      /imsmanifest.xml não encontrado/i,
    );
  });

  it('rejeita launch file ausente no conjunto extraído', () => {
    const bytes = zipSync({
      'imsmanifest.xml': strToU8('<manifest><resources><resource href="missing.html" /></resources></manifest>'),
    });
    expect(() => extractAndValidateLmsPackage(bytes, 'scorm')).toThrow(/não existe no conjunto extraído/i);
  });

  it('valida pacote H5P completo', () => {
    const bytes = zipSync({
      'h5p.json': strToU8(JSON.stringify({ mainLibrary: 'H5P.CoursePresentation 1.25' })),
      'content/content.json': strToU8('{}'),
    });
    const result = extractAndValidateLmsPackage(bytes, 'h5p');
    expect(result.tipoH5p).toBe('H5P.CoursePresentation');
  });

  it('rejeita H5P sem content/content.json', () => {
    const bytes = zipSync({
      'h5p.json': strToU8(JSON.stringify({ mainLibrary: 'H5P.Column 1.0' })),
    });
    expect(() => extractAndValidateLmsPackage(bytes, 'h5p')).toThrow(/content\/content.json/i);
  });
});
