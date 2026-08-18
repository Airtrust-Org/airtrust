import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import {
  getAtividadesRecentes,
  getComplianceScore,
  getDashboardAlerts,
  getDashboardMetrics,
} from '../services/dashboardService';
import { employeeSectorSql, getEmployeeSectorAccess } from '../services/employee-sector-access';
import type { EmployeeSectorAccess } from '../services/employee-sector-access';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

type PapelFicha = 'ALUNO' | 'INSTRUTOR';

interface FichaPendenteResumo {
  id: number;
  papel: PapelFicha;
  data_sessao: string | null;
  hora_inicio: string | null;
  participante_nome: string;
  instrutor_nome: string;
  link: string;
}

interface FichaConcluidaResumo {
  id: number;
  resultado_final: string | null;
  data_sessao: string | null;
  participante_nome: string;
  instrutor_nome: string;
  link: string;
}

interface HomeAssistantContext {
  funcionarioNome?: string;
  role: string;
  dashboard: {
    tripulantesAtivos: number;
    qualificacoesAVencer: number;
    qualificacoesVencidas: number;
    demandaFutura30Dias: number;
  };
  compliance: {
    scoreGeral: number;
    metaOrganizacional: number;
    qualificacoesValidas: number;
    totalQualificacoes: number;
  };
  alertasCriticos: Array<{
    criticidade: string;
    mensagem: string;
    urlAcao: string;
  }>;
  atividadesRecentes: Array<{
    tipo: string;
    descricao: string;
    tripulanteNome?: string;
    timestamp: string;
  }>;
  fichas: {
    pendentesAluno: number;
    pendentesInstrutor: number;
    pendentes: FichaPendenteResumo[];
    concluidasRecentes: FichaConcluidaResumo[];
  };
  consultaQualificacoes?: {
    alvoId: number;
    alvoNome: string;
    filtro: string | null;
    resultados: Array<{
      funcionarioId: number;
      funcionarioNome: string;
      qualificacaoCodigo: string | null;
      qualificacaoNome: string | null;
      dataConclusao: string | null;
      dataVencimento: string | null;
      status: string | null;
      diasParaVencer: number | null;
    }>;
  } | null;
}

function buildPromptContext(context: HomeAssistantContext) {
  return {
    funcionarioNome: context.funcionarioNome,
    role: context.role,
    dashboard: context.dashboard,
    compliance: context.compliance,
    alertasCriticos: context.alertasCriticos.map((alerta) => ({
      criticidade: alerta.criticidade,
      mensagem: alerta.mensagem,
      urlAcao: alerta.urlAcao,
    })),
    atividadesRecentes: context.atividadesRecentes.map((atividade) => ({
      tipo: atividade.tipo,
      descricao: atividade.descricao,
      tripulanteNome: atividade.tripulanteNome,
      timestamp: atividade.timestamp,
    })),
    fichas: {
      pendentesAluno: context.fichas.pendentesAluno,
      pendentesInstrutor: context.fichas.pendentesInstrutor,
      pendentes: context.fichas.pendentes.map((item) => ({
        papel: item.papel,
        data_sessao: item.data_sessao,
        hora_inicio: item.hora_inicio,
        participante_nome: item.participante_nome,
        instrutor_nome: item.instrutor_nome,
      })),
      concluidasRecentes: context.fichas.concluidasRecentes.map((item) => ({
        resultado_final: item.resultado_final,
        data_sessao: item.data_sessao,
        participante_nome: item.participante_nome,
        instrutor_nome: item.instrutor_nome,
      })),
    },
    consultaQualificacoes: context.consultaQualificacoes,
  };
}

const STOPWORDS_FUNCIONARIO = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'minha',
  'minhas',
  'meu',
  'meus',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'para',
  'por',
  'qual',
  'quais',
  'ultimo',
  'ultima',
  'ultimas',
  'ultimos',
  'venc',
  'vencimento',
  'vence',
  'crm',
  'cma',
  'certificado',
  'certificados',
  'qualificacao',
  'qualificacoes',
]);

