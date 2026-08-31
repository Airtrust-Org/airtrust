import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacyDashboard = readFileSync(
  'src/react-app/pages/DashboardQualificacoes.tsx',
  'utf8',
);
const qualificacoes = readFileSync('src/react-app/pages/Qualificacoes.tsx', 'utf8');
const mainDashboard = readFileSync('src/react-app/pages/DashboardPrincipal.tsx', 'utf8');
const contract = readFileSync('docs/audit/qualification-lms-metric-contract.md', 'utf8');

describe('qualification and LMS metric contract', () => {
  it('keeps /qualificacoes as the only user-facing qualification metric source', () => {
    expect(legacyDashboard).toContain('<Navigate to="/qualificacoes" replace />');
    expect(qualificacoes).toContain('stats: historicoStats');
    expect(qualificacoes).toContain('const stats = historicoStats');
  });

  it('keeps people, qualification records and LMS enrollments explicitly distinct', () => {
    expect(mainDashboard).toContain('tripulantesComQualificacoesVencidas');
    expect(mainDashboard).toContain('qualificacoesVencidas');
    expect(mainDashboard).toContain('LMS em andamento');
    expect(mainDashboard).toContain('Matrículas ainda não concluídas');
  });

  it('documents the configurable expiry horizon and forbids forced metric equality', () => {
    expect(contract).toContain('empresas_config.dias_alerta_vencimento');
    expect(contract).toContain('default 30 days and allowed from 1 to 365 days');
    expect(contract).toContain('A count of people is not expected to equal a count of qualification records.');
    expect(contract).toContain('Loading is not zero.');
    expect(contract).toContain('Query failure is not zero.');
  });
});
