import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(currentDirectory, relativePath), 'utf8');
}

describe('audit round 2 focused high-risk regressions', () => {
  it('keeps LMS dynamic reports private and non-cacheable', () => {
    const route = source('../../routes/lms-relatorios.ts');

    expect(route).toMatch(/Cache-Control[\s\S]*no-store/);
  });

  it('keeps simulator reports private and non-cacheable', () => {
    const route = source('../../routes/simuladores-relatorios.ts');

    expect(route).toMatch(/Cache-Control[\s\S]*no-store/);
  });

  it('keeps daily alert publication idempotent and tenant-scoped', () => {
    const cron = source('../../cron/alertasDiarios.ts');

    expect(cron).toContain('publishDomainEventOnce');
    expect(cron).toMatch(/json_extract\(payload/);
    expect(cron).toMatch(/empresa=.*falhou/);
  });

  it('translates duplicate administrative email races deterministically', () => {
    const route = source('../../routes/admin-usuarios-legacy.ts');

    expect(route).toContain('EMAIL_ALREADY_EXISTS');
    expect(route).toContain(
      '/UNIQUE constraint failed: usuarios\\.email/i.test(insertError.message)',
    );
  });
});
