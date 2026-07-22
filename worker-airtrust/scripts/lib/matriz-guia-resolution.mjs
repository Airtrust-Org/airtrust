function fail(message) {
  throw new Error(`Resolução de guias recusada: ${message}`);
}

function normalizePrograma(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

function sessionSignature(session) {
  const match = String(session.html_relpath || '').match(/Sessao_(\d+)_de_(\d+)/);
  if (!match) return null;
  return {
    aeronave: session.aeronave,
    // The guia's "programa" tracks the overarching curricular program
    // (Inicial/Periódico/Semestral), not the finer per-session
    // tipo_qualificacao_estruturado (e.g. a CHECK session is still part of
    // the Periódico program for guia-linking purposes).
    programa: normalizePrograma(session.programa),
    ciclo: session.ciclo ? Number(String(session.ciclo).replace(/\D/g, '')) || null : null,
    sessao_numero: Number(match[1]),
    sessao_total: Number(match[2]),
  };
}

function guiaSignature(guia) {
  return {
    aeronave: guia.aeronave,
    programa: guia.programa,
    ciclo: guia.ciclo == null ? null : Number(guia.ciclo),
    sessao_numero: guia.sessao_numero == null ? null : Number(guia.sessao_numero),
    sessao_total: guia.sessao_total == null ? null : Number(guia.sessao_total),
  };
}

function sameSignature(a, b) {
  return (
    a.aeronave === b.aeronave &&
    a.programa === b.programa &&
    a.ciclo === b.ciclo &&
    a.sessao_numero === b.sessao_numero &&
    a.sessao_total === b.sessao_total
  );
}

/**
 * Resolves each of the 51 canonical sessions to exactly one active guia,
 * first by exact codigo_canonico match, then — only when that is absent —
 * by the structured signature (programa/ciclo/sessao_numero/sessao_total)
 * every session's html_relpath and every guia row already carry. Never
 * matches by approximate/fuzzy text.
 */
export function resolveGuiaLinks({ sessions, guias }) {
  if (!Array.isArray(sessions) || sessions.length === 0) fail('sessões ausentes');
  if (!Array.isArray(guias) || guias.length === 0) fail('guias ausentes');

  const guiasByCode = new Map();
  for (const g of guias) {
    if (!guiasByCode.has(g.codigo)) guiasByCode.set(g.codigo, []);
    guiasByCode.get(g.codigo).push(g);
  }

  const usedGuiaIds = new Set();
  const resolutions = sessions.map((session) => {
    const exact = guiasByCode.get(session.codigo_canonico) || [];
    if (exact.length === 1) {
      return { codigo_canonico: session.codigo_canonico, guia_id: exact[0].id, match_type: 'EXACT_CODE' };
    }
    if (exact.length > 1) {
      fail(`${session.codigo_canonico}: mais de um guia ativo com o mesmo código`);
    }

    const signature = sessionSignature(session);
    if (!signature) fail(`${session.codigo_canonico}: html_relpath sem padrão Sessao_N_de_M`);
    const candidates = guias.filter((g) => sameSignature(signature, guiaSignature(g)));
    if (candidates.length === 0) fail(`${session.codigo_canonico}: nenhum guia corresponde à assinatura estruturada`);
    if (candidates.length > 1) fail(`${session.codigo_canonico}: assinatura estruturada ambígua entre ${candidates.length} guias`);
    return { codigo_canonico: session.codigo_canonico, guia_id: candidates[0].id, match_type: 'STRUCTURED' };
  });

  for (const r of resolutions) {
    if (usedGuiaIds.has(r.guia_id)) fail(`guia ${r.guia_id} vinculado a mais de um código canônico`);
    usedGuiaIds.add(r.guia_id);
  }
  if (resolutions.length !== sessions.length) fail('quantidade de resoluções diverge das sessões');

  const guiaIds = new Set(guias.map((g) => g.id));
  for (const id of usedGuiaIds) if (!guiaIds.has(id)) fail(`guia ${id} não pertence ao catálogo fornecido`);
  const orphanGuiaIds = guias.map((g) => g.id).filter((id) => !usedGuiaIds.has(id));
  if (orphanGuiaIds.length) fail(`guia(s) ativo(s) sem sessão correspondente: ${orphanGuiaIds.join(',')}`);

  return resolutions;
}
