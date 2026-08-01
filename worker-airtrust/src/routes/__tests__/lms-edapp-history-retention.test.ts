import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(resolve(currentDir, '../lms-edapp-legado.ts'), 'utf8');

const pendingImportSection = routeSource.slice(
  routeSource.indexOf('async function countPendingLegacyImports'),
  routeSource.indexOf("app.get('/legado/edapp/resumo'"),
);

const readOnlyHistorySection = routeSource.slice(
  routeSource.indexOf("app.get('/legado/edapp/resumo'"),
  routeSource.indexOf("app.post('/legado/edapp/importar'"),
);

describe('retenção do histórico EdApp', () => {
  it('não exclui registros porque o funcionário ficou inativo ou foi removido', () => {
    expect(readOnlyHistorySection).not.toContain('COALESCE(fx.ativo');
    expect(readOnlyHistorySection).not.toContain('UPPER(COALESCE(NULLIF(TRIM(fx.status)');
    expect(readOnlyHistorySection).not.toContain('AND f.deleted_at IS NULL');
  });

  it('mantém o join do funcionário estritamente no tenant do histórico', () => {
    expect(readOnlyHistorySection).toContain('AND f.empresa_id = h.empresa_id');
  });

  it('isola por tenant o diagnóstico de eventos pendentes', () => {
    expect(pendingImportSection).toContain('ON u.empresa_id = e.empresa_id');
    expect(pendingImportSection).toContain('AND f.empresa_id = e.empresa_id');
    expect(pendingImportSection).toContain('AND h.empresa_id = e.empresa_id');
    expect(pendingImportSection).toContain('WHERE e.empresa_id = ?');
  });

  it('expõe o estado atual sem apagar a evidência histórica', () => {
    expect(readOnlyHistorySection).toContain('f.ativo AS funcionario_atual_ativo');
    expect(readOnlyHistorySection).toContain('f.status AS funcionario_atual_status');
    expect(readOnlyHistorySection).toContain('f.deleted_at AS funcionario_atual_deleted_at');
    expect(readOnlyHistorySection).toContain('COALESCE(h.funcionario_nome, f.nome)');
  });
});
