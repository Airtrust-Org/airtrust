import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  MessageSquareMore,
  RefreshCw,
} from 'lucide-react';

import AppLayout from '@/react-app/components/AppLayout';
import { api } from '@/react-app/utils/api-client';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

interface AlertaVencimentoItem {
  id: number;
  nome: string;
  tipoLabel: string;
  categoria: string;
  data_vencimento: string;
  dias_restantes: number;
}

interface NotificacaoConfig {
  id: number;
  tipo: string;
  ativo: number;
  dias_antes: number;
  urgencia: string | null;
  destinatarios: string | null;
  template: string;
  updated_at?: string;
}

interface NotificacaoLog {
  id: number;
  funcionario_id?: number | null;
  funcionario_nome: string | null;
  qualificacao_nome: string | null;
  tipo: string;
  destinatario: string | null;
  status: string;
  erro_mensagem: string | null;
  enviado_em: string | null;
  created_at: string;
}

interface WhatsAppTemplateRow {
  template_key: string;
  friendly_name: string;
  template_name: string;
  approval_status: string | null;
  approval_error: string | null;
  twilio_content_sid: string | null;
  last_synced_at: string | null;
}

interface WhatsAppOverview {
  stats: {
    total: number;
    approved: number;
    pending: number;
    needsAttention: number;
    lastSyncedAt: string | null;
  };
  templates: WhatsAppTemplateRow[];
  configs: NotificacaoConfig[];
  recentLogs: NotificacaoLog[];
}

interface ProcessamentoResumo {
  configsProcessadas: number;
  enviadas: number;
  erros: number;
  porTipo: Record<string, { enviadas: number; erros: number }>;
}

const successBadge = 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700';
const errorBadge = 'rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700';

