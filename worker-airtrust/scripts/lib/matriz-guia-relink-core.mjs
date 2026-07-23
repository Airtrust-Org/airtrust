import { resolveGuiaLinks } from './matriz-guia-resolution.mjs';
import { sha256, stableJson } from './matriz-import-plan.mjs';

function fail(message) {
  throw new Error(`Relink de guias recusado: ${message}`);
}
function esc(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * The matching policy lives exclusively in matriz-guia-resolution.mjs. This
 * module only turns already-resolved pairs into a tenant-scoped, D1-agnostic
 * plan (fingerprint + SQL statements), so the local CLI (relinkGuias) and
 * this executor can never grow separate matching rules.
 *
 * `guides`: live rows for empresa_id (id, codigo, programa, ciclo,
 *   sessao_numero, sessao_total, aeronave, deleted_at).
 * `currentModels`: live rows from modelos_sessao_versionamento where
 *   is_current=1 for the given versao_matriz (modelo_id, codigo_canonico).
 * `activeLinks`: live rows from simuladores_modelos_sessao_guias with
 *   deleted_at IS NULL for the resolved guia_ids (id, guia_id,
 *   modelo_sessao_id, principal, ordem).
 */
export function buildGuiaRelinkPlan({
  empresaId,
  versaoMatriz,
  contract,
  guides,
  currentModels,
  activeLinks,
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) fail('empresa_id inválido');
  if (!versaoMatriz) fail('versao_matriz obrigatória');

  const active = (guides || []).filter((g) => !g.deleted_at);
  const resolutions = resolveGuiaLinks({ sessions: contract.sessions, guias: active });

  const currentByCode = new Map(
    (currentModels || []).map((m) => [m.codigo_canonico, Number(m.modelo_id)]),
  );
  const activeLinksByGuia = new Map();
  for (const link of activeLinks || []) {
    const list = activeLinksByGuia.get(Number(link.guia_id)) || [];
    list.push(link);
    activeLinksByGuia.set(Number(link.guia_id), list);
  }

  const byAircraft = { AW139: 0, 'S-76': 0 };
  const entries = resolutions.map((resolution) => {
    const session = contract.sessions.find((s) => s.codigo_canonico === resolution.codigo_canonico);
    if (!session) fail(`${resolution.codigo_canonico}: sessão ausente do contrato`);
    const aircraft = session.aeronave === 'SK76' ? 'S-76' : session.aeronave;
    byAircraft[aircraft] = (byAircraft[aircraft] || 0) + 1;

    const modeloNovo = currentByCode.get(resolution.codigo_canonico);
    if (!modeloNovo) fail(`${resolution.codigo_canonico}: nenhuma versão corrente ${versaoMatriz}`);

    const guiaId = Number(resolution.guia_id);
    const existing = activeLinksByGuia.get(guiaId) || [];
    if (existing.length > 1) fail(`guia ${guiaId}: mais de um vínculo ativo antes do relink`);
    const previous = existing[0] || null;

    return {
      codigo_canonico: resolution.codigo_canonico,
      guia_id: guiaId,
      aeronave: aircraft,
      modelo_sessao_id_novo: modeloNovo,
      vinculo_antigo_id: previous ? Number(previous.id) : null,
      modelo_sessao_id_antigo: previous ? Number(previous.modelo_sessao_id) : null,
      already_correct: previous ? Number(previous.modelo_sessao_id) === modeloNovo : false,
    };
  });

  if (entries.length !== 51 || byAircraft.AW139 !== 30 || byAircraft['S-76'] !== 21) {
    fail(`resolução de guias inválida: ${JSON.stringify({ total: entries.length, byAircraft })}`);
  }

  return { entries, byAircraft };
}

// Excludes timestamps and any other unstable field: only the tenant-scoped
// identity of each guia -> model relationship is fingerprinted.
export function buildGuiaRelinkFingerprint({ empresaId, versaoMatriz, entries }) {
  const payload = {
    empresa_id: Number(empresaId),
    versao_matriz: String(versaoMatriz),
    entries: [...entries]
      .map((e) => ({
        codigo_canonico: e.codigo_canonico,
        guia_id: e.guia_id,
        modelo_sessao_id_novo: e.modelo_sessao_id_novo,
        vinculo_antigo_id: e.vinculo_antigo_id,
        modelo_sessao_id_antigo: e.modelo_sessao_id_antigo,
      }))
      .sort((a, b) => a.guia_id - b.guia_id),
  };
  return { payload, fingerprint: sha256(payload), canonical: stableJson(payload) };
}

/**
 * Builds the single atomic D1 batch for apply: transition to APPLYING,
 * deactivate/insert the 51 links with audit rows, then flip to APPLIED as
 * the last statement (a BEFORE UPDATE trigger on that flip asserts every
 * invariant and RAISEs ABORT — which rolls back the whole batch — on any
 * violation; see migration 0442).
 */
export function buildGuiaRelinkApplyStatements({
  empresaId,
  versaoMatriz,
  importUuid,
  entries,
  expectedHash,
  isNewRelink,
}) {
  const statements = [];
  const versaoMatrizEscaped = esc(versaoMatriz);
  const uuidEscaped = esc(importUuid);
  const countsJson = esc(
    JSON.stringify({
      total: entries.length,
      AW139: entries.filter((e) => e.aeronave === 'AW139').length,
      'S-76': entries.filter((e) => e.aeronave === 'S-76').length,
    }),
  );

  if (isNewRelink) {
    statements.push(`INSERT INTO simuladores_matriz_guia_relink(
        uuid,empresa_id,versao_matriz,status,expected_hash,expected_counts_json
      ) VALUES ('${uuidEscaped}',${empresaId},'${versaoMatrizEscaped}','APPLYING','${esc(expectedHash)}','${countsJson}');`);
  } else {
    statements.push(`UPDATE simuladores_matriz_guia_relink SET status='APPLYING', failure_reason=NULL
      WHERE uuid='${uuidEscaped}' AND empresa_id=${empresaId} AND status='APPLYING';`);
  }

  const relinkIdExpr = `(SELECT id FROM simuladores_matriz_guia_relink WHERE uuid='${uuidEscaped}' AND empresa_id=${empresaId})`;

  for (const entry of entries) {
    // Even when the correct link already exists (already_correct), still run
    // the guarded insert + its audit row below: the terminal assertion on
    // APPLIED counts every resolved guia_id via its GUIDE_LINK_INSERT audit
    // row, so every one of the 51 entries needs one, whether or not this
    // particular batch actually created a new row.
    if (!entry.already_correct && entry.vinculo_antigo_id != null) {
      // CAS: only deactivate the exact link id validated against the live
      // state right before this batch was built. If it already changed
      // (drift), this UPDATE matches zero rows and the terminal assertion on
      // APPLIED (51 active links) fails closed, aborting the whole batch.
      statements.push(`UPDATE simuladores_modelos_sessao_guias
        SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=${entry.vinculo_antigo_id} AND empresa_id=${empresaId} AND guia_id=${entry.guia_id}
          AND modelo_sessao_id=${entry.modelo_sessao_id_antigo} AND deleted_at IS NULL;`);
      statements.push(`INSERT INTO simuladores_matriz_guia_relink_changes(relink_id,guia_id,modelo_sessao_id,operacao,before_json)
        VALUES(${relinkIdExpr},${entry.guia_id},${entry.modelo_sessao_id_antigo},'GUIDE_LINK_DEACTIVATE',
          json_object('id',${entry.vinculo_antigo_id},'guia_id',${entry.guia_id},'modelo_sessao_id',${entry.modelo_sessao_id_antigo}));`);
    }
    statements.push(`INSERT INTO simuladores_modelos_sessao_guias(empresa_id,modelo_sessao_id,guia_id,principal,ordem,created_at,updated_at)
      SELECT ${empresaId},${entry.modelo_sessao_id_novo},${entry.guia_id},1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM simuladores_modelos_sessao_guias
        WHERE empresa_id=${empresaId} AND guia_id=${entry.guia_id} AND modelo_sessao_id=${entry.modelo_sessao_id_novo} AND deleted_at IS NULL
      );`);
    statements.push(`INSERT INTO simuladores_matriz_guia_relink_changes(relink_id,guia_id,modelo_sessao_id,operacao,after_json)
      SELECT ${relinkIdExpr},${entry.guia_id},${entry.modelo_sessao_id_novo},'GUIDE_LINK_INSERT',
        json_object('guia_id',${entry.guia_id},'modelo_sessao_id',${entry.modelo_sessao_id_novo})
      WHERE EXISTS (
        SELECT 1 FROM simuladores_modelos_sessao_guias
        WHERE empresa_id=${empresaId} AND guia_id=${entry.guia_id} AND modelo_sessao_id=${entry.modelo_sessao_id_novo} AND deleted_at IS NULL
      );`);
  }

  statements.push(`UPDATE simuladores_matriz_guia_relink
    SET status='APPLIED', applied_at=CURRENT_TIMESTAMP
    WHERE uuid='${uuidEscaped}' AND empresa_id=${empresaId} AND status='APPLYING';`);

  return statements;
}

/**
 * Builds the single atomic D1 batch for rollback: undoes only the relink's
 * own GUIDE_LINK_INSERT/GUIDE_LINK_DEACTIVATE changes, restoring exactly the
 * previously-active links recorded in the audit trail. Never touches a link
 * this relink did not itself create or deactivate.
 */
export function buildGuiaRelinkRollbackStatements({
  empresaId,
  importUuid,
  compensationUuid,
  changes,
}) {
  const statements = [];
  const uuidEscaped = esc(importUuid);
  const relinkIdExpr = `(SELECT id FROM simuladores_matriz_guia_relink WHERE uuid='${uuidEscaped}' AND empresa_id=${empresaId})`;

  const inserted = changes.filter((c) => c.operacao === 'GUIDE_LINK_INSERT');
  const deactivated = changes.filter((c) => c.operacao === 'GUIDE_LINK_DEACTIVATE');

  for (const change of inserted) {
    const after = JSON.parse(String(change.after_json));
    statements.push(`UPDATE simuladores_modelos_sessao_guias
      SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE empresa_id=${empresaId} AND guia_id=${Number(after.guia_id)} AND modelo_sessao_id=${Number(after.modelo_sessao_id)} AND deleted_at IS NULL;`);
    statements.push(`INSERT INTO simuladores_matriz_guia_relink_changes(relink_id,guia_id,modelo_sessao_id,operacao,after_json)
      VALUES(${relinkIdExpr},${Number(after.guia_id)},${Number(after.modelo_sessao_id)},'GUIDE_LINK_COMPENSATE',
        json_object('deactivated_insert', json('${esc(change.after_json)}')));`);
  }
  for (const change of deactivated) {
    const before = JSON.parse(String(change.before_json));
    statements.push(`UPDATE simuladores_modelos_sessao_guias
      SET deleted_at=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE id=${Number(before.id)} AND empresa_id=${empresaId} AND guia_id=${Number(before.guia_id)} AND modelo_sessao_id=${Number(before.modelo_sessao_id)};`);
    statements.push(`INSERT INTO simuladores_matriz_guia_relink_changes(relink_id,guia_id,modelo_sessao_id,operacao,after_json)
      VALUES(${relinkIdExpr},${Number(before.guia_id)},${Number(before.modelo_sessao_id)},'GUIDE_LINK_RESTORE',
        json_object('restored', json('${esc(change.before_json)}')));`);
  }

  statements.push(`UPDATE simuladores_matriz_guia_relink
    SET status='ROLLED_BACK', rolled_back_at=CURRENT_TIMESTAMP, rollback_uuid='${esc(compensationUuid)}'
    WHERE uuid='${uuidEscaped}' AND empresa_id=${empresaId} AND status='APPLIED';`);

  return statements;
}
