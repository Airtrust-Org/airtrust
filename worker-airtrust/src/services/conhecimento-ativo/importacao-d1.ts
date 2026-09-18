import type { Env } from '../../types';
import type {
  ConhecimentoImportApplyResult,
  ConhecimentoImportIssue,
  ConhecimentoImportRow,
} from './importacao';
import { normalizarModeloConhecimento } from './challenge-service';

const TEMPLATE_VERSION = '1.0';
const MAX_ROWS_PER_SQL_CHUNK = 100;
const MAX_JSON_BYTES_PER_CHUNK = 900_000;
const encoder = new TextEncoder();

type ExistingSource = {
  id: number;
  tipo_documento: string;
  titulo: string;
  revisao: string;
  aeronave_modelo: string | null;
  data_revisao: string | null;
};

type ExistingTopic = {
  id: number;
  codigo: string;
  nome: string;
  aeronave_modelo: string | null;
};

type ExistingItem = {
  id: number;
  codigo: string;
  titulo: string;
  conceito: string;
  resumo_essencial: string | null;
  criticidade: string;
  tempo_estudo_segundos: number;
  aeronave_modelo: string | null;
  topico_codigo: string;
};

type ExistingQuestion = {
  id: number;
  item_codigo: string;
  variante_chave: string;
  tipo: string;
  enunciado: string;
  explicacao: string;
  o_que_guardar: string | null;
  dificuldade: number;
};

type ExistingAlternative = {
  questao_id: number;
  texto: string;
  correta: number;
  ordem: number;
};

type ExistingState = {
  sources: Map<string, ExistingSource>;
  topics: Map<string, ExistingTopic>;
  items: Map<string, ExistingItem>;
  questions: Map<string, ExistingQuestion>;
  alternatives: Map<number, ExistingAlternative[]>;
};

export type DecoratedImportRow = ConhecimentoImportRow & {
  sourceAction: 'INSERIDO' | 'IGNORADO';
  topicAction: 'INSERIDO' | 'IGNORADO';
  itemAction: 'INSERIDO' | 'IGNORADO';
  questionAction: 'INSERIDO' | 'IGNORADO';
};

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function normalizeModel(value: string | null): string {
  return value ? normalizarModeloConhecimento(value) : '';
}

function sourceKeyParts(
  tipo: string,
  titulo: string,
  revisao: string,
  aeronaveModelo: string | null,
): string {
  return [
    tipo.toUpperCase(),
    normalizeText(titulo),
    normalizeText(revisao),
    normalizeModel(aeronaveModelo),
  ].join('|');
}

function sourceKey(row: ConhecimentoImportRow): string {
  return sourceKeyParts(
    row.fonteTipo,
    row.fonteTitulo,
    row.fonteRevisao,
    row.aeronaveModelo,
  );
}

function topicKey(row: ConhecimentoImportRow): string {
  return row.topicoCodigo;
}

function itemKey(row: ConhecimentoImportRow): string {
  return row.itemCodigo;
}

function questionKey(row: ConhecimentoImportRow): string {
  return row.itemCodigo + '|' + row.questaoVariante;
}

function dbConflict(linha: number, campo: string, erro: string): ConhecimentoImportIssue {
  return { linha, campo, erro };
}

