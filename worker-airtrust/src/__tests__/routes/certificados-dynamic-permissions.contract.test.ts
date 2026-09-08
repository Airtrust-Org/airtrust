import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const writeSource = readFileSync(
  decodeURIComponent(new URL('../../routes/qualificacoes-certificados-write.ts', import.meta.url).pathname),
  'utf8',
);
const rootSource = readFileSync(
  decodeURIComponent(new URL('../../routes/qualificacoes-certificados.ts', import.meta.url).pathname),
  'utf8',
);

describe('certificate dynamic permission wiring', () => {
  it('uses tenant-scoped dynamic create permission for certificate generation and upload', () => {
    expect(writeSource.match(/requirePermission\('certificados', 'criar', 'admin', 'manager'\)/g)?.length).toBe(2);
    expect(writeSource).not.toContain("requireRole('admin', 'manager')");
  });

  it('uses tenant-scoped dynamic delete permission for certificate deletion', () => {
    expect(rootSource).toContain("requirePermission('certificados', 'deletar', 'admin', 'manager')");
  });
});
