import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, Clock, RefreshCw, Settings2 } from 'lucide-react';

import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { api } from '@/react-app/utils/api-client';
import AlertasLegacy from './AlertasLegacy';

type AlertaVencimentoItem = {
  id: number;
  nome: string;
  tipoLabel: 'Qualificação' | 'Licença';
  categoria: string;
  data_vencimento: string;
  dias_restantes: number;
};

type AlertasVencimentosResponse = {
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
};

function calcularDiasRestantes(dataVencimento: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const vencimento = new Date(`${dataVencimento.slice(0, 10)}T00:00:00`);
  return Math.ceil((vencimento.getTime() - hoje.getTime()) / 86400000);
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function formatPrazo(dias: number) {
  if (dias < 0) return `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'} vencido`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  return `Vence em ${dias} dias`;
}

function urgencyClass(dias: number) {
  if (dias < 0) return 'border-[color-mix(in_srgb,var(--at-critical)_40%,var(--at-border))] bg-[var(--at-critical-soft)]';
  if (dias <= 7) return 'border-[color-mix(in_srgb,var(--at-warning)_40%,var(--at-border))] bg-[var(--at-warning-soft)]';
  return 'border-[var(--at-border)] bg-[var(--at-bg-surface)]';
}

export default function Alertas() {
  const showNotificationAdmin =
    new URLSearchParams(window.location.search).get('view') === 'notificacoes';

  if (showNotificationAdmin) return <AlertasLegacy />;

  return <AlertasOperacionais />;
}

function AlertasOperacionais() {
  const [items, setItems] = useState<AlertaVencimentoItem[]>([]);
  const [diasJanela, setDiasJanela] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const carregarVencimentos = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get<AlertasVencimentosResponse>('/alertas/vencimentos');
      if (!response.success || !response.data) throw new Error('ALERTAS_VENCIMENTOS_UNAVAILABLE');

      const data = response.data;
      const janela = Number(data.dias || 30);
      setDiasJanela(janela);

      const qualificacoes: AlertaVencimentoItem[] = (data.qualificacoes || []).map((item) => ({
        id: item.id,
        nome: item.nome,
        tipoLabel: 'Qualificação',
        categoria: item.categoria,
        data_vencimento: item.data_vencimento,
        dias_restantes: calcularDiasRestantes(item.data_vencimento),
      }));
      const licencas: AlertaVencimentoItem[] = (data.licencas || []).map((item) => ({
        id: item.id,
        nome: item.nome,
        tipoLabel: 'Licença',
        categoria: `${item.tipo} ${item.numero}`.trim(),
        data_vencimento: item.data_vencimento,
        dias_restantes: calcularDiasRestantes(item.data_vencimento),
      }));

      setItems([...qualificacoes, ...licencas].sort((a, b) => a.dias_restantes - b.dias_restantes));
    } catch {
      setItems([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregarVencimentos();
  }, [carregarVencimentos]);

  const resumo = useMemo(() => {
    const qualificacoes7Dias = items.filter(
      (item) =>
        item.tipoLabel === 'Qualificação' && item.dias_restantes >= 0 && item.dias_restantes <= 7,
    ).length;
    const qualificacoesJanela = items.filter(
      (item) =>
        item.tipoLabel === 'Qualificação' &&
        item.dias_restantes >= 0 &&
        item.dias_restantes <= diasJanela,
    ).length;
    const licencasJanela = items.filter(
      (item) =>
        item.tipoLabel === 'Licença' &&
        item.dias_restantes >= 0 &&
        item.dias_restantes <= diasJanela,
    ).length;
    return { qualificacoes7Dias, qualificacoesJanela, licencasJanela };
  }, [diasJanela, items]);

  return (
    <AppLayout>
      <PageHeader
        title="Vencimentos e alertas"
        subtitle="Prioridades de qualificação e licença que exigem acompanhamento"
        className="mb-5"
        actions={
          <a
            href="/qualificacoes/alertas?view=notificacoes"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--at-border)] bg-[var(--at-bg-surface)] px-3 py-2 text-sm font-medium text-[var(--at-text-secondary)] transition hover:bg-[var(--at-bg-hover)]"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Configurar notificações
          </a>
        }
      />

      {loading ? (
        <div aria-label="Carregando vencimentos" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-xl border border-[var(--at-border)] bg-[var(--at-bg-surface)]"
              />
            ))}
          </div>
          <div className="h-52 animate-pulse rounded-xl border border-[var(--at-border)] bg-[var(--at-bg-surface)]" />
        </div>
      ) : error ? (
        <section
          role="alert"
          className="rounded-xl border border-[color-mix(in_srgb,var(--at-critical)_35%,var(--at-border))] bg-[var(--at-critical-soft)] p-5"
        >
          <h2 className="font-semibold text-[var(--at-text-primary)]">Não foi possível carregar os vencimentos</h2>
          <p className="mt-1 text-sm text-[var(--at-text-secondary)]">
            Os números não serão exibidos como zero enquanto a consulta estiver indisponível.
          </p>
          <button
            type="button"
            onClick={() => void carregarVencimentos()}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </section>
      ) : (
        <div className="space-y-5">
          <section aria-label="Resumo de vencimentos" className="grid gap-3 md:grid-cols-3">
            <Metric
              icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
              label="Qualificações em até 7 dias"
              value={resumo.qualificacoes7Dias}
              tone="warning"
            />
            <Metric
              icon={<Clock className="h-5 w-5" aria-hidden="true" />}
              label={`Qualificações em até ${diasJanela} dias`}
              value={resumo.qualificacoesJanela}
            />
            <Metric
              icon={<Bell className="h-5 w-5" aria-hidden="true" />}
              label={`Licenças em até ${diasJanela} dias`}
              value={resumo.licencasJanela}
            />
          </section>

          <section className="rounded-xl border border-[var(--at-border)] bg-[var(--at-bg-surface)] p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[var(--at-text-primary)]">Próximos vencimentos</h2>
                <p className="mt-1 text-sm text-[var(--at-text-secondary)]">
                  {items.length} item{items.length === 1 ? '' : 's'} na janela operacional.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void carregarVencimentos()}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--at-border)] px-3 py-2 text-sm font-medium text-[var(--at-text-secondary)] hover:bg-[var(--at-bg-hover)]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Atualizar
              </button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--at-border)] p-8 text-center">
                <p className="font-medium text-[var(--at-text-primary)]">Nenhum vencimento na janela</p>
                <p className="mt-1 text-sm text-[var(--at-text-secondary)]">
                  Não há qualificação ou licença exigindo acompanhamento nos próximos {diasJanela} dias.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.slice(0, 20).map((item) => (
                  <article
                    key={`${item.tipoLabel}-${item.id}`}
                    className={`rounded-lg border p-3 ${urgencyClass(item.dias_restantes)}`}
                  >
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm text-[var(--at-text-primary)]">{item.nome}</strong>
                          <span className="rounded-full border border-[var(--at-border)] px-2 py-0.5 text-xs text-[var(--at-text-secondary)]">
                            {item.tipoLabel}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-[var(--at-text-secondary)]">
                          {item.categoria || 'Sem categoria'}
                        </p>
                      </div>
                      <div className="shrink-0 sm:text-right">
                        <p className="text-sm font-semibold text-[var(--at-text-primary)]">
                          {formatPrazo(item.dias_restantes)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--at-text-subtle)]">
                          {formatDate(item.data_vencimento)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppLayout>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === 'warning'
          ? 'border-[color-mix(in_srgb,var(--at-warning)_35%,var(--at-border))] bg-[var(--at-warning-soft)]'
          : 'border-[var(--at-border)] bg-[var(--at-bg-surface)]'
      }`}
    >
      <div className="flex items-center gap-2 text-[var(--at-text-secondary)]">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-[var(--at-text-primary)]">{value}</p>
    </div>
  );
}
