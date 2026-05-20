type TipoTreinamento = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

export type QualificacaoTipoSnapshot = {
  codigo: string | null;
  nome: string | null;
  categoria: string | null;
  validade: number | null;
  vencimentoFimMes: number | null;
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

function isFuncionarioComMaisDe60AnosNaConclusao(
  dataConclusao?: string | null,
  nascimentoFuncionario?: string | null,
): boolean {
  const dataConclusaoNormalizada = String(dataConclusao || '').trim();
  const nascimentoNormalizado = String(nascimentoFuncionario || '').trim();

  if (!dataConclusaoNormalizada || !nascimentoNormalizado) return false;

  const dataConclusaoRef = new Date(`${dataConclusaoNormalizada}T00:00:00Z`);
  const nascimentoRef = new Date(`${nascimentoNormalizado}T00:00:00Z`);

  if (Number.isNaN(dataConclusaoRef.getTime()) || Number.isNaN(nascimentoRef.getTime())) {
    return false;
  }

  const aniversario60 = new Date(nascimentoRef);
  aniversario60.setUTCFullYear(aniversario60.getUTCFullYear() + 60);
  return aniversario60 <= dataConclusaoRef;
}

function calcularDataVencimentoSnapshot(
  dataConclusao: string,
  validadeMeses: number,
  vencimentoFimMes: number | null,
): string | null {
  const dataBase = new Date(`${dataConclusao}T00:00:00Z`);

  if (Number.isNaN(dataBase.getTime()) || validadeMeses <= 0) {
    return null;
  }

  if (Number(vencimentoFimMes || 0) === 1) {
    const year = dataBase.getUTCFullYear();
    const month = dataBase.getUTCMonth();
    const endOfMonth = new Date(Date.UTC(year, month + validadeMeses + 1, 0));
    return endOfMonth.toISOString().slice(0, 10);
  }

  dataBase.setUTCMonth(dataBase.getUTCMonth() + validadeMeses);
  return dataBase.toISOString().slice(0, 10);
}

export function resolveHistoricoValidadeMeses(
  tipo: QualificacaoTipoSnapshot,
  historico: QualificacaoHistoricoSyncInput,
): number | null {
  const codigo = String(tipo.codigo || '')
    .trim()
    .toUpperCase();

  if (
    codigo === 'CMA' &&
    isFuncionarioComMaisDe60AnosNaConclusao(
      historico.dataConclusao,
      historico.nascimentoFuncionario,
    )
  ) {
    return 6;
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
    return calcularDataVencimentoSnapshot(dataConclusao, validadeMeses, tipo.vencimentoFimMes);
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
    'vencimento_fim_mes',
    'carga_horaria_inicial',
    'carga_horaria_recorrente',
  ].some((field) => Object.prototype.hasOwnProperty.call(data, field));
}
