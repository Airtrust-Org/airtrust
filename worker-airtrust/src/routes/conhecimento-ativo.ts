import { Hono, type Context } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { AppEnv } from '../types';
import {
  buscarDesafioParaFuncionario,
  gerarOuObterDesafio,
  iniciarDesafio,
  mapaConhecimento,
  responderQuestao,
  resumoConhecimentoAtivo,
} from '../services/conhecimento-ativo/challenge-service';
import type { ConhecimentoConfianca } from '../services/conhecimento-ativo/retencao';
import { conhecimentoAtivoEnabledForTenant } from '../services/conhecimento-ativo/feature-gate';

const conhecimentoAtivoRoutes = new Hono<AppEnv>();

conhecimentoAtivoRoutes.use('*', auth());

function contextoFuncionario(c: Context<AppEnv>) {
  const empresaId = c.get('empresaId') as number;
  const funcionarioId = c.get('funcionarioId') as number | null | undefined;
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new ApiError('Empresa ativa inválida', 403, 'TENANT_INVALIDO');
  }
  if (!conhecimentoAtivoEnabledForTenant(c.env, empresaId)) {
    throw new ApiError(
      'Conhecimento Ativo ainda não está habilitado para esta empresa.',
      404,
      'CONHECIMENTO_ATIVO_DESABILITADO',
    );
  }
  if (!Number.isInteger(funcionarioId) || Number(funcionarioId) <= 0) {
    throw new ApiError(
      'O Conhecimento Ativo exige vínculo do usuário com um funcionário.',
      403,
      'CONHECIMENTO_ATIVO_SEM_FUNCIONARIO',
    );
  }
  return { empresaId, funcionarioId: Number(funcionarioId) };
}

function parseId(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(label + ' inválido', 400, 'CONHECIMENTO_ATIVO_ID_INVALIDO');
  }
  return parsed;
}

function mapServiceError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Error) {
    if (error.name === 'SEM_AERONAVE') {
      throw new ApiError(error.message, 400, 'CONHECIMENTO_ATIVO_SEM_AERONAVE');
    }
    if (error.name === 'AERONAVE_FORA_ESCOPO') {
      throw new ApiError(error.message, 403, 'CONHECIMENTO_ATIVO_AERONAVE_FORA_ESCOPO');
    }
    if (error.name === 'CONTEUDO_INSUFICIENTE') {
      throw new ApiError(error.message, 400, 'CONHECIMENTO_ATIVO_CONTEUDO_INSUFICIENTE');
    }
    if (error.name === 'TOPICO_INVALIDO') {
      throw new ApiError(error.message, 400, 'CONHECIMENTO_ATIVO_TOPICO_INVALIDO');
    }
    if (error.name === 'TOPICO_FORA_ESCOPO') {
      throw new ApiError(error.message, 400, 'CONHECIMENTO_ATIVO_TOPICO_FORA_ESCOPO');
    }
    if (error.name === 'ALTERNATIVA_INVALIDA') {
      throw new ApiError(error.message, 400, 'CONHECIMENTO_ATIVO_ALTERNATIVA_INVALIDA');
    }
  }
  throw error;
}

conhecimentoAtivoRoutes.get('/me', async (c) => {
  const { empresaId, funcionarioId } = contextoFuncionario(c);
  const data = await resumoConhecimentoAtivo({
    db: c.env.DB,
    empresaId,
    funcionarioId,
  });
  return c.json({ success: true, data });
});

conhecimentoAtivoRoutes.get('/me/mapa', async (c) => {
  const { empresaId, funcionarioId } = contextoFuncionario(c);
  const data = await mapaConhecimento({
    db: c.env.DB,
    empresaId,
    funcionarioId,
  });
  return c.json({ success: true, data });
});

conhecimentoAtivoRoutes.post('/me/desafios/gerar', async (c) => {
  const { empresaId, funcionarioId } = contextoFuncionario(c);
  let body: {
    aeronave_modelo?: string | null;
    topico_id?: number | null;
    modo?: 'TOPICO' | 'MISTO' | null;
  } = {};
  try {
    body = await c.req.json<{
      aeronave_modelo?: string | null;
      topico_id?: number | null;
      modo?: 'TOPICO' | 'MISTO' | null;
    }>();
  } catch {
    body = {};
  }
  const topicoSolicitado = body.topico_id == null ? null : Number(body.topico_id);
  if (topicoSolicitado !== null && (!Number.isInteger(topicoSolicitado) || topicoSolicitado <= 0)) {
    throw new ApiError('Área de conhecimento inválida', 400, 'CONHECIMENTO_ATIVO_TOPICO_INVALIDO');
  }
  try {
    const result = await gerarOuObterDesafio({
      db: c.env.DB,
      empresaId,
      funcionarioId,
      modeloSolicitado: typeof body.aeronave_modelo === 'string' ? body.aeronave_modelo : null,
      topicoSolicitado,
      modoMisto: body.modo === 'MISTO',
    });
    return c.json({ success: true, data: result }, result.criado ? 201 : 200);
  } catch (error) {
    return mapServiceError(error);
  }
});

