import {
  EXPECTED_MAPPING_COUNT,
  EXPECTED_MODEL_COUNT,
  EXPECTED_LINK_COUNT,
  EXPECTED_LINKS_PER_MODEL,
} from './matriz-remediation-plan.mjs';
import { buildGuiaRelinkApplyStatements } from './matriz-guia-relink-core.mjs';

const NON_REUSABLE_RESOLUTION_TYPES = new Set(['TRUE_MISSING', 'COLLISION', 'CROSS_TENANT_ONLY']);

function fail(message) {
  throw new Error(`Remediação de matriz recusada: ${message}`);
}
function esc(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Pure, DB-agnostic discovery: given the tenant's own five human-reviewed
 * mappings (canonical code -> correct legacy manobra code) and a set of
 * pre-fetched, read-only lookups, mechanically discovers every model/link
 * this remediation must touch. Never trusts a hardcoded model/link id list —
 * every affected row is re-derived from live state, so a plan built from a
 * stale snapshot fails the count assertions below rather than silently
 * acting on the wrong rows.
 *
 * `mappings`: [{ codigo_canonico, correct_legacy_manobra_codigo }] (exactly 5,
 *   human-reviewed; carries no numeric ids — those are resolved from `resolutionRows`
 *   and `manobraByCode` below, so no production id ever needs to live in this
 *   mapping file's schema).
 * `resolutionRows`: simuladores_matriz_manobra_resolution rows for
 *   (empresaId, versaoMatriz): {id, codigo_canonico, manobra_id, resolution_type}.
 * `activeCorrectionCodes`: Set<codigo_canonico> with an is_current=1 overlay
 *   already recorded (idempotency guard — a code already corrected must not
 *   be silently re-targeted by a fresh remediation_uuid).
 * `manobraByCode`: Map<codigo, {id, empresa_id, deleted_at}> — tenant manobras only.
 * `manobraById`: Map<id, {id, codigo, empresa_id, deleted_at}> — tenant manobras only.
 * `currentModelsByCode`: Map<codigo_canonico, {modelo_id, codigo_fisico}> — is_current=1
 *   versionamento rows for versaoMatriz, joined to modelos_sessao.codigo.
 * `linkRows`: active modelos_sessao_manobras rows for the tenant's models:
 *   {id, modelo_id, manobra_id, ordem, obrigatoria, tripulante, observacoes}.
 * `downstreamUsageCount`: integer — ficha_sessao/simulador_agendamentos rows
 *   referencing any of the affected modelo_ids, counted by the caller.
 */
export function discoverRemediationTargets({
  empresaId,
  versaoMatriz,
  mappings,
  resolutionRows,
  activeCorrectionCodes = new Set(),
  manobraByCode,
  manobraById,
  currentModelsByCode,
  linkRows,
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) fail('empresa_id inválido');
  if (!versaoMatriz) fail('versao_matriz obrigatória');
  if (!Array.isArray(mappings) || mappings.length !== EXPECTED_MAPPING_COUNT) {
    fail(`esperados ${EXPECTED_MAPPING_COUNT} mappings; encontrados ${mappings?.length ?? 0}`);
  }

  const resolutionByCode = new Map(resolutionRows.map((r) => [r.codigo_canonico, r]));
  const seenWrongManobraIds = new Set();
  const seenCodes = new Set();

  const mappingResolutions = mappings.map((mapping) => {
    const codigo = String(mapping.codigo_canonico || '');
    if (!codigo) fail('mapping sem codigo_canonico');
    if (seenCodes.has(codigo)) fail(`código duplicado no mapping: ${codigo}`);
    seenCodes.add(codigo);
    if (activeCorrectionCodes.has(codigo)) {
      fail(`${codigo}: já possui correção corrente; use rollback antes de reaplicar`);
    }

    const resolution = resolutionByCode.get(codigo);
    if (!resolution) fail(`${codigo}: sem resolução registrada para ${versaoMatriz}`);
    if (!NON_REUSABLE_RESOLUTION_TYPES.has(resolution.resolution_type)) {
      fail(`${codigo}: resolution_type ${resolution.resolution_type} não é elegível para correção LEGACY_EQUIVALENT`);
    }

    const wrongManobraId = Number(resolution.manobra_id);
    if (seenWrongManobraIds.has(wrongManobraId)) fail(`manobra_id ${wrongManobraId} reutilizada por mais de um mapping`);
    seenWrongManobraIds.add(wrongManobraId);

    const wrongManobra = manobraById.get(wrongManobraId);
    if (!wrongManobra || wrongManobra.deleted_at) fail(`${codigo}: manobra criada (id ${wrongManobraId}) não está mais ativa`);
    if (Number(wrongManobra.empresa_id) !== empresaId) fail(`${codigo}: manobra criada pertence a outro tenant`);

    const correctCodigo = String(mapping.correct_legacy_manobra_codigo || '');
    if (!correctCodigo) fail(`${codigo}: correct_legacy_manobra_codigo ausente`);
    const correctManobra = manobraByCode.get(correctCodigo);
    if (!correctManobra || correctManobra.deleted_at) fail(`${codigo}: manobra legada ${correctCodigo} não encontrada ou inativa`);
    if (Number(correctManobra.empresa_id) !== empresaId) fail(`${codigo}: manobra legada pertence a outro tenant`);
    if (Number(correctManobra.id) === wrongManobraId) fail(`${codigo}: manobra legada é a mesma manobra criada por engano`);

    return {
      codigo_canonico: codigo,
      wrong_manobra_id: wrongManobraId,
      wrong_manobra_codigo: wrongManobra.codigo,
      correct_manobra_id: Number(correctManobra.id),
      correct_manobra_codigo: correctCodigo,
      original_resolution_id: Number(resolution.id),
      original_resolution_type: resolution.resolution_type,
    };
  });

  // Scoped to CURRENT models only: a historical (is_current=0) version's
  // links are never soft-deleted (they stay auditable forever, same as every
  // other superseded version in this system), so without this filter a link
  // on an old, no-longer-current version pointing at the same wrong
  // manobra_id would double-count as "affected" — exactly the scenario a
  // reapply-after-rollback produces once a first COMPENSATE cycle exists.
  const currentModeloIds = new Set([...currentModelsByCode.values()].map((row) => Number(row.modelo_id)));
  const wrongIdToMapping = new Map(mappingResolutions.map((m) => [m.wrong_manobra_id, m]));
  const affectedLinks = linkRows
    .filter((link) => currentModeloIds.has(Number(link.modelo_id)) && wrongIdToMapping.has(Number(link.manobra_id)))
    .map((link) => ({ ...link, mapping: wrongIdToMapping.get(Number(link.manobra_id)) }));

  if (affectedLinks.length !== EXPECTED_LINK_COUNT) {
    fail(`esperados ${EXPECTED_LINK_COUNT} vínculos afetados; encontrados ${affectedLinks.length}`);
  }

  const linksByModel = new Map();
  for (const link of affectedLinks) {
    const list = linksByModel.get(Number(link.modelo_id)) || [];
    list.push(link);
    linksByModel.set(Number(link.modelo_id), list);
  }
  if (linksByModel.size !== EXPECTED_MODEL_COUNT) {
    fail(`esperados ${EXPECTED_MODEL_COUNT} modelos afetados; encontrados ${linksByModel.size}`);
  }

  const currentModelByModeloId = new Map(
    [...currentModelsByCode.entries()].map(([codigo, row]) => [Number(row.modelo_id), { codigo_canonico: codigo, ...row }]),
  );

  const affectedModels = [...linksByModel.keys()].map((modeloId) => {
    const current = currentModelByModeloId.get(modeloId);
    if (!current) fail(`modelo ${modeloId}: não é a versão corrente de ${versaoMatriz}`);
    const allLinksForModel = linkRows.filter((l) => Number(l.modelo_id) === modeloId);
    if (allLinksForModel.length !== EXPECTED_LINKS_PER_MODEL) {
      fail(`${current.codigo_canonico}: esperados ${EXPECTED_LINKS_PER_MODEL} vínculos; encontrados ${allLinksForModel.length}`);
    }
    return {
      modelo_id: modeloId,
      codigo_canonico: current.codigo_canonico,
      codigo_fisico: current.codigo_fisico,
      links: allLinksForModel,
      affected_links: linksByModel.get(modeloId),
    };
  });

  return { mappingResolutions, affectedModels, affectedLinks };
}

/**
 * Builds the D1 batch() for one apply: for each affected model, COMPENSATE a
 * brand-new modelos_sessao row (the only way to write links once a model's
 * versionamento row is non-LEGACY — see migration 0440's
 * trg_modelo_manobra_versionada_imutavel*), copying all 18 links with the 13
 * affected ones repointed to the correct legacy manobra_id, then flips
 * is_current and appends the resolution-correction overlay + remediation
 * ledger rows. Guide relink for the 9 models reuses buildGuiaRelinkApplyStatements
 * verbatim (via a new, remediation-scoped simuladores_matriz_guia_relink row)
 * so the two executors can never silently diverge on that logic.
 */
export function buildRemediationApplyStatements({
  empresaId,
  versaoMatriz,
  remediationUuid,
  guideRelinkUuid,
  guideRelinkExpectedHash,
  affectedModels,
  mappingResolutions,
  modelPhysicalMeta,
  guideRelinkEntries,
  startChangeOrder = 1,
}) {
  const statements = [];
  const versaoMatrizEscaped = esc(versaoMatriz);
  let changeOrder = startChangeOrder - 1;
  const nextChangeOrder = () => ++changeOrder;
  const remediationIdExpr = `(SELECT id FROM simuladores_matriz_remediations WHERE remediation_uuid='${esc(remediationUuid)}' AND empresa_id=${empresaId})`;

  for (const model of affectedModels) {
    const meta = modelPhysicalMeta.get(model.modelo_id);
    if (!meta) fail(`modelo ${model.modelo_id}: metadados físicos ausentes`);
    const codigoFisicoNovo = esc(`${model.codigo_canonico}@${versaoMatriz}-REMEDIATION-${remediationUuid}`);

    statements.push(`INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
      SELECT '${codigoFisicoNovo}', ms.nome, ms.empresa_id, ms.tipo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM modelos_sessao ms WHERE ms.id=${model.modelo_id};`);
    statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id,metadata_json)
      SELECT ${remediationIdExpr}, ${nextChangeOrder()}, 'modelos_sessao', 'COMPENSATE_CREATE', '${esc(model.codigo_canonico)}', ${model.modelo_id}, ms_new.id,
        json_object('codigo_fisico', ms_new.codigo)
      FROM modelos_sessao ms_new WHERE ms_new.codigo='${codigoFisicoNovo}' AND ms_new.empresa_id=${empresaId};`);

    for (const link of model.links) {
      const mapping = model.affected_links.find((l) => Number(l.id) === Number(link.id));
      const targetManobraId = mapping ? mapping.mapping.correct_manobra_id : Number(link.manobra_id);
      statements.push(`INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at)
        SELECT (SELECT id FROM modelos_sessao WHERE codigo='${codigoFisicoNovo}' AND empresa_id=${empresaId}),
          ${targetManobraId}, ${Number(link.ordem)}, ${link.obrigatoria ? 1 : 0}, '${esc(link.tripulante || 'AB')}', ${link.observacoes ? `'${esc(link.observacoes)}'` : 'NULL'},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP;`);
      statements.push(`INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json)
        SELECT msm_new.id, ${empresaId},
          COALESCE(
            (SELECT metadados_json FROM modelos_sessao_manobras_contexto WHERE modelo_manobra_id=${Number(link.id)}),
            json_object('source','remediation')
          )
        FROM modelos_sessao_manobras msm_new
        JOIN modelos_sessao ms_new ON ms_new.id = msm_new.modelo_id AND ms_new.codigo='${codigoFisicoNovo}'
        WHERE msm_new.ordem=${Number(link.ordem)};`);
      statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id,metadata_json)
        VALUES(${remediationIdExpr}, ${nextChangeOrder()}, 'modelos_sessao_manobras', '${mapping ? 'LINK_SUBSTITUTE' : 'LINK_COPY'}', '${esc(model.codigo_canonico)}',
          ${Number(link.manobra_id)}, ${targetManobraId}, json_object('ordem', ${Number(link.ordem)}));`);
    }

    statements.push(`UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP
      WHERE modelo_id=${model.modelo_id} AND empresa_id=${empresaId} AND is_current=1;`);
    statements.push(`INSERT INTO modelos_sessao_versionamento(modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate)
      SELECT (SELECT id FROM modelos_sessao WHERE codigo='${codigoFisicoNovo}' AND empresa_id=${empresaId}),
        ${empresaId}, '${esc(model.codigo_canonico)}', ${Number(meta.versaoNumero) + 1}, '${versaoMatrizEscaped}-REMEDIATION', 1, ${model.modelo_id}, CURRENT_TIMESTAMP, NULL;`);
    statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id)
      SELECT ${remediationIdExpr}, ${nextChangeOrder()}, 'modelos_sessao_versionamento', 'COMPENSATE_INACTIVATE', '${esc(model.codigo_canonico)}', ${model.modelo_id}, ms_new.id
      FROM modelos_sessao ms_new WHERE ms_new.codigo='${codigoFisicoNovo}' AND ms_new.empresa_id=${empresaId};`);
  }

  for (const mapping of mappingResolutions) {
    statements.push(`INSERT INTO simuladores_matriz_resolution_corrections(
        empresa_id,versao_matriz,codigo_canonico,original_resolution_id,original_resolution_type,original_manobra_id,
        corrected_resolution_type,corrected_manobra_id,remediation_id
      ) VALUES (
        ${empresaId},'${versaoMatrizEscaped}','${esc(mapping.codigo_canonico)}',${mapping.original_resolution_id},'${mapping.original_resolution_type}',${mapping.wrong_manobra_id},
        'LEGACY_EQUIVALENT',${mapping.correct_manobra_id},${remediationIdExpr}
      );`);
    statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id)
      VALUES(${remediationIdExpr}, ${nextChangeOrder()}, 'simuladores_matriz_resolution_corrections', 'RESOLUTION_OVERLAY', '${esc(mapping.codigo_canonico)}', ${mapping.wrong_manobra_id}, ${mapping.correct_manobra_id});`);
  }

  if (guideRelinkEntries?.length) {
    const relinkStatements = buildGuiaRelinkApplyStatements({
      empresaId,
      versaoMatriz: `${versaoMatriz}-REMEDIATION`,
      importUuid: guideRelinkUuid,
      entries: guideRelinkEntries,
      expectedHash: guideRelinkExpectedHash,
      isNewRelink: true,
    });
    statements.push(...relinkStatements);
    for (const entry of guideRelinkEntries) {
      statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id)
        VALUES(${remediationIdExpr}, ${nextChangeOrder()}, 'simuladores_modelos_sessao_guias', 'GUIDE_RELINK', '${esc(entry.codigo_canonico)}',
          ${entry.modelo_sessao_id_antigo ?? 'NULL'}, ${entry.modelo_sessao_id_novo});`);
    }
  }

  return { statements, lastChangeOrder: changeOrder };
}

/**
 * Builds the D1 batch() for a compensatory rollback: for each affected
 * model, COMPENSATE a new physical row restoring the original (wrong) links,
 * mirroring rollback-simuladores-matriz-import.mjs exactly. Never touches the
 * modelos_sessao row the remediation created — that stays historical and
 * auditable, exactly like every other superseded version in this system.
 * Supersedes the five resolution-correction overlays (is_current 1->0).
 *
 * Guide relink cannot reuse buildGuiaRelinkRollbackStatements' literal
 * before/after restore here: that would repoint each guide at the
 * *pre-remediation* modelo_id, but the compensatory matrix rollback above
 * never reactivates a historical version (trg_modelo_versao_integridade_update
 * unconditionally forbids is_current 0->1) — it always mints a *new*
 * COMPENSATE row instead. So "rollback" for the guide is itself a forward
 * compensating relink (via buildGuiaRelinkApplyStatements, a fresh
 * simuladores_matriz_guia_relink row, `guideRelinkRollbackUuid`) pointing
 * each guide at the new COMPENSATE model — never a literal undo. The
 * original remediation-scoped relink row is left APPLIED and historical,
 * exactly like a superseded modelos_sessao_versionamento row.
 */
export function buildRemediationRollbackStatements({
  empresaId,
  versaoMatriz,
  remediationUuid,
  compensationUuid,
  affectedModels,
  correctionRows,
  guideRelinkRollbackUuid,
  guideRelinkEntries,
  guideRelinkExpectedHash,
  startChangeOrder = 1,
}) {
  const statements = [];
  let changeOrder = startChangeOrder - 1;
  const nextChangeOrder = () => ++changeOrder;
  const remediationIdExpr = `(SELECT id FROM simuladores_matriz_remediations WHERE remediation_uuid='${esc(remediationUuid)}' AND empresa_id=${empresaId})`;
  const codigoFisicoRestoreByCode = new Map();

  for (const model of affectedModels) {
    const codigoFisicoRestore = esc(`${model.codigo_canonico}@${versaoMatriz}-COMPENSATE-${compensationUuid}`);
    codigoFisicoRestoreByCode.set(model.codigo_canonico, codigoFisicoRestore);
    statements.push(`INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
      SELECT '${codigoFisicoRestore}', ms.nome, ms.empresa_id, ms.tipo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM modelos_sessao ms WHERE ms.id=${model.remediated_modelo_id};`);
    for (const link of model.original_links) {
      statements.push(`INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at)
        SELECT (SELECT id FROM modelos_sessao WHERE codigo='${codigoFisicoRestore}' AND empresa_id=${empresaId}),
          ${Number(link.manobra_id)}, ${Number(link.ordem)}, ${link.obrigatoria ? 1 : 0}, '${esc(link.tripulante || 'AB')}', ${link.observacoes ? `'${esc(link.observacoes)}'` : 'NULL'},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP;`);
      statements.push(`INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json)
        SELECT msm_new.id, ${empresaId},
          COALESCE(
            (SELECT metadados_json FROM modelos_sessao_manobras_contexto WHERE modelo_manobra_id=${Number(link.id)}),
            json_object('source','remediation_rollback')
          )
        FROM modelos_sessao_manobras msm_new
        JOIN modelos_sessao ms_new ON ms_new.id = msm_new.modelo_id AND ms_new.codigo='${codigoFisicoRestore}'
        WHERE msm_new.ordem=${Number(link.ordem)};`);
    }
    statements.push(`UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP
      WHERE modelo_id=${model.remediated_modelo_id} AND empresa_id=${empresaId} AND is_current=1;`);
    statements.push(`INSERT INTO modelos_sessao_versionamento(modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate)
      SELECT (SELECT id FROM modelos_sessao WHERE codigo='${codigoFisicoRestore}' AND empresa_id=${empresaId}),
        ${empresaId}, '${esc(model.codigo_canonico)}', ${Number(model.remediated_versao_numero) + 1}, '${esc(versaoMatriz)}-COMPENSATE', 1, ${model.remediated_modelo_id}, CURRENT_TIMESTAMP, NULL;`);
    statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id)
      SELECT ${remediationIdExpr}, ${nextChangeOrder()}, 'modelos_sessao_versionamento', 'COMPENSATE_INACTIVATE', '${esc(model.codigo_canonico)}', ${model.remediated_modelo_id}, ms_new.id
      FROM modelos_sessao ms_new WHERE ms_new.codigo='${codigoFisicoRestore}' AND ms_new.empresa_id=${empresaId};`);
  }

  for (const correction of correctionRows) {
    statements.push(`UPDATE simuladores_matriz_resolution_corrections
      SET is_current=0, superseded_at=CURRENT_TIMESTAMP
      WHERE id=${Number(correction.id)} AND empresa_id=${empresaId} AND is_current=1;`);
    statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id)
      VALUES(${remediationIdExpr}, ${nextChangeOrder()}, 'simuladores_matriz_resolution_corrections', 'MANOBRA_SUPERSEDE', '${esc(correction.codigo_canonico)}',
        ${Number(correction.corrected_manobra_id)}, ${Number(correction.original_manobra_id)});`);
  }

  if (guideRelinkEntries?.length) {
    const resolvedEntries = guideRelinkEntries.map((entry) => {
      const codigoFisicoRestore = codigoFisicoRestoreByCode.get(entry.codigo_canonico);
      if (!codigoFisicoRestore) fail(`${entry.codigo_canonico}: modelo compensado ausente para relink de guia`);
      return {
        ...entry,
        modelo_sessao_id_novo: `(SELECT id FROM modelos_sessao WHERE codigo='${codigoFisicoRestore}' AND empresa_id=${empresaId})`,
      };
    });
    const relinkStatements = buildGuiaRelinkApplyStatements({
      empresaId,
      versaoMatriz: `${versaoMatriz}-COMPENSATE`,
      importUuid: guideRelinkRollbackUuid,
      entries: resolvedEntries,
      expectedHash: guideRelinkExpectedHash,
      isNewRelink: true,
    });
    statements.push(...relinkStatements);
    for (const entry of resolvedEntries) {
      statements.push(`INSERT INTO simuladores_matriz_remediation_changes(remediation_id,change_order,entity_type,action_type,logical_code,before_id,after_id)
        VALUES(${remediationIdExpr}, ${nextChangeOrder()}, 'simuladores_modelos_sessao_guias', 'GUIDE_RELINK', '${esc(entry.codigo_canonico)}',
          ${entry.modelo_sessao_id_antigo ?? 'NULL'}, ${entry.modelo_sessao_id_novo});`);
    }
  }

  statements.push(`UPDATE simuladores_matriz_remediations
    SET status='ROLLED_BACK', rolled_back_at=CURRENT_TIMESTAMP, rollback_uuid='${esc(compensationUuid)}'
    WHERE remediation_uuid='${esc(remediationUuid)}' AND empresa_id=${empresaId};`);

  return { statements, lastChangeOrder: changeOrder };
}