async function loadExistingState(db: D1Database, empresaId: number): Promise<ExistingState> {
  const [sourceResult, topicResult, itemResult, questionResult, alternativeResult] =
    await Promise.all([
      db
        .prepare(
          'SELECT id,tipo_documento,titulo,revisao,aeronave_modelo,data_revisao ' +
            'FROM conhecimento_ativo_fontes WHERE empresa_id=? AND deleted_at IS NULL',
        )
        .bind(empresaId)
        .all<ExistingSource>(),
      db
        .prepare(
          'SELECT id,codigo,nome,aeronave_modelo FROM conhecimento_ativo_topicos ' +
            'WHERE empresa_id=? AND deleted_at IS NULL',
        )
        .bind(empresaId)
        .all<ExistingTopic>(),
      db
        .prepare(
          'SELECT i.id,i.codigo,i.titulo,i.conceito,i.resumo_essencial,i.criticidade,' +
            'i.tempo_estudo_segundos,i.aeronave_modelo,t.codigo AS topico_codigo ' +
            'FROM conhecimento_ativo_itens i ' +
            'JOIN conhecimento_ativo_topicos t ON t.id=i.topico_id AND t.empresa_id=i.empresa_id ' +
            'WHERE i.empresa_id=? AND i.deleted_at IS NULL',
        )
        .bind(empresaId)
        .all<ExistingItem>(),
      db
        .prepare(
          'SELECT q.id,i.codigo AS item_codigo,q.variante_chave,q.tipo,q.enunciado,' +
            'q.explicacao,q.o_que_guardar,q.dificuldade ' +
            'FROM conhecimento_ativo_questoes q ' +
            'JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id ' +
            'WHERE q.empresa_id=? AND q.deleted_at IS NULL',
        )
        .bind(empresaId)
        .all<ExistingQuestion>(),
      db
        .prepare(
          'SELECT a.questao_id,a.texto,a.correta,a.ordem ' +
            'FROM conhecimento_ativo_alternativas a ' +
            'JOIN conhecimento_ativo_questoes q ON q.id=a.questao_id AND q.empresa_id=a.empresa_id ' +
            'WHERE a.empresa_id=? AND a.deleted_at IS NULL AND q.deleted_at IS NULL ' +
            'ORDER BY a.questao_id,a.ordem',
        )
        .bind(empresaId)
        .all<ExistingAlternative>(),
    ]);

  const sources = new Map<string, ExistingSource>();
  for (const row of sourceResult.results || []) {
    sources.set(
      sourceKeyParts(row.tipo_documento, row.titulo, row.revisao, row.aeronave_modelo),
      row,
    );
  }

  const topics = new Map<string, ExistingTopic>();
  for (const row of topicResult.results || []) topics.set(row.codigo, row);

  const items = new Map<string, ExistingItem>();
  for (const row of itemResult.results || []) items.set(row.codigo, row);

  const questions = new Map<string, ExistingQuestion>();
  for (const row of questionResult.results || []) {
    questions.set(row.item_codigo + '|' + row.variante_chave, row);
  }

  const alternatives = new Map<number, ExistingAlternative[]>();
  for (const row of alternativeResult.results || []) {
    const list = alternatives.get(row.questao_id) || [];
    list.push(row);
    alternatives.set(row.questao_id, list);
  }

  return { sources, topics, items, questions, alternatives };
}

export async function validarConflitosBanco(params: {
  db: D1Database;
  empresaId: number;
  rows: ConhecimentoImportRow[];
}): Promise<ConhecimentoImportIssue[]> {
  const { db, empresaId, rows } = params;
  const state = await loadExistingState(db, empresaId);
  const errors: ConhecimentoImportIssue[] = [];

  for (const row of rows) {
    const source = state.sources.get(sourceKey(row));
    if (source && (source.data_revisao || null) !== row.fonteDataRevisao) {
      errors.push(
        dbConflict(
          row.linha,
          'fonte_revisao',
          'A fonte já existe com metadados diferentes.',
        ),
      );
    }

    const topic = state.topics.get(topicKey(row));
    if (
      topic &&
      (topic.nome !== row.topicoNome ||
        normalizeModel(topic.aeronave_modelo) !== normalizeModel(row.aeronaveModelo))
    ) {
      errors.push(
        dbConflict(
          row.linha,
          'topico_codigo',
          'O tópico já existe com definição diferente.',
        ),
      );
    }

    const item = state.items.get(itemKey(row));
    if (
      item &&
      (item.titulo !== row.itemTitulo ||
        item.conceito !== row.itemConceito ||
        (item.resumo_essencial || null) !== row.itemResumoEssencial ||
        item.criticidade !== row.criticidade ||
        Number(item.tempo_estudo_segundos) !== row.tempoEstudoSegundos ||
        normalizeModel(item.aeronave_modelo) !== normalizeModel(row.aeronaveModelo) ||
        item.topico_codigo !== row.topicoCodigo)
    ) {
      errors.push(
        dbConflict(
          row.linha,
          'item_codigo',
          'O item já existe com conteúdo diferente.',
        ),
      );
    }

    const question = state.questions.get(questionKey(row));
    if (!question) continue;

    if (
      question.tipo !== row.questaoTipo ||
      question.enunciado !== row.questaoEnunciado ||
      question.explicacao !== row.questaoExplicacao ||
      (question.o_que_guardar || '') !== row.questaoOQueGuardar ||
      Number(question.dificuldade) !== row.dificuldade
    ) {
      errors.push(
        dbConflict(
          row.linha,
          'questao_variante',
          'A questão já existe com conteúdo diferente. Use nova variante ou revise manualmente.',
        ),
      );
      continue;
    }

    const current = (state.alternatives.get(question.id) || []).map((alternative) => [
      alternative.texto,
      Number(alternative.correta) === 1,
    ]);
    const incoming = row.alternativas.map((alternative) => [
      alternative.texto,
      alternative.correta,
    ]);
    if (JSON.stringify(current) !== JSON.stringify(incoming)) {
      errors.push(
        dbConflict(
          row.linha,
          'alternativa_a',
          'A questão já existe com alternativas diferentes. Use nova variante ou revise manualmente.',
        ),
      );
    }
  }

  return errors;
}

