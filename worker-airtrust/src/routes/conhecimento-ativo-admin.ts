import { Hono, type Context } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { requireRole } from '../middleware/rbac';
import type { AppEnv } from '../types';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { normalizarModeloConhecimento } from '../services/conhecimento-ativo/challenge-service';
import {
  aplicarImportacaoConhecimento,
  gerarTemplateConhecimentoAtivo,
  parseConhecimentoAtivoWorkbook,
  sha256Hex,
  validarConflitosBanco,
} from '../services/conhecimento-ativo/importacao';

const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', auth(), requireRole('admin', 'manager'));

function empresaIdFrom(c: Context<AppEnv>): number {
  const empresaId = c.get('empresaId');
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new ApiError('Empresa ativa inválida', 403, 'TENANT_INVALIDO');
  }
  return empresaId;
}

function positiveId(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(label + ' inválido', 400, 'CONHECIMENTO_ATIVO_ID_INVALIDO');
  }
  return parsed;
}

function nonEmpty(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new ApiError(label + ' é obrigatório', 400, 'CONHECIMENTO_ATIVO_CAMPO_OBRIGATORIO');
  }
  return text;
}

async function audit(
  c: Context<AppEnv>,
  tabela: string,
  acao: 'INSERT' | 'UPDATE' | 'DELETE' | 'BULK_UPDATE',
  id: number,
  payload: unknown,
) {
  await registrarAuditoria({
    db: c.env.DB,
    tabela,
    acao,
    registro_id: id,
    dados_novos: payload,
    ...extrairUsuarioAuditoria(c),
  });
}

adminRoutes.get('/fontes', async (c) => {
  const empresaId = empresaIdFrom(c);
  const modelo = c.req.query('modelo')?.trim();
  const filters = ['empresa_id=?', 'deleted_at IS NULL'];
  const binds: unknown[] = [empresaId];
  if (modelo) {
    filters.push("UPPER(REPLACE(COALESCE(aeronave_modelo,''),'-',''))=?");
    binds.push(normalizarModeloConhecimento(modelo).replace(/-/g, ''));
  }
  const result = await c.env.DB
    .prepare(
      'SELECT id,tipo_documento,titulo,aeronave_modelo,revisao,data_revisao,r2_key,hash_documento,status,created_at,updated_at ' +
        'FROM conhecimento_ativo_fontes WHERE ' + filters.join(' AND ') +
        ' ORDER BY status,tipo_documento,titulo,revisao DESC',
    )
    .bind(...binds)
    .all();
  return c.json({ success: true, data: result.results || [] });
});

adminRoutes.post('/fontes', async (c) => {
  const empresaId = empresaIdFrom(c);
  const body = await c.req.json<{
    tipo_documento?: string;
    titulo?: string;
    aeronave_modelo?: string | null;
    revisao?: string;
    data_revisao?: string | null;
    r2_key?: string | null;
    hash_documento?: string | null;
    status?: string;
  }>();
  const tipo = nonEmpty(body.tipo_documento, 'Tipo do documento').toUpperCase();
  if (!['RFM', 'FCOM', 'QRH', 'SOP', 'OM', 'OUTRO'].includes(tipo)) {
    throw new ApiError('Tipo de documento inválido', 400, 'CONHECIMENTO_ATIVO_FONTE_TIPO_INVALIDO');
  }
  const status = String(body.status || 'RASCUNHO').toUpperCase();
  if (!['RASCUNHO', 'VIGENTE'].includes(status)) {
    throw new ApiError('Status inicial de fonte inválido', 400, 'CONHECIMENTO_ATIVO_FONTE_STATUS_INVALIDO');
  }
  const modelo = body.aeronave_modelo
    ? normalizarModeloConhecimento(body.aeronave_modelo)
    : null;
  const insert = await c.env.DB
    .prepare(
      'INSERT INTO conhecimento_ativo_fontes ' +
        '(empresa_id,tipo_documento,titulo,aeronave_modelo,revisao,data_revisao,r2_key,hash_documento,status) ' +
        'VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
    )
    .bind(
      empresaId,
      tipo,
      nonEmpty(body.titulo, 'Título'),
      modelo,
      nonEmpty(body.revisao, 'Revisão'),
      body.data_revisao || null,
      body.r2_key || null,
      body.hash_documento || null,
      status,
    )
    .first<{ id: number }>();
  if (!insert?.id) throw new ApiError('Falha ao cadastrar fonte técnica', 500);
  await audit(c, 'conhecimento_ativo_fontes', 'INSERT', insert.id, { ...body, status, aeronave_modelo: modelo });
  return c.json({ success: true, data: { id: insert.id } }, 201);
});

