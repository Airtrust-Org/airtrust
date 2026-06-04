import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyAssetAccess } from '../../routes/assets';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('assets public surface architecture guard', () => {
  it('mantém política explícita deny-by-default para /api/assets/*', () => {
    const source = readFileSync(join(testDir, '../../routes/assets.ts'), 'utf8');
    const classifyIndex = source.indexOf('const policy = classifyAssetAccess(key)');
    const bucketGetIndex = source.indexOf('await c.env.BUCKET.get(key)');

    expect(source).toContain('export type AssetAccessPolicy');
    expect(source).toContain("visibility: 'public'");
    expect(source).toContain("visibility: 'tenant'");
    expect(source).toContain("visibility: 'blocked'");
    expect(source).toContain('PUBLIC_EMPRESA_ASSET_PATTERN');
    expect(source).toContain('^fira\\/(\\d+)\\/.+');
    expect(source).toContain('EXAME-ASO-');
    expect(source).toContain('certificados|funcionarios|qualificacoes');
    expect(source).toContain('private, no-store');
    expect(source).toContain('public, max-age=86400');
    expect(classifyIndex).toBeGreaterThan(-1);
    expect(bucketGetIndex).toBeGreaterThan(classifyIndex);
  });

  it('classifica somente logos/branding como público e FIRA como tenant-scoped', () => {
    expect(classifyAssetAccess('empresas/6/logo.png')).toEqual({
      visibility: 'public',
      cache: 'public',
    });
    expect(classifyAssetAccess('empresas/6/logo-1760000000000.png')).toEqual({
      visibility: 'public',
      cache: 'public',
    });
    expect(classifyAssetAccess('empresas/6/sistema-logo-1760000000000.png')).toEqual({
      visibility: 'public',
      cache: 'public',
    });
    expect(classifyAssetAccess('fira/6/CANAC/2026-06/fira.pdf')).toEqual({
      visibility: 'tenant',
      empresaId: 6,
      cache: 'private',
    });
  });

  it('bloqueia prefixos sensíveis sem ownership seguro direto em /api/assets', () => {
    expect(classifyAssetAccess('EXAME-ASO-JOAO-20260602-abcd1234.pdf').visibility).toBe(
      'blocked',
    );
    expect(classifyAssetAccess('certificados/CERT-JOAO-G1-20260602-abcd1234.pdf').visibility).toBe(
      'blocked',
    );
    expect(classifyAssetAccess('funcionarios/123/documento.pdf').visibility).toBe('blocked');
    expect(classifyAssetAccess('qualificacoes/123/documento.pdf').visibility).toBe('blocked');
    expect(classifyAssetAccess('desconhecido/documento.pdf').visibility).toBe('blocked');
  });
});
