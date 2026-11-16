// Avaliação pura (sem rede) da listagem de guias V18 contra o manifesto de publicação.
export const SUFIXO = '@PTO-REV10-V18';
export const EXPECTED = { AW139: 37, S76: 45, FUNCIONAL: 6 };

export function evaluateListing(guias, manifest) {
  const v18 = guias.filter((g) => String(g.codigo).endsWith(SUFIXO));
  const legados = guias.length - v18.length;
  const porCodigo = new Map(manifest.guias.map((g) => [g.codigo, g]));
  const porAeronave = { AW139: 0, S76: 0, FUNCIONAL: 0 };
  let cruzados = 0;
  for (const g of v18) {
    const m = porCodigo.get(g.codigo);
    if (!m) { cruzados += 1; continue; }
    porAeronave[m.aeronave] += 1;
    const prefixoOk = m.aeronave === 'AW139' ? g.codigo.startsWith('A139-')
      : m.aeronave === 'S76' ? g.codigo.startsWith('S76-') : /^(INST|EXA)-/.test(g.codigo);
    const idOk = m.modelo_aeronave_id == null
      ? g.modelo_aeronave_id == null
      : g.modelo_aeronave_id === m.modelo_aeronave_id;
    // O vínculo guia→modelo de sessão é o que a rota de sessão usa: tem de ser exatamente o do plano.
    const modeloOk = g.modelo_sessao_id === m.modelo_sessao_id;
    if (!prefixoOk || !idOk || !modeloOk || g.programa !== m.programa) cruzados += 1;
  }
  return {
    v18,
    legados,
    porAeronave,
    cruzados,
    modelosDistintos: new Set(v18.map((g) => g.modelo_sessao_id)).size,
    codigosPresentes: manifest.guias.length === 88
      && manifest.guias.every((m) => v18.some((g) => g.codigo === m.codigo)),
  };
}
