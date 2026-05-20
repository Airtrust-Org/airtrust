/**
 * Fase 7: End-to-End Test
 * Criar dados de teste → Verificar no DB → Fetch via API → Validar no Frontend
 */

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

function getAuthHeaderToken(): string {
  return getAccessToken() || 'test';
}

export interface E2ETestResult {
  phase: string;
  success: boolean;
  timestamp: string;
  data?: Record<string, unknown>;
  error?: string;
  responseTime?: number;
  details: string;
}

/**
 * Criar qualificação de teste
 */
export async function createTestQualificacao(): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const testData = {
      nome: `TEST-QUAL-${Date.now()}`,
      codigo: `TQ${Math.random().toString(36).substring(7).toUpperCase()}`,
      categoria: 'TEST',
      validade_meses: 12,
      ativo: true,
      descricao: 'Dados de teste para diagnóstico - será deletado',
    };

    const response = await fetch(`${API_BASE_URL}/qualificacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
      body: JSON.stringify(testData),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const responseTime = Math.round(performance.now() - startTime);

    return {
      phase: 'CREATE_QUALIFICACAO',
      success: result.success && !!result.data?.id,
      timestamp,
      data: result.data,
      responseTime,
      details: `✅ Qualificação criada: ${result.data?.id}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'CREATE_QUALIFICACAO',
      success: false,
      timestamp,
      error,
      details: `❌ Erro ao criar: ${error}`,
    };
  }
}

/**
 * Buscar qualificação via API
 */
export async function fetchTestQualificacao(
  qualificacaoId: string | number,
): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${API_BASE_URL}/qualificacoes/${qualificacaoId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const responseTime = Math.round(performance.now() - startTime);

    return {
      phase: 'FETCH_QUALIFICACAO',
      success: result.success && !!result.data?.id,
      timestamp,
      data: result.data,
      responseTime,
      details: `✅ Qualificação encontrada: ${result.data?.nome}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'FETCH_QUALIFICACAO',
      success: false,
      timestamp,
      error,
      details: `❌ Erro ao buscar: ${error}`,
    };
  }
}

/**
 * Listar qualificações e validar que a de teste aparece
 */
export async function validateTestQualificacaoInList(
  testQualificacaoId: string | number,
): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${API_BASE_URL}/qualificacoes?limit=1000`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    const responseTime = Math.round(performance.now() - startTime);

    const qualList = result.data || [];
    const found = qualList.some((q: Record<string, unknown>) => q.id === testQualificacaoId);

    return {
      phase: 'VALIDATE_IN_LIST',
      success: found,
      timestamp,
      data: { total: qualList.length, found },
      responseTime,
      details: found
        ? `✅ Qualificação de teste encontrada na lista`
        : `❌ Qualificação de teste NÃO encontrada (${qualList.length} itens)`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'VALIDATE_IN_LIST',
      success: false,
      timestamp,
      error,
      details: `❌ Erro ao validar lista: ${error}`,
    };
  }
}

/**
 * Deletar qualificação de teste (cleanup)
 */
export async function deleteTestQualificacao(
  qualificacaoId: string | number,
): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${API_BASE_URL}/qualificacoes/${qualificacaoId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const responseTime = Math.round(performance.now() - startTime);

    return {
      phase: 'DELETE_QUALIFICACAO',
      success: true,
      timestamp,
      responseTime,
      details: `✅ Qualificação de teste deletada`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'DELETE_QUALIFICACAO',
      success: false,
      timestamp,
      error,
      details: `⚠️  Erro ao deletar (mas tá ok): ${error}`,
    };
  }
}

/**
 * ⚡ EXECUTAR TESTE END-TO-END COMPLETO
 */
export async function runFullE2ETest(): Promise<E2ETestResult[]> {
  console.log('🧪 Iniciando teste end-to-end completo...\n');

  const results: E2ETestResult[] = [];
  let testQualificacaoId: string | number | null = null;

  // Fase 1: Criar
  console.log('📝 Fase 1: Criar qualificação de teste...');
  const createResult = await createTestQualificacao();
  results.push(createResult);
  if (createResult.success && createResult.data?.id) {
    testQualificacaoId = createResult.data.id;
    console.log(`✅ ${createResult.details}\n`);
  } else {
    console.log(`❌ ${createResult.details}\n`);
    return results; // Parar aqui se falhar
  }

  // Fase 2: Buscar
  if (testQualificacaoId) {
    console.log('🔍 Fase 2: Buscar qualificação via API...');
    const fetchResult = await fetchTestQualificacao(testQualificacaoId);
    results.push(fetchResult);
    console.log(`${fetchResult.success ? '✅' : '❌'} ${fetchResult.details}\n`);
  }

  // Fase 3: Validar na lista
  if (testQualificacaoId) {
    console.log('📋 Fase 3: Validar na lista de qualificações...');
    const validateResult = await validateTestQualificacaoInList(testQualificacaoId);
    results.push(validateResult);
    console.log(`${validateResult.success ? '✅' : '❌'} ${validateResult.details}\n`);
  }

  // Fase 4: Deletar (cleanup)
  if (testQualificacaoId) {
    console.log('🗑️  Fase 4: Cleanup - deletar qualificação de teste...');
    const deleteResult = await deleteTestQualificacao(testQualificacaoId);
    results.push(deleteResult);
    console.log(`${deleteResult.success ? '✅' : '⚠️'} ${deleteResult.details}\n`);
  }

  // Resumo
  const passed = results.filter((r) => r.success).length;
  const total = results.length;
  console.log(`\n📊 RESULTADO FINAL: ${passed}/${total} testes passaram`);

  if (passed === total) {
    console.log('🎉 TODOS OS TESTES PASSARAM! Sistema funcionando corretamente.');
  } else {
    console.log('⚠️  Alguns testes falharam. Verifique os logs acima.');
  }

  return results;
}

/**
 * Log dos resultados de teste
 */
export function logE2EResults(results: E2ETestResult[]): void {
  console.table(
    results.map((r) => ({
      phase: r.phase,
      success: r.success ? '✅' : '❌',
      time: `${r.responseTime}ms`,
      details: r.details,
    })),
  );
}
