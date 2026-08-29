import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'src/react-app/pages/escalas/VisaoMensalIntegradaPage.tsx',
  'utf8',
);

describe('VisaoMensalIntegradaPage state semantics', () => {
  it('does not present computed zero indicators before data is known', () => {
    expect(source).toContain('loading && !data');
    expect(source).toContain('Carregando indicadores da visão mensal');
    expect(source).toContain('data ? (');
  });

  it('keeps technical API errors out of the user-facing surface', () => {
    expect(source).toContain('Não foi possível carregar a visão mensal integrada.');
    expect(source).toContain('Os indicadores não serão tratados como zero');
    expect(source).not.toContain('{error}');
  });

  it('does not generate dead hash links for events without a source route', () => {
    expect(source).toContain('if (!event.sourceRoute)');
    expect(source).not.toContain("href={event.sourceRoute || '#'}");
  });

  it('uses a compact four-signal summary instead of five large KPI cards', () => {
    expect(source).toContain("['Tripulantes', visualSummary.employees]");
    expect(source).toContain("['Avisos', visualSummary.warnings]");
    expect(source).toContain("['Conflitos', visualSummary.conflicts]");
    expect(source).toContain("['Bloqueios', visualSummary.blockingIssues]");
    expect(source).not.toContain("['Compromissos', visualSummary.events]");
  });
});