const Alertas = () => {
  const [notificacoes, setNotificacoes] = useState<AlertaVencimentoItem[]>([]);
  const [configs, setConfigs] = useState<NotificacaoConfig[]>([]);
  const [logs, setLogs] = useState<NotificacaoLog[]>([]);
  const [whatsAppOverview, setWhatsAppOverview] = useState<WhatsAppOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [diasJanela, setDiasJanela] = useState(30);

  useEffect(() => {
    void carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);

      const [alertasRes, configsRes, logsRes, whatsappRes] = await Promise.allSettled([
        api.get<{
          dias: number;
          qualificacoes: Array<{
            id: number;
            nome: string;
            categoria: string;
            data_vencimento: string;
          }>;
          licencas: Array<{
            id: number;
            nome: string;
            tipo: string;
            numero: string;
            data_vencimento: string;
          }>;
        }>('/alertas/vencimentos'),
        api.get<NotificacaoConfig[]>('/notificacoes/config'),
        api.get<NotificacaoLog[]>('/notificacoes/log?limit=12'),
        api.get<WhatsAppOverview>('/notificacoes/whatsapp/overview'),
      ]);

      if (alertasRes.status === 'fulfilled' && alertasRes.value.success && alertasRes.value.data) {
        setDiasJanela(Number(alertasRes.value.data.dias || 30));

        const qualificacoes = (alertasRes.value.data.qualificacoes || []).map((item) => ({
          id: item.id,
          nome: item.nome,
          tipoLabel: 'Qualificação',
          categoria: item.categoria,
          data_vencimento: item.data_vencimento,
          dias_restantes: calcularDiasRestantes(item.data_vencimento),
        }));
        const licencas = (alertasRes.value.data.licencas || []).map((item) => ({
          id: item.id,
          nome: item.nome,
          tipoLabel: 'Licença',
          categoria: `${item.tipo} ${item.numero}`.trim(),
          data_vencimento: item.data_vencimento,
          dias_restantes: calcularDiasRestantes(item.data_vencimento),
        }));

        setNotificacoes(
          [...qualificacoes, ...licencas].sort((a, b) => a.dias_restantes - b.dias_restantes),
        );
      } else {
        setNotificacoes([]);
      }

      if (configsRes.status === 'fulfilled' && configsRes.value.success && configsRes.value.data) {
        setConfigs(configsRes.value.data);
      } else {
        setConfigs([]);
      }

      if (logsRes.status === 'fulfilled' && logsRes.value.success) {
        setLogs(logsRes.value.data || []);
      } else {
        setLogs([]);
      }

      if (
        whatsappRes.status === 'fulfilled' &&
        whatsappRes.value.success &&
        whatsappRes.value.data
      ) {
        setWhatsAppOverview(whatsappRes.value.data);
      } else {
        setWhatsAppOverview(null);
      }
    } catch (error) {
      console.error('Erro ao carregar alertas:', error);
      toast.error('Erro ao carregar visão de alertas');
    } finally {
      setLoading(false);
    }
  };

  const enviarAlertas = async () => {
    if (!(await confirmDialog('Processar agora as notificações automáticas de vencimento?')))
      return;

    try {
      setEnviando(true);
      const response = await api.post<ProcessamentoResumo>('/notificacoes/processar', {});

      if (!response.success || !response.data) {
        toast.error(response.error || 'Erro ao processar notificações');
        return;
      }

      toast.success(
        `Processamento concluído: ${response.data.enviadas} enviadas, ${response.data.erros} com erro.`,
      );
      await carregarDados();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar notificações');
    } finally {
      setEnviando(false);
    }
  };

  const qualificacoes7Dias = notificacoes.filter(
    (item) =>
      item.tipoLabel === 'Qualificação' && item.dias_restantes >= 0 && item.dias_restantes <= 7,
  ).length;
  const qualificacoes30Dias = notificacoes.filter(
    (item) =>
      item.tipoLabel === 'Qualificação' &&
      item.dias_restantes >= 0 &&
      item.dias_restantes <= diasJanela,
  ).length;
  const licencas30Dias = notificacoes.filter(
    (item) =>
      item.tipoLabel === 'Licença' && item.dias_restantes >= 0 && item.dias_restantes <= diasJanela,
  ).length;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Qualificações em 7 dias"
            value={qualificacoes7Dias}
            icon={<AlertTriangle className="w-5 h-5 text-orange-600" />}
            tone="orange"
          />
          <SummaryCard
            title={`Qualificações em ${diasJanela} dias`}
            value={qualificacoes30Dias}
            icon={<Clock className="w-5 h-5 text-blue-600" />}
            tone="blue"
          />
          <SummaryCard
            title={`Licenças em ${diasJanela} dias`}
            value={licencas30Dias}
            icon={<Bell className="w-5 h-5 text-emerald-600" />}
            tone="emerald"
          />
          <SummaryCard
            title="Templates WhatsApp aprovados"
            value={whatsAppOverview?.stats.approved || 0}
            subtitle={
              whatsAppOverview
                ? `${whatsAppOverview.stats.pending} pendentes • ${whatsAppOverview.stats.needsAttention} com atenção`
                : 'Canal não carregado'
            }
            icon={<CheckCircle2 className="w-5 h-5 text-sky-600" />}
            tone="sky"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Motor de alertas e notificações
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {notificacoes.length} itens monitorados para os próximos {diasJanela} dias. O cron
                agora suporta email, dashboard e WhatsApp com template aprovado.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => void carregarDados()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </button>
              <button
                onClick={() => void enviarAlertas()}
                disabled={enviando}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  enviando ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary/90'
                }`}
              >
                <Bell className="w-4 h-4" />
                {enviando ? 'Processando...' : 'Processar agora'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Próximos vencimentos</h3>
            </div>

            {notificacoes.length === 0 ? (
              <EmptyState
                text={`Nenhum vencimento encontrado para os próximos ${diasJanela} dias.`}
              />
            ) : (
              <div className="space-y-3">
                {notificacoes.slice(0, 12).map((item) => (
                  <div
                    key={`${item.tipoLabel}-${item.id}`}
                    className={`rounded-xl border p-4 ${getCorPrioridade(item.dias_restantes)}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{item.nome}</span>
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                            {item.tipoLabel}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          {item.categoria || 'Sem categoria'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatDias(item.dias_restantes)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDate(item.data_vencimento)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareMore className="w-4 h-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Canal WhatsApp</h3>
            </div>

            {!whatsAppOverview ? (
              <EmptyState text="Resumo de WhatsApp indisponível no momento." compact />
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-700">
                    Templates aprovados: <strong>{whatsAppOverview.stats.approved}</strong> de{' '}
                    <strong>{whatsAppOverview.stats.total}</strong>
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    Pendentes: {whatsAppOverview.stats.pending} • Atenção:{' '}
                    {whatsAppOverview.stats.needsAttention}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Última sincronização:{' '}
                    {whatsAppOverview.stats.lastSyncedAt
                      ? formatDateTime(whatsAppOverview.stats.lastSyncedAt)
                      : 'ainda não sincronizado'}
                  </p>
                </div>

                <div className="space-y-2">
                  {whatsAppOverview.templates.map((template) => (
                    <div
                      key={template.template_key}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {template.friendly_name}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">{template.template_name}</p>
                        </div>
                        <StatusBadge status={template.approval_status} />
                      </div>
                      {template.approval_error ? (
                        <p className="mt-2 text-xs text-red-600">{template.approval_error}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Configurações ativas</h3>
            </div>

            {configs.length === 0 ? (
              <EmptyState text="Nenhuma configuração cadastrada." compact />
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <div key={config.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {config.tipo} • {config.dias_antes} dias
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Urgência: {config.urgencia || 'todas'} •{' '}
                          {config.ativo ? 'ativa' : 'inativa'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          config.ativo
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {config.ativo ? 'ativo' : 'inativo'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{config.template}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Últimas execuções</h3>
            </div>

            {logs.length === 0 ? (
              <EmptyState text="Nenhum log disponível." compact />
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <FuncionarioLink
                          funcionarioId={log.funcionario_id ?? undefined}
                          nome={log.funcionario_nome || 'Sem funcionário'}
                          className="text-sm font-medium text-slate-900"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {log.tipo} • {log.qualificacao_nome || 'Sem qualificação'}
                        </p>
                      </div>
                      <span className={log.status === 'enviada' ? successBadge : errorBadge}>
                        {log.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {log.destinatario || 'Sem destinatário'} •{' '}
                      {formatDateTime(log.enviado_em || log.created_at)}
                    </p>
                    {log.erro_mensagem ? (
                      <p className="text-xs text-red-600 mt-2">{log.erro_mensagem}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {whatsAppOverview?.recentLogs?.length ? (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareMore className="w-4 h-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Últimos envios WhatsApp</h3>
            </div>

            <div className="space-y-3">
              {whatsAppOverview.recentLogs.map((log) => (
                <div key={`wa-${log.id}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <FuncionarioLink
                        funcionarioId={log.funcionario_id ?? undefined}
                        nome={log.funcionario_nome || 'Sem funcionário'}
                        className="text-sm font-medium text-slate-900"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {log.destinatario || 'Sem destino'}
                      </p>
                    </div>
                    <span className={log.status === 'enviada' ? successBadge : errorBadge}>
                      {log.status}
                    </span>
                  </div>
                  {log.erro_mensagem ? (
                    <p className="text-xs text-red-600 mt-2">{log.erro_mensagem}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          O cron de notificações já pode usar WhatsApp, mas o envio automático só acontece quando o
          template estiver aprovado no provedor. Enquanto o status estiver pendente, o canal fica
          visível aqui e os erros aparecem no log.
        </div>
      </div>
    </AppLayout>
  );
};

function SummaryCard({
  title,
  value,
  icon,
  subtitle,
  tone,
}: {
  title: string;
  value: number;
  icon: ReactNode;
  subtitle?: string;
  tone: 'orange' | 'blue' | 'emerald' | 'sky';
}) {
  const toneClass = {
    orange: 'bg-orange-50 border-orange-200',
    blue: 'bg-blue-50 border-blue-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    sky: 'bg-sky-50 border-sky-200',
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          {subtitle ? <p className="mt-2 text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="rounded-lg bg-white/80 p-2 border border-white">{icon}</div>
      </div>
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm text-center ${
        compact ? 'p-4' : 'p-8'
      }`}
    >
      {text}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = String(status || 'pendente').toLowerCase();
  const className =
    normalized === 'approved'
      ? successBadge
      : normalized === 'received' || normalized === 'submitted'
        ? 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700'
        : errorBadge;

  return <span className={className}>{status || 'pendente'}</span>;
}

function calcularDiasRestantes(dataVencimento: string): number {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const vencimento = new Date(`${dataVencimento}T00:00:00`);

  return Math.ceil((vencimento.getTime() - inicioHoje.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function formatDias(dias: number): string {
  if (dias < 0) return `${Math.abs(dias)} dia(s) vencido`;
  if (dias === 0) return 'vence hoje';
  return `${dias} dia(s)`;
}

function getCorPrioridade(dias: number): string {
  if (dias < 0) return 'border-red-200 bg-red-50';
  if (dias <= 7) return 'border-orange-200 bg-orange-50';
  if (dias <= 15) return 'border-amber-200 bg-amber-50';
  return 'border-slate-200 bg-white';
}

export default Alertas;
