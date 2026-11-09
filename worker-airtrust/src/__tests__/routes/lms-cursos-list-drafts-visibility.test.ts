/**
 * P02-07: aluno nao lista rascunhos de curso com ?publicados=0. A rota vive em um
 * arquivo grande com teto de linhas; o contrato e verificado no codigo-fonte, como
 * os demais testes dessa rota, e a expressao e exercitada com a mesma tabela-verdade.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-cursos-legacy.ts'), 'utf8');
const EXPECTED =
  "const somentePublicados = c.req.query('publicados') !== '0' || !hasRole(c, 'admin', 'manager');";

// Mesma expressao da rota, com o papel resolvido por canSeeDrafts.
const onlyPublished = (publicados: string | undefined, canSeeDrafts: boolean) =>
  publicados !== '0' || !canSeeDrafts;

describe('P02-07 visibilidade de rascunhos no catalogo de cursos', () => {
  it('a rota combina o parametro com o papel do chamador (admin/manager)', () => {
    expect(source).toContain(EXPECTED);
    expect(source).not.toContain("const somentePublicados = c.req.query('publicados') !== '0';");
  });

  it('quem nao gerencia cursos sempre recebe so publicados, mesmo com ?publicados=0', () => {
    expect(onlyPublished('0', false)).toBe(true);
    expect(onlyPublished(undefined, false)).toBe(true);
    expect(onlyPublished('1', false)).toBe(true);
  });

  it('admin/gestor veem rascunhos so quando pedem explicitamente publicados=0', () => {
    expect(onlyPublished('0', true)).toBe(false);
    expect(onlyPublished(undefined, true)).toBe(true);
    expect(onlyPublished('1', true)).toBe(true);
  });
});