function decorateRows(
  rows: ConhecimentoImportRow[],
  state: ExistingState,
): {
  rows: DecoratedImportRow[];
  inserted: ConhecimentoImportApplyResult['inserted'];
  ignored: ConhecimentoImportApplyResult['ignored'];
} {
  const uniqueSources = new Set<string>();
  const uniqueTopics = new Set<string>();
  const uniqueItems = new Set<string>();
  const uniqueQuestions = new Set<string>();

  const inserted = { fontes: 0, topicos: 0, itens: 0, questoes: 0, alternativas: 0 };
  const ignored = { fontes: 0, topicos: 0, itens: 0, questoes: 0 };

  const decorated = rows.map((row) => {
    const skey = sourceKey(row);
    const tkey = topicKey(row);
    const ikey = itemKey(row);
    const qkey = questionKey(row);

    const sourceExists = state.sources.has(skey);
    const topicExists = state.topics.has(tkey);
    const itemExists = state.items.has(ikey);
    const questionExists = state.questions.has(qkey);

    if (!uniqueSources.has(skey)) {
      sourceExists ? (ignored.fontes += 1) : (inserted.fontes += 1);
      uniqueSources.add(skey);
    }
    if (!uniqueTopics.has(tkey)) {
      topicExists ? (ignored.topicos += 1) : (inserted.topicos += 1);
      uniqueTopics.add(tkey);
    }
    if (!uniqueItems.has(ikey)) {
      itemExists ? (ignored.itens += 1) : (inserted.itens += 1);
      uniqueItems.add(ikey);
    }
    if (!uniqueQuestions.has(qkey)) {
      if (questionExists) {
        ignored.questoes += 1;
      } else {
        inserted.questoes += 1;
        inserted.alternativas += row.alternativas.length;
      }
      uniqueQuestions.add(qkey);
    }

    const sourceAction: DecoratedImportRow['sourceAction'] = sourceExists
      ? 'IGNORADO'
      : 'INSERIDO';
    const topicAction: DecoratedImportRow['topicAction'] = topicExists
      ? 'IGNORADO'
      : 'INSERIDO';
    const itemAction: DecoratedImportRow['itemAction'] = itemExists
      ? 'IGNORADO'
      : 'INSERIDO';
    const questionAction: DecoratedImportRow['questionAction'] = questionExists
      ? 'IGNORADO'
      : 'INSERIDO';

    return {
      ...row,
      sourceAction,
      topicAction,
      itemAction,
      questionAction,
    };
  });

  return { rows: decorated, inserted, ignored };
}

