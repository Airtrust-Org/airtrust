import { resolveHistoricoReadExpiry } from './historico-helpers';
import { isCmaCode, resolveCmaValidity } from '../../utils/cma-validity';

export type QualificationExportExpiryInput = {
  validadeMeses: string | number | null;
  dataVencimentoPersistida: string | null;
  dataRealizacao: string | null;
  codigoQualificacao: string | null;
  nascimentoFuncionario: string | null;
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
  if (isCmaCode(codigo) && input.dataRealizacao) {
    // CMA: validade por idade na data de realizacao (12 meses; 6 a partir dos 60 anos).
    validadeMeses = resolveCmaValidity({
      dataRealizacao: input.dataRealizacao,
      dataNascimento: input.nascimentoFuncionario,
    }).months;
  }

  return {
    validadeMeses,
    dataVencimento: resolveHistoricoReadExpiry({
      dataVencimento: input.dataVencimentoPersistida,
      dataConclusao: input.dataRealizacao,
      validadeMeses,
      codigoQualificacao: codigo,
    }),
  };
}
