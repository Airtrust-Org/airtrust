/**
 * Testes de caracterização de contrato para GET /:id/pdf (proposta CAE
 * Planning V3), no mesmo padrão de src/react-app/pages/__tests__/
 * Qualificacoes.mutations.test.tsx: verificação estática de string/regex
 * do source, protegendo o contrato de RBAC e isolamento de tenant sem
 * precisar montar toda a árvore de dependências do Hono app + D1 mock.
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('src/routes/simuladores-planejamento.ts', 'utf-8');

function routeBlock(): string {
  const start = src.indexOf("app.get('/:id/pdf'");
  const end = src.indexOf("app.get('/:id/auditoria'");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('GET /:id/pdf — contrato RBAC e isolamento de tenant', () => {
  it('exige role admin ou manager (RBAC)', () => {
    expect(src).toMatch(/app\.get\('\/:id\/pdf',\s*requireRole\('admin',\s*'manager'\)/);
  });

  it('busca a proposta filtrando por t.empresa_id — nunca por id previsível sozinho', () => {
    const block = routeBlock();
    expect(block).toMatch(/WHERE t\.id = \? AND t\.empresa_id = \? AND t\.deleted_at IS NULL/);
  });

  it('usa getEmpresaId(c) do contexto de tenant — não confia em empresa_id vindo do cliente', () => {
    const block = routeBlock();
    expect(block).toMatch(/const empresaId = getEmpresaId\(c\)/);
  });

  it('retorna 404 controlado quando a proposta não é encontrada (não expõe existência cross-tenant)', () => {
    const block = routeBlock();
    expect(block).toMatch(/if \(!row\) return c\.json\(\{ success: false, error: 'Planejamento não encontrado' \}, 404\)/);
  });

  it('resolve nomes de funcionários e modelos com o mesmo filtro de empresa_id (sem vazamento cross-tenant)', () => {
    const block = routeBlock();
    expect(block).toContain('FROM funcionarios WHERE id IN');
    expect(block).toContain('FROM modelos_sessao WHERE id IN');
    expect(block).toContain('FROM qualificacoes_tipos WHERE id IN');
    // As três queries de lookup terminam com "AND empresa_id = ?" logo após o IN(...).
    const empresaScopedCount = (block.match(/\.map\(\(\) => '\?'\)\s*\.join\(','\)}\)\s*AND empresa_id = \?`/g) || [])
      .length;
    expect(empresaScopedCount).toBe(3);
  });

  it('constrói o PDF a partir do snapshot já persistido — não recalcula dados', () => {
    const block = routeBlock();
    expect(block).toMatch(/JSON\.parse\(row\.planejamento_snapshot_json\)/);
    expect(block).not.toMatch(/resolveIndividualNextModel|matchCaeAvailabilityBatch|pairSimulatorPlanningCandidates/);
  });

  it('responde com Content-Type application/pdf e Content-Disposition attachment', () => {
    const block = routeBlock();
    expect(block).toMatch(/'Content-Type': 'application\/pdf'/);
    expect(block).toMatch(/'Content-Disposition': `attachment; filename="proposta-cae-\$\{treinamentoId\}\.pdf"`/);
  });

  it('inclui recursos pendentes explicitamente em vez de omitir campos ausentes', () => {
    const block = routeBlock();
    expect(block).toMatch(/simulator_id: Number\.isInteger\(snapshot\.simulator_id\)/);
    expect(block).toMatch(/instructor_id: Number\.isInteger\(snapshot\.instructor_id\)/);
  });
});
