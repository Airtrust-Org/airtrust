import { resolveHistoricoReadExpiry } from './historico-helpers';

export type QualificationExportExpiryInput = {
  validadeMeses: string | number | null;
  dataVencimentoPersistida: string | null;
  dataRealizacao: string | null;
  codigoQualificacao: string | null;
  nascimentoFuncionario: string | null;
  vencimentoFimMes: string | number | null;
};

/**
 * A exportação deve exibir o mesmo vencimento que o Histórico canônico.
 * Não inventar uma validade padrão quando o modelo não informa periodicidade.
 */
export function resolveQualificationExportExpiry(input: QualificationExportExpiryInput): {
  validadeMeses: number | null;
  dataVencimento: string | null;
} {
  const validadeNumerica =
    input.validadeMeses === null ? null : Number(input.validadeMeses);
  let validadeMeses =
    validadeNumerica !== null && Number.isFinite(validadeNumerica) && validadeNumerica > 0
      ? validadeNumerica
      : null;

  const codigo = String(input.codigoQualificacao || '').trim().toUpperCase();
  if (codigo === 'CMA' && input.nascimentoFuncionario && input.dataRealizacao) {
    const nascimento = new Date(`${input.nascimentoFuncionario}T00:00:00Z`);
    const realizacao = new Date(`${input.dataRealizacao}T00:00:00Z`);
    if (!Number.isNaN(nascimento.getTime()) && !Number.isNaN(realizacao.getTime())) {
      const aniversario60 = new Date(nascimento);
      aniversario60.setUTCFullYear(aniversario60.getUTCFullYear() + 60);
      if (aniversario60 <= realizacao) validadeMeses = 6;
    }
  }

  return {
    validadeMeses,
    dataVencimento: resolveHistoricoReadExpiry({
      dataVencimento: input.dataVencimentoPersistida,
      dataConclusao: input.dataRealizacao,
      validadeMeses,
      vencimentoFimMes: Number(input.vencimentoFimMes || 0) === 1 ? 1 : 0,
      codigoQualificacao: codigo,
    }),
  };
}
