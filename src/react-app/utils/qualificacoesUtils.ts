/**
 * Utilitários compartilhados para o módulo de Qualificações
 */

import { API_BASE_URL } from '@/react-app/config/api';

export { API_BASE_URL };

/**
 * Calcula dias restantes até uma data
 */
export function diasRestantes(data: string | null | undefined): number {
  if (!data) return 999;
  const diff = new Date(data).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Retorna status baseado nos dias restantes
 */
export function getStatus(
  dataValidade: string | null | undefined,
): 'VALIDO' | 'VENCENDO' | 'VENCIDO' {
  const dias = diasRestantes(dataValidade);
  if (dias < 0) return 'VENCIDO';
  if (dias <= 30) return 'VENCENDO';
  return 'VALIDO';
}

/**
 * Retorna classe CSS para badge de status
 */
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'VENCIDO':
      return 'bg-red-100 text-red-800';
    case 'VENCENDO':
      return 'bg-yellow-100 text-yellow-800';
    case 'VALIDO':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Formata data para exibição
 */
export function formatarData(data: string | null | undefined): string {
  if (!data) return '-';
  try {
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}

/**
 * Faz requisição à API com tratamento de erros
 */
export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`Erro ao buscar ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Interface para Qualificação
 */
export interface Qualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  tipo?: 'TREINAMENTO' | 'CHECK' | 'EXAME';
  categoria: string;
  descricao?: string;
  instituicao?: string;
  instrutor?: string;
  carga_horaria?: number;
  numero?: string;
  data_emissao?: string;
  data_conclusao?: string;
  data_vencimento: string;
  status_calculado?: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
  dias_restantes?: number;
  observacoes?: string;
  arquivo_url?: string;
}

/**
 * Interface para resposta da API
 */
export interface QualificacoesResponse {
  success: boolean;
  qualificacoes: Qualificacao[];
  total?: number;
}
