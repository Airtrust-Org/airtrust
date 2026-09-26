import {
  modelosConhecimentoAtivoDisponiveis,
  normalizarModeloConhecimento,
} from './challenge-service';

export type DesafioDiarioCriticidade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export interface DesafioDiarioAlternativa {
  id: number;
  texto: string;
  ordem: number;
}

export interface DesafioDiarioFonte {
  tipoDocumento: string;
  titulo: string;
  revisao: string;
  secao: string | null;
  pagina: string | null;
  referencia: string | null;
}

export interface DesafioDiarioQuestao {
  data: string;
  aeronaveModelo: string;
  questaoId: number;
  enunciado: string;
  topico: string;
  criticidade: DesafioDiarioCriticidade;
  alternativas: DesafioDiarioAlternativa[];
}

export interface DesafioDiarioFeedback extends DesafioDiarioQuestao {
  alternativaId: number;
  alternativaCorretaId: number;
  correta: boolean;
  explicacao: string;
  oQueGuardar: string | null;
  fontes: DesafioDiarioFonte[];
}

type ModeloCatalogoRow = {
  id: string | number;
  modelo: string | null;
  codigo: string | null;
};

type QuestaoRow = {
  questao_id: number;
  item_id: number;
  enunciado: string;
  explicacao: string;
  o_que_guardar: string | null;
  topico: string;
  criticidade: DesafioDiarioCriticidade;
};

function chaveModeloSql(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '');
}

function variantesModeloSql(modelo: string): string[] {
  const normalizado = normalizarModeloConhecimento(modelo);
  if (normalizado === 'SK76') return ['SK76', 'S76'];
  return [chaveModeloSql(normalizado)];
}

