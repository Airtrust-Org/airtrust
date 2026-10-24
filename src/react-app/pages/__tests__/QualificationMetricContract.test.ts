import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacyDashboard = readFileSync('src/react-app/pages/DashboardQualificacoes.tsx', 'utf8');
const qualificacoes = readFileSync('src/react-app/pages/Qualificacoes.tsx', 'utf8');
const mainDashboard = readFileSync('src/react-app/pages/DashboardPrincipal.tsx', 'utf8');
const operationalSummary = readFileSync(
  'src/react-app/pages/dashboard/useOperationalSummary.ts',
  'utf8',
);
const contract = readFileSync('docs/audit/qualification-lms-metric-contract.md', 'utf8');

describe('qualification and LMS metric contract', () => {
  it('keeps /qualificacoes as the only user-facing qualification metric source', () => {
    expect(legacyDashboard).toContain('<Navigate to="/qualificacoes" replace />');
    expect(qualificacoes).toContain('stats: historicoStats');
    expect(qualificacoes).toContain('const stats = historicoStats');
  });

  it('keeps Training Compliance and Qualification Compliance explicitly distinct', () => {
    expect(mainDashboard).toContain('trainingCompliance');
    expect(mainDashboard).toContain('qualificationCompliance');
    expect(mainDashboard).toContain('Compliance de Treinamentos');
    expect(mainDashboard).toContain('Compliance de Qualificações');
    expect(mainDashboard).toContain('EAD, presencial, simulador e demais modalidades');
    expect(mainDashboard).toContain('licenças, habilitações, CMA e cheques');
    expect(operationalSummary).toContain('DashboardTrainingComplianceSummary');
    expect(operationalSummary).toContain('DashboardQualificationComplianceSummary');
    expect(mainDashboard).not.toContain('LMS em andamento');
    expect(mainDashboard).not.toContain('Score de Compliance');
  });

  it('documents the configurable expiry horizon and forbids forced metric equality', () => {
    expect(contract).toContain('empresas_config.dias_alerta_vencimento');
    expect(contract).toContain('default 30 days and allowed from 1 to 365 days');
    expect(contract).toContain(
      'A count of people is not expected to equal a count of qualification records.',
    );
    expect(contract).toContain('Loading is not zero.');
    expect(contract).toContain('Query failure is not zero.');
  });
});
