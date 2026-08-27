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

// Re-export funções individuais para compatibilidade
export async function listarFuncionariosAtivos(limit = 1000) {
  const response = await qualificacoesService.lookups.funcionariosAtivos(limit);
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function listarTiposQualificacao(limit = 1000, categoriaId?: number | null) {
  const response = await qualificacoesService.lookups.tiposQualificacao(limit, categoriaId);
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function listarHistoricoQualificacoes(filtros: any = {}) {
  const response = await qualificacoesService.historico.listar(filtros);
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function criarHistoricoQualificacao(input: any) {
  const response = await qualificacoesService.historico.criar(input);
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function atualizarHistoricoQualificacao(id: number, input: any) {
  const response = await qualificacoesService.historico.atualizar(id, input);
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function deletarHistoricoQualificacao(id: number) {
  const response = await qualificacoesService.historico.deletar(id);
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function renovarHistoricoQualificacao(id: number, novaDataVencimento: string) {
  const response = await qualificacoesService.historico.renovar(id, novaDataVencimento);
  if (!response.success) throw new Error(response.error);
  return response.data;
}
