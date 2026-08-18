import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../../routes/notificacoes-convocacao.ts'),
  'utf8',
);

describe('notificações de convocação — escopo de funcionário e privacidade', () => {
  it('protege leitura de configuração e gestores com papel operacional', () => {
    expect(source).toMatch(
      /['"]\/convocacoes\/config['"],[\s\S]{0,120}requireRole\('admin', 'manager'\)/,
    );
    expect(source).toMatch(
      /['"]\/convocacoes\/gestores['"],[\s\S]{0,120}requireRole\('admin', 'manager'\)/,
    );
  });

  it('aplica employee-sector access ao envio por IDs e por histórico planejado', () => {
    expect(source).toContain('const access = await getEmployeeSectorAccess(c, empresaId)');
    expect(source.match(/employeeSectorSql\(access, 'f'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(
      3,
    );
    expect(source).toContain('AND ${funcionarioScope.clause}');
    expect(source).toContain('...funcionarioScope.bindings');
  });

  it('amarra histórico, funcionário e tipo de qualificação ao mesmo tenant', () => {
    expect(source).toContain('AND qt.empresa_id = qh.empresa_id');
    expect(source).toContain('AND f.empresa_id = qh.empresa_id');
    expect(source).toContain('WHERE qh.empresa_id = ?');
  });

  it('não devolve erro bruto do provedor ao cliente', () => {
    expect(source).toContain("code: 'CONVOCACAO_EMAIL_TEST_FAILED'");
    expect(source).toContain("error: 'Não foi possível concluir o envio da convocação'");
    expect(source).not.toContain(
      "{ success: false, error: message, code: 'CONVOCACAO_PLANEJADA_SEND_FAILED' }",
    );
  });
});
