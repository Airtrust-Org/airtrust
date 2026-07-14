export type FichaQualificacaoFlow = {
  is_check?: number | boolean | null;
  tipo_sessao?: string | null;
};

const TIPOS_FICHA_ESPECIAL_CHECK = new Set(['TRE-INST', 'CRED-EXA', 'INST-E01', 'INST-E02']);

export function isFichaDoFluxoDeCheckComQualificacao(
  ficha?: FichaQualificacaoFlow | null,
): boolean {
  if (!ficha) return false;
  if (ficha.is_check === 1 || ficha.is_check === true) return true;

  const tipoSessao = String(ficha.tipo_sessao || '')
    .trim()
    .toUpperCase();
  return TIPOS_FICHA_ESPECIAL_CHECK.has(tipoSessao);
}

export function deveGerarQualificacaoAoAssinar(
  ficha: FichaQualificacaoFlow | null | undefined,
  aprovado: boolean | null | undefined,
): boolean {
  return aprovado === true && isFichaDoFluxoDeCheckComQualificacao(ficha);
}
