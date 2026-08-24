/**
 * Testes de caracterização do contrato de UI de resource assignment (Fase I
 * do CAE Planning V3) em PlanejamentoSimuladores.tsx.
 *
 * Estratégia: análise estática de string/regex, no mesmo padrão já usado
 * para Qualificacoes.mutations.test.tsx — este componente é grande e as
 * mutations relevantes (POST /recursos, GET /recursos/candidatos) são
 * verificáveis com segurança por contrato de texto/regex, sem precisar
 * montar toda a árvore de providers do app para um RTL render.
 *
 * Cobre:
 * 1. GET /:id/recursos/candidatos é chamado sob demanda (não no load automático)
 * 2. POST /:id/recursos usa o campo correto (simulator_id | instructor_id)
 * 3. Simulador RESOLVED não expõe select — mostra apenas confirmação
 * 4. Simulador NEEDS_ASSIGNMENT mostra aviso, não inventa opções
 * 5. Simulador AMBIGUOUS lista somente os candidatos retornados pelo backend
 * 6. Instrutor inválido/erro do backend é refletido via toast (frontendErrorMessage)
 * 7. Botão Aprovar desabilitado quando resource_assignment.complete === false
 * 8. Nenhuma regra de elegibilidade duplicada no frontend (sem is_instrutor local)
 */

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

const src = readFileSync(
  'src/react-app/pages/simuladores/planejamento/PlanejamentoSimuladores.tsx',
  'utf-8',
);

describe('PlanejamentoSimuladores resource assignment — caracterização de contrato', () => {
  it('carrega candidatos via GET /:id/recursos/candidatos', () => {
    expect(src).toMatch(/\/api\/simuladores\/planejamento\/\$\{id\}\/recursos\/candidatos/);
  });

  it('candidatos são carregados sob demanda (loadResourceCandidates), não automaticamente em load()', () => {
    const loadFnIdx = src.indexOf('const load = useCallback');
    const loadResourceIdx = src.indexOf('const loadResourceCandidates');
    expect(loadFnIdx).toBeGreaterThan(-1);
    expect(loadResourceIdx).toBeGreaterThan(-1);
    const loadBody = src.slice(loadFnIdx, loadResourceIdx > loadFnIdx ? loadResourceIdx : loadFnIdx + 2000);
    expect(loadBody).not.toMatch(/recursos\/candidatos/);
  });

  it('atribuição de recurso usa POST /:id/recursos com method POST', () => {
    expect(src).toMatch(/\/api\/simuladores\/planejamento\/\$\{id\}\/recursos`/);
    const idx = src.indexOf('handleAssignResource');
    const body = src.slice(idx, idx + 800);
    expect(body).toMatch(/method:\s*['"]POST['"]/);
    expect(body).toMatch(/\[field\]:\s*value/);
  });

  it('simulador RESOLVED não renderiza <select> — apenas confirmação textual', () => {
    const idx = src.indexOf("simRes.status === 'RESOLVED'");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).not.toMatch(/<select/);
    expect(block).toMatch(/Resolvido automaticamente/);
  });

  it('simulador NEEDS_ASSIGNMENT mostra aviso sem opções inventadas', () => {
    const idx = src.indexOf("simRes.status === 'NEEDS_ASSIGNMENT'");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).not.toMatch(/<select/);
    expect(block).toMatch(/Nenhum simulador compatível/);
  });

  it('simulador AMBIGUOUS mapeia exatamente simRes.candidates — sem lista paralela', () => {
    const idx = src.indexOf("simRes.status === 'AMBIGUOUS'");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/simRes\.candidates\.map/);
  });

  it('instrutor usa exatamente instructors (eligible_instructors do backend) — sem filtro local por is_instrutor', () => {
    expect(src).not.toMatch(/is_instrutor/);
    const idx = src.indexOf('Instrutor / Examinador');
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/instructors\.map/);
  });

  it('erros de atribuição de recurso são refletidos via frontendErrorMessage/showToast', () => {
    const idx = src.indexOf('const handleAssignResource');
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/showToast\.error\(frontendErrorMessage\(error\)\)/);
  });

  it('botão Aprovar é desabilitado quando resource_assignment.complete === false', () => {
    const idx = src.indexOf("item.planejamento_aprovacao_status === 'PENDENTE'");
    const block = src.slice(idx, idx + 1400);
    expect(block).toMatch(/resource_assignment\.complete/);
    expect(block).toMatch(/disabled=\{[\s\S]*resource_assignment/);
  });

  it('mensagem clara é exibida ao usuário quando recursos estão incompletos', () => {
    expect(src).toMatch(/Defina o simulador e o instrutor\/examinador antes da aprovação\./);
  });

  it('atribuição salva dispara reload da lista (load()) para refletir estado atualizado', () => {
    const idx = src.indexOf('const handleAssignResource');
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/await load\(\)/);
  });
});