adminRoutes.post('/fontes/:id/superar', async (c) => {
  const empresaId = empresaIdFrom(c);
  const fonteId = positiveId(c.req.param('id'), 'Fonte');
  const source = await c.env.DB
    .prepare(
      'SELECT id,status FROM conhecimento_ativo_fontes ' +
        'WHERE id=? AND empresa_id=? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(fonteId, empresaId)
    .first<{ id: number; status: string }>();
  if (!source) throw new ApiError('Fonte não encontrada', 404, 'CONHECIMENTO_ATIVO_FONTE_NAO_ENCONTRADA');

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        "UPDATE conhecimento_ativo_fontes SET status='SUPERADO',updated_at=datetime('now') " +
          'WHERE id=? AND empresa_id=?',
      )
      .bind(fonteId, empresaId),
    c.env.DB
      .prepare(
        "UPDATE conhecimento_ativo_itens SET status='REVISAO_NECESSARIA',updated_at=datetime('now') " +
          'WHERE empresa_id=? AND deleted_at IS NULL AND id IN (' +
          'SELECT item_id FROM conhecimento_ativo_item_fontes WHERE empresa_id=? AND fonte_id=? AND deleted_at IS NULL)',
      )
      .bind(empresaId, empresaId, fonteId),
    c.env.DB
      .prepare(
        "UPDATE conhecimento_ativo_questoes SET status='EM_REVISAO',updated_at=datetime('now') " +
          'WHERE empresa_id=? AND deleted_at IS NULL AND item_id IN (' +
          'SELECT item_id FROM conhecimento_ativo_item_fontes WHERE empresa_id=? AND fonte_id=? AND deleted_at IS NULL)',
      )
      .bind(empresaId, empresaId, fonteId),
  ]);
  await audit(c, 'conhecimento_ativo_fontes', 'UPDATE', fonteId, { status: 'SUPERADO' });
  return c.json({ success: true, data: { id: fonteId, status: 'SUPERADO' } });
});

adminRoutes.get('/topicos', async (c) => {
  const empresaId = empresaIdFrom(c);
  const result = await c.env.DB
    .prepare(
      'SELECT id,codigo,nome,aeronave_modelo,parent_id,ordem,ativo,created_at,updated_at ' +
        'FROM conhecimento_ativo_topicos WHERE empresa_id=? AND deleted_at IS NULL ' +
        'ORDER BY aeronave_modelo,ordem,nome',
    )
    .bind(empresaId)
    .all();
  return c.json({ success: true, data: result.results || [] });
});

adminRoutes.post('/topicos', async (c) => {
  const empresaId = empresaIdFrom(c);
  const body = await c.req.json<{
    codigo?: string;
    nome?: string;
    aeronave_modelo?: string | null;
    parent_id?: number | null;
    ordem?: number;
  }>();
  const modelo = body.aeronave_modelo
    ? normalizarModeloConhecimento(body.aeronave_modelo)
    : null;
  const insert = await c.env.DB
    .prepare(
      'INSERT INTO conhecimento_ativo_topicos ' +
        '(empresa_id,codigo,nome,aeronave_modelo,parent_id,ordem) VALUES (?,?,?,?,?,?) RETURNING id',
    )
    .bind(
      empresaId,
      nonEmpty(body.codigo, 'Código').toUpperCase(),
      nonEmpty(body.nome, 'Nome'),
      modelo,
      body.parent_id == null ? null : positiveId(body.parent_id, 'Tópico pai'),
      Math.max(0, Math.round(Number(body.ordem || 0))),
    )
    .first<{ id: number }>();
  if (!insert?.id) throw new ApiError('Falha ao cadastrar tópico', 500);
  await audit(c, 'conhecimento_ativo_topicos', 'INSERT', insert.id, { ...body, aeronave_modelo: modelo });
  return c.json({ success: true, data: { id: insert.id } }, 201);
});