function normalizarRole(role: string): string {
  const normalized = role.trim().toUpperCase();
  if (normalized === 'ALUNO' || normalized === 'USUARIO') return 'ALUNO';
  if (normalized === 'INSTRUTOR') return 'INSTRUTOR';
  return normalized || 'USUARIO';
}

async function getFuncionarioContext(
  db: D1Database,
  userId: string,
  empresaId: string,
): Promise<{ funcionarioId: string; nome: string } | null> {
  const row = await db
    .prepare(
      `SELECT f.id as funcionario_id, f.nome
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
       WHERE u.id = ?
         AND f.empresa_id = ?
         AND u.deleted_at IS NULL
         AND f.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(userId, empresaId)
    .first<{ funcionario_id: number; nome: string }>();

  if (!row) return null;
  return { funcionarioId: String(row.funcionario_id), nome: row.nome };
}

async function carregarResumoFichas(
  db: D1Database,
  empresaId: string,
  funcionarioId: string,
): Promise<HomeAssistantContext['fichas']> {
  const pendentesResult = await db
    .prepare(
      `SELECT
         f.id,
         COALESCE(sa.data, f.data_sessao) as data_sessao,
         COALESCE(sa.hora_inicio, '') as hora_inicio,
         COALESCE(aluno.nome, 'Aluno') as participante_nome,
         COALESCE(instrutor.nome, 'Instrutor') as instrutor_nome,
         CASE
           WHEN f.colaborador_id_aluno = ?
             AND f.assinatura_aluno_timestamp IS NULL
             AND f.assinatura_instrutor_timestamp IS NULL
           THEN 'ALUNO'
           WHEN f.instrutor_id = ?
             AND f.assinatura_aluno_timestamp IS NOT NULL
             AND f.assinatura_instrutor_timestamp IS NULL
           THEN 'INSTRUTOR'
           ELSE NULL
         END as papel
       FROM fichas_sessao f
       LEFT JOIN simulador_agendamentos sa ON sa.id = f.agendamento_slot_id
       LEFT JOIN funcionarios aluno ON aluno.id = f.colaborador_id_aluno
       LEFT JOIN funcionarios instrutor ON instrutor.id = f.instrutor_id
       WHERE f.deleted_at IS NULL
         AND aluno.empresa_id = ?
         AND (
           (f.colaborador_id_aluno = ?
             AND f.assinatura_aluno_timestamp IS NULL
             AND f.assinatura_instrutor_timestamp IS NULL)
           OR
           (f.instrutor_id = ?
             AND f.assinatura_aluno_timestamp IS NOT NULL
             AND f.assinatura_instrutor_timestamp IS NULL)
         )
       ORDER BY COALESCE(sa.data, f.data_sessao) ASC, COALESCE(sa.hora_inicio, '23:59') ASC
       LIMIT 5`,
    )
    .bind(funcionarioId, funcionarioId, empresaId, funcionarioId, funcionarioId)
    .all<{
      id: number;
      data_sessao: string | null;
      hora_inicio: string | null;
      participante_nome: string;
      instrutor_nome: string;
      papel: PapelFicha | null;
    }>();

  const concluidasResult = await db
    .prepare(
      `SELECT
         f.id,
         f.resultado_final,
         COALESCE(sa.data, f.data_sessao) as data_sessao,
         COALESCE(aluno.nome, 'Aluno') as participante_nome,
         COALESCE(instrutor.nome, 'Instrutor') as instrutor_nome
       FROM fichas_sessao f
       LEFT JOIN simulador_agendamentos sa ON sa.id = f.agendamento_slot_id
       LEFT JOIN funcionarios aluno ON aluno.id = f.colaborador_id_aluno
       LEFT JOIN funcionarios instrutor ON instrutor.id = f.instrutor_id
       WHERE f.deleted_at IS NULL
         AND aluno.empresa_id = ?
         AND (f.colaborador_id_aluno = ? OR f.instrutor_id = ?)
         AND f.assinatura_instrutor_timestamp IS NOT NULL
       ORDER BY COALESCE(f.updated_at, f.created_at) DESC
       LIMIT 3`,
    )
    .bind(empresaId, funcionarioId, funcionarioId)
    .all<{
      id: number;
      resultado_final: string | null;
      data_sessao: string | null;
      participante_nome: string;
      instrutor_nome: string;
    }>();

  const pendentes = (pendentesResult.results || [])
    .filter((item) => item.papel)
    .map((item) => ({
      id: item.id,
      papel: item.papel as PapelFicha,
      data_sessao: item.data_sessao,
      hora_inicio: item.hora_inicio,
      participante_nome: item.participante_nome,
      instrutor_nome: item.instrutor_nome,
      link: `/simuladores/fichas/${item.id}?mode=sign&papel=${item.papel === 'INSTRUTOR' ? 'INSTRUTOR' : 'TRIPULANTE'}`,
    }));

  const concluidasRecentes = (concluidasResult.results || []).map((item) => ({
    id: item.id,
    resultado_final: item.resultado_final,
    data_sessao: item.data_sessao,
    participante_nome: item.participante_nome,
    instrutor_nome: item.instrutor_nome,
    link: `/simuladores/fichas/${item.id}`,
  }));

  return {
    pendentesAluno: pendentes.filter((item) => item.papel === 'ALUNO').length,
    pendentesInstrutor: pendentes.filter((item) => item.papel === 'INSTRUTOR').length,
    pendentes,
    concluidasRecentes,
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function shouldConsultarQualificacoes(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return [
    'qualific',
    'venc',
    'vence',
    'vencimento',
    'crm',
    'cma',
    'certificado',
    'licenca',
    'licenca',
  ].some((keyword) => normalized.includes(keyword));
}

function detectarFiltroQualificacao(message: string): string | null {
  const normalized = normalizeSearchText(message);
  if (normalized.includes('crm')) return 'crm';
  if (normalized.includes('cma')) return 'cma';

  const sigla = normalized.match(/\b(pp|pla|ifr|mlte|cht)\b/i);
  return sigla ? sigla[1].toLowerCase() : null;
}

async function resolverFuncionarioConsulta(
  db: D1Database,
  empresaId: string,
  message: string,
  access: EmployeeSectorAccess,
  funcionarioAtual?: { funcionarioId: string; nome: string } | null,
): Promise<{ id: number; nome: string } | null> {
  const normalized = normalizeSearchText(message);
  const employeeScope = employeeSectorSql(access, 'f');

  if (funcionarioAtual && /\b(meu|minha|meus|minhas|eu)\b/.test(normalized)) {
    return { id: Number(funcionarioAtual.funcionarioId), nome: funcionarioAtual.nome };
  }

  const fullNameMatch = await db
    .prepare(
      `SELECT f.id, f.nome
       FROM funcionarios f
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND instr(LOWER(?), LOWER(f.nome)) > 0
         AND ${employeeScope.clause}
       ORDER BY LENGTH(f.nome) DESC
       LIMIT 1`,
    )
    .bind(empresaId, message, ...employeeScope.bindings)
    .first<{ id: number; nome: string }>();

  if (fullNameMatch) {
    return fullNameMatch;
  }

  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS_FUNCIONARIO.has(token));

  if (tokens.length === 0) {
    return funcionarioAtual
      ? { id: Number(funcionarioAtual.funcionarioId), nome: funcionarioAtual.nome }
      : null;
  }

  const scoreExpr = tokens
    .map(() => `CASE WHEN LOWER(f.nome) LIKE ? THEN 1 ELSE 0 END`)
    .join(' + ');
  const candidate = await db
    .prepare(
      `SELECT f.id, f.nome, ${scoreExpr} as score
       FROM funcionarios f
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND ${employeeScope.clause}
       ORDER BY score DESC, LENGTH(f.nome) ASC
       LIMIT 1`,
    )
    .bind(...tokens.map((token) => `%${token}%`), empresaId, ...employeeScope.bindings)
    .first<{ id: number; nome: string; score: number }>();

  const minScore = tokens.length > 1 ? 2 : 1;
  if (candidate && candidate.score >= minScore) {
    return { id: candidate.id, nome: candidate.nome };
  }

  return funcionarioAtual
    ? { id: Number(funcionarioAtual.funcionarioId), nome: funcionarioAtual.nome }
    : null;
}

async function consultarQualificacoesRelacionadas(
  db: D1Database,
  empresaId: string,
  message: string,
  access: EmployeeSectorAccess,
  funcionarioAtual?: { funcionarioId: string; nome: string } | null,
): Promise<HomeAssistantContext['consultaQualificacoes']> {
  if (!shouldConsultarQualificacoes(message)) {
    return null;
  }

  const alvo = await resolverFuncionarioConsulta(db, empresaId, message, access, funcionarioAtual);
  if (!alvo) {
    return null;
  }

  const filtro = detectarFiltroQualificacao(message);
  const filtrosSql = filtro
    ? `
      AND (
        LOWER(COALESCE(qt.nome, '')) LIKE ?
        OR LOWER(COALESCE(qh.qualificacao_codigo, '')) LIKE ?
        OR LOWER(COALESCE(qh.tipo, '')) LIKE ?
        OR LOWER(COALESCE(qh.codigo, '')) LIKE ?
      )`
    : '';
  const filtroArgs = filtro ? Array.from({ length: 4 }, () => `%${filtro}%`) : [];

  const resultado = await db
    .prepare(
      `SELECT
         f.nome as funcionario_nome,
         qh.qualificacao_codigo,
         COALESCE(qt.nome, qh.tipo, qh.qualificacao_codigo, qh.codigo) as qualificacao_nome,
         qh.data_conclusao,
         qh.data_vencimento,
         qh.status
       FROM qualificacoes_historico qh
       INNER JOIN funcionarios f
         ON f.id = qh.funcionario_id
        AND f.empresa_id = qh.empresa_id
        AND f.deleted_at IS NULL
       LEFT JOIN qualificacoes_tipos qt
         ON qt.id = qh.qualificacao_id
        AND qt.empresa_id = qh.empresa_id
        AND qt.deleted_at IS NULL
       WHERE qh.empresa_id = ?
         AND qh.deleted_at IS NULL
         AND qh.funcionario_id = ?
         ${filtrosSql}
       ORDER BY COALESCE(qh.data_vencimento, '9999-12-31') DESC,
                COALESCE(qh.data_conclusao, '0001-01-01') DESC,
                qh.id DESC
       LIMIT 5`,
    )
    .bind(empresaId, alvo.id, ...filtroArgs)
    .all<{
      funcionario_nome: string;
      qualificacao_codigo: string | null;
      qualificacao_nome: string | null;
      data_conclusao: string | null;
      data_vencimento: string | null;
      status: string | null;
    }>();

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return {
    alvoId: alvo.id,
    alvoNome: alvo.nome,
    filtro,
    resultados: (resultado.results || []).map((item) => {
      const dataVencimento = item.data_vencimento ? new Date(item.data_vencimento) : null;
      const diasParaVencer = dataVencimento
        ? Math.round((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        funcionarioId: alvo.id,
        funcionarioNome: item.funcionario_nome,
        qualificacaoCodigo: item.qualificacao_codigo,
        qualificacaoNome: item.qualificacao_nome,
        dataConclusao: item.data_conclusao,
        dataVencimento: item.data_vencimento,
        status: item.status,
        diasParaVencer,
      };
    }),
  };
}

function formatarDataPtBr(data: string | null | undefined): string {
  if (!data) return 'sem data informada';
  const parsed = new Date(data);
  if (Number.isNaN(parsed.getTime())) return data;
  return parsed.toLocaleDateString('pt-BR');
}

function descreverValidade(
  item: NonNullable<HomeAssistantContext['consultaQualificacoes']>['resultados'][number],
): string {
  if (!item.dataVencimento) {
    return 'não possui vencimento informado';
  }

  if (item.diasParaVencer === null) {
    return `vence em ${formatarDataPtBr(item.dataVencimento)}`;
  }

  if (item.diasParaVencer < 0) {
    return `venceu em ${formatarDataPtBr(item.dataVencimento)} (${Math.abs(item.diasParaVencer)} dias atrás)`;
  }

  if (item.diasParaVencer === 0) {
    return `vence hoje (${formatarDataPtBr(item.dataVencimento)})`;
  }

  return `vence em ${formatarDataPtBr(item.dataVencimento)} (${item.diasParaVencer} dias)`;
}

function buildFallbackAnswer(message: string, context: HomeAssistantContext): string {
  const normalized = message.toLowerCase();
  const totalPendentes = context.fichas.pendentesAluno + context.fichas.pendentesInstrutor;

  if (context.consultaQualificacoes) {
    const { alvoNome, filtro, resultados } = context.consultaQualificacoes;
    if (resultados.length === 0) {
      return filtro
        ? `Não encontrei registros de ${filtro.toUpperCase()} para ${alvoNome} na base atual da empresa.`
        : `Não encontrei qualificações registradas para ${alvoNome} na base atual da empresa.`;
    }

    const ultima = resultados[0];
    const descricaoTipo =
      ultima.qualificacaoNome ||
      ultima.qualificacaoCodigo ||
      filtro?.toUpperCase() ||
      'qualificação';
    const conclusao = ultima.dataConclusao
      ? ` A conclusão mais recente foi em ${formatarDataPtBr(ultima.dataConclusao)}.`
      : '';
    const status = ultima.status ? ` Status atual: ${ultima.status}.` : '';

    if (
      normalized.includes('ultimo') ||
      normalized.includes('último') ||
      normalized.includes('venc') ||
      normalized.includes('crm') ||
      normalized.includes('cma')
    ) {
      return `O último registro de ${descricaoTipo} para ${alvoNome} ${descreverValidade(ultima)}.${conclusao}${status}`;
    }

    const resumo = resultados
      .slice(0, 3)
      .map(
        (item) =>
          `${item.qualificacaoNome || item.qualificacaoCodigo || 'Qualificação'}: ${descreverValidade(item)}`,
      )
      .join('; ');

    return `Resumo de qualificações para ${alvoNome}: ${resumo}.`;
  }

  if (
    normalized.includes('compliance') ||
    normalized.includes('conformidade') ||
    normalized.includes('qualifica')
  ) {
    const percentualValido =
      context.compliance.totalQualificacoes > 0
        ? Math.round(
            (context.compliance.qualificacoesValidas / context.compliance.totalQualificacoes) * 100,
          )
        : 100;

    return `A conformidade geral está em ${context.compliance.scoreGeral}%, com meta de ${context.compliance.metaOrganizacional}%. Hoje existem ${context.dashboard.qualificacoesVencidas} qualificações vencidas, ${context.dashboard.qualificacoesAVencer} a vencer e ${percentualValido}% do estoque atual está válido.`;
  }

  if (
    normalized.includes('alerta') ||
    normalized.includes('urgente') ||
    normalized.includes('critico')
  ) {
    if (context.alertasCriticos.length === 0) {
      return 'Não encontrei alertas críticos abertos no momento.';
    }

    const topAlertas = context.alertasCriticos
      .slice(0, 3)
      .map((alerta) => `${alerta.criticidade}: ${alerta.mensagem}`)
      .join('; ');

    return `Há ${context.alertasCriticos.length} alerta(s) crítico(s) ou prioritário(s) no painel. Principais itens: ${topAlertas}.`;
  }

  if (
    normalized.includes('atividade') ||
    normalized.includes('recent') ||
    normalized.includes('ultimas') ||
    normalized.includes('últimas')
  ) {
    if (context.atividadesRecentes.length === 0) {
      return 'Não encontrei atividades recentes relevantes para mostrar agora.';
    }

    const recentes = context.atividadesRecentes
      .slice(0, 3)
      .map((atividade) => atividade.descricao)
      .join('; ');

    return `Atividades recentes: ${recentes}.`;
  }

  if (
    normalized.includes('pend') ||
    normalized.includes('assinar') ||
    normalized.includes('assinatura') ||
    normalized.includes('ficha')
  ) {
    if (totalPendentes === 0) {
      return 'Não há fichas pendentes de assinatura no momento para o seu contexto atual.';
    }

    const detalhes = context.fichas.pendentes
      .map((item) => {
        const prefixo = item.papel === 'INSTRUTOR' ? 'Como instrutor' : 'Como aluno';
        const data = item.data_sessao ? ` em ${item.data_sessao}` : '';
        return `${prefixo}, a ficha #${item.id}${data} está aguardando sua ação.`;
      })
      .join(' ');

    return `Você tem ${totalPendentes} ficha(s) pendente(s). ${detalhes}`;
  }

  if (
    normalized.includes('conclu') ||
    normalized.includes('resultado') ||
    normalized.includes('aprov')
  ) {
    if (context.fichas.concluidasRecentes.length === 0) {
      return 'Não encontrei fichas concluídas recentes para você.';
    }

    const recentes = context.fichas.concluidasRecentes
      .map((item) => `Ficha #${item.id} com resultado ${item.resultado_final || 'PENDENTE'}`)
      .join('; ');

    return `As fichas concluídas mais recentes são: ${recentes}.`;
  }

  if (
    normalized.includes('treinamento') ||
    normalized.includes('demanda') ||
    normalized.includes('agenda')
  ) {
    return `A demanda operacional mostra ${context.dashboard.demandaFutura30Dias} sessão(ões) previstas para os próximos 30 dias. Posso detalhar risco, fichas pendentes ou pressão de qualificações.`;
  }

  return `Resumo operacional: conformidade em ${context.compliance.scoreGeral}%, ${context.dashboard.qualificacoesVencidas} qualificações vencidas, ${context.dashboard.qualificacoesAVencer} a vencer, ${context.dashboard.demandaFutura30Dias} sessões nos próximos 30 dias e ${totalPendentes} ficha(s) pendente(s) para assinatura.`;
}

