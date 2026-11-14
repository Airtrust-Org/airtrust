/**
 * Uma consulta de conflitos em erro, com dado antigo em cache ou em refetch
 * NÃO pode ser representada como "Sem conflitos". Conserva o total conhecido
 * apenas para diagnóstico, mas exige estado verificado explícito para publicar.
 */
interface ConflictsView {
  conflitos_eventos: unknown[];
  conflitos_tripulacoes: unknown[];
  restricoes_violadas: unknown[];
  violacoes_compliance: unknown[];
}

export function deriveConflictVerification(input: {
  hasEscala: boolean;
  data: ConflictsView | null;
  error: string | null;
  loading: boolean;
  isFetching: boolean;
  isSuccess: boolean;
}) {
  const { hasEscala, data, error, loading, isFetching, isSuccess } = input;
  return {
    verificado: Boolean(hasEscala && isSuccess && !loading && !isFetching && !error && data),
    total: data
      ? data.conflitos_eventos.length +
        data.conflitos_tripulacoes.length +
        data.restricoes_violadas.length +
        data.violacoes_compliance.length
      : 0,
  };
}
