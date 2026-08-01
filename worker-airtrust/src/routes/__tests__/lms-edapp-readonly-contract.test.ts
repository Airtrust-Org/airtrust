import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(currentDir, '../lms-edapp-legado.ts'), 'utf8');
const importRouteSignature = ['app', 'post'].join('.') + "('/legado/edapp/importar'";

describe('contrato somente leitura do histórico EdApp', () => {
  it('não contém SQL de mutação nem execução de writes', () => {
    expect(source).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(source).not.toMatch(/\bUPDATE\s+[a-z_]/i);
    expect(source).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(source).not.toContain('.run()');
    expect(source).not.toContain('.batch(');
  });

  it('mantém o antigo endpoint de importação como tombstone 410', () => {
    expect(source).toContain(importRouteSignature);
    expect(source).toContain("code: 'LMS_EDAPP_IMPORT_RETIRED'");
    expect(source).toContain('410');
  });

  it('preserva as rotas de resumo e consulta histórica', () => {
    expect(source).toContain("app.get('/legado/edapp/resumo'");
    expect(source).toContain("app.get('/legado/edapp/historico'");
  });

  it('não depende de helpers pertencentes ao domínio de escalas', () => {
    expect(source).not.toContain("from './escalas-shared'");
    expect(source).toContain("from '../utils/tenant-context'");
  });
});