conhecimentoAtivoRoutes.get('/me/desafios/:id', async (c) => {
  const { empresaId, funcionarioId } = contextoFuncionario(c);
  const desafioId = parseId(c.req.param('id'), 'Desafio');
  const data = await buscarDesafioParaFuncionario({
    db: c.env.DB,
    empresaId,
    funcionarioId,
    desafioId,
  });
  if (!data) {
    throw new ApiError('Desafio não encontrado', 404, 'CONHECIMENTO_ATIVO_DESAFIO_NAO_ENCONTRADO');
  }
  return c.json({ success: true, data });
});

conhecimentoAtivoRoutes.post('/me/desafios/:id/iniciar', async (c) => {
  const { empresaId, funcionarioId } = contextoFuncionario(c);
  const desafioId = parseId(c.req.param('id'), 'Desafio');
  const changed = await iniciarDesafio({
    db: c.env.DB,
    empresaId,
    funcionarioId,
    desafioId,
  });
  const data = await buscarDesafioParaFuncionario({
    db: c.env.DB,
    empresaId,
    funcionarioId,
    desafioId,
  });
  if (!data) {
    throw new ApiError('Desafio não encontrado', 404, 'CONHECIMENTO_ATIVO_DESAFIO_NAO_ENCONTRADO');
  }
  return c.json({ success: true, data: { ...data, iniciadoAgora: changed } });
});

conhecimentoAtivoRoutes.post('/me/desafios/:id/respostas', async (c) => {
  const { empresaId, funcionarioId } = contextoFuncionario(c);
  const desafioId = parseId(c.req.param('id'), 'Desafio');
  const body = await c.req.json<{
    desafio_questao_id?: number;
    alternativa_id?: number;
    confianca?: ConhecimentoConfianca;
    tempo_resposta_ms?: number | null;
  }>();

  const desafioQuestaoId = Number(body.desafio_questao_id);
  const alternativaId = Number(body.alternativa_id);
  if (!Number.isInteger(desafioQuestaoId) || desafioQuestaoId <= 0) {
    throw new ApiError('Questão do desafio inválida', 400, 'CONHECIMENTO_ATIVO_QUESTAO_INVALIDA');
  }
  if (!Number.isInteger(alternativaId) || alternativaId <= 0) {
    throw new ApiError('Alternativa inválida', 400, 'CONHECIMENTO_ATIVO_ALTERNATIVA_INVALIDA');
  }
  if (!['SABIA', 'DUVIDA', 'CHUTEI'].includes(String(body.confianca))) {
    throw new ApiError(
      'Informe seu nível de confiança na resposta.',
      400,
      'CONHECIMENTO_ATIVO_CONFIANCA_INVALIDA',
    );
  }

  const tempoRespostaMs =
    body.tempo_resposta_ms == null ? null : Math.max(0, Math.round(Number(body.tempo_resposta_ms)));
  if (tempoRespostaMs !== null && !Number.isFinite(tempoRespostaMs)) {
    throw new ApiError('Tempo de resposta inválido', 400, 'CONHECIMENTO_ATIVO_TEMPO_INVALIDO');
  }

  try {
    const data = await responderQuestao({
      db: c.env.DB,
      empresaId,
      funcionarioId,
      desafioId,
      desafioQuestaoId,
      alternativaId,
      confianca: body.confianca as ConhecimentoConfianca,
      tempoRespostaMs,
    });
    if (!data) {
      throw new ApiError(
        'Questão não encontrada neste desafio',
        404,
        'CONHECIMENTO_ATIVO_QUESTAO_NAO_ENCONTRADA',
      );
    }
    return c.json({ success: true, data });
  } catch (error) {
    return mapServiceError(error);
  }
});

export default conhecimentoAtivoRoutes;