adminRoutes.get('/itens', async (c) => {
  const empresaId = empresaIdFrom(c);
  const result = await c.env.DB
    .prepare(
      'SELECT i.id,i.codigo,i.aeronave_modelo,i.titulo,i.criticidade,i.status,i.ativo, ' +
        't.nome AS topico, ' +
        '(SELECT COUNT(*) FROM conhecimento_ativo_item_fontes jf WHERE jf.empresa_id=i.empresa_id ' +
        'AND jf.item_id=i.id AND jf.deleted_at IS NULL) AS total_fontes, ' +
        '(SELECT COUNT(*) FROM conhecimento_ativo_questoes q WHERE q.empresa_id=i.empresa_id ' +
        'AND q.item_id=i.id AND q.deleted_at IS NULL) AS total_questoes ' +
        'FROM conhecimento_ativo_itens i ' +
        'JOIN conhecimento_ativo_topicos t ON t.id=i.topico_id AND t.empresa_id=i.empresa_id ' +
        'WHERE i.empresa_id=? AND i.deleted_at IS NULL ORDER BY i.aeronave_modelo,t.ordem,i.codigo',
    )
    .bind(empresaId)
    .all();
  return c.json({ success: true, data: result.results || [] });
});

adminRoutes.post('/itens', async (c) => {
  const empresaId = empresaIdFrom(c);
  const body = await c.req.json<{
    topico_id?: number;
    codigo?: string;
    aeronave_modelo?: string | null;
    titulo?: string;
    conceito?: string;
    resumo_essencial?: string | null;
    criticidade?: string;
    tempo_estudo_segundos?: number;
    fontes?: Array<{
      fonte_id: number;
      secao?: string | null;
      pagina?: string | null;
      referencia?: string | null;
      principal?: boolean;
    }>;
  }>();
  const topicoId = positiveId(body.topico_id, 'Tópico');
  const criticidade = String(body.criticidade || 'MEDIA').toUpperCase();
  if (!['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(criticidade)) {
    throw new ApiError('Criticidade inválida', 400, 'CONHECIMENTO_ATIVO_CRITICIDADE_INVALIDA');
  }
  const modelo = body.aeronave_modelo
    ? normalizarModeloConhecimento(body.aeronave_modelo)
    : null;
  const insert = await c.env.DB
    .prepare(
      'INSERT INTO conhecimento_ativo_itens ' +
        '(empresa_id,topico_id,codigo,aeronave_modelo,titulo,conceito,resumo_essencial,criticidade,tempo_estudo_segundos) ' +
        'VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
    )
    .bind(
      empresaId,
      topicoId,
      nonEmpty(body.codigo, 'Código').toUpperCase(),
      modelo,
      nonEmpty(body.titulo, 'Título'),
      nonEmpty(body.conceito, 'Conceito'),
      body.resumo_essencial?.trim() || null,
      criticidade,
      Math.min(900, Math.max(15, Math.round(Number(body.tempo_estudo_segundos || 60)))),
    )
    .first<{ id: number }>();
  if (!insert?.id) throw new ApiError('Falha ao cadastrar item de conhecimento', 500);

  const sources = Array.isArray(body.fontes) ? body.fontes : [];
  if (sources.length > 0) {
    await c.env.DB.batch(
      sources.map((source) =>
        c.env.DB
          .prepare(
            'INSERT INTO conhecimento_ativo_item_fontes ' +
              '(empresa_id,item_id,fonte_id,secao,pagina,referencia,principal) VALUES (?,?,?,?,?,?,?)',
          )
          .bind(
            empresaId,
            insert.id,
            positiveId(source.fonte_id, 'Fonte'),
            source.secao?.trim() || null,
            source.pagina?.trim() || null,
            source.referencia?.trim() || null,
            source.principal ? 1 : 0,
          ),
      ),
    );
  }
  await audit(c, 'conhecimento_ativo_itens', 'INSERT', insert.id, { ...body, aeronave_modelo: modelo });
  return c.json({ success: true, data: { id: insert.id } }, 201);
});

adminRoutes.post('/itens/:id/aprovar', async (c) => {
  const empresaId = empresaIdFrom(c);
  const itemId = positiveId(c.req.param('id'), 'Item');
  const validSource = await c.env.DB
    .prepare(
      'SELECT 1 AS ok FROM conhecimento_ativo_item_fontes jf ' +
        'JOIN conhecimento_ativo_fontes f ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id ' +
        'WHERE jf.empresa_id=? AND jf.item_id=? AND jf.deleted_at IS NULL ' +
        "AND f.status='VIGENTE' AND f.deleted_at IS NULL LIMIT 1",
    )
    .bind(empresaId, itemId)
    .first<{ ok: number }>();
  if (!validSource) {
    throw new ApiError(
      'O item só pode ser aprovado com pelo menos uma fonte técnica vigente.',
      400,
      'CONHECIMENTO_ATIVO_FONTE_VIGENTE_OBRIGATORIA',
    );
  }
  const result = await c.env.DB
    .prepare(
      "UPDATE conhecimento_ativo_itens SET status='APROVADO',aprovado_por_usuario_id=?, " +
        "aprovado_em=datetime('now'),updated_at=datetime('now') " +
        'WHERE id=? AND empresa_id=? AND deleted_at IS NULL',
    )
    .bind(c.get('userId'), itemId, empresaId)
    .run();
  if (!result.meta.changes) throw new ApiError('Item não encontrado', 404, 'CONHECIMENTO_ATIVO_ITEM_NAO_ENCONTRADO');
  await audit(c, 'conhecimento_ativo_itens', 'UPDATE', itemId, { status: 'APROVADO' });
  return c.json({ success: true, data: { id: itemId, status: 'APROVADO' } });
});

adminRoutes.post('/aprovar-tudo', async (c) => {
  const empresaId = empresaIdFrom(c);
  const body = await c.req.json<{ aeronave_modelo?: string }>();
  const modelo = normalizarModeloConhecimento(nonEmpty(body.aeronave_modelo, 'Aeronave/modelo'));
  const userId = c.get('userId');

  const itemScope =
    "i.empresa_id=? AND UPPER(REPLACE(COALESCE(i.aeronave_modelo,''),'-',''))=? " +
    "AND i.deleted_at IS NULL AND i.status<>'ARQUIVADO'";
  const modelKey = modelo.replace(/-/g, '');

  const stats = await c.env.DB
    .prepare(
      'SELECT ' +
        'COUNT(*) AS itens, ' +
        "SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM conhecimento_ativo_item_fontes jf " +
        'JOIN conhecimento_ativo_fontes f ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id ' +
        'WHERE jf.empresa_id=i.empresa_id AND jf.item_id=i.id AND jf.deleted_at IS NULL ' +
        "AND f.deleted_at IS NULL AND f.status IN ('RASCUNHO','VIGENTE')) THEN 1 ELSE 0 END) AS itens_sem_fonte_aprovavel " +
        'FROM conhecimento_ativo_itens i WHERE ' + itemScope,
    )
    .bind(empresaId, modelKey)
    .first<{ itens: number; itens_sem_fonte_aprovavel: number }>();

  if (!stats || Number(stats.itens) < 1) {
    throw new ApiError('Nenhum item encontrado para o modelo informado.', 404, 'CONHECIMENTO_ATIVO_MODELO_SEM_ITENS');
  }
  if (Number(stats.itens_sem_fonte_aprovavel) > 0) {
    throw new ApiError(
      `${stats.itens_sem_fonte_aprovavel} item(ns) não possuem fonte em RASCUNHO ou VIGENTE.`,
      400,
      'CONHECIMENTO_ATIVO_FONTE_VIGENTE_OBRIGATORIA',
    );
  }

  const invalidQuestions = await c.env.DB
    .prepare(
      'SELECT COUNT(*) AS total FROM conhecimento_ativo_questoes q ' +
        'JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id ' +
        'WHERE ' + itemScope +
        " AND q.deleted_at IS NULL AND q.status<>'ARQUIVADA' AND (" +
        '(SELECT COUNT(*) FROM conhecimento_ativo_alternativas a WHERE a.empresa_id=q.empresa_id ' +
        'AND a.questao_id=q.id AND a.deleted_at IS NULL) NOT BETWEEN 2 AND 6 OR ' +
        '(SELECT COUNT(*) FROM conhecimento_ativo_alternativas a WHERE a.empresa_id=q.empresa_id ' +
        'AND a.questao_id=q.id AND a.correta=1 AND a.deleted_at IS NULL)<>1)',
    )
    .bind(empresaId, modelKey)
    .first<{ total: number }>();

  if (Number(invalidQuestions?.total || 0) > 0) {
    throw new ApiError(
      `${invalidQuestions?.total} questão(ões) possuem contrato de alternativas inválido.`,
      400,
      'CONHECIMENTO_ATIVO_ALTERNATIVAS_INVALIDAS',
    );
  }

  const sourceUpdate = c.env.DB
    .prepare(
      "UPDATE conhecimento_ativo_fontes SET status='VIGENTE',updated_at=datetime('now') " +
        "WHERE empresa_id=? AND status='RASCUNHO' AND deleted_at IS NULL AND id IN (" +
        'SELECT DISTINCT jf.fonte_id FROM conhecimento_ativo_item_fontes jf ' +
        'JOIN conhecimento_ativo_itens i ON i.id=jf.item_id AND i.empresa_id=jf.empresa_id ' +
        'WHERE ' + itemScope + ' AND jf.deleted_at IS NULL)',
    )
    .bind(empresaId, empresaId, modelKey);

  const itemUpdate = c.env.DB
    .prepare(
      "UPDATE conhecimento_ativo_itens SET status='APROVADO',aprovado_por_usuario_id=?, " +
        "aprovado_em=datetime('now'),updated_at=datetime('now') WHERE " + itemScope,
    )
    .bind(userId, empresaId, modelKey);

  const questionUpdate = c.env.DB
    .prepare(
      "UPDATE conhecimento_ativo_questoes SET status='APROVADA',aprovado_por_usuario_id=?, " +
        "aprovado_em=datetime('now'),updated_at=datetime('now') WHERE empresa_id=? " +
        "AND deleted_at IS NULL AND status<>'ARQUIVADA' AND item_id IN (" +
        'SELECT i.id FROM conhecimento_ativo_itens i WHERE ' + itemScope + ')',
    )
    .bind(userId, empresaId, empresaId, modelKey);

  const [sourcesResult, itemsResult, questionsResult] = await c.env.DB.batch([
    sourceUpdate,
    itemUpdate,
    questionUpdate,
  ]);

  const data = {
    aeronave_modelo: modelo,
    fontes_vigentes: Number(sourcesResult.meta.changes || 0),
    itens_aprovados: Number(itemsResult.meta.changes || 0),
    questoes_aprovadas: Number(questionsResult.meta.changes || 0),
  };
  await audit(c, 'conhecimento_ativo_aprovacao_lote', 'BULK_UPDATE', 0, data);
  return c.json({ success: true, data });
});

adminRoutes.get('/questoes', async (c) => {
  const empresaId = empresaIdFrom(c);
  const result = await c.env.DB
    .prepare(
      'SELECT q.id,q.item_id,q.variante_chave,q.tipo,q.enunciado,q.dificuldade,q.status,q.ativo, ' +
        'i.codigo AS item_codigo,i.titulo AS item_titulo ' +
        'FROM conhecimento_ativo_questoes q ' +
        'JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id ' +
        'WHERE q.empresa_id=? AND q.deleted_at IS NULL ORDER BY i.codigo,q.variante_chave',
    )
    .bind(empresaId)
    .all();
  return c.json({ success: true, data: result.results || [] });
});

adminRoutes.post('/questoes', async (c) => {
  const empresaId = empresaIdFrom(c);
  const body = await c.req.json<{
    item_id?: number;
    variante_chave?: string;
    tipo?: string;
    enunciado?: string;
    explicacao?: string;
    o_que_guardar?: string | null;
    imagem_r2_key?: string | null;
    dificuldade?: number;
    alternativas?: Array<{ texto?: string; correta?: boolean }>;
  }>();
  const itemId = positiveId(body.item_id, 'Item');
  const tipo = String(body.tipo || 'MULTIPLA_ESCOLHA').toUpperCase();
  if (!['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'CENARIO'].includes(tipo)) {
    throw new ApiError('Tipo de questão inválido', 400, 'CONHECIMENTO_ATIVO_QUESTAO_TIPO_INVALIDO');
  }
  const alternatives = Array.isArray(body.alternativas) ? body.alternativas : [];
  if (alternatives.length < 2 || alternatives.length > 6) {
    throw new ApiError('Informe de 2 a 6 alternativas.', 400, 'CONHECIMENTO_ATIVO_ALTERNATIVAS_INVALIDAS');
  }
  if (alternatives.filter((alt) => Boolean(alt.correta)).length !== 1) {
    throw new ApiError(
      'A questão deve ter exatamente uma alternativa correta.',
      400,
      'CONHECIMENTO_ATIVO_RESPOSTA_CORRETA_INVALIDA',
    );
  }
  for (const alt of alternatives) nonEmpty(alt.texto, 'Texto da alternativa');

  const insert = await c.env.DB
    .prepare(
      'INSERT INTO conhecimento_ativo_questoes ' +
        '(empresa_id,item_id,variante_chave,tipo,enunciado,explicacao,o_que_guardar,imagem_r2_key,dificuldade) ' +
        'VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
    )
    .bind(
      empresaId,
      itemId,
      nonEmpty(body.variante_chave, 'Chave da variante').toUpperCase(),
      tipo,
      nonEmpty(body.enunciado, 'Enunciado'),
      nonEmpty(body.explicacao, 'Explicação'),
      body.o_que_guardar?.trim() || null,
      body.imagem_r2_key?.trim() || null,
      Math.min(5, Math.max(1, Math.round(Number(body.dificuldade || 2)))),
    )
    .first<{ id: number }>();
  if (!insert?.id) throw new ApiError('Falha ao cadastrar questão', 500);

  await c.env.DB.batch(
    alternatives.map((alternative, index) =>
      c.env.DB
        .prepare(
          'INSERT INTO conhecimento_ativo_alternativas ' +
            '(empresa_id,questao_id,texto,correta,ordem) VALUES (?,?,?,?,?)',
        )
        .bind(
          empresaId,
          insert.id,
          nonEmpty(alternative.texto, 'Texto da alternativa'),
          alternative.correta ? 1 : 0,
          index + 1,
        ),
    ),
  );
  await audit(c, 'conhecimento_ativo_questoes', 'INSERT', insert.id, body);
  return c.json({ success: true, data: { id: insert.id } }, 201);
});

adminRoutes.post('/questoes/:id/aprovar', async (c) => {
  const empresaId = empresaIdFrom(c);
  const questaoId = positiveId(c.req.param('id'), 'Questão');
  const contract = await c.env.DB
    .prepare(
      'SELECT q.id,i.status AS item_status, ' +
        '(SELECT COUNT(*) FROM conhecimento_ativo_alternativas a WHERE a.empresa_id=q.empresa_id ' +
        'AND a.questao_id=q.id AND a.deleted_at IS NULL) AS alternativas, ' +
        '(SELECT COUNT(*) FROM conhecimento_ativo_alternativas a WHERE a.empresa_id=q.empresa_id ' +
        'AND a.questao_id=q.id AND a.correta=1 AND a.deleted_at IS NULL) AS corretas, ' +
        '(SELECT COUNT(*) FROM conhecimento_ativo_item_fontes jf JOIN conhecimento_ativo_fontes f ' +
        'ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id WHERE jf.empresa_id=q.empresa_id ' +
        "AND jf.item_id=q.item_id AND jf.deleted_at IS NULL AND f.status='VIGENTE' AND f.deleted_at IS NULL) AS fontes " +
        'FROM conhecimento_ativo_questoes q ' +
        'JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id ' +
        'WHERE q.id=? AND q.empresa_id=? AND q.deleted_at IS NULL LIMIT 1',
    )
    .bind(questaoId, empresaId)
    .first<{ id: number; item_status: string; alternativas: number; corretas: number; fontes: number }>();
  if (!contract) throw new ApiError('Questão não encontrada', 404, 'CONHECIMENTO_ATIVO_QUESTAO_NAO_ENCONTRADA');
  if (contract.item_status !== 'APROVADO' || Number(contract.fontes) < 1) {
    throw new ApiError(
      'A questão só pode ser aprovada após aprovação do item e validação de fonte vigente.',
      400,
      'CONHECIMENTO_ATIVO_ITEM_NAO_PUBLICAVEL',
    );
  }
  if (Number(contract.alternativas) < 2 || Number(contract.corretas) !== 1) {
    throw new ApiError(
      'Contrato de alternativas inválido.',
      400,
      'CONHECIMENTO_ATIVO_ALTERNATIVAS_INVALIDAS',
    );
  }
  await c.env.DB
    .prepare(
      "UPDATE conhecimento_ativo_questoes SET status='APROVADA',aprovado_por_usuario_id=?, " +
        "aprovado_em=datetime('now'),updated_at=datetime('now') WHERE id=? AND empresa_id=?",
    )
    .bind(c.get('userId'), questaoId, empresaId)
    .run();
  await audit(c, 'conhecimento_ativo_questoes', 'UPDATE', questaoId, { status: 'APROVADA' });
  return c.json({ success: true, data: { id: questaoId, status: 'APROVADA' } });
});


adminRoutes.post('/fontes/:id/vigente', async (c) => {
  const empresaId = empresaIdFrom(c);
  const fonteId = positiveId(c.req.param('id'), 'Fonte');
  const result = await c.env.DB
    .prepare(
      "UPDATE conhecimento_ativo_fontes SET status='VIGENTE',updated_at=datetime('now') " +
        "WHERE id=? AND empresa_id=? AND status IN ('RASCUNHO','SUPERADO') AND deleted_at IS NULL",
    )
    .bind(fonteId, empresaId)
    .run();
  if (!result.meta.changes) {
    throw new ApiError(
      'Fonte não encontrada ou já está vigente.',
      404,
      'CONHECIMENTO_ATIVO_FONTE_NAO_ENCONTRADA',
    );
  }
  await audit(c, 'conhecimento_ativo_fontes', 'UPDATE', fonteId, { status: 'VIGENTE' });
  return c.json({ success: true, data: { id: fonteId, status: 'VIGENTE' } });
});

adminRoutes.get('/importacao/modelo.xlsx', async (c) => {
  const buffer = await gerarTemplateConhecimentoAtivo();
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-conhecimento-ativo-airtrust.xlsx"',
      'Cache-Control': 'private, no-store',
    },
  });
});

