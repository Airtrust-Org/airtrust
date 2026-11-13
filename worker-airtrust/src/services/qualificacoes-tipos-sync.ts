import { tryAddCalendarMonthsClamped } from '../../../src/shared/utils/validade-meses';
import { isCmaCode, resolveCmaValidity } from '../utils/cma-validity';
type TipoTreinamento = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

export type QualificacaoTipoSnapshot = {
  codigo: string | null;
  nome: string | null;
  categoria: string | null;
  validade: number | null;
  cargaHoraria: number | null;
  cargaHorariaInicial: number | null;
  cargaHorariaRecorrente: number | null;
};

export type QualificacaoHistoricoSyncInput = {
  dataConclusao: string | null;
  dataVencimentoAtual: string | null;
  tipoTreinamento: string | null;
  nascimentoFuncionario: string | null;
};

export type QualificacaoHistoricoSyncPayload = {
  qualificacaoCodigo: string | null;
  tipo: string | null;
  categoria: string | null;
  validadeMeses: number | null;
  dataVencimento: string | null;
  cargaHoraria: number | null;
};

function normalizeTipoTreinamento(value?: string | null): TipoTreinamento | null {
  const raw = String(value || '')
    .trim()
    .toUpperCase();

  if (!raw) return null;
  if (raw === 'SEMESTRAL') return 'SEMESTRAL';
  if (raw === 'PERIODICO' || raw === 'PERIODICO') return 'RECORRENTE';
  if (raw === 'RECORRENTE') return 'RECORRENTE';
  if (raw === 'INICIAL') return 'INICIAL';
  if (raw === 'UPGRADE') return 'UPGRADE';
  if (raw === 'ESPECIFICO' || raw === 'ESPECIFICO') return 'ESPECIFICO';
  return null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function calcularDataVencimentoSnapshot(dataConclusao: string, validadeMeses: number): string | null {
  return tryAddCalendarMonthsClamped(dataConclusao, validadeMeses);
}

export function resolveHistoricoValidadeMeses(
  tipo: QualificacaoTipoSnapshot,
  historico: QualificacaoHistoricoSyncInput,
): number | null {
  // CMA: validade por idade (12 meses; 6 a partir dos 60 anos) — fonte única.
  if (isCmaCode(tipo.codigo)) {
    return resolveCmaValidity({
      dataRealizacao: historico.dataConclusao,
      dataNascimento: historico.nascimentoFuncionario,
    }).months;
  }

  return toPositiveNumber(tipo.validade);
}

export function resolveHistoricoCargaHoraria(
  tipo: QualificacaoTipoSnapshot,
  historico: QualificacaoHistoricoSyncInput,
): number | null {
  const cargaInicial = toPositiveNumber(tipo.cargaHorariaInicial);
  const cargaRecorrente = toPositiveNumber(tipo.cargaHorariaRecorrente);
  const cargaPadrao = toPositiveNumber(tipo.cargaHoraria);
  const tipoTreinamento = normalizeTipoTreinamento(historico.tipoTreinamento);

  if (tipoTreinamento === 'RECORRENTE' || tipoTreinamento === 'SEMESTRAL') {
    return cargaRecorrente || cargaInicial || cargaPadrao;
  }

  if (tipoTreinamento === 'INICIAL') {
    return cargaInicial || cargaRecorrente || cargaPadrao;
  }

  return cargaInicial || cargaRecorrente || cargaPadrao;
}

export function resolveHistoricoDataVencimento(
  tipo: QualificacaoTipoSnapshot,
  historico: QualificacaoHistoricoSyncInput,
  validadeMeses: number | null,
): string | null {
  const dataConclusao = String(historico.dataConclusao || '').trim();

  if (!dataConclusao) {
    return historico.dataVencimentoAtual || null;
  }

  if (!validadeMeses) {
    return null;
  }

  try {
    return calcularDataVencimentoSnapshot(dataConclusao, validadeMeses);
  } catch {
    return historico.dataVencimentoAtual || null;
  }
}

export function buildHistoricoTipoSnapshot(
  tipo: QualificacaoTipoSnapshot,
  historico: QualificacaoHistoricoSyncInput,
): QualificacaoHistoricoSyncPayload {
  const validadeMeses = resolveHistoricoValidadeMeses(tipo, historico);

  return {
    qualificacaoCodigo: String(tipo.codigo || '').trim() || null,
    tipo: String(tipo.nome || '').trim() || null,
    categoria: String(tipo.categoria || '').trim() || null,
    validadeMeses,
    dataVencimento: resolveHistoricoDataVencimento(tipo, historico, validadeMeses),
    cargaHoraria: resolveHistoricoCargaHoraria(tipo, historico),
  };
}

export function shouldSyncHistoricoSnapshotsOnTipoUpdate(data: Record<string, unknown>): boolean {
  return [
    'nome',
    'codigo',
    'categoria',
    'validade',
    'carga_horaria_inicial',
    'carga_horaria_recorrente',
  ].some((field) => Object.prototype.hasOwnProperty.call(data, field));
}
