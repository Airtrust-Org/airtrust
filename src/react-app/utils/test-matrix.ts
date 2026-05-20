/**
 * Fase 8: Test Matrix - Validar todos os 7 módulos
 * Verifica se cada módulo está trazendo dados corretamente
 */

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

export interface ModuleTest {
  module: string;
  endpoint: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
  count: number;
  responseTime: number;
  error?: string;
  sampleData?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Testar módulo genérico
 */
async function testModule(moduleName: string, endpoint: string): Promise<ModuleTest> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    console.log(`🧪 Testando módulo: ${moduleName}...`);

    const response = await fetch(`${API_BASE_URL}${endpoint}?limit=1000`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken() || 'test'}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    const responseTime = Math.round(performance.now() - startTime);

    if (!result.success) {
      throw new Error(result.error || 'API retornou success: false');
    }

    const data = Array.isArray(result.data) ? result.data : [result.data];
    const count = data.length;

    return {
      module: moduleName,
      endpoint,
      status: count > 0 ? 'PASS' : 'FAIL',
      count,
      responseTime,
      sampleData: data[0],
      timestamp,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    const responseTime = Math.round(performance.now() - startTime);

    return {
      module: moduleName,
      endpoint,
      status: 'FAIL',
      count: 0,
      responseTime,
      error,
      timestamp,
    };
  }
}

/**
 * ⚡ EXECUTAR TESTE EM TODOS OS 7 MÓDULOS
 */
export async function runTestMatrix(): Promise<ModuleTest[]> {
  console.log('🧪 Iniciando Test Matrix para todos os módulos...\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const tests: ModuleTest[] = [];

  // Os 7 módulos principais (baseado na auditoria)
  const modules = [
    { name: '1️⃣  Funcionários', endpoint: '/funcionarios' },
    { name: '2️⃣  Habilitações', endpoint: '/habilitacoes' },
    { name: '3️⃣  Qualificações', endpoint: '/qualificacoes' },
    { name: '4️⃣  Certificados', endpoint: '/certificados' },
    { name: '5️⃣  Sessões (Simuladores)', endpoint: '/simuladores/sessoes' },
    { name: '6️⃣  Manobras', endpoint: '/manobras' },
    { name: '7️⃣  Compliance', endpoint: '/compliance/dashboard' },
  ];

  // Testar cada módulo
  for (const module of modules) {
    const result = await testModule(module.name, module.endpoint);
    tests.push(result);

    // Log imediato
    const statusEmoji = result.status === 'PASS' ? '✅' : '❌';
    console.log(
      `${statusEmoji} ${result.module} | ${result.count} itens | ${result.responseTime}ms ${
        result.error ? `| ⚠️ ${result.error}` : ''
      }`,
    );
  }

  console.log('\n═══════════════════════════════════════════════════════\n');

  // Resumo
  const passed = tests.filter((t) => t.status === 'PASS').length;
  const failed = tests.filter((t) => t.status === 'FAIL').length;
  const totalItems = tests.reduce((sum, t) => sum + t.count, 0);
  const avgResponseTime = Math.round(
    tests.reduce((sum, t) => sum + t.responseTime, 0) / tests.length,
  );

  console.log('📊 RESUMO DO TEST MATRIX:');
  console.log(`   • Módulos passou: ${passed}/7`);
  console.log(`   • Módulos falharam: ${failed}/7`);
  console.log(`   • Total de itens: ${totalItems}`);
  console.log(`   • Response time médio: ${avgResponseTime}ms\n`);

  if (passed === 7) {
    console.log('🎉 TODOS OS MÓDULOS PASSARAM! Sistema está 100% funcional.');
  } else if (passed >= 5) {
    console.log(`⚠️  ${failed} módulo(s) falhando. Investigar acima.`);
  } else {
    console.log('🔴 MÚLTIPLAS FALHAS. Sistema degradado. Verificar logs.');
  }

  return tests;
}

/**
 * Gerar relatório em Markdown
 */
export function generateTestMatrixReport(tests: ModuleTest[]): string {
  const timestamp = new Date().toISOString();
  const passed = tests.filter((t) => t.status === 'PASS').length;
  const failed = tests.filter((t) => t.status === 'FAIL').length;

  let report = `# 📊 Test Matrix Report
Generated: ${timestamp}

## Summary
- ✅ Passed: ${passed}/7
- ❌ Failed: ${failed}/7
- Status: ${passed === 7 ? '🟢 HEALTHY' : passed >= 5 ? '🟡 DEGRADED' : '🔴 CRITICAL'}

## Results

| Module | Status | Count | Response Time | Notes |
|--------|--------|-------|---------------|-------|
`;

  for (const test of tests) {
    const statusIcon = test.status === 'PASS' ? '✅' : '❌';
    report += `| ${test.module} | ${statusIcon} | ${test.count} | ${test.responseTime}ms | ${
      test.error || '—'
    } |\n`;
  }

  report += `

## Details

`;

  for (const test of tests) {
    report += `### ${test.module}
- **Endpoint**: \`${test.endpoint}\`
- **Status**: ${test.status}
- **Items Count**: ${test.count}
- **Response Time**: ${test.responseTime}ms
- **Timestamp**: ${test.timestamp}
${test.error ? `- **Error**: ${test.error}\n` : ''}
`;
  }

  return report;
}

/**
 * Salvar relatório em localStorage
 */
export function saveTestMatrixReport(tests: ModuleTest[]): void {
  const report = {
    timestamp: new Date().toISOString(),
    tests,
    passed: tests.filter((t) => t.status === 'PASS').length,
    failed: tests.filter((t) => t.status === 'FAIL').length,
  };

  localStorage.setItem('test-matrix-latest', JSON.stringify(report));
  console.log('📁 Relatório salvo em localStorage');
}

/**
 * Recuperar último relatório
 */
export function getLastTestMatrixReport():
  | typeof undefined
  | { timestamp: string; tests: ModuleTest[]; passed: number; failed: number } {
  const stored = localStorage.getItem('test-matrix-latest');
  if (!stored) return undefined;

  try {
    return JSON.parse(stored);
  } catch {
    return undefined;
  }
}