export function buildImportPayloadChunks(rows: DecoratedImportRow[]): string[] {
  const payloads: string[] = [];
  let current: DecoratedImportRow[] = [];
  let currentBytes = 2;

  const flush = () => {
    if (!current.length) return;
    payloads.push(JSON.stringify(current));
    current = [];
    currentBytes = 2;
  };

  for (const row of rows) {
    const serialized = JSON.stringify(row);
    const rowBytes = encoder.encode(serialized).byteLength + 1;
    if (rowBytes > MAX_JSON_BYTES_PER_CHUNK) {
      throw new Error(
        'Uma linha da planilha excede o tamanho técnico permitido para importação.',
      );
    }
    if (
      current.length >= MAX_ROWS_PER_SQL_CHUNK ||
      currentBytes + rowBytes > MAX_JSON_BYTES_PER_CHUNK
    ) {
      flush();
    }
    current.push(row);
    currentBytes += rowBytes;
  }

  flush();
  return payloads;
}

const INSERT_SOURCES_SQL = [
  "WITH input(row) AS (SELECT value FROM json_each(?))",
  "INSERT OR IGNORE INTO conhecimento_ativo_fontes",
  "  (empresa_id,tipo_documento,titulo,aeronave_modelo,revisao,data_revisao,status)",
  "SELECT DISTINCT",
  "  ?,",
  "  json_extract(row,'$.fonteTipo'),",
  "  json_extract(row,'$.fonteTitulo'),",
  "  json_extract(row,'$.aeronaveModelo'),",
  "  json_extract(row,'$.fonteRevisao'),",
  "  json_extract(row,'$.fonteDataRevisao'),",
  "  'RASCUNHO'",
  "FROM input",
  "WHERE json_extract(row,'$.sourceAction')='INSERIDO';",
].join('\n');

const INSERT_TOPICS_SQL = [
  "WITH input(row) AS (SELECT value FROM json_each(?))",
  "INSERT OR IGNORE INTO conhecimento_ativo_topicos",
  "  (empresa_id,codigo,nome,aeronave_modelo,ordem)",
  "SELECT DISTINCT",
  "  ?,",
  "  json_extract(row,'$.topicoCodigo'),",
  "  json_extract(row,'$.topicoNome'),",
  "  json_extract(row,'$.aeronaveModelo'),",
  "  0",
  "FROM input",
  "WHERE json_extract(row,'$.topicAction')='INSERIDO';",
].join('\n');

const INSERT_ITEMS_SQL = [
  "WITH input(row) AS (SELECT value FROM json_each(?))",
  "INSERT OR IGNORE INTO conhecimento_ativo_itens",
  "  (empresa_id,topico_id,codigo,aeronave_modelo,titulo,conceito,resumo_essencial,",
  "   criticidade,tempo_estudo_segundos,status)",
  "SELECT",
  "  ?,",
  "  (SELECT t.id FROM conhecimento_ativo_topicos t",
  "    WHERE t.empresa_id=?",
  "      AND t.codigo=json_extract(input.row,'$.topicoCodigo')",
  "      AND t.deleted_at IS NULL LIMIT 1),",
  "  json_extract(input.row,'$.itemCodigo'),",
  "  json_extract(input.row,'$.aeronaveModelo'),",
  "  json_extract(input.row,'$.itemTitulo'),",
  "  json_extract(input.row,'$.itemConceito'),",
  "  json_extract(input.row,'$.itemResumoEssencial'),",
  "  json_extract(input.row,'$.criticidade'),",
  "  json_extract(input.row,'$.tempoEstudoSegundos'),",
  "  'EM_REVISAO'",
  "FROM input",
  "WHERE json_extract(input.row,'$.itemAction')='INSERIDO';",
].join('\n');

const INSERT_ITEM_SOURCES_SQL = [
  "WITH input(row) AS (SELECT value FROM json_each(?))",
  "INSERT OR IGNORE INTO conhecimento_ativo_item_fontes",
  "  (empresa_id,item_id,fonte_id,secao,pagina,referencia,principal)",
  "SELECT",
  "  ?,",
  "  (SELECT i.id FROM conhecimento_ativo_itens i",
  "    WHERE i.empresa_id=?",
  "      AND i.codigo=json_extract(input.row,'$.itemCodigo')",
  "      AND i.deleted_at IS NULL LIMIT 1),",
  "  (SELECT f.id FROM conhecimento_ativo_fontes f",
  "    WHERE f.empresa_id=?",
  "      AND f.tipo_documento=json_extract(input.row,'$.fonteTipo')",
  "      AND LOWER(TRIM(f.titulo))=LOWER(TRIM(json_extract(input.row,'$.fonteTitulo')))",
  "      AND LOWER(TRIM(f.revisao))=LOWER(TRIM(json_extract(input.row,'$.fonteRevisao')))",
  "      AND COALESCE(f.aeronave_modelo,'')=COALESCE(json_extract(input.row,'$.aeronaveModelo'),'')",
  "      AND f.deleted_at IS NULL LIMIT 1),",
  "  json_extract(input.row,'$.fonteSecao'),",
  "  json_extract(input.row,'$.fontePagina'),",
  "  json_extract(input.row,'$.fonteReferencia'),",
  "  1",
  "FROM input;",
].join('\n');

