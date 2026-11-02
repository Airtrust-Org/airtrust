/** Resultado de validação de linhas de importação (planilhas). Reexportado por components/shared/ImportValidator. */

export interface ValidationResult {
  linha: number;
  tipo: 'erro' | 'aviso' | 'sucesso';
  campo: string;
  mensagem: string;
  valorOriginal: any;
  valorSugerido?: any;
}
