import React, { startTransition } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderOpen,
  MessageSquareText,
  SendHorizontal,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantResponseContext {
  role: string;
  tripulantesAtivos: number;
  qualificacoesAVencer: number;
  qualificacoesVencidas: number;
  demandaFutura30Dias: number;
  pendentesAluno: number;
  pendentesInstrutor: number;
  alertasCriticos: number;
  atividadesRecentes: number;
  consultaQualificacoes?: number;
}

interface AssistantAlertItem {
  criticidade: string;
  mensagem: string;
  tripulanteNome?: string;
  qualificacaoNome?: string;
  diasRestantes?: number;
  dataVencimento?: string;
  urlAcao?: string;
}

interface AssistantActivityItem {
  tipo: string;
  descricao: string;
  tripulanteNome?: string;
  timestamp: string;
}

interface AssistantFichaItem {
  id: number;
  papel: 'ALUNO' | 'INSTRUTOR';
  data_sessao: string | null;
  hora_inicio: string | null;
  participante_nome: string;
  instrutor_nome: string;
  link: string;
}

interface AssistantFichaRecenteItem {
  id: number;
  resultado_final: string | null;
  data_sessao: string | null;
  participante_nome: string;
  instrutor_nome: string;
  link: string;
}

interface AssistantQualificationQuery {
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
}

interface AssistantResponseData {
  message: string;
  provider: string;
  model: string;
  suggestions?: string[];
  context?: AssistantResponseContext;
  alertas?: AssistantAlertItem[];
  atividades?: AssistantActivityItem[];
  fichasPendentes?: AssistantFichaItem[];
  fichasRecentes?: AssistantFichaRecenteItem[];
  consultaQualificacoes?: AssistantQualificationQuery | null;
}

const QUICK_PROMPTS = [
  'Qual é o resumo operacional de hoje?',
  'Há alertas críticos ou qualificações vencidas?',
  'O que está pendente nas minhas fichas?',
];

function formatDate(value?: string | null) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sem horário';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDiasLabel(dias?: number) {
  if (dias === undefined) return null;
  if (dias < 0) return `${Math.abs(dias)} dia(s) em atraso`;
  if (dias === 0) return 'Vence hoje';
  return `${dias} dia(s) restantes`;
}

function getCriticidadeClasses(criticidade: string) {
  const normalized = criticidade.toUpperCase();
  if (normalized === 'CRITICA' || normalized === 'ALTA') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  if (normalized === 'MEDIA') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function StatCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  tone?: 'slate' | 'red' | 'amber' | 'emerald' | 'blue';
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
  } as const;

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none">{value}</p>
    </div>
  );
}

function SideSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ActionLink({
  label,
  onClick,
  tone = 'slate',
}: {
  label: string;
  onClick: () => void;
  tone?: 'slate' | 'red' | 'amber' | 'blue';
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    red: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${tones[tone]}`}
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

export default function HomePerfilAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = React.useState<AssistantMessage[]>([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'Posso resumir o panorama operacional da sua empresa com base no seu perfil autenticado: compliance, alertas, atividade recente, demanda e fichas quando existirem.',
    },
  ]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [meta, setMeta] = React.useState<AssistantResponseData | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const quickActions = React.useMemo(() => {
    const actions: Array<{
      key: string;
      label: string;
      tone?: 'slate' | 'red' | 'amber' | 'blue';
      onClick: () => void;
    }> = [];

    if ((meta?.alertas?.length || 0) > 0) {
      actions.push({
        key: 'alertas',
        label: 'Abrir alertas de qualificações',
        tone: 'red',
        onClick: () => navigate('/qualificacoes/alertas'),
      });
    }

    const firstFichaPendente = meta?.fichasPendentes?.[0];
    if (firstFichaPendente) {
      actions.push({
        key: 'fichas',
        label: 'Abrir próxima ficha pendente',
        tone: 'amber',
        onClick: () => navigate(firstFichaPendente.link),
      });
    }

    if (meta?.consultaQualificacoes?.alvoId) {
      actions.push({
        key: 'consulta',
        label: 'Abrir qualificações do funcionário',
        tone: 'blue',
        onClick: () =>
          navigate(`/qualificacoes?funcionario_id=${meta.consultaQualificacoes?.alvoId}`),
      });
    }

    if ((meta?.atividades?.length || 0) > 0) {
      actions.push({
        key: 'atividades',
        label: 'Abrir simuladores e fichas',
        tone: 'slate',
        onClick: () => navigate('/simuladores/fichas'),
      });
    }

    return actions.slice(0, 4);
  }, [meta, navigate]);

  async function enviarMensagem(message: string) {
    const texto = message.trim();
    if (!texto || loading) return;

    setLoading(true);
    setInput('');

    startTransition(() => {
      setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: texto }]);
    });

    try {
      const res = await api.post<{ success: boolean; data: AssistantResponseData }>(
        '/assistente/home-perfil/chat',
        { message: texto },
      );

      const payload = res.data as { success?: boolean; data?: AssistantResponseData } | undefined;
      if (!res.success || !payload?.success || !payload.data) {
        throw new Error(res.error || 'Falha ao consultar o assistente');
      }

      setMeta(payload.data);
      startTransition(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: payload.data?.message || 'Não consegui montar a resposta agora.',
          },
        ]);
      });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Falha ao consultar o assistente';
      startTransition(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-error-${Date.now()}`,
            role: 'assistant',
            content: `Não consegui responder agora. ${messageText}.`,
          },
        ]);
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] shadow-sm sm:mt-6">
      <div className="border-b border-slate-100 px-4 py-5 sm:px-6">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          <Sparkles className="w-4 h-4" />
          Copiloto Operacional
        </div>
        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Assistente do painel operacional
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Responde com contexto da operação, destaca pendências importantes e organiza nomes,
              vencimentos e atividades recentes sem te obrigar a ler blocos longos de texto.
            </p>
          </div>
          {meta?.context ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[420px]">
              <StatCard
                label="Alertas"
                value={meta.context.alertasCriticos}
                tone={meta.context.alertasCriticos > 0 ? 'red' : 'slate'}
              />
              <StatCard
                label="Fichas"
                value={meta.context.pendentesAluno + meta.context.pendentesInstrutor}
                tone={
                  meta.context.pendentesAluno + meta.context.pendentesInstrutor > 0
                    ? 'amber'
                    : 'emerald'
                }
              />
              <StatCard label="Ativos" value={meta.context.tripulantesAtivos} tone="blue" />
              <StatCard
                label="Consulta"
                value={meta.context.consultaQualificacoes || 0}
                tone={(meta.context.consultaQualificacoes || 0) > 0 ? 'blue' : 'slate'}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.45fr)_380px] xl:items-start">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap gap-2">
            {(meta?.suggestions || QUICK_PROMPTS).slice(0, 3).map((prompt) => (
              <button
                key={prompt}
                onClick={() => void enviarMensagem(prompt)}
                disabled={loading}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>

          {quickActions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {quickActions.map((action) => (
                <ActionLink
                  key={action.key}
                  label={action.label}
                  onClick={action.onClick}
                  tone={action.tone}
                />
              ))}
            </div>
          ) : null}

          <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'assistant'
                    ? 'max-w-[92%] rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3'
                    : 'ml-auto max-w-[88%] rounded-[24px] bg-slate-900 px-4 py-3 text-white'
                }
              >
                <div className="mb-2 flex items-center gap-2">
                  {message.role === 'assistant' ? (
                    <>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                        <MessageSquareText className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Assistente
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Você
                      </span>
                    </>
                  )}
                </div>
                <p
                  className={
                    message.role === 'assistant'
                      ? 'whitespace-pre-line text-sm leading-6 text-slate-700'
                      : 'whitespace-pre-line text-sm leading-6 text-white'
                  }
                >
                  {message.content}
                </p>
              </div>
            ))}
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
                Consultando o panorama operacional...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void enviarMensagem(input);
            }}
            className="mt-4 flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pergunte sobre operação, compliance, alertas, treinamento ou fichas"
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              maxLength={400}
            />
            <button
              type="submit"
              disabled={loading || input.trim().length < 2}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            >
              Enviar
              <SendHorizontal className="w-4 h-4" />
            </button>
          </form>

          {meta ? (
            <p className="mt-3 text-xs text-slate-400">
              Resposta gerada por {meta.provider} ({meta.model}).
            </p>
          ) : null}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          {meta?.consultaQualificacoes?.resultados?.length ? (
            <SideSection
              title={`Consulta de ${meta.consultaQualificacoes.alvoNome}`}
              subtitle="Últimos registros encontrados para a pergunta atual"
            >
              {meta.consultaQualificacoes.resultados.slice(0, 3).map((item, index) => (
                <div
                  key={`${item.funcionarioNome}-${item.qualificacaoCodigo || item.qualificacaoNome || index}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.funcionarioNome}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.qualificacaoNome || item.qualificacaoCodigo || 'Qualificação'}
                      </p>
                    </div>
                    {item.status ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {item.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">
                      Conclusão: {formatDate(item.dataConclusao)}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1">
                      Vencimento: {formatDate(item.dataVencimento)}
                    </span>
                    {item.diasParaVencer !== null ? (
                      <span className="rounded-full bg-white px-2.5 py-1">
                        {getDiasLabel(item.diasParaVencer) || 'Sem prazo'}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionLink
                      label="Abrir qualificações"
                      tone="blue"
                      onClick={() =>
                        navigate(`/qualificacoes?funcionario_id=${item.funcionarioId}`)
                      }
                    />
                  </div>
                </div>
              ))}
            </SideSection>
          ) : null}

          {meta?.alertas?.length ? (
            <SideSection title="Alertas críticos" subtitle="Quem exige ação mais rápida agora">
              {meta.alertas.map((alerta, index) => (
                <div
                  key={`${alerta.tripulanteNome || alerta.qualificacaoNome || alerta.mensagem}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border ${getCriticidadeClasses(alerta.criticidade)}`}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {alerta.tripulanteNome || 'Tripulante não identificado'}
                        </p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${getCriticidadeClasses(alerta.criticidade)}`}
                        >
                          {alerta.criticidade}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {alerta.qualificacaoNome || alerta.mensagem}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        {alerta.dataVencimento ? (
                          <span className="rounded-full bg-slate-50 px-2.5 py-1">
                            Vence em {formatDate(alerta.dataVencimento)}
                          </span>
                        ) : null}
                        {typeof alerta.diasRestantes === 'number' ? (
                          <span className="rounded-full bg-slate-50 px-2.5 py-1">
                            {getDiasLabel(alerta.diasRestantes)}
                          </span>
                        ) : null}
                      </div>
                      {alerta.urlAcao ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <ActionLink
                            label="Abrir qualificação"
                            tone="red"
                            onClick={() => navigate(alerta.urlAcao as string)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </SideSection>
          ) : null}

          {meta?.fichasPendentes?.length ? (
            <SideSection
              title="Fichas pendentes"
              subtitle="Pendências separadas por papel e com nomes visíveis"
            >
              {meta.fichasPendentes.map((ficha) => (
                <div
                  key={ficha.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {ficha.participante_nome}
                        </p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {ficha.papel}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Instrutor: {ficha.instrutor_nome}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-white px-2.5 py-1">
                          Sessão: {formatDate(ficha.data_sessao)}
                        </span>
                        {ficha.hora_inicio ? (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {ficha.hora_inicio}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionLink
                          label={ficha.papel === 'INSTRUTOR' ? 'Assinar ficha' : 'Abrir ficha'}
                          tone="amber"
                          onClick={() => navigate(ficha.link)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </SideSection>
          ) : null}

          {meta?.atividades?.length ? (
            <SideSection
              title="Atividade recente"
              subtitle="Eventos recentes organizados por pessoa e horário"
            >
              {meta.atividades.map((atividade, index) => (
                <div
                  key={`${atividade.tipo}-${atividade.timestamp}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                      {atividade.tipo === 'qualificacao_emitida' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {atividade.tripulanteNome || 'Registro operacional'}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{atividade.descricao}</p>
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDateTime(atividade.timestamp)}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionLink
                          label={
                            atividade.tipo === 'qualificacao_emitida'
                              ? 'Abrir qualificações'
                              : 'Abrir simuladores'
                          }
                          tone="slate"
                          onClick={() =>
                            navigate(
                              atividade.tipo === 'qualificacao_emitida'
                                ? '/qualificacoes'
                                : '/simuladores/fichas',
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </SideSection>
          ) : null}

          {meta?.fichasRecentes?.length ? (
            <SideSection
              title="Fichas concluídas"
              subtitle="Últimos registros concluídos do contexto atual"
            >
              {meta.fichasRecentes.map((ficha) => (
                <div
                  key={ficha.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-slate-900">{ficha.participante_nome}</p>
                  <p className="mt-1 text-sm text-slate-600">Instrutor: {ficha.instrutor_nome}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">
                      Sessão: {formatDate(ficha.data_sessao)}
                    </span>
                    {ficha.resultado_final ? (
                      <span className="rounded-full bg-white px-2.5 py-1">
                        {ficha.resultado_final}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionLink
                      label="Abrir ficha concluída"
                      tone="slate"
                      onClick={() => navigate(ficha.link)}
                    />
                  </div>
                </div>
              ))}
            </SideSection>
          ) : null}
        </div>
      </div>
    </section>
  );
}