const INSERT_QUESTIONS_SQL = [
  "WITH input(row) AS (SELECT value FROM json_each(?))",
  "INSERT OR IGNORE INTO conhecimento_ativo_questoes",
  "  (empresa_id,item_id,variante_chave,tipo,enunciado,explicacao,o_que_guardar,dificuldade,status)",
  "SELECT",
  "  ?,",
  "  (SELECT i.id FROM conhecimento_ativo_itens i",
  "    WHERE i.empresa_id=?",
  "      AND i.codigo=json_extract(input.row,'$.itemCodigo')",
  "      AND i.deleted_at IS NULL LIMIT 1),",
  "  json_extract(input.row,'$.questaoVariante'),",
  "  json_extract(input.row,'$.questaoTipo'),",
  "  json_extract(input.row,'$.questaoEnunciado'),",
  "  json_extract(input.row,'$.questaoExplicacao'),",
  "  json_extract(input.row,'$.questaoOQueGuardar'),",
  "  json_extract(input.row,'$.dificuldade'),",
  "  'EM_REVISAO'",
  "FROM input",
  "WHERE json_extract(input.row,'$.questionAction')='INSERIDO';",
].join('\n');

const INSERT_ALTERNATIVES_SQL = [
  "WITH input(row) AS (SELECT value FROM json_each(?)),",
  "expanded AS (",
  "  SELECT input.row AS row, alt.value AS alternative",
  "  FROM input, json_each(json_extract(input.row,'$.alternativas')) alt",
  "  WHERE json_extract(input.row,'$.questionAction')='INSERIDO'",
  ")",
  "INSERT OR IGNORE INTO conhecimento_ativo_alternativas",
  "  (empresa_id,questao_id,texto,correta,ordem)",
  "SELECT",
  "  ?,",
  "  (SELECT q.id",
  "    FROM conhecimento_ativo_questoes q",
  "    JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id",
  "    WHERE q.empresa_id=?",
  "      AND i.codigo=json_extract(expanded.row,'$.itemCodigo')",
  "      AND q.variante_chave=json_extract(expanded.row,'$.questaoVariante')",
  "      AND q.deleted_at IS NULL",
  "      AND i.deleted_at IS NULL LIMIT 1),",
  "  json_extract(expanded.alternative,'$.texto'),",
  "  CASE WHEN json_extract(expanded.alternative,'$.correta') THEN 1 ELSE 0 END,",
  "  json_extract(expanded.alternative,'$.ordem')",
  "FROM expanded;",
].join('\n');

