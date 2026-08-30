/**
 * Qualificações Service - Compatibilidade retroativa
 *
 * @deprecated Use qualificacoesService from './qualificacoes' para novos códigos
 * Este arquivo mantém compatibilidade com código existente
 */

export type {
  FuncionarioResumo,
  TipoQualificacaoResumo,
  HistoricoQualificacao,
  HistoricoFiltros,
  HistoricoQualificacaoInput,
} from './qualificacoes';

import qualificacoesService from './qualificacoes';
import { safeVisibleToastText } from '@/react-app/utils/toast';

export function safeQualificacoesServiceError(
  error: unknown,
  fallback = 'Não foi possível concluir a operação de qualificações.',
): string {
  const detail =
    typeof error === 'string' ? error : error instanceof Error ? error.message : undefined;
  return safeVisibleToastText(detail, fallback) ?? fallback;
}

function failWithSafeMessage(error: unknown, fallback: string): never {
  console.error('[Qualificações service] Falha na operação', error);
  throw new Error(safeQualificacoesServiceError(error, fallback));
}

// Re-export funções individuais para compatibilidade
export async function listarFuncionariosAtivos(limit = 1000) {
  const response = await qualificacoesService.lookups.funcionariosAtivos(limit);
  if (!response.success) {
    failWithSafeMessage(response.error, 'Não foi possível carregar os funcionários.');
  }
  return response.data;
}

export async function listarTiposQualificacao(limit = 1000, categoriaId?: number | null) {
  const response = await qualificacoesService.lookups.tiposQualificacao(limit, categoriaId);
  if (!response.success) {
    failWithSafeMessage(response.error, 'Não foi possível carregar os tipos de qualificação.');
  }
  return response.data;
}

export async function listarHistoricoQualificacoes(filtros: any = {}) {
  const response = await qualificacoesService.historico.listar(filtros);
  if (!response.success) {
    failWithSafeMessage(response.error, 'Não foi possível carregar o histórico de qualificações.');
  }
  return response.data;
}

export async function criarHistoricoQualificacao(input: any) {
  const response = await qualificacoesService.historico.criar(input);
  if (!response.success) {
    failWithSafeMessage(response.error, 'Não foi possível salvar a qualificação. Tente novamente.');
  }
  return response.data;
}

export async function atualizarHistoricoQualificacao(id: number, input: any) {
  const response = await qualificacoesService.historico.atualizar(id, input);
  if (!response.success) {
    failWithSafeMessage(response.error, 'Não foi possível salvar a qualificação. Tente novamente.');
  }
  return response.data;
}

export async function deletarHistoricoQualificacao(id: number) {
  const response = await qualificacoesService.historico.deletar(id);
  if (!response.success) {
    failWithSafeMessage(response.error, 'Não foi possível excluir a qualificação. Tente novamente.');
  }
  return response.data;
}

export async function renovarHistoricoQualificacao(id: number, novaDataVencimento: string) {
  const response = await qualificacoesService.historico.renovar(id, novaDataVencimento);
  if (!response.success) {
    failWithSafeMessage(response.error, 'Não foi possível renovar a qualificação. Tente novamente.');
  }
  return response.data;
}
