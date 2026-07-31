const LINKS_CHUNK_SIZE = 150;

const SESSION_TYPES = Object.freeze({
  INICIAL: { codigo: 'INI', nome: 'Inicial', ordem: 10 },
  PERIODICO: { codigo: 'PER', nome: 'Periódico', ordem: 20 },
  SEMESTRAL: { codigo: 'SEM', nome: 'Semestral', ordem: 30 },
  CHECK: { codigo: 'P10-CHK', nome: 'Check PTO Rev10', ordem: 40 },
  REQUALIFICACAO: { codigo: 'P10-RQ', nome: 'Requalificação PTO Rev10', ordem: 50 },
  ELEVACAO_NIVEL: { codigo: 'P10-EN', nome: 'Elevação de nível PTO Rev10', ordem: 60 },
  EXPERIENCIA_RECENTE: {
    codigo: 'P10-REC',
    nome: 'Reaquisição de experiência recente PTO Rev10',
    ordem: 70,
  },
  NOTURNO: { codigo: 'P10-NOT', nome: 'Treinamento noturno PTO Rev10', ordem: 80 },
});

function fail(message) {
  throw new Error(`Aplicação PTO Rev10 recusada: ${message}`);
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function physicalPtoRev10ModelCode(canonicalCode, matrixVersion, versionNumber) {
  return `${canonicalCode}@${matrixVersion}-V${versionNumber}`;
}

export function getPtoRev10SessionType(type) {
  const definition = SESSION_TYPES[String(type || '').toUpperCase()];
  if (!definition) fail(`tipo estruturado inválido: ${type}`);
  return definition;
}

function modelRowsFromPlan({ plan, maxVersionByCode }) {
  return plan.models
    .map((model) => {
      const previous = maxVersionByCode.get(String(model.codigo));
      const versionNumber = previous ? Number(previous.versao_numero) + 1 : 1;
      const sessionType = getPtoRev10SessionType(model.tipo_estruturado);
      return {
        codigoCanonico: String(model.codigo),
        codigoFisico: physicalPtoRev10ModelCode(
          model.codigo,
          plan.versao_matriz,
          versionNumber,
        ),
        titulo: String(model.titulo),
        tipoEstruturado: String(model.tipo_estruturado),
        tipoDispositivo: String(model.tipo_dispositivo || 'SIMULADOR').toUpperCase(),
        tipoSessaoCodigo: sessionType.codigo,
        programa: String(model.programa),
        natureza: String(model.natureza),
        cargaSessao: String(model.carga_sessao),
        duracao: Number(model.duracao_estimada_minutos),
        aeronave: String(model.aeronave),
        ordemCurricular: Number(model.ordem_curricular),
        previousId: previous ? Number(previous.modelo_id) : null,
        versionNumber,
      };
    })
    .map((model) => {
      if (model.tipoDispositivo !== 'SIMULADOR' && model.tipoDispositivo !== 'AERONAVE') {
        fail(`${model.codigoCanonico}: tipo de dispositivo inválido`);
      }
      return model;
    });
}

/**
 * Pure DML builder. It only writes the curriculum catalog/version tables;
 * historical agendamentos, fichas, signatures and evaluations are never
 * referenced by any generated statement.
 */
export function buildPtoRev10ModelAndLinkStatements({
  plan,
  empresaId,
  importUuid,
  maxVersionByCode,
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) fail('empresa_id inválido');
  if (Number(plan.empresa_id) !== empresaId) fail('tenant do plano diverge');
  const statements = [];
  const versionEscaped = esc(plan.versao_matriz);
  const importEscaped = esc(importUuid);
  const modelRows = modelRowsFromPlan({ plan, maxVersionByCode });

  const usedTypes = [...new Set(modelRows.map((model) => model.tipoEstruturado))].map(
    getPtoRev10SessionType,
  );
  for (const type of usedTypes) {
    statements.push(`INSERT INTO tipos_sessao(codigo,nome,descricao,ativo,ordem,empresa_id,created_at,updated_at)
      SELECT '${esc(type.codigo)}','${esc(type.nome)}','Classificação curricular ${versionEscaped}',1,${type.ordem},${empresaId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM tipos_sessao
        WHERE empresa_id=${empresaId} AND codigo='${esc(type.codigo)}' AND deleted_at IS NULL
      );`);
  }

  statements.push(`INSERT INTO modelos_sessao(
      codigo,nome,tipo,descricao,duracao_estimada,ativo,tipo_sessao_id,modelo_aeronave,empresa_id,created_at,updated_at
    ) VALUES
    ${modelRows
      .map((model) => {
        const description = `Programa: ${model.programa}; natureza: ${model.natureza}; carga: ${model.cargaSessao}`;
        return `('${esc(model.codigoFisico)}','${esc(model.titulo)}','${esc(model.tipoDispositivo)}','${esc(description)}',${model.duracao},1,(SELECT id FROM tipos_sessao WHERE empresa_id=${empresaId} AND codigo='${esc(model.tipoSessaoCodigo)}' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1),'${esc(model.aeronave)}',${empresaId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
      })
      .join(',\n    ')};`);

  const modelsCte = `_models(codigo_canonico,codigo_fisico,previous_id,version_number,ordem_curricular,carga_sessao) AS (VALUES
    ${modelRows
      .map(
        (model) =>
          `('${esc(model.codigoCanonico)}','${esc(model.codigoFisico)}',${model.previousId == null ? 'NULL' : model.previousId},${model.versionNumber},${model.ordemCurricular},'${esc(model.cargaSessao)}')`,
      )
      .join(',\n    ')}
  )`;

  const linksCte = (items) => `_links(codigo_canonico,ordem,manobra_codigo,execucao_pf,fase_voo,tipo_conteudo,nome) AS (VALUES
    ${items
      .map(
        (item) =>
          `('${esc(item.modelo)}',${Number(item.ordem)},'${esc(item.codigo)}','${esc(item.execucao_pf || 'AB')}','${esc(item.fase_voo || '')}','${esc(item.tipo_conteudo || '')}','${esc(item.nome || '')}')`,
      )
      .join(',\n    ')}
  )`;

  for (const items of chunk(plan.items, LINKS_CHUNK_SIZE)) {
    const links = linksCte(items);
    statements.push(`WITH ${modelsCte}, ${links}
      INSERT INTO modelos_sessao_manobras(
        modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at
      )
      SELECT ms.id,res.manobra_id,link.ordem,1,
        CASE WHEN upper(link.execucao_pf)='A' THEN 'A'
             WHEN upper(link.execucao_pf)='B' THEN 'B'
             ELSE 'AB' END,
        link.nome,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM _links link
      JOIN _models model ON model.codigo_canonico=link.codigo_canonico
      JOIN modelos_sessao ms
        ON ms.codigo=model.codigo_fisico AND ms.empresa_id=${empresaId}
      JOIN simuladores_matriz_manobra_resolution res
        ON res.empresa_id=${empresaId}
       AND res.versao_matriz='${versionEscaped}'
       AND res.codigo_canonico=link.manobra_codigo
      JOIN manobras man
        ON man.id=res.manobra_id AND man.empresa_id=${empresaId} AND man.deleted_at IS NULL;`);

    statements.push(`WITH ${modelsCte}, ${links}
      INSERT INTO modelos_sessao_manobras_contexto(
        modelo_manobra_id,empresa_id,metadados_json
      )
      SELECT msm.id,${empresaId},json_object(
        'fase_voo',link.fase_voo,
        'tipo_conteudo',link.tipo_conteudo,
        'execucao_pf',link.execucao_pf,
        'nome',link.nome,
        'codigo_manobra',link.manobra_codigo,
        'fonte_normativa','PTO_REV10'
      )
      FROM _links link
      JOIN _models model ON model.codigo_canonico=link.codigo_canonico
      JOIN modelos_sessao ms
        ON ms.codigo=model.codigo_fisico AND ms.empresa_id=${empresaId}
      JOIN modelos_sessao_manobras msm
        ON msm.modelo_id=ms.id AND msm.ordem=link.ordem AND msm.deleted_at IS NULL;`);
  }

  statements.push(`WITH ${modelsCte}
    UPDATE modelos_sessao_versionamento
       SET is_current=0,efetivo_ate=CURRENT_TIMESTAMP
     WHERE empresa_id=${empresaId} AND is_current=1
       AND codigo_canonico IN (SELECT codigo_canonico FROM _models)
       AND modelo_id IN (SELECT previous_id FROM _models WHERE previous_id IS NOT NULL);`);

  statements.push(`WITH ${modelsCte}
    INSERT INTO modelos_sessao_versionamento(
      modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate
    )
    SELECT ms.id,${empresaId},model.codigo_canonico,model.version_number,'${versionEscaped}',1,model.previous_id,CURRENT_TIMESTAMP,NULL
      FROM _models model
      JOIN modelos_sessao ms
        ON ms.codigo=model.codigo_fisico AND ms.empresa_id=${empresaId};`);

  statements.push(`WITH ${modelsCte}
    INSERT INTO simuladores_matriz_import_changes(import_id,entidade,entity_id,operacao,after_json)
    SELECT imp.id,'modelos_sessao',ms.id,'INSERT',json_object(
      'codigo_canonico',model.codigo_canonico,
      'versao',model.version_number,
      'ordem_curricular',model.ordem_curricular,
      'carga_sessao',model.carga_sessao
    )
      FROM _models model
      JOIN modelos_sessao ms
        ON ms.codigo=model.codigo_fisico AND ms.empresa_id=${empresaId}
      JOIN simuladores_matriz_imports imp ON imp.uuid='${importEscaped}';`);

  return { statements, modelRows };
}

export const PTO_REV10_ALLOWED_MUTATION_TABLES = Object.freeze([
  'tipos_sessao',
  'modelos_sessao',
  'modelos_sessao_manobras',
  'modelos_sessao_manobras_contexto',
  'modelos_sessao_versionamento',
  'simuladores_matriz_import_changes',
]);

export const PTO_REV10_FORBIDDEN_HISTORICAL_TABLES = Object.freeze([
  'fichas_sessao',
  'ficha_manobras_avaliacao',
  'simulador_agendamentos',
  'simulador_agendamento_tripulantes',
  'assinaturas',
  'qualificacoes_historico',
]);