const INSERT_LINEAGE_SQL = [
  "WITH input(row) AS (SELECT value FROM json_each(?)),",
  "lineage(linha,entidade,registro_id,acao,chave_natural) AS (",
  "  SELECT",
  "    json_extract(input.row,'$.linha'),",
  "    'FONTE',",
  "    (SELECT f.id FROM conhecimento_ativo_fontes f",
  "      WHERE f.empresa_id=?",
  "        AND f.tipo_documento=json_extract(input.row,'$.fonteTipo')",
  "        AND LOWER(TRIM(f.titulo))=LOWER(TRIM(json_extract(input.row,'$.fonteTitulo')))",
  "        AND LOWER(TRIM(f.revisao))=LOWER(TRIM(json_extract(input.row,'$.fonteRevisao')))",
  "        AND COALESCE(f.aeronave_modelo,'')=COALESCE(json_extract(input.row,'$.aeronaveModelo'),'')",
  "        AND f.deleted_at IS NULL LIMIT 1),",
  "    json_extract(input.row,'$.sourceAction'),",
  "    json_extract(input.row,'$.fonteTipo') || '|' ||",
  "      LOWER(TRIM(json_extract(input.row,'$.fonteTitulo'))) || '|' ||",
  "      LOWER(TRIM(json_extract(input.row,'$.fonteRevisao'))) || '|' ||",
  "      COALESCE(json_extract(input.row,'$.aeronaveModelo'),'')",
  "  FROM input",
  "  UNION ALL",
  "  SELECT",
  "    json_extract(input.row,'$.linha'),",
  "    'TOPICO',",
  "    (SELECT t.id FROM conhecimento_ativo_topicos t",
  "      WHERE t.empresa_id=?",
  "        AND t.codigo=json_extract(input.row,'$.topicoCodigo')",
  "        AND t.deleted_at IS NULL LIMIT 1),",
  "    json_extract(input.row,'$.topicAction'),",
  "    json_extract(input.row,'$.topicoCodigo')",
  "  FROM input",
  "  UNION ALL",
  "  SELECT",
  "    json_extract(input.row,'$.linha'),",
  "    'ITEM',",
  "    (SELECT i.id FROM conhecimento_ativo_itens i",
  "      WHERE i.empresa_id=?",
  "        AND i.codigo=json_extract(input.row,'$.itemCodigo')",
  "        AND i.deleted_at IS NULL LIMIT 1),",
  "    json_extract(input.row,'$.itemAction'),",
  "    json_extract(input.row,'$.itemCodigo')",
  "  FROM input",
  "  UNION ALL",
  "  SELECT",
  "    json_extract(input.row,'$.linha'),",
  "    'QUESTAO',",
  "    (SELECT q.id FROM conhecimento_ativo_questoes q",
  "      JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id",
  "      WHERE q.empresa_id=?",
  "        AND i.codigo=json_extract(input.row,'$.itemCodigo')",
  "        AND q.variante_chave=json_extract(input.row,'$.questaoVariante')",
  "        AND q.deleted_at IS NULL",
  "        AND i.deleted_at IS NULL LIMIT 1),",
  "    json_extract(input.row,'$.questionAction'),",
  "    json_extract(input.row,'$.itemCodigo') || '|' || json_extract(input.row,'$.questaoVariante')",
  "  FROM input",
  "  UNION ALL",
  "  SELECT",
  "    json_extract(input.row,'$.linha'),",
  "    'ALTERNATIVA',",
  "    (SELECT a.id FROM conhecimento_ativo_alternativas a",
  "      JOIN conhecimento_ativo_questoes q ON q.id=a.questao_id AND q.empresa_id=a.empresa_id",
  "      JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id",
  "      WHERE a.empresa_id=?",
  "        AND i.codigo=json_extract(input.row,'$.itemCodigo')",
  "        AND q.variante_chave=json_extract(input.row,'$.questaoVariante')",
  "        AND a.ordem=json_extract(alt.value,'$.ordem')",
  "        AND a.deleted_at IS NULL",
  "        AND q.deleted_at IS NULL",
  "        AND i.deleted_at IS NULL LIMIT 1),",
  "    'INSERIDO',",
  "    json_extract(input.row,'$.itemCodigo') || '|' ||",
  "      json_extract(input.row,'$.questaoVariante') || '|' ||",
  "      json_extract(alt.value,'$.letra')",
  "  FROM input, json_each(json_extract(input.row,'$.alternativas')) alt",
  "  WHERE json_extract(input.row,'$.questionAction')='INSERIDO'",
  ")",
  "INSERT INTO conhecimento_ativo_importacao_registros",
  "  (empresa_id,importacao_id,linha_numero,entidade,registro_id,acao,chave_natural)",
  "SELECT ?,?,linha,entidade,registro_id,acao,chave_natural FROM lineage;",
].join('\n');

export const importacaoD1SqlForTests = {
  INSERT_SOURCES_SQL,
  INSERT_TOPICS_SQL,
  INSERT_ITEMS_SQL,
  INSERT_ITEM_SOURCES_SQL,
  INSERT_QUESTIONS_SQL,
  INSERT_ALTERNATIVES_SQL,
  INSERT_LINEAGE_SQL,
};

