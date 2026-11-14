export const GUIAS_PROGRAMAS = [
  'INICIAL',
  'TRANSICAO',
  'PERIODICO',
  'SEMESTRAL',
  'REQUALIFICACAO',
  'RECENTE',
  'NOTURNO',
  'CHECK',
  'INSTRUTOR',
  'EXAMINADOR',
] as const;

export type GuiaPrograma = (typeof GUIAS_PROGRAMAS)[number];

export const PROGRAMAS_FUNCIONAIS = new Set<string>(['INSTRUTOR', 'EXAMINADOR']);

export const FUNCIONAL_AERONAVE_NOME = 'Funcional (INST/EXA)';
export const FUNCIONAL_AERONAVE_CODIGO = 'FUNCIONAL';

export function isProgramaFuncional(programa: string): boolean {
  return PROGRAMAS_FUNCIONAIS.has(programa);
}