async function gerarRespostaAssistente(
  env: Env,
  message: string,
  context: HomeAssistantContext,
): Promise<{ text: string; provider: string; model: string }> {
  const fallbackText = buildFallbackAnswer(message, context);
  const promptContext = buildPromptContext(context);

  if (!env.AI) {
    return {
      text: fallbackText,
      provider: 'rule-engine',
      model: 'operational-home-v2',
    };
  }

  try {
    const systemPrompt =
      'Você é o Assistente AirTrust da tela inicial. Responda em português do Brasil, com objetividade, usando SOMENTE os dados fornecidos. ' +
      'Nunca invente informações, nunca mencione outras empresas, nunca exponha dados fora do contexto do usuário autenticado. ' +
      'Você pode responder sobre operação, compliance, qualificações, alertas, atividades recentes, fichas e consultas de vencimento de qualificação por colaborador quando esses dados estiverem presentes. Se não houver dado, diga isso claramente.';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Pergunta do usuário: ${message}\n\nContexto disponível:\n${JSON.stringify(promptContext)}`,
        },
      ],
      max_tokens: 220,
    })) as { response?: string };

    if (result?.response?.trim()) {
      return {
        text: result.response.trim(),
        provider: 'cloudflare-workers-ai',
        model: '@cf/meta/llama-3.1-8b-instruct',
      };
    }
  } catch {
    // fallback abaixo
  }

  return {
    text: fallbackText,
    provider: 'rule-engine',
    model: 'operational-home-v1',
  };
}

app.post('/home-perfil/chat', async (c) => {
  const schema = z.object({
    message: z.string().trim().min(2).max(400),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Mensagem inválida', code: 'INVALID_ASSISTANT_INPUT' },
      400,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawUserId = (c as any).get('userId');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEmpresaId = (c as any).get('empresaId');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = String((c as any).get('userRole') || '');

  const userId = Number(rawUserId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json(
      {
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Usuário não autenticado para acessar o assistente',
      },
      401,
    );
  }

  const empresaId = Number(rawEmpresaId);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    return c.json(
      {
        success: false,
        error: 'TENANT_CONTEXT_REQUIRED',
        message: 'Contexto de empresa inválido para acessar o assistente',
      },
      403,
    );
  }

  const roleNormalizado = normalizarRole(userRole);
  const funcionario = await getFuncionarioContext(c.env.DB, String(userId), String(empresaId));
  const access = await getEmployeeSectorAccess(c, empresaId);
  const [metrics, compliance, alertas, atividades, resumoFichas, consultaQualificacoes] =
    await Promise.all([
      getDashboardMetrics(c.env.DB, empresaId, access),
      getComplianceScore(c.env.DB, empresaId, access),
      getDashboardAlerts(c.env.DB, empresaId, access),
      getAtividadesRecentes(c.env.DB, empresaId, access),
      funcionario
        ? carregarResumoFichas(c.env.DB, String(empresaId), funcionario.funcionarioId)
        : Promise.resolve({
            pendentesAluno: 0,
            pendentesInstrutor: 0,
            pendentes: [],
            concluidasRecentes: [],
          }),
      consultarQualificacoesRelacionadas(
        c.env.DB,
        String(empresaId),
        parsed.data.message,
        access,
        funcionario,
      ),
    ]);

  const context: HomeAssistantContext = {
    funcionarioNome: funcionario?.nome,
    role: roleNormalizado,
    dashboard: {
      tripulantesAtivos: metrics.tripulantesAtivos,
      qualificacoesAVencer: metrics.qualificacoesAVencer,
      qualificacoesVencidas: metrics.qualificacoesVencidas,
      demandaFutura30Dias: metrics.demandaFutura30Dias,
    },
    compliance: {
      scoreGeral: compliance.scoreGeral,
      metaOrganizacional: compliance.metaOrganizacional,
      qualificacoesValidas: compliance.qualificacoesValidas ?? 0,
      totalQualificacoes: compliance.totalQualificacoes ?? 0,
    },
    alertasCriticos: alertas.slice(0, 5).map((alerta) => ({
      criticidade: alerta.criticidade,
      mensagem: alerta.mensagem,
      urlAcao: alerta.urlAcao,
    })),
    atividadesRecentes: atividades.slice(0, 5).map((atividade) => ({
      tipo: atividade.tipo,
      descricao: atividade.descricao,
      tripulanteNome: atividade.tripulanteNome,
      timestamp: atividade.timestamp,
    })),
    fichas: resumoFichas,
    consultaQualificacoes,
  };

  const answer = await gerarRespostaAssistente(c.env, parsed.data.message, context);

  return c.json({
    success: true,
    data: {
      message: answer.text,
      provider: answer.provider,
      model: answer.model,
      suggestions: [
        'Qual é o resumo operacional de hoje?',
        'Há alertas críticos ou qualificações vencidas?',
        'O que está pendente nas minhas fichas?',
        'Qual foi o vencimento do último CRM de um colaborador?',
      ],
      context: {
        role: context.role,
        tripulantesAtivos: context.dashboard.tripulantesAtivos,
        qualificacoesAVencer: context.dashboard.qualificacoesAVencer,
        qualificacoesVencidas: context.dashboard.qualificacoesVencidas,
        demandaFutura30Dias: context.dashboard.demandaFutura30Dias,
        pendentesAluno: context.fichas.pendentesAluno,
        pendentesInstrutor: context.fichas.pendentesInstrutor,
        alertasCriticos: context.alertasCriticos.length,
        atividadesRecentes: context.atividadesRecentes.length,
        consultaQualificacoes: context.consultaQualificacoes?.resultados.length || 0,
      },
      alertas: alertas.slice(0, 4).map((alerta) => ({
        criticidade: alerta.criticidade,
        mensagem: alerta.mensagem,
        tripulanteNome: alerta.tripulanteNome,
        qualificacaoNome: alerta.qualificacaoNome,
        diasRestantes: alerta.diasRestantes,
        dataVencimento: alerta.dataVencimento,
        urlAcao: alerta.urlAcao,
      })),
      atividades: atividades.slice(0, 4).map((atividade) => ({
        tipo: atividade.tipo,
        descricao: atividade.descricao,
        tripulanteNome: atividade.tripulanteNome,
        timestamp: atividade.timestamp,
      })),
      fichasPendentes: context.fichas.pendentes.slice(0, 4),
      fichasRecentes: context.fichas.concluidasRecentes.slice(0, 3),
      consultaQualificacoes: context.consultaQualificacoes,
    },
  });
});

export default app;
