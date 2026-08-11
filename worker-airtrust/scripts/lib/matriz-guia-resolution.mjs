import {
  canonicalSk76PeriodicCode,
  legacySk76PeriodicCode,
} from './sk76-periodic-code-contract.mjs';

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

function canonicalSession(session) {
  const codigoCanonico = canonicalSk76PeriodicCode(session.codigo_canonico);
  return codigoCanonico === session.codigo_canonico
    ? session
    : { ...session, codigo_canonico: codigoCanonico };
}

// Some contract sessions leave `ciclo` null/absent even though their own
// codigo_canonico already encodes it (e.g. "S76-P-01/03-C1" with ciclo:
// null) — this is not inferring new information, only reading the same
// canonical code already trusted everywhere else in this pipeline.
function extractCicloFromCode(code) {
  const match = String(code || '').match(/-C(\d)(?:[^0-9]|$)/);
  return match ? Number(match[1]) : null;
}

function deriveCiclo(entity) {
  const declared =
    entity.ciclo == null ? null : Number(String(entity.ciclo).replace(/\D/g, '')) || null;
  return declared ?? extractCicloFromCode(entity.codigo_canonico ?? entity.codigo);
}

function sessionCoreSignature(session) {
  return {
    aeronave: normalizeText(session.aeronave),
    programaCandidates: new Set(
      [normalizeText(session.programa), normalizeText(session.tipo_qualificacao_estruturado)].filter(
        Boolean,
      ),
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
 * Resolves each canonical session to exactly one active guia. Both callers
 * that use loadSessionContract() and the production executor that imports the
 * raw JSON directly converge here: S-76 periodic /04 source codes are first
 * canonicalized to /03. Existing /04 guide rows remain accepted only via the
 * explicit six-entry alias map, so pre- and post-migration states are both
 * deterministic without fuzzy matching.
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
  const resolutions = sessions.map((rawSession) => {
    const session = canonicalSession(rawSession);
    const core = sessionCoreSignature(session);
    const legacyAlias = legacySk76PeriodicCode(session.codigo_canonico);
    const exactCandidates = [
      ...(guiasByCode.get(session.codigo_canonico) || []).map((guia) => ({
        guia,
        matchType: 'EXACT_CODE',
      })),
      ...(legacyAlias ? guiasByCode.get(legacyAlias) || [] : []).map((guia) => ({
        guia,
        matchType: 'EXACT_LEGACY_CODE_ALIAS',
      })),
    ];

    if (exactCandidates.length > 1) {
      fail(`${session.codigo_canonico}: mais de um guia ativo para o código canônico/alias`);
    }
    if (exactCandidates.length === 1) {
      const { guia, matchType } = exactCandidates[0];
      if (!sameCoreSignature(core, guiaCoreSignature(guia))) {
        fail(
          `${session.codigo_canonico}: guia de código exato pertence a aeronave/programa/ciclo/sessão incompatível`,
        );
      }
      return {
        codigo_canonico: session.codigo_canonico,
        guia_id: guia.id,
        match_type: matchType,
      };
    }

    const count = sessionCountSignature(session);
    if (!count)
      fail(
        `${session.codigo_canonico}: sem código exato e html_relpath sem padrão Sessao_N_de_M para o fallback estruturado`,
      );
    const candidates = guias.filter(
      (g) =>
        sameCoreSignature(core, guiaCoreSignature(g)) &&
        sameCountSignature(count, guiaCountSignature(g)),
    );
    if (candidates.length === 0)
      fail(`${session.codigo_canonico}: nenhum guia corresponde à assinatura estruturada`);
    if (candidates.length > 1)
      fail(
        `${session.codigo_canonico}: assinatura estruturada ambígua entre ${candidates.length} guias`,
      );
    return {
      codigo_canonico: session.codigo_canonico,
      guia_id: candidates[0].id,
      match_type: 'STRUCTURED',
    };
  });

  for (const r of resolutions) {
    if (usedGuiaIds.has(r.guia_id)) fail(`guia ${r.guia_id} vinculado a mais de um código canônico`);
    usedGuiaIds.add(r.guia_id);
  }
  if (resolutions.length !== sessions.length) fail('quantidade de resoluções diverge das sessões');

  const guiaIds = new Set(guias.map((g) => g.id));
  for (const id of usedGuiaIds)
    if (!guiaIds.has(id)) fail(`guia ${id} não pertence ao catálogo fornecido`);
  const orphanGuiaIds = guias.map((g) => g.id).filter((id) => !usedGuiaIds.has(id));
  if (orphanGuiaIds.length)
    fail(`guia(s) ativo(s) sem sessão correspondente: ${orphanGuiaIds.join(',')}`);

  return resolutions;
}
