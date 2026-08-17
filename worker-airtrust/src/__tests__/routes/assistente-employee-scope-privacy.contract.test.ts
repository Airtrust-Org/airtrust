import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(__dirname, '../../routes/assistente.ts'), 'utf8');

describe('assistente home — escopo de funcionário e tenant', () => {
  it('usa o employee-sector access em todo contexto organizacional', () => {
    expect(source).toContain('const access = await getEmployeeSectorAccess(c, empresaId)');
    expect(source).toContain('getDashboardMetrics(c.env.DB, empresaId, access)');
    expect(source).toContain('getComplianceScore(c.env.DB, empresaId, access)');
    expect(source).toContain('getDashboardAlerts(c.env.DB, empresaId, access)');
    expect(source).toContain('getAtividadesRecentes(c.env.DB, empresaId, access)');
  });

  it('não resolve colaborador por nome fora do employee-sector scope', () => {
    expect(source).toContain("const employeeScope = employeeSectorSql(access, 'f')");
    expect(source).toContain('AND ${employeeScope.clause}');
    expect(source).toContain('.bind(empresaId, message, ...employeeScope.bindings)');
    expect(source).toContain('empresaId, ...employeeScope.bindings)');
  });

  it('amarra histórico e tipo de qualificação ao mesmo tenant do funcionário', () => {
    expect(source).toContain('AND f.empresa_id = qh.empresa_id');
    expect(source).toContain('AND qt.empresa_id = qh.empresa_id');
    expect(source).toContain('WHERE qh.empresa_id = ?');
  });
});
