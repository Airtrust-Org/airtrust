import { physicalManoeuvreCode } from './matriz-manobra-resolution.mjs';

export const REUSE_RESOLUTION_TYPES = new Set(['EXACT_UNIQUE', 'FORMAL_ALIAS', 'LEGACY_EQUIVALENT']);

function esc(value) {
  return String(value).replace(/'/g, "''");
}
function sqlText(value) {
  return value == null ? 'NULL' : `'${esc(value)}'`;
}

export function physicalCode(canonical, versaoMatriz, versaoNumero) {
  return `${canonical}@${versaoMatriz}-V${versaoNumero}`;
}

export function resolveStructuredTipo(model, fail) {
  const candidates = [model.tipo_qualificacao_estruturado, model.tipo, model.programa].map((value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toUpperCase(),
  );
  for (const raw of candidates) {
    if (!raw) continue;
    if (/[0-9]/.test(raw) || raw.includes('/') || raw.includes('-')) continue;
    if (raw === 'INICIAL' || raw === 'INI') return 'INICIAL';
    if (raw === 'PERIODICO' || raw === 'PER' || raw === 'RECORRENTE') return 'PERIODICO';
    if (raw === 'SEMESTRAL' || raw === 'SEM') return 'SEMESTRAL';
    if (raw === 'CHECK') return 'CHECK';
  }
  fail(`tipo_qualificacao_estruturado ausente/inválido para ${model.codigo}`);
}

/**
 * Pure, DB-agnostic core: given plan data and pre-fetched read-only lookups
 * (so this function itself never touches a database, sqlite3 CLI or D1),
 * builds the manoeuvre-resolution SQL statements — one shared implementation
 * used by both the local sqlite3 CLI applicator and the D1-backed production
 * executor, so the two can never silently drift apart.
 *
 * `existingResolutionByCode`: Map<codigo_canonico, {manobra_id, resolution_type, source_hash}>
 * `manobraById`: Map<id, {codigo, empresa_id, nome, categoria, tipo_aeronave, descricao, deleted_at}>
 */
export function buildResolutionStatements({
  plan,
  empresaId,
  versaoMatriz,
  importUuid,
  fail,
  existingResolutionByCode,
  manobraById,
}) {
  const statements = [];
  const versaoMatrizEscaped = esc(versaoMatriz);

  for (const entry of plan.manobra_resolution) {
    const codigoEscaped = esc(entry.codigo_canonico);
    const existing = existingResolutionByCode.get(entry.codigo_canonico);

    if (existing) {
      if (String(existing.resolution_type) !== entry.resolution_type) {
        fail(`${entry.codigo_canonico}: resolution_type divergente da resolução já registrada`);
      }
      if (String(existing.source_hash) !== String(entry.source_hash)) {
        fail(`${entry.codigo_canonico}: source_hash divergente da resolução já registrada`);
      }
      if (REUSE_RESOLUTION_TYPES.has(entry.resolution_type)) {
        if (Number(existing.manobra_id) !== Number(entry.existing_manobra_id)) {
          fail(`${entry.codigo_canonico}: manobra_id divergente da resolução já registrada`);
        }
      } else {
        const created = manobraById.get(Number(existing.manobra_id));
        if (!created) fail(`${entry.codigo_canonico}: manobra da resolução já registrada não existe mais`);
        if (Number(created.empresa_id) !== empresaId) {
          fail(`${entry.codigo_canonico}: manobra da resolução já registrada pertence a outro tenant`);
        }
        const expectedCodigoFisico =
          entry.resolution_type === 'COLLISION'
            ? physicalManoeuvreCode(entry.codigo_canonico, versaoMatriz)
            : entry.codigo_canonico;
        const payload = entry.create_payload;
        if (
          String(created.codigo) !== expectedCodigoFisico ||
          String(created.nome ?? '') !== String(payload.nome ?? '') ||
          String(created.categoria ?? '') !== String(payload.categoria ?? '') ||
          String(created.tipo_aeronave ?? '') !== String(payload.tipo_aeronave ?? '') ||
          String(created.descricao ?? '') !== String(payload.descricao ?? '')
        ) {
          fail(`${entry.codigo_canonico}: manobra criada diverge do create_payload da resolução já registrada`);
        }
      }
      continue;
    }

    if (REUSE_RESOLUTION_TYPES.has(entry.resolution_type)) {
      statements.push(`INSERT INTO simuladores_matriz_manobra_resolution(
          empresa_id,versao_matriz,codigo_canonico,manobra_id,resolution_type,source_hash,import_uuid
        ) VALUES (
          ${empresaId},'${versaoMatrizEscaped}','${codigoEscaped}',
          ${Number(entry.existing_manobra_id)},'${entry.resolution_type}','${entry.source_hash}',
          '${esc(importUuid)}'
        );`);
      continue;
    }

    const payload = entry.create_payload;
    const codigoFisico = (
      entry.resolution_type === 'COLLISION'
        ? physicalManoeuvreCode(entry.codigo_canonico, versaoMatriz)
        : entry.codigo_canonico
    ).replace(/'/g, "''");
    const referenciasJson = payload.referencia_tecnica
      ? JSON.stringify({ referencia_tecnica: payload.referencia_tecnica }).replace(/'/g, "''")
      : null;
    statements.push(`INSERT INTO manobras(empresa_id,codigo,nome,categoria,descricao,tipo_aeronave,referencias_json,created_at,updated_at)
      VALUES(${empresaId},'${codigoFisico}',${sqlText(payload.nome)},${sqlText(payload.categoria)},${sqlText(payload.descricao)},${sqlText(payload.tipo_aeronave)},${referenciasJson ? `'${referenciasJson}'` : 'NULL'},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
    statements.push(`INSERT INTO simuladores_matriz_manobra_resolution(
        empresa_id,versao_matriz,codigo_canonico,manobra_id,resolution_type,source_hash,import_uuid
      )
      SELECT ${empresaId},'${versaoMatrizEscaped}','${codigoEscaped}',id,'${entry.resolution_type}','${entry.source_hash}','${esc(importUuid)}'
      FROM manobras WHERE codigo='${codigoFisico}' AND empresa_id=${empresaId} AND deleted_at IS NULL;`);
    statements.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
      SELECT imp.id, 'manobras', m.id, 'INSERT', json_object('codigo_canonico', '${codigoEscaped}', 'resolution_type', '${entry.resolution_type}')
      FROM manobras m
      JOIN simuladores_matriz_imports imp ON imp.uuid='${esc(importUuid)}'
      WHERE m.codigo='${codigoFisico}' AND m.empresa_id=${empresaId} AND m.deleted_at IS NULL;`);
  }

  return statements;
}

/**
 * Pure, DB-agnostic core: builds the model + link + versioning statements.
 * `maxVersionByCode`: Map<codigo_canonico, {modelo_id, versao_numero}> — the
 * highest versao_numero ever recorded for that code (current or not).
 */
export function buildModelAndLinkStatements({ plan, empresaId, versaoMatriz, importUuid, fail, models, items, maxVersionByCode }) {
  const statements = [];
  const versaoMatrizEscaped = esc(versaoMatriz);

  statements.push(`CREATE TEMP TABLE _matriz_apply_models(
    codigo_canonico TEXT PRIMARY KEY,
    codigo_fisico TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    prev_id INTEGER,
    versao_numero INTEGER NOT NULL
  );`);

  for (const model of models) {
    const prev = maxVersionByCode.get(String(model.codigo));
    const versaoNumero = prev ? Number(prev.versao_numero) + 1 : 1;
    const codigoFisico = physicalCode(model.codigo, versaoMatriz, versaoNumero);
    const tipo = resolveStructuredTipo(model, fail);
    statements.push(`INSERT INTO _matriz_apply_models VALUES(
      '${esc(model.codigo)}',
      '${esc(codigoFisico)}',
      '${esc(model.titulo || model.codigo)}',
      '${tipo}',
      ${prev ? Number(prev.modelo_id) : 'NULL'},
      ${versaoNumero}
    );`);
  }

  statements.push(`INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
    SELECT codigo_fisico,nome,${empresaId},tipo,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM _matriz_apply_models;`);

  statements.push(`CREATE TEMP TABLE _matriz_apply_ids AS
    SELECT m.codigo_canonico, ms.id AS modelo_id, m.prev_id, m.versao_numero, m.tipo
    FROM _matriz_apply_models m
    JOIN modelos_sessao ms ON ms.codigo = m.codigo_fisico AND ms.empresa_id=${empresaId};`);

  statements.push(`CREATE TEMP TABLE _matriz_apply_links(
    codigo_canonico TEXT, ordem INTEGER, manobra_codigo TEXT, execucao_pf TEXT,
    fase_voo TEXT, tipo_conteudo TEXT, nome TEXT
  );`);
  for (const item of items) {
    statements.push(`INSERT INTO _matriz_apply_links VALUES(
      '${esc(item.modelo)}',
      ${Number(item.ordem)},
      '${esc(item.codigo)}',
      '${esc(item.execucao_pf || 'AB')}',
      '${esc(item.fase_voo || '')}',
      '${esc(item.tipo_conteudo || '')}',
      '${esc(item.nome || '')}'
    );`);
  }

  statements.push(`INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at)
    SELECT i.modelo_id, r.manobra_id, l.ordem, 1,
      CASE WHEN upper(l.execucao_pf) LIKE '%B%' AND upper(l.execucao_pf) NOT LIKE '%A%B%' AND upper(l.execucao_pf) NOT LIKE 'AB' THEN 'B'
           WHEN upper(l.execucao_pf) LIKE '%A%' AND upper(l.execucao_pf) NOT LIKE 'AB' THEN 'A'
           ELSE 'AB' END,
      NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM _matriz_apply_links l
    JOIN _matriz_apply_ids i ON i.codigo_canonico = l.codigo_canonico
    JOIN simuladores_matriz_manobra_resolution r
      ON r.empresa_id=${empresaId} AND r.versao_matriz='${versaoMatrizEscaped}' AND r.codigo_canonico = l.manobra_codigo
    JOIN manobras man ON man.id = r.manobra_id AND man.empresa_id=${empresaId} AND man.deleted_at IS NULL;`);

  statements.push(`INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json)
    SELECT msm.id, ${empresaId},
      json_object(
        'fase_voo', l.fase_voo,
        'tipo_conteudo', l.tipo_conteudo,
        'execucao_pf', l.execucao_pf,
        'nome', l.nome,
        'codigo_manobra', l.manobra_codigo
      )
    FROM modelos_sessao_manobras msm
    JOIN _matriz_apply_ids i ON i.modelo_id = msm.modelo_id
    JOIN _matriz_apply_links l ON l.codigo_canonico = i.codigo_canonico AND l.ordem = msm.ordem;`);

  statements.push(`UPDATE modelos_sessao_versionamento
    SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP
    WHERE empresa_id=${empresaId} AND is_current=1
      AND codigo_canonico IN (SELECT codigo_canonico FROM _matriz_apply_ids)
      AND modelo_id IN (SELECT prev_id FROM _matriz_apply_ids WHERE prev_id IS NOT NULL);`);

  statements.push(`INSERT INTO modelos_sessao_versionamento(
      modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate
    )
    SELECT modelo_id,${empresaId},codigo_canonico,versao_numero,'${versaoMatrizEscaped}',1,prev_id,CURRENT_TIMESTAMP,NULL
    FROM _matriz_apply_ids;`);

  statements.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
    SELECT imp.id, 'modelos_sessao', i.modelo_id, 'INSERT', json_object('codigo_canonico', i.codigo_canonico, 'versao', i.versao_numero)
    FROM _matriz_apply_ids i
    JOIN simuladores_matriz_imports imp ON imp.uuid='${esc(importUuid)}';`);

  statements.push(`INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
    SELECT imp.id, 'modelos_sessao_versionamento', i.prev_id, 'INACTIVATE', json_object('codigo_canonico', i.codigo_canonico)
    FROM _matriz_apply_ids i
    JOIN simuladores_matriz_imports imp ON imp.uuid='${esc(importUuid)}'
    WHERE i.prev_id IS NOT NULL;`);

  statements.push(`UPDATE simuladores_matriz_imports
    SET status='APPLIED', applied_at=CURRENT_TIMESTAMP,
        applied_counts_json='${esc(JSON.stringify({ modelos: 51, vinculos: 918, loft: 22 }))}'
    WHERE uuid='${esc(importUuid)}';`);

  return statements;
}
