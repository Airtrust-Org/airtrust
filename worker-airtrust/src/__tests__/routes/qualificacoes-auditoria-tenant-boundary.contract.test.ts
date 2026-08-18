import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(__dirname, '../../routes/auditoria.ts'), 'utf8');

describe('qualificações auditoria tenant boundary', () => {
  it('permanece restrita a admin e limita quantidade de CPFs por request', () => {
    expect(source).toContain("app.use('*', auth(), requireRole('admin'))");
    expect(source).toContain('cpfsFormatados.length > 40');
    expect(source).toContain("code: 'CPFS_LIMIT_EXCEEDED'");
    expect(source).toContain(
      'const cpfs = [...new Set([...cpfsFormatados, ...cpfsSemFormatacao])]',
    );
  });

  it('fixa empresa_id diretamente em todas as leituras de histórico por CPF', () => {
    const duplicateAt = source.indexOf('// 3. VERIFICAR DUPLICATAS');
    const summaryAt = source.indexOf('// 6. RESUMO GERAL');
    const cpfAudit = source.slice(duplicateAt, summaryAt);

    expect((cpfAudit.match(/h\.empresa_id = \?/g) || []).length).toBe(3);
    expect((cpfAudit.match(/f\.empresa_id = h\.empresa_id/g) || []).length).toBe(3);
    expect((cpfAudit.match(/\.bind\(empresaId, \.\.\.cpfs\)/g) || []).length).toBe(3);
  });

  it('fixa empresa_id também no resumo geral em vez de inferir tenant apenas pelo funcionário', () => {
    const summary = source.slice(source.indexOf('// 6. RESUMO GERAL'));
    expect((summary.match(/qh\.empresa_id = \?/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(summary).toContain('f.empresa_id = qh.empresa_id');
    expect(summary).toContain('.bind(empresaId, empresaId, empresaId, empresaId)');
  });
});