adminRoutes.get('/importacao/historico', async (c) => {
  const empresaId = empresaIdFrom(c);
  const result = await c.env.DB
    .prepare(
      'SELECT id,arquivo_nome,arquivo_sha256,template_versao,status,total_linhas,total_erros,' +
        'total_inseridos,total_ignorados,resumo_json,erro,created_at,aplicado_em ' +
        'FROM conhecimento_ativo_importacoes WHERE empresa_id=? ORDER BY id DESC LIMIT 50',
    )
    .bind(empresaId)
    .all();
  return c.json({ success: true, data: result.results || [] });
});

async function readImportFile(c: Context<AppEnv>): Promise<{
  name: string;
  buffer: ArrayBuffer;
}> {
  const form = await c.req.formData();
  const value = form.get('arquivo');
  if (
    typeof value !== 'object' ||
    value === null ||
    !('arrayBuffer' in value) ||
    typeof value.arrayBuffer !== 'function'
  ) {
    throw new ApiError(
      'Envie o arquivo .xlsx no campo "arquivo".',
      400,
      'CONHECIMENTO_ATIVO_IMPORT_ARQUIVO_OBRIGATORIO',
    );
  }
  const file = value as File;
  const name = String(file.name || 'conhecimento-ativo.xlsx');
  if (!name.toLowerCase().endsWith('.xlsx')) {
    throw new ApiError(
      'Formato inválido. Use o modelo .xlsx do AirTrust.',
      400,
      'CONHECIMENTO_ATIVO_IMPORT_FORMATO_INVALIDO',
    );
  }
  if (Number(file.size || 0) > 8 * 1024 * 1024) {
    throw new ApiError(
      'Arquivo excede o limite de 8 MB.',
      400,
      'CONHECIMENTO_ATIVO_IMPORT_ARQUIVO_GRANDE',
    );
  }
  return { name, buffer: await file.arrayBuffer() };
}

