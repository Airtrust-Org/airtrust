/**
 * Gerador canônico e idempotente de migração D1 para adequação integral do
 * AirTrust ao PTO Rev.10 V18 (SHA-256 040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912).
 *
 * Regras absolutas:
 * - O PTO aprovado é a única fonte canônica (88 sessões = 37 AW139 + 45 S76 + 6 INST/EXA).
 * - Nunca altera nem exclui fichas históricas, avaliações assinadas ou agendamentos.
 * - Não fabrica nem aprova guias operacionais sem evidência SOP/RFM/QRH/ECL.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { durationMinutesFromCanonicalLoad } from './simuladores-pto-rev10-packages.mjs';
import {
  assertPtoV18CanonicalPlan,
  PTO_V18_CANONICAL_FUNCTIONAL_SHA,
  PTO_V18_CANONICAL_NOTECHS_SHA,
  PTO_V18_CANONICAL_SESSIONS_SHA,
} from './simuladores-pto-v18-canonical-match.mjs';

export const PTO_V18_APPROVED_SOURCE_SHA =
  '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912';
export const PTO_V18_MATRIX_VERSION = 'PTO-REV10-V18';

const SESSION_TYPE_BY_PROGRAM = Object.freeze({
  Inicial: { structured: 'INICIAL', codigo: 'INI', nome: 'Inicial', ordem: 10 },
  'Transição': { structured: 'TRANSICAO', codigo: 'P10-TRN', nome: 'Transição PTO Rev10', ordem: 15 },
  'Periódico': { structured: 'PERIODICO', codigo: 'PER', nome: 'Periódico', ordem: 20 },
  Semestral: { structured: 'SEMESTRAL', codigo: 'SEM', nome: 'Semestral', ordem: 30 },
  'Requalificação': { structured: 'REQUALIFICACAO', codigo: 'P10-RQ', nome: 'Requalificação PTO Rev10', ordem: 50 },
  'Reaquisição de experiência recente': {
    structured: 'EXPERIENCIA_RECENTE',
    codigo: 'P10-REC',
    nome: 'Reaquisição de experiência recente PTO Rev10',
    ordem: 70,
  },
  'Treinamento noturno': { structured: 'NOTURNO', codigo: 'P10-NOT', nome: 'Treinamento noturno PTO Rev10', ordem: 80 },
  INSTRUTOR: { structured: 'INSTRUTOR', codigo: 'P10-INS', nome: 'Treinamento de Instrutor PTO Rev10', ordem: 90 },
  EXAMINADOR: { structured: 'EXAMINADOR', codigo: 'P10-EXA', nome: 'Treinamento de Examinador PTO Rev10', ordem: 100 },
});

const QUALIFICATION_MAP = Object.freeze({
  'A139-I-12/12': { gera: 1, qualificacaoTipoId: 33 },
  'A139-T-09/09': { gera: 1, qualificacaoTipoId: 33 },
  'A139-P-03/03': { gera: 1, qualificacaoTipoId: 33 },
  'A139-RQ-05/05': { gera: 1, qualificacaoTipoId: 33 },
  'A139-S-03/03': { gera: 1, qualificacaoTipoId: 106 },
  'A139-REC-01': { gera: 0, qualificacaoTipoId: 94 },
  'S76-I-12/12': { gera: 1, qualificacaoTipoId: 40 },
  'S76-T-09/09': { gera: 1, qualificacaoTipoId: 40 },
  'S76-P-03/03-C1': { gera: 1, qualificacaoTipoId: 40 },
  'S76-P-03/03-C2': { gera: 1, qualificacaoTipoId: 40 },
  'S76-P-03/03-C3': { gera: 1, qualificacaoTipoId: 40 },
  'S76-RQ-06/06': { gera: 1, qualificacaoTipoId: 40 },
  'S76-S-03/03': { gera: 1, qualificacaoTipoId: 178 },
  'S76-NOT-01': { gera: 1, qualificacaoTipoId: 93 },
  'S76-NOT-02': { gera: 1, qualificacaoTipoId: 91 },
  'S76-REC-01': { gera: 0, qualificacaoTipoId: 94 },
  'INST-E01': { gera: 0, qualificacaoTipoId: 46 },
  'INST-E02': { gera: 1, qualificacaoTipoId: 46 },
  'EXA-01/04': { gera: 0, qualificacaoTipoId: 47 },
  'EXA-02/04': { gera: 0, qualificacaoTipoId: 47 },
  'EXA-03/04': { gera: 0, qualificacaoTipoId: 47 },
  'EXA-04/04': { gera: 1, qualificacaoTipoId: 47 },
});

const FLIGHT_CURRICULA_ITEMS = Object.freeze([
  // G1 (33): AW139 Periódico (3 ciclos x 3 sessões; P-03/03 é compartilhada)
  { qualificacaoTipoId: 33, ciclo: 1, codigoCanonico: 'A139-P-01/03-C1', ordem: 1 },
  { qualificacaoTipoId: 33, ciclo: 1, codigoCanonico: 'A139-P-02/03-C1', ordem: 2 },
  { qualificacaoTipoId: 33, ciclo: 1, codigoCanonico: 'A139-P-03/03', ordem: 3 },
  { qualificacaoTipoId: 33, ciclo: 2, codigoCanonico: 'A139-P-01/03-C2', ordem: 1 },
  { qualificacaoTipoId: 33, ciclo: 2, codigoCanonico: 'A139-P-02/03-C2', ordem: 2 },
  { qualificacaoTipoId: 33, ciclo: 2, codigoCanonico: 'A139-P-03/03', ordem: 3 },
  { qualificacaoTipoId: 33, ciclo: 3, codigoCanonico: 'A139-P-01/03-C3', ordem: 1 },
  { qualificacaoTipoId: 33, ciclo: 3, codigoCanonico: 'A139-P-02/03-C3', ordem: 2 },
  { qualificacaoTipoId: 33, ciclo: 3, codigoCanonico: 'A139-P-03/03', ordem: 3 },
  // G1-SEM (106): AW139 Semestral (3 ciclos x 3 sessões canônicas)
  { qualificacaoTipoId: 106, ciclo: 1, codigoCanonico: 'A139-S-01/03', ordem: 1 },
  { qualificacaoTipoId: 106, ciclo: 1, codigoCanonico: 'A139-S-02/03', ordem: 2 },
  { qualificacaoTipoId: 106, ciclo: 1, codigoCanonico: 'A139-S-03/03', ordem: 3 },
  { qualificacaoTipoId: 106, ciclo: 2, codigoCanonico: 'A139-S-01/03', ordem: 1 },
  { qualificacaoTipoId: 106, ciclo: 2, codigoCanonico: 'A139-S-02/03', ordem: 2 },
  { qualificacaoTipoId: 106, ciclo: 2, codigoCanonico: 'A139-S-03/03', ordem: 3 },
  { qualificacaoTipoId: 106, ciclo: 3, codigoCanonico: 'A139-S-01/03', ordem: 1 },
  { qualificacaoTipoId: 106, ciclo: 3, codigoCanonico: 'A139-S-02/03', ordem: 2 },
  { qualificacaoTipoId: 106, ciclo: 3, codigoCanonico: 'A139-S-03/03', ordem: 3 },
  // G2 (40): SK76 Periódico (3 ciclos x 3 sessões regulares; AD é complementar condicional)
  { qualificacaoTipoId: 40, ciclo: 1, codigoCanonico: 'S76-P-01/03-C1', ordem: 1 },
  { qualificacaoTipoId: 40, ciclo: 1, codigoCanonico: 'S76-P-02/03-C1', ordem: 2 },
  { qualificacaoTipoId: 40, ciclo: 1, codigoCanonico: 'S76-P-03/03-C1', ordem: 3 },
  { qualificacaoTipoId: 40, ciclo: 2, codigoCanonico: 'S76-P-01/03-C2', ordem: 1 },
  { qualificacaoTipoId: 40, ciclo: 2, codigoCanonico: 'S76-P-02/03-C2', ordem: 2 },
  { qualificacaoTipoId: 40, ciclo: 2, codigoCanonico: 'S76-P-03/03-C2', ordem: 3 },
  { qualificacaoTipoId: 40, ciclo: 3, codigoCanonico: 'S76-P-01/03-C3', ordem: 1 },
  { qualificacaoTipoId: 40, ciclo: 3, codigoCanonico: 'S76-P-02/03-C3', ordem: 2 },
  { qualificacaoTipoId: 40, ciclo: 3, codigoCanonico: 'S76-P-03/03-C3', ordem: 3 },
]);

function readApprovedJson(filename, expectedSha256) {
  const url = new URL(`../../../scripts/operations/pto-v18-canonical/${filename}`, import.meta.url);
  const raw = readFileSync(url);
  const actualSha = createHash('sha256').update(raw).digest('hex');
  if (expectedSha256 && actualSha !== expectedSha256) {
    throw new Error(`PTO V18: hash divergente em ${filename} (esperado ${expectedSha256}, obtido ${actualSha})`);
  }
  return JSON.parse(raw.toString('utf8'));
}

export function loadApprovedPtoV18CanonicalData() {
  const manifest = readApprovedJson('manifest.json');
  if (manifest.source_sha256 !== PTO_V18_APPROVED_SOURCE_SHA) {
    throw new Error('PTO V18: manifest.json com source_sha256 inválido');
  }
  const sessions = readApprovedJson('sessoes_pto_v18.json', PTO_V18_CANONICAL_SESSIONS_SHA);
  const functional = readApprovedJson('funcionais_pto_v18.json', PTO_V18_CANONICAL_FUNCTIONAL_SHA);
  const notechs = readApprovedJson('notechs_pto_v18.json', PTO_V18_CANONICAL_NOTECHS_SHA);
  return { manifest, sessions, functional, notechs };
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function sqlText(value) {
  return value == null ? 'NULL' : `'${esc(value)}'`;
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function inferManeuverCategory(code, isFunctional) {
  if (isFunctional) {
    return code.startsWith('INST-') ? 'INSTRUTOR' : 'EXAMINADOR';
  }
  if (code.startsWith('WAR-') || code.startsWith('CAU-') || code.startsWith('ABN-') || code.startsWith('EMG-')) {
    return 'EMERGENCIAS';
  }
  return 'PROCEDIMENTOS';
}

export function buildCanonicalPtoV18Plan() {
  const { sessions, functional, notechs } = loadApprovedPtoV18CanonicalData();
  const models = [];
  const items = [];
  const maneuverCatalog = new Map();

  let ordemCurricular = 1;
  for (const session of sessions) {
    const aircraft = session.aeronave === 'S76' ? 'SK76' : 'AW139';
    const typeDef = SESSION_TYPE_BY_PROGRAM[session.programa];
    if (!typeDef) throw new Error(`Programa não mapeado: ${session.programa}`);
    const qual = QUALIFICATION_MAP[session.codigo] || { gera: 0, qualificacaoTipoId: null };
    const duration = durationMinutesFromCanonicalLoad(session.carga);

    models.push({
      codigo: session.codigo,
      titulo: session.titulo,
      programa: session.programa,
      natureza: /check|exame/i.test(session.titulo) ? 'CHECK' : 'TREINAMENTO',
      tipo_estruturado: typeDef.structured,
      tipo_sessao_codigo: typeDef.codigo,
      tipo_sessao_nome: typeDef.nome,
      tipo_sessao_ordem: typeDef.ordem,
      carga_sessao: session.carga,
      duracao_estimada_minutos: duration,
      ordem_curricular: ordemCurricular++,
      aeronave: aircraft,
      tipo_dispositivo: 'SIMULADOR',
      gera_qualificacao: qual.gera,
      qualificacao_tipo_id: qual.qualificacaoTipoId,
    });

    for (let i = 0; i < session.itens.length; i += 1) {
      const item = session.itens[i];
      const execucaoPf = i < 9 ? 'A' : 'B';
      items.push({
        modelo: session.codigo,
        ordem: item.ordem,
        codigo: item.codigo,
        nome: item.nome,
        execucao_pf: execucaoPf,
        aeronave: aircraft,
      });

      const existing = maneuverCatalog.get(item.codigo);
      if (existing && (existing.tipo_aeronave !== aircraft || existing.nome !== item.nome)) {
        // Keep aircraft-specific catalog consistent; PTO codes are unique per aircraft family
        throw new Error(`Conflito no catálogo para código ${item.codigo}`);
      }
      maneuverCatalog.set(item.codigo, {
        codigo: item.codigo,
        nome: item.nome,
        tipo_aeronave: aircraft,
        categoria: inferManeuverCategory(item.codigo, false),
        tipo_sessao: 'TREINAMENTO',
      });
    }
  }

  for (const session of functional) {
    const isInst = session.codigo.startsWith('INST-');
    const typeDef = isInst ? SESSION_TYPE_BY_PROGRAM.INSTRUTOR : SESSION_TYPE_BY_PROGRAM.EXAMINADOR;
    const qual = QUALIFICATION_MAP[session.codigo] || { gera: 0, qualificacaoTipoId: null };
    const duration = durationMinutesFromCanonicalLoad(session.carga);

    models.push({
      codigo: session.codigo,
      titulo: session.titulo,
      programa: isInst ? 'Instrutor' : 'Examinador',
      natureza: isInst ? 'INSTRUTOR' : 'EXAMINADOR',
      tipo_estruturado: typeDef.structured,
      tipo_sessao_codigo: typeDef.codigo,
      tipo_sessao_nome: typeDef.nome,
      tipo_sessao_ordem: typeDef.ordem,
      carga_sessao: session.carga,
      duracao_estimada_minutos: duration,
      ordem_curricular: ordemCurricular++,
      aeronave: null,
      tipo_dispositivo: 'SIMULADOR',
      gera_qualificacao: qual.gera,
      qualificacao_tipo_id: qual.qualificacaoTipoId,
    });

    for (const item of session.itens) {
      items.push({
        modelo: session.codigo,
        ordem: item.ordem,
        codigo: item.codigo,
        nome: item.nome,
        execucao_pf: 'AB',
        aeronave: null,
      });

      maneuverCatalog.set(item.codigo, {
        codigo: item.codigo,
        nome: item.nome,
        tipo_aeronave: null,
        categoria: inferManeuverCategory(item.codigo, true),
        tipo_sessao: isInst ? 'INSTRUTOR' : 'EXAMINADOR',
      });
    }
  }

  const plan = {
    canonical_contract_sha256: PTO_V18_CANONICAL_SESSIONS_SHA,
    approved_source_sha256: PTO_V18_APPROVED_SOURCE_SHA,
    models,
    items,
    notechs: notechs.map((n, index) => ({
      codigo: n.codigo,
      nome: n.elemento,
      categoria: n.categoria,
      evidencia_observavel: n.evidencia,
      ordem: 1001 + index,
    })),
    maneuvers: [...maneuverCatalog.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)),
  };

  assertPtoV18CanonicalPlan(plan);
  return plan;
}

export function buildPtoV18CanonicalMigrationStatements({
  empresaId = 6,
  versaoMatriz = PTO_V18_MATRIX_VERSION,
  versionNumber = 1,
} = {}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) throw new Error('empresa_id inválido');
  const plan = buildCanonicalPtoV18Plan();
  const statements = [];
  const refJson = JSON.stringify({
    fonte_normativa: 'PRG-OPS-001_PTO_Rev10_V18.docx',
    sha256: PTO_V18_APPROVED_SOURCE_SHA,
    versao_matriz: versaoMatriz,
  });

  // 1. Tipos de sessão necessários
  const seenTypes = new Map();
  for (const m of plan.models) {
    seenTypes.set(m.tipo_sessao_codigo, {
      codigo: m.tipo_sessao_codigo,
      nome: m.tipo_sessao_nome,
      ordem: m.tipo_sessao_ordem,
    });
  }
  for (const t of seenTypes.values()) {
    statements.push(
      `INSERT INTO tipos_sessao(codigo,nome,descricao,ativo,ordem,empresa_id,created_at,updated_at)
SELECT '${esc(t.codigo)}','${esc(t.nome)}','Classificação curricular ${esc(versaoMatriz)}',1,${t.ordem},${empresaId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM empresas WHERE id=${empresaId})
  AND NOT EXISTS (SELECT 1 FROM tipos_sessao WHERE empresa_id=${empresaId} AND codigo='${esc(t.codigo)}' AND deleted_at IS NULL);`,
    );
  }

  // 2. Catálogo de manobras (531 técnicas + 94 funcionais = 625)
  for (const man of plan.maneuvers) {
    statements.push(
      `UPDATE manobras
   SET nome='${esc(man.nome)}',
       tipo_aeronave=${sqlText(man.tipo_aeronave)},
       categoria='${esc(man.categoria)}',
       tipo_sessao='${esc(man.tipo_sessao)}',
       referencias_json='${esc(refJson)}',
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now')
 WHERE empresa_id=${empresaId} AND codigo='${esc(man.codigo)}' AND deleted_at IS NULL;`,
    );
    statements.push(
      `INSERT INTO manobras(codigo,nome,categoria,descricao,tipo_sessao,tipo_aeronave,ordem,empresa_id,referencias_json,created_at,updated_at)
SELECT '${esc(man.codigo)}','${esc(man.nome)}','${esc(man.categoria)}','${esc(man.nome)}','${esc(man.tipo_sessao)}',${sqlText(man.tipo_aeronave)},1,${empresaId},'${esc(refJson)}',strftime('%Y-%m-%d %H:%M:%S','now'),strftime('%Y-%m-%d %H:%M:%S','now')
WHERE EXISTS (SELECT 1 FROM empresas WHERE id=${empresaId})
  AND NOT EXISTS (SELECT 1 FROM manobras WHERE empresa_id=${empresaId} AND codigo='${esc(man.codigo)}' AND deleted_at IS NULL);`,
    );
  }

  // 3. Modelos de sessão (88) — append-only, preserva históricos e fichas
  for (const m of plan.models) {
    const physicalCode = `${m.codigo}@${versaoMatriz}-V${versionNumber}`;
    const desc = `Programa: ${m.programa}; natureza: ${m.natureza}; carga: ${m.carga_sessao}`;
    const qualExpr = m.qualificacao_tipo_id == null
      ? 'NULL'
      : `(SELECT id FROM qualificacoes_tipos WHERE id=${m.qualificacao_tipo_id} AND empresa_id=${empresaId} AND deleted_at IS NULL LIMIT 1)`;
    statements.push(
      `INSERT INTO modelos_sessao(
  codigo,nome,tipo,descricao,duracao_estimada,ordem_no_treinamento,ativo,
  tipo_sessao_id,modelo_aeronave,gera_qualificacao,qualificacao_tipo_id,empresa_id,created_at,updated_at
)
SELECT '${esc(physicalCode)}','${esc(m.titulo)}','${esc(m.tipo_dispositivo)}','${esc(desc)}',${m.duracao_estimada_minutos},${m.ordem_curricular},1,
  (SELECT id FROM tipos_sessao WHERE empresa_id=${empresaId} AND codigo='${esc(m.tipo_sessao_codigo)}' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1),
  ${sqlText(m.aeronave)},${m.gera_qualificacao},${qualExpr},${empresaId},datetime('now'),datetime('now')
WHERE EXISTS (SELECT 1 FROM empresas WHERE id=${empresaId})
  AND NOT EXISTS (SELECT 1 FROM modelos_sessao WHERE empresa_id=${empresaId} AND codigo='${esc(physicalCode)}' AND deleted_at IS NULL);`,
    );
  }

  // 4. Superar versões anteriores ativas (sem excluir nem mutar histórico/fichas)
  statements.push(
    `UPDATE modelos_sessao
   SET ativo=0, updated_at=datetime('now')
 WHERE empresa_id=${empresaId}
   AND ativo=1
   AND deleted_at IS NULL
   AND codigo NOT LIKE '%@${esc(versaoMatriz)}-V${versionNumber}';`,
  );
  statements.push(
    `UPDATE modelos_sessao_versionamento
   SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
 WHERE empresa_id=${empresaId}
   AND is_current=1
   AND versao_matriz != '${esc(versaoMatriz)}';`,
  );

  // 5. Registrar versionamento corrente dos 88 modelos PTO-REV10-V18
  for (const m of plan.models) {
    const physicalCode = `${m.codigo}@${versaoMatriz}-V${versionNumber}`;
    statements.push(
      `INSERT INTO modelos_sessao_versionamento(
  modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate
)
SELECT ms.id,${empresaId},'${esc(m.codigo)}',${versionNumber},'${esc(versaoMatriz)}',1,
  (SELECT msv_old.modelo_id FROM modelos_sessao_versionamento msv_old
    WHERE msv_old.empresa_id=${empresaId} AND msv_old.codigo_canonico='${esc(m.codigo)}' AND msv_old.modelo_id != ms.id
    ORDER BY msv_old.versao_numero DESC, msv_old.modelo_id DESC LIMIT 1),
  CURRENT_TIMESTAMP,NULL
FROM modelos_sessao ms
WHERE ms.empresa_id=${empresaId}
  AND ms.codigo='${esc(physicalCode)}'
  AND ms.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM modelos_sessao_versionamento msv WHERE msv.modelo_id=ms.id);`,
    );
  }

  // 6. Vincular as 1.584 posições (1.476 técnicas + 108 funcionais)
  for (const itemsChunk of chunk(plan.items, 120)) {
    const cte = `_pto_links(codigo_canonico,codigo_fisico,ordem,manobra_codigo,execucao_pf,nome) AS (VALUES
  ${itemsChunk
    .map(
      (item) =>
        `('${esc(item.modelo)}','${esc(`${item.modelo}@${versaoMatriz}-V${versionNumber}`)}',${item.ordem},'${esc(item.codigo)}','${esc(item.execucao_pf)}','${esc(item.nome)}')`,
    )
    .join(',\n  ')}
)`;
    statements.push(
      `WITH ${cte}
INSERT INTO modelos_sessao_manobras(
  modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at
)
SELECT ms.id,man.id,link.ordem,1,link.execucao_pf,link.nome,datetime('now'),datetime('now')
FROM _pto_links link
JOIN modelos_sessao ms ON ms.empresa_id=${empresaId} AND ms.codigo=link.codigo_fisico AND ms.deleted_at IS NULL
JOIN manobras man ON man.empresa_id=${empresaId} AND man.codigo=link.manobra_codigo AND man.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM modelos_sessao_manobras existing
   WHERE existing.modelo_id=ms.id AND existing.ordem=link.ordem AND existing.deleted_at IS NULL
);`,
    );

    statements.push(
      `WITH ${cte}
INSERT INTO modelos_sessao_manobras_contexto(
  modelo_manobra_id,empresa_id,metadados_json
)
SELECT msm.id,${empresaId},json_object(
  'execucao_pf',link.execucao_pf,
  'nome',link.nome,
  'codigo_manobra',link.manobra_codigo,
  'fonte_normativa','PTO_REV10_V18',
  'pto_sha256','${PTO_V18_APPROVED_SOURCE_SHA}'
)
FROM _pto_links link
JOIN modelos_sessao ms ON ms.empresa_id=${empresaId} AND ms.codigo=link.codigo_fisico AND ms.deleted_at IS NULL
JOIN modelos_sessao_manobras msm ON msm.modelo_id=ms.id AND msm.ordem=link.ordem AND msm.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM modelos_sessao_manobras_contexto ctx WHERE ctx.modelo_manobra_id=msm.id
);`,
    );
  }

  // 7. Atualizar currículos de voo (G1=33, G1-SEM=106, G2=40) para os modelos PTO-REV10-V18
  statements.push(
    `UPDATE simuladores_curriculos_voo_itens
   SET deleted_at=datetime('now'), updated_at=datetime('now')
 WHERE empresa_id=${empresaId}
   AND qualificacao_tipo_id IN (33, 106, 40)
   AND deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM modelos_sessao ms WHERE ms.empresa_id=${empresaId} AND ms.codigo='A139-P-01/03-C1@${esc(versaoMatriz)}-V${versionNumber}' AND ms.deleted_at IS NULL)
   AND modelo_sessao_id NOT IN (
     SELECT id FROM modelos_sessao WHERE empresa_id=${empresaId} AND codigo LIKE '%@${esc(versaoMatriz)}-V${versionNumber}' AND deleted_at IS NULL
   );`,
  );

  for (const item of FLIGHT_CURRICULA_ITEMS) {
    const physicalCode = `${item.codigoCanonico}@${versaoMatriz}-V${versionNumber}`;
    statements.push(
      `INSERT INTO simuladores_curriculos_voo_itens(
  empresa_id,qualificacao_tipo_id,ciclo,modelo_sessao_id,codigo_canonico,ordem,created_at,updated_at
)
SELECT ${empresaId},${item.qualificacaoTipoId},${item.ciclo},ms.id,'${esc(item.codigoCanonico)}',${item.ordem},datetime('now'),datetime('now')
FROM modelos_sessao ms
WHERE ms.empresa_id=${empresaId}
  AND ms.codigo='${esc(physicalCode)}'
  AND ms.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM simuladores_curriculos_voo_config cfg WHERE cfg.empresa_id=${empresaId} AND cfg.qualificacao_tipo_id=${item.qualificacaoTipoId} AND cfg.deleted_at IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM simuladores_curriculos_voo_itens existing
     WHERE existing.empresa_id=${empresaId}
       AND existing.qualificacao_tipo_id=${item.qualificacaoTipoId}
       AND existing.ciclo=${item.ciclo}
       AND existing.codigo_canonico='${esc(item.codigoCanonico)}'
       AND existing.deleted_at IS NULL
  );`,
    );
  }

  return statements;
}

export function buildPtoV18CanonicalRollbackStatements({
  empresaId = 6,
  versaoMatriz = PTO_V18_MATRIX_VERSION,
  versionNumber = 1,
} = {}) {
  return [
    `UPDATE modelos_sessao SET ativo=0, updated_at=datetime('now')
 WHERE empresa_id=${empresaId} AND codigo LIKE '%@${esc(versaoMatriz)}-V${versionNumber}' AND deleted_at IS NULL;`,
    `UPDATE modelos_sessao_versionamento SET is_current=0, efetivo_ate=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
 WHERE empresa_id=${empresaId} AND versao_matriz='${esc(versaoMatriz)}' AND is_current=1;`,
    `UPDATE modelos_sessao SET ativo=1, updated_at=datetime('now')
 WHERE empresa_id=${empresaId} AND deleted_at IS NULL
   AND id IN (
     SELECT msv.modelo_id FROM modelos_sessao_versionamento msv
      WHERE msv.empresa_id=${empresaId} AND msv.versao_matriz IN ('M2026.07','M2026.07-REMEDIATION')
        AND msv.versao_numero = (
          SELECT MAX(m2.versao_numero) FROM modelos_sessao_versionamento m2
           WHERE m2.empresa_id=${empresaId} AND m2.codigo_canonico=msv.codigo_canonico AND m2.versao_matriz != '${esc(versaoMatriz)}'
        )
   );`,
  ];
}
