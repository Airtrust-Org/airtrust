import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('dynamic configurable permission surfaces', () => {
  it('routes remaining qualification writes through qualificacoes permissions', () => {
    for (const file of [
      'src/routes/qualificacoes/atribuicao.ts',
      'src/routes/qualificacoes/historico-write.ts',
      'src/routes/qualificacoes/historico-atomic-write.ts',
    ]) {
      const source = read(file);
      expect(source).toContain("requirePermission('qualificacoes'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }
  });

  it('routes employee manager surfaces through funcionarios permissions', () => {
    const root = read('src/routes/funcionarios.ts');
    expect(root).toContain("requirePermission('funcionarios', 'editar', 'admin', 'manager')");
    expect(root).toContain("requirePermission('funcionarios', 'deletar', 'admin', 'manager')");
    expect(root).not.toContain("requireRole('admin', 'manager')");

    const mutations = read('src/routes/funcionarios-mutations.ts');
    expect(mutations).toContain("requirePermission('funcionarios', 'criar', 'admin', 'manager')");
    expect(mutations).toContain("requirePermission('funcionarios', 'editar', 'admin', 'manager')");
    expect(mutations).toContain("requirePermission('funcionarios', 'deletar', 'admin', 'manager')");
    expect(mutations).not.toContain("requireRole('admin', 'manager')");
  });

  it('routes LMS manager surfaces dynamically while preserving admin-only recovery operations', () => {
    for (const file of [
      'src/routes/lms-cursos-upload-routes.ts',
      'src/routes/lms-matriculas-mel-manutencao.ts',
      'src/routes/lms-cursos-legacy.ts',
    ]) {
      const source = read(file);
      expect(source).toContain("requirePermission('lms'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }
    const matriculas = read('src/routes/lms-matriculas.ts');
    expect(matriculas).toContain("requirePermission('lms'");
    expect(matriculas).toContain("requireRole('admin')");
  });

  it('routes simulator planning manager surfaces dynamically', () => {
    for (const file of [
      'src/routes/simuladores-planejamento.ts',
      'src/routes/simuladores-planejamento-v2-crew.ts',
    ]) {
      const source = read(file);
      expect(source).toContain("requirePermission('simuladores'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }
  });

  it('routes remaining escala manager surfaces dynamically', () => {
    for (const file of [
      'src/routes/escalas-core.ts',
      'src/routes/escalas-crud.ts',
      'src/routes/escalas-padroes.ts',
      'src/routes/escalas-templates.ts',
      'src/routes/escalas-tipos-evento.ts',
      'src/routes/escalas-quinzenas.ts',
      'src/routes/escalas-situacoes.ts',
      'src/routes/escalas-confirmacoes.ts',
      'src/routes/escalas-eventos.ts',
      'src/routes/escalas-alocacoes.ts',
      'src/routes/escalas-tripulacoes.ts',
      'src/routes/escalas-evd.ts',
      'src/routes/escala-mensal-integrada.ts',
    ]) {
      const source = read(file);
      expect(source).toContain("requirePermission('escalas'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }
  });
});
