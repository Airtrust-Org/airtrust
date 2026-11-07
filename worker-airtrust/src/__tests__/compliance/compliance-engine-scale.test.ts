/**
 * Auditoria de Compliance (2ª rodada) — comportamento de escala do motor puro (sem banco).
 *
 * A rodada anterior deixou "desempenho" sem medição. Aqui o cálculo que roda a cada leitura do
 * painel (`buildSnapshot`: resolução de regras por funcionário + `computeRequirement` por
 * requisito) e as varreduras novas de `/resumo` (#1945: `ruleApplies` por pessoa × regra) são
 * medidos com dados sintéticos. O teste vale como guarda de regressão de complexidade: o tempo
 * deve crescer ~linearmente com o número de funcionários (nunca quadraticamente) e ficar bem
 * abaixo do orçamento de CPU de uma requisição do Worker.
 */
import { describe, expect, it } from 'vitest';
import {
  computeRequirement,
  resolvedRules,
  ruleApplies,
} from '../../services/training-compliance-snapshot-builder';

type AnyRule = Parameters<typeof computeRequirement>[0];
type AnyEmployee = Parameters<typeof resolvedRules>[1];

function makeRules(count: number, setores: number, funcoes: number): AnyRule[] {
  const rules: AnyRule[] = [];
  for (let i = 1; i <= count; i += 1) {
    const kind = i % 4;
    rules.push({
      id: i,
      escopo: kind === 0 ? 'EMPRESA' : kind === 1 ? 'SETOR' : kind === 2 ? 'FUNCAO' : 'SETOR_FUNCAO',
      setor_id: (i % setores) + 1,
      funcao_id: (i % funcoes) + 1,
      funcionario_id: null,
      qualificacao_tipo_id: (i % 120) + 1,
      obrigatoriedade: i % 9 === 0 ? 'RECOMENDADA' : 'OBRIGATORIA',
      validade_meses: 12,
      condicao_id: null,
      aeronave_modelo: null,
      perfil_competencia: null,
      modalidade_requerida: null,
    } as unknown as AnyRule);
  }
  return rules;
}

function makeEmployees(count: number, setores: number, funcoes: number): AnyEmployee[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    setor_id: (i % setores) + 1,
    funcao_id: (i % funcoes) + 1,
    condicoes_ids: [],
    aeronaves_modelos: [],
  })) as unknown as AnyEmployee[];
}

const evidence = (employeeId: number) => [
  {
    qualificacao_historico_id: employeeId,
    tipo_id: 1,
    data_realizacao: '2026-03-01',
    data_vencimento: '2027-03-01',
    modalidade: 'PRESENCIAL',
  },
];

function snapshotPass(employees: AnyEmployee[], rules: AnyRule[]) {
  const options = { today: '2026-11-04', realizedCutoff: '2026-11-04' };
  let requirements = 0;
  for (const employee of employees) {
    const resolved = resolvedRules(rules, employee);
    for (const rule of resolved) {
      if (rule.obrigatoriedade === 'NAO_APLICA') continue;
      computeRequirement(rule, evidence(Number(employee.id)) as never, undefined, options);
      requirements += 1;
    }
  }
  return requirements;
}

/** Varredura acrescentada em /resumo pela #1945: 2 × pessoas × regras com `.some(ruleApplies)`. */
function resumoCoveragePass(employees: AnyEmployee[], rules: AnyRule[]) {
  let semEspecifica = 0;
  for (const person of employees) {
    const funcao = rules.some(
      (r) => (r.escopo === 'FUNCAO' || r.escopo === 'SETOR_FUNCAO') && ruleApplies(r, person),
    );
    const setor = rules.some(
      (r) => (r.escopo === 'SETOR' || r.escopo === 'SETOR_FUNCAO') && ruleApplies(r, person),
    );
    if (!funcao) semEspecifica += 1;
    if (!setor) semEspecifica += 1;
  }
  return semEspecifica;
}

function timed<T>(fn: () => T): { ms: number; value: T } {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
}

describe('escala do motor de compliance (dados sintéticos, sem banco)', () => {
  const rules = makeRules(400, 25, 60);

  it('snapshot: 4.000 funcionários × 400 regras cabe com folga no orçamento da requisição', () => {
    const employees = makeEmployees(4000, 25, 60);
    snapshotPass(employees.slice(0, 200), rules); // aquecimento
    const { ms, value } = timed(() => snapshotPass(employees, rules));
    console.info(`[escala] snapshot 4000x400: ${ms.toFixed(0)} ms, ${value} requisitos calculados`);
    expect(value).toBeGreaterThan(40_000);
    expect(ms).toBeLessThan(5_000);
  });

  it('snapshot: crescimento linear — dobrar funcionários não quadruplica o tempo', () => {
    const small = makeEmployees(1500, 25, 60);
    const large = makeEmployees(3000, 25, 60);
    snapshotPass(small.slice(0, 200), rules);
    const a = timed(() => snapshotPass(small, rules)).ms;
    const b = timed(() => snapshotPass(large, rules)).ms;
    console.info(`[escala] 1500 func: ${a.toFixed(0)} ms; 3000 func: ${b.toFixed(0)} ms; razão ${(b / a).toFixed(2)}`);
    expect(b / Math.max(a, 1)).toBeLessThan(3.2);
  });

  it('/resumo (#1945): varredura de cobertura específica por pessoa × regra é linear e barata', () => {
    const employees = makeEmployees(4000, 25, 60);
    const { ms } = timed(() => resumoCoveragePass(employees, rules));
    console.info(`[escala] /resumo cobertura 4000x400: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2_000);
  });

  it('resolução de regras é determinística: mesma entrada, mesma saída em passagens repetidas', () => {
    const employees = makeEmployees(300, 25, 60);
    const first = employees.map((e) => resolvedRules(rules, e).map((r) => r.id).join(','));
    const second = employees.map((e) => resolvedRules(rules, e).map((r) => r.id).join(','));
    expect(second).toEqual(first);
  });
});
