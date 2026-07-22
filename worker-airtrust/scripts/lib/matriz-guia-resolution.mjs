function fail(message) {
  throw new Error(`Resolução de guias recusada: ${message}`);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

// Some contract sessions leave `ciclo` null/absent even though their own
// codigo_canonico already encodes it (e.g. "S76-P-01/04-C1" with ciclo:
// null) — this is not inferring new information, only reading the same
// canonical code already trusted everywhere else in this pipeline.
function extractCicloFromCode(code) {
  const match = String(code || '').match(/-C(\d)(?:[^0-9]|$)/);
  return match ? Number(match[1]) : null;
}

function deriveCiclo(entity) {
  const declared = entity.ciclo == null ? null : Number(String(entity.ciclo).replace(/\D/g, '')) || null;
  return declared ?? extractCicloFromCode(entity.codigo_canonico ?? entity.codigo);
}

// A guia's "programa" column is used inconsistently in real data: most guias
// use the broad curricular program (e.g. "PERIODICO") even for a CHECK
// session, but at least one real guia (SK76-P-CHECK) instead stores the
// finer tipo_qualificacao_estruturado ("CHECK") as its programa. Both are
// authoritative, non-fuzzy fields already on the session — a guia matches if
// its single programa value equals *either* one.
function sessionCoreSignature(session) {
  return {
    aeronave: normalizeText(session.aeronave),
    programaCandidates: new Set(
      [normalizeText(session.programa), normalizeText(session.tipo_qualificacao_estruturado)].filter(Boolean),
    ),
    ciclo: deriveCiclo(session),
  };
}
function guiaCoreSignature(guia) {
  return {
    aeronave: normalizeText(guia.aeronave),
    programa: normalizeText(guia.programa),
    ciclo: deriveCiclo(guia),
  };
}
function sameCoreSignature(sessionCore, guiaCore) {
  return (
    sessionCore.aeronave === guiaCore.aeronave &&
    sessionCore.programaCandidates.has(guiaCore.programa) &&
    sessionCore.ciclo === guiaCore.ciclo
  );
}

// Only derivable when html_relpath encodes "Sessao_N_de_M" — some guias (e.g.
// legacy SK76 filenames) instead embed the canonical code directly and never
// carry this pattern, so it is required only for the structured fallback,
// never as a precondition for verifying an exact codigo_canonico match.
function sessionCountSignature(session) {
  const match = String(session.html_relpath || '').match(/Sessao_(\d+)_de_(\d+)/);
  if (!match) return null;
  return { sessao_numero: Number(match[1]), sessao_total: Number(match[2]) };
}
function guiaCountSignature(guia) {
  return {
    sessao_numero: guia.sessao_numero == null ? null : Number(guia.sessao_numero),
    sessao_total: guia.sessao_total == null ? null : Number(guia.sessao_total),
  };
}
function sameCountSignature(a, b) {
  return a.sessao_numero === b.sessao_numero && a.sessao_total === b.sessao_total;
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
    const core = sessionCoreSignature(session);

    const exact = guiasByCode.get(session.codigo_canonico) || [];
    if (exact.length > 1) {
      fail(`${session.codigo_canonico}: mais de um guia ativo com o mesmo código`);
    }
    if (exact.length === 1) {
      // An exact codigo_canonico match is never trusted on its own: a stale
      // or reused guia code could belong to the wrong aircraft/programa/
      // ciclo, so the core signature must still agree.
      if (!sameCoreSignature(core, guiaCoreSignature(exact[0]))) {
        fail(`${session.codigo_canonico}: guia de código exato pertence a aeronave/programa/ciclo/sessão incompatível`);
      }
      return { codigo_canonico: session.codigo_canonico, guia_id: exact[0].id, match_type: 'EXACT_CODE' };
    }

    const count = sessionCountSignature(session);
    if (!count) fail(`${session.codigo_canonico}: sem código exato e html_relpath sem padrão Sessao_N_de_M para o fallback estruturado`);
    const candidates = guias.filter(
      (g) => sameCoreSignature(core, guiaCoreSignature(g)) && sameCountSignature(count, guiaCountSignature(g)),
    );
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