export function dataDesafioDiario(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function indiceDeterministico(seed: string, tamanho: number): number {
  if (!Number.isInteger(tamanho) || tamanho <= 0) return 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % tamanho;
}

export function resolverModelosConhecimentoFuncionario(params: {
  modeloAeronaveId: string | null | undefined;
  aeronave: string | null | undefined;
  catalogo: ModeloCatalogoRow[];
}): string[] {
  const permitidos = new Set(modelosConhecimentoAtivoDisponiveis());
  const tokens = String(params.modeloAeronaveId || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const catalogoPorId = new Map(
    params.catalogo.map((row) => [String(row.id), [row.codigo, row.modelo].filter(Boolean) as string[]]),
  );
  const candidatos = [
    ...tokens,
    ...tokens.flatMap((token) => catalogoPorId.get(token) || []),
    String(params.aeronave || '').trim(),
  ].filter(Boolean);

  const modelos: string[] = [];
  for (const candidato of candidatos) {
    const modelo = normalizarModeloConhecimento(candidato);
    if (permitidos.has(modelo) && !modelos.includes(modelo)) modelos.push(modelo);
  }
  return modelos;
}

async function modelosDoFuncionario(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
}): Promise<string[]> {
  const funcionario = await params.db
    .prepare(
      `SELECT modelo_aeronave_id, aeronave
         FROM funcionarios
        WHERE id=? AND empresa_id=?
          AND deleted_at IS NULL
          AND COALESCE(ativo,1)=1
          AND UPPER(COALESCE(NULLIF(TRIM(status),''),'ATIVO'))='ATIVO'
        LIMIT 1`,
    )
    .bind(params.funcionarioId, params.empresaId)
    .first<{ modelo_aeronave_id: string | null; aeronave: string | null }>();

  if (!funcionario) {
    const error = new Error('Funcionário ativo não encontrado para o desafio diário');
    error.name = 'SEM_AERONAVE';
    throw error;
  }

  const tokens = String(funcionario.modelo_aeronave_id || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const ids = tokens.filter((value) => /^\d+$/.test(value));
  let catalogo: ModeloCatalogoRow[] = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const result = await params.db
      .prepare(
        `SELECT id, modelo, codigo
           FROM modelos_aeronave
          WHERE CAST(id AS TEXT) IN (${placeholders})
            AND empresa_id=?
            AND deleted_at IS NULL`,
      )
      .bind(...ids, params.empresaId)
      .all<ModeloCatalogoRow>();
    catalogo = result.results || [];
  }

  const modelos = resolverModelosConhecimentoFuncionario({
    modeloAeronaveId: funcionario.modelo_aeronave_id,
    aeronave: funcionario.aeronave,
    catalogo,
  });
  if (!modelos.length) {
    const error = new Error(
      'Não foi possível identificar AW139 ou S76/SK76 no cadastro de aeronave do tripulante.',
    );
    error.name = 'SEM_AERONAVE';
    throw error;
  }
  return modelos;
}

function filtroModeloSql(modelo: string) {
  const variantes = variantesModeloSql(modelo);
  return {
    sql: `UPPER(REPLACE(REPLACE(COALESCE(NULLIF(TRIM(i.aeronave_modelo),''),NULLIF(TRIM(t.aeronave_modelo),''),''),'-',''),' ','')) IN (${variantes
      .map(() => '?')
      .join(',')})`,
    binds: variantes,
  };
}

function elegibilidadeQuestaoSql(modeloSql: string): string {
  return `
      q.empresa_id=?
      AND i.empresa_id=q.empresa_id
      AND t.empresa_id=q.empresa_id
      AND ${modeloSql}
      AND q.status='APROVADA' AND q.ativo=1 AND q.deleted_at IS NULL
      AND i.status='APROVADO' AND i.ativo=1 AND i.deleted_at IS NULL
      AND t.ativo=1 AND t.deleted_at IS NULL
      AND LENGTH(TRIM(q.explicacao))>0
      AND EXISTS (
        SELECT 1
          FROM conhecimento_ativo_item_fontes jf
          JOIN conhecimento_ativo_fontes f
            ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id
         WHERE jf.empresa_id=i.empresa_id
           AND jf.item_id=i.id
           AND jf.deleted_at IS NULL
           AND f.status='VIGENTE'
           AND f.deleted_at IS NULL
      )
      AND (
        SELECT COUNT(*) FROM conhecimento_ativo_alternativas a
         WHERE a.empresa_id=q.empresa_id AND a.questao_id=q.id AND a.deleted_at IS NULL
      )>=2
      AND (
        SELECT COUNT(*) FROM conhecimento_ativo_alternativas a
         WHERE a.empresa_id=q.empresa_id AND a.questao_id=q.id
           AND a.correta=1 AND a.deleted_at IS NULL
      )=1`;
}

async function contarQuestoes(params: {
  db: D1Database;
  empresaId: number;
  modelo: string;
}): Promise<number> {
  const filtro = filtroModeloSql(params.modelo);
  const row = await params.db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM conhecimento_ativo_questoes q
         JOIN conhecimento_ativo_itens i ON i.id=q.item_id
         JOIN conhecimento_ativo_topicos t ON t.id=i.topico_id
        WHERE ${elegibilidadeQuestaoSql(filtro.sql)}`,
    )
    .bind(params.empresaId, ...filtro.binds)
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

async function carregarQuestaoPorOffset(params: {
  db: D1Database;
  empresaId: number;
  modelo: string;
  offset: number;
}): Promise<QuestaoRow | null> {
  const filtro = filtroModeloSql(params.modelo);
  return params.db
    .prepare(
      `SELECT q.id AS questao_id, q.item_id, q.enunciado, q.explicacao, q.o_que_guardar,
              t.nome AS topico, i.criticidade
         FROM conhecimento_ativo_questoes q
         JOIN conhecimento_ativo_itens i ON i.id=q.item_id
         JOIN conhecimento_ativo_topicos t ON t.id=i.topico_id
        WHERE ${elegibilidadeQuestaoSql(filtro.sql)}
        ORDER BY q.id
        LIMIT 1 OFFSET ?`,
    )
    .bind(params.empresaId, ...filtro.binds, params.offset)
    .first<QuestaoRow>();
}

async function alternativasDaQuestao(
  db: D1Database,
  empresaId: number,
  questaoId: number,
): Promise<Array<DesafioDiarioAlternativa & { correta: number }>> {
  const result = await db
    .prepare(
      `SELECT id, texto, ordem, correta
         FROM conhecimento_ativo_alternativas
        WHERE empresa_id=? AND questao_id=? AND deleted_at IS NULL
        ORDER BY ordem, id`,
    )
    .bind(empresaId, questaoId)
    .all<DesafioDiarioAlternativa & { correta: number }>();
  return result.results || [];
}

async function fontesDaQuestao(
  db: D1Database,
  empresaId: number,
  itemId: number,
): Promise<DesafioDiarioFonte[]> {
  const result = await db
    .prepare(
      `SELECT f.tipo_documento AS tipoDocumento, f.titulo, f.revisao,
              jf.secao, jf.pagina, jf.referencia
         FROM conhecimento_ativo_item_fontes jf
         JOIN conhecimento_ativo_fontes f
           ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id
        WHERE jf.empresa_id=? AND jf.item_id=?
          AND jf.deleted_at IS NULL
          AND f.status='VIGENTE' AND f.deleted_at IS NULL
        ORDER BY jf.principal DESC, f.id
        LIMIT 3`,
    )
    .bind(empresaId, itemId)
    .all<DesafioDiarioFonte>();
  return result.results || [];
}

async function selecionarQuestaoDiaria(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  now?: Date;
}): Promise<{ data: string; modelo: string; questao: QuestaoRow }> {
  const data = dataDesafioDiario(params.now);
  const modelos = await modelosDoFuncionario(params);
  const seedBase = `${params.empresaId}:${params.funcionarioId}:${data}`;
  const inicio = indiceDeterministico(`${seedBase}:modelo`, modelos.length);

  for (let step = 0; step < modelos.length; step += 1) {
    const modelo = modelos[(inicio + step) % modelos.length];
    const total = await contarQuestoes({ db: params.db, empresaId: params.empresaId, modelo });
    if (!total) continue;
    const offset = indiceDeterministico(`${seedBase}:${modelo}:questao`, total);
    const questao = await carregarQuestaoPorOffset({
      db: params.db,
      empresaId: params.empresaId,
      modelo,
      offset,
    });
    if (questao) return { data, modelo, questao };
  }

  const error = new Error('Não há perguntas aprovadas disponíveis para a aeronave do tripulante.');
  error.name = 'CONTEUDO_INSUFICIENTE';
  throw error;
}

export async function obterDesafioDiario(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  now?: Date;
}): Promise<DesafioDiarioQuestao> {
  const selecionada = await selecionarQuestaoDiaria(params);
  const alternativas = await alternativasDaQuestao(
    params.db,
    params.empresaId,
    selecionada.questao.questao_id,
  );
  return {
    data: selecionada.data,
    aeronaveModelo: selecionada.modelo,
    questaoId: selecionada.questao.questao_id,
    enunciado: selecionada.questao.enunciado,
    topico: selecionada.questao.topico,
    criticidade: selecionada.questao.criticidade,
    alternativas: alternativas.map(({ id, texto, ordem }) => ({ id, texto, ordem })),
  };
}

export async function responderDesafioDiario(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  alternativaId: number;
  now?: Date;
}): Promise<DesafioDiarioFeedback> {
  const selecionada = await selecionarQuestaoDiaria(params);
  const alternativas = await alternativasDaQuestao(
    params.db,
    params.empresaId,
    selecionada.questao.questao_id,
  );
  const escolhida = alternativas.find((alternativa) => alternativa.id === params.alternativaId);
  if (!escolhida) {
    const error = new Error('Alternativa não pertence ao desafio diário atual.');
    error.name = 'ALTERNATIVA_INVALIDA';
    throw error;
  }
  const correta = alternativas.find((alternativa) => alternativa.correta === 1);
  if (!correta) {
    const error = new Error('Questão sem alternativa correta configurada.');
    error.name = 'CONTEUDO_INSUFICIENTE';
    throw error;
  }

  return {
    data: selecionada.data,
    aeronaveModelo: selecionada.modelo,
    questaoId: selecionada.questao.questao_id,
    enunciado: selecionada.questao.enunciado,
    topico: selecionada.questao.topico,
    criticidade: selecionada.questao.criticidade,
    alternativas: alternativas.map(({ id, texto, ordem }) => ({ id, texto, ordem })),
    alternativaId: escolhida.id,
    alternativaCorretaId: correta.id,
    correta: escolhida.correta === 1,
    explicacao: selecionada.questao.explicacao,
    oQueGuardar: selecionada.questao.o_que_guardar,
    fontes: await fontesDaQuestao(params.db, params.empresaId, selecionada.questao.item_id),
  };
}