adminRoutes.post('/importacao/validar', async (c) => {
  const empresaId = empresaIdFrom(c);
  const { name, buffer } = await readImportFile(c);
  const parsed = await parseConhecimentoAtivoWorkbook(buffer);
  const dbErrors =
    parsed.errors.length === 0
      ? await validarConflitosBanco({ db: c.env.DB, empresaId, rows: parsed.rows })
      : [];
  const errors = [...parsed.errors, ...dbErrors];
  return c.json({
    success: true,
    data: {
      arquivo: name,
      version: parsed.version,
      totalRows: parsed.totalRows,
      validRows: parsed.rows.length,
      errors,
      warnings: parsed.warnings,
      canImport: errors.length === 0 && parsed.rows.length > 0,
      preview: parsed.rows.slice(0, 12).map((row) => ({
        linha: row.linha,
        aeronave_modelo: row.aeronaveModelo,
        fonte: row.fonteTipo + ' · ' + row.fonteTitulo + ' · Rev. ' + row.fonteRevisao,
        topico_codigo: row.topicoCodigo,
        item_codigo: row.itemCodigo,
        item_titulo: row.itemTitulo,
        questao_variante: row.questaoVariante,
        questao_enunciado: row.questaoEnunciado,
      })),
    },
  });
});

adminRoutes.post('/importacao/aplicar', async (c) => {
  const empresaId = empresaIdFrom(c);
  const userId = Number(c.get('userId'));
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError('Usuário autenticado inválido.', 403, 'USER_INVALID');
  }

  const { name, buffer } = await readImportFile(c);
  const parsed = await parseConhecimentoAtivoWorkbook(buffer);
  const dbErrors =
    parsed.errors.length === 0
      ? await validarConflitosBanco({ db: c.env.DB, empresaId, rows: parsed.rows })
      : [];
  const errors = [...parsed.errors, ...dbErrors];

  if (errors.length > 0 || parsed.rows.length === 0) {
    return c.json(
      {
        success: false,
        error: 'A planilha possui erros e não foi importada.',
        code: 'CONHECIMENTO_ATIVO_IMPORT_VALIDATION_FAILED',
        details: {
          totalRows: parsed.totalRows,
          validRows: parsed.rows.length,
          errors,
        },
      },
      400,
    );
  }

  const result = await aplicarImportacaoConhecimento({
    env: c.env,
    empresaId,
    userId,
    arquivoNome: name,
    arquivoSha256: await sha256Hex(buffer),
    rows: parsed.rows,
  });

  await audit(c, 'conhecimento_ativo_importacoes', 'INSERT', result.importacaoId, {
    arquivo: name,
    totalRows: result.totalRows,
    inserted: result.inserted,
    ignored: result.ignored,
  });

  return c.json({ success: true, data: result }, 201);
});

export default adminRoutes;