function buildChunkStatements(
  db: D1Database,
  empresaId: number,
  importacaoId: number,
  payload: string,
): D1PreparedStatement[] {
  return [
    db.prepare(INSERT_SOURCES_SQL).bind(payload, empresaId),
    db.prepare(INSERT_TOPICS_SQL).bind(payload, empresaId),
    db.prepare(INSERT_ITEMS_SQL).bind(payload, empresaId, empresaId),
    db.prepare(INSERT_ITEM_SOURCES_SQL).bind(payload, empresaId, empresaId, empresaId),
    db.prepare(INSERT_QUESTIONS_SQL).bind(payload, empresaId, empresaId),
    db.prepare(INSERT_ALTERNATIVES_SQL).bind(payload, empresaId, empresaId),
    db
      .prepare(INSERT_LINEAGE_SQL)
      .bind(
        payload,
        empresaId,
        empresaId,
        empresaId,
        empresaId,
        empresaId,
        empresaId,
        importacaoId,
      ),
  ];
}


export function estimateImportD1Queries(rows: DecoratedImportRow[]): number {
  const payloads = buildImportPayloadChunks(rows);
  return 5 + 1 + payloads.length * 7 + 1;
}

export async function aplicarImportacaoConhecimento(params: {
  env: Env;
  empresaId: number;
  userId: number;
  arquivoNome: string;
  arquivoSha256: string;
  rows: ConhecimentoImportRow[];
}): Promise<ConhecimentoImportApplyResult> {
  const { env, empresaId, userId, arquivoNome, arquivoSha256, rows } = params;
  const db = env.DB;
  const state = await loadExistingState(db, empresaId);
  const decorated = decorateRows(rows, state);
  const payloads = buildImportPayloadChunks(decorated.rows);

  const importRow = await db
    .prepare(
      'INSERT INTO conhecimento_ativo_importacoes ' +
        '(empresa_id,arquivo_nome,arquivo_sha256,template_versao,status,total_linhas,total_erros,criado_por_usuario_id) ' +
        "VALUES (?,?,?,?, 'APLICANDO', ?,0,?) RETURNING id",
    )
    .bind(
      empresaId,
      arquivoNome,
      arquivoSha256,
      TEMPLATE_VERSION,
      rows.length,
      userId,
    )
    .first<{ id: number }>();

  if (!importRow?.id) {
    throw new Error('Não foi possível registrar o lote de importação.');
  }

  const totalInserted =
    decorated.inserted.fontes +
    decorated.inserted.topicos +
    decorated.inserted.itens +
    decorated.inserted.questoes +
    decorated.inserted.alternativas;
  const totalIgnored =
    decorated.ignored.fontes +
    decorated.ignored.topicos +
    decorated.ignored.itens +
    decorated.ignored.questoes;

  const statements: D1PreparedStatement[] = [];
  for (const payload of payloads) {
    statements.push(...buildChunkStatements(db, empresaId, importRow.id, payload));
  }
  statements.push(
    db
      .prepare(
        "UPDATE conhecimento_ativo_importacoes SET status='APLICADO',total_inseridos=?," +
          "total_ignorados=?,resumo_json=?,aplicado_em=datetime('now') " +
          'WHERE id=? AND empresa_id=?',
      )
      .bind(
        totalInserted,
        totalIgnored,
        JSON.stringify({
          inserted: decorated.inserted,
          ignored: decorated.ignored,
          sqlChunks: payloads.length,
        }),
        importRow.id,
        empresaId,
      ),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    await db
      .prepare(
        "UPDATE conhecimento_ativo_importacoes SET status='FALHOU',erro=? " +
          'WHERE id=? AND empresa_id=?',
      )
      .bind(
        error instanceof Error ? error.message.slice(0, 500) : 'Falha desconhecida',
        importRow.id,
        empresaId,
      )
      .run();
    throw error;
  }

  return {
    importacaoId: importRow.id,
    totalRows: rows.length,
    inserted: decorated.inserted,
    ignored: decorated.ignored,
  };
}
