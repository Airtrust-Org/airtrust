import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/lms/LmsHistoricoEdApp.tsx'),
  'utf8',
);

describe('contratos da tela de histórico EdApp', () => {
  it('mantém a autorização em um wrapper antes dos hooks de dados', () => {
    const wrapperStart = source.indexOf('export default function LmsHistoricoEdApp()');
    const authorizationGuard = source.indexOf('if (!canManage)', wrapperStart);
    const childRender = source.indexOf('return <LmsHistoricoEdAppContent', wrapperStart);
    const childStart = source.indexOf('function LmsHistoricoEdAppContent', childRender);
    const summaryHook = source.indexOf('useLmsEdappLegacySummary', childStart);
    const historyHook = source.indexOf('useLmsHistoricoEdApp({', childStart);

    // A autorização deve ser decidida antes da execução de qualquer hook de dados históricos.
    expect(wrapperStart).toBeGreaterThanOrEqual(0);
    expect(authorizationGuard).toBeGreaterThan(wrapperStart);
    expect(childRender).toBeGreaterThan(authorizationGuard);
    expect(childStart).toBeGreaterThan(childRender);
    expect(summaryHook).toBeGreaterThan(childStart);
    expect(historyHook).toBeGreaterThan(childStart);
  });

  it('identifica claramente que o CSV contém somente a página atual', () => {
    expect(source).toContain('Exportar página CSV');
    expect(source).toContain('Exporta somente os registros exibidos na página atual');
    expect(source).toContain('edapp-historico-pagina-${page}-');
  });

  it('não promete imutabilidade absoluta enquanto existe reconciliação controlada', () => {
    expect(source).not.toContain('registros preservados aqui são imutáveis');
    expect(source).toContain('reconciliações devem seguir processo controlado e auditável');
  });
});
