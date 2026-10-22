import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(currentDir, '../../routes/lms-matriculas.ts'), 'utf8');
const start = source.indexOf("  '/em-andamento'");
const end = source.indexOf('// ── Detalhe de matrícula', start);
const route = source.slice(start, end);

describe('LMS visão consolidada de matrículas em andamento', () => {
  it('restringe a consulta à empresa, a matrículas ativas e a funcionários ativos', () => {
    expect(route).toContain("requirePermission('lms', 'visualizar', 'admin', 'manager')");
    expect(route).toContain('m.empresa_id = ?');
    expect(route).toContain('c.empresa_id = m.empresa_id');
    expect(route).toContain('f.empresa_id = m.empresa_id');
    expect(route).toContain("UPPER(TRIM(COALESCE(m.status, ''))) = 'EM_ANDAMENTO'");
    expect(route).toContain('m.deleted_at IS NULL');
    expect(route).toContain('c.deleted_at IS NULL');
    expect(route).toContain('f.deleted_at IS NULL');
    expect(route).toContain('COALESCE(f.ativo, 1) = 1');
  });

  it('aplica escopo de funcionário e curso, busca vinculada e paginação', () => {
    expect(route).toContain("employeeSectorSql(access, 'f')");
    expect(route).toContain('lms_cursos_setores');
    expect(route).toContain('qualificacoes_tipos_setores');
    expect(route).toContain('LOWER(f.nome) LIKE LOWER(?)');
    expect(route).toContain('LOWER(c.titulo) LIKE LOWER(?)');
    expect(route).toContain('LIMIT ? OFFSET ?');
    expect(route).toContain('pagination: { page, limit, total: total?.n ?? 0 }');
  });
});
