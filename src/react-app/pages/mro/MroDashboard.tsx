import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  Package,
  Plane,
  Wrench,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatusBadge from './components/MroStatusBadge';
import {
  MOCK_AERONAVES,
  MOCK_ESTOQUE,
  MOCK_OS,
  MOCK_REGISTROS_TECNICOS,
  MOCK_VENCIMENTOS,
} from './data/mroMockData';
import { formatCiclos, formatFH } from './data/mroUtils';

const attentionBadgeClass = {
  critical:
    'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  warning:
    'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
} as const;

export default function MroDashboard() {
  const stats = useMemo(() => {
    const aeronavesIndisponiveis = MOCK_AERONAVES.filter(
      (a) => a.status === 'em-manutencao' || a.status === 'aog',
    ).length;
    const osAbertas = MOCK_OS.filter(
      (o) => o.status === 'aberta' || o.status === 'em-andamento',
    ).length;
    const osAguardandoMaterial = MOCK_OS.filter(
      (o) => o.status === 'aguardando-material',
    ).length;
    const vencimentosCriticos = MOCK_VENCIMENTOS.filter(
      (v) => v.criticidade === 'critica' || v.criticidade === 'alta',
    ).length;
    const estoqueCritico = MOCK_ESTOQUE.filter(
      (e) => e.status === 'critico' || e.status === 'baixo',
    ).length;
    const rtPendentes = MOCK_REGISTROS_TECNICOS.filter(
      (r) => r.status === 'pendente',
    ).length;

    return {
      aeronavesIndisponiveis,
      osAbertas,
      osAguardandoMaterial,
      vencimentosCriticos,
      estoqueCritico,
      rtPendentes,
    };
  }, []);

  const attentionItems = [
    {
      to: '/mro/vencimentos',
      label: 'Vencimentos críticos',
      detail: 'Itens de criticidade alta ou crítica que precisam de revisão.',
      count: stats.vencimentosCriticos,
      tone: 'critical' as const,
      icon: AlertTriangle,
    },
    {
      to: '/mro/estoque',
      label: 'Estoque crítico',
      detail: 'Peças abaixo do mínimo ou zeradas que podem afetar a execução.',
      count: stats.estoqueCritico,
      tone: 'warning' as const,
      icon: Package,
    },
    {
      to: '/mro/os',
      label: 'OS aguardando material',
      detail: 'Ordens de serviço paradas por dependência de material.',
      count: stats.osAguardandoMaterial,
      tone: 'warning' as const,
      icon: Wrench,
    },
    {
      to: '/mro/registros-tecnicos',
      label: 'Registros técnicos pendentes',
      detail: 'Registros que ainda aguardam validação ou aprovação.',
      count: stats.rtPendentes,
      tone: 'info' as const,
      icon: FileText,
    },
  ];

  return (
    <AppLayout>
      <div className="w-full">
        <MroPageShell>
          <MroPageHeader
            title="Manutenção"
            description="Pendências que exigem ação e situação operacional da frota."
          />

          <section className="mb-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Central de atenção
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Comece pelo que pode afetar disponibilidade, prazo ou encerramento técnico.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                  {stats.aeronavesIndisponiveis} aeronave(s) indisponível(is)
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                  {stats.osAbertas} OS aberta(s)
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {attentionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
                  >
                    <span
                      className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold ${attentionBadgeClass[item.tone]}`}
                      aria-label={`${item.count} ${item.label.toLowerCase()}`}
                    >
                      {item.count}
                    </span>
                    <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.detail}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Situação da frota
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Disponibilidade e utilização em uma leitura única.
                </p>
              </div>
              <Link
                to="/mro/aeronaves"
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver frota completa
              </Link>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Aeronave
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Situação
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Utilização
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Base
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {MOCK_AERONAVES.map((aeronave) => (
                    <tr
                      key={aeronave.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/mro/aeronaves/${aeronave.id}`}
                          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {aeronave.matricula}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {aeronave.modelo}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <MroStatusBadge status={aeronave.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        <span className="font-mono">{formatFH(aeronave.totalHoras)} FH</span>
                        <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
                        <span className="font-mono">{formatCiclos(aeronave.totalCiclos)} ciclos</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {aeronave.base}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Ordens de serviço recentes
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Acompanhe rapidamente o trabalho em andamento e os últimos registros.
                </p>
              </div>
              <Link
                to="/mro/os"
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver todas as OS
              </Link>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Ordem de serviço
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Aeronave
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Situação
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                      Emissão
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {MOCK_OS.slice(0, 6).map((ordem) => {
                    const aeronave = MOCK_AERONAVES.find(
                      (item) => item.id === ordem.aeronaveId,
                    );
                    return (
                      <tr
                        key={ordem.id}
                        className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/mro/os/${ordem.id}`}
                            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {ordem.numero}
                          </Link>
                          <p
                            className="mt-0.5 max-w-[360px] truncate text-xs text-slate-500 dark:text-slate-400"
                            title={ordem.titulo}
                          >
                            {ordem.titulo}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {aeronave?.matricula || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <MroStatusBadge status={ordem.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {ordem.dataEmissao}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </MroPageShell>
      </div>
    </AppLayout>
  );
}
