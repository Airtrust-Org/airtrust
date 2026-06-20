export function isValidQuinzenaRange(dataInicio?: string | null, dataFim?: string | null): boolean {
  if (!dataInicio || !dataFim) return false;
  return dataFim > dataInicio;
}
