import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, AlertTriangle, Clock, Package, CheckCircle, TrendingUp, FileText, Plane } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatCards from './components/MroStatCards';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_AERONAVES, MOCK_OS, MOCK_VENCIMENTOS, MOCK_ESTOQUE, MOCK_REGISTROS_TECNICOS } from './data/mroMockData';
import { formatFH, formatCiclos } from './data/mroUtils';

export default function MroDashboard() {
  const stats = useMemo(() => {
    const aeronavesOperando = MOCK_AERONAVES.filter((a) => a.status === 'operando').length;
    const aeronavesManutencao = MOCK_AERONAVES.filter((a) => a.status === 'em-manutencao' || a.status === 'aog').length;
    const osAbertas = MOCK_OS.filter((o) => o.status === 'aberta' || o.status === 'em-andamento').length;
    const osAguardandoMaterial = MOCK_OS.filter((o) => o.status === 'aguardando-material').length;
    const vencimentosProximos30d = MOCK_VENCIMENTOS.filter((v) => v.saldo <= 30 && v.criticidade !== 'baixa').length;
    const vencimentosCriticos = MOCK_VENCIMENTOS.filter((v) => v.criticidade === 'critica' || v.criticidade === 'alta').length;
    const estoqueCritico = MOCK_ESTOQUE.filter((e) => e.status === 'critico' || e.status === 'baixo').length;
    const rtPendentes = MOCK_REGISTROS_TECNICOS.filter((r) => r.status === 'pendente').length;
    return { aeronavesOperando, aeronavesManutencao, osAbertas, osAguardandoMaterial, vencimentosProximos30d, vencimentosCriticos, estoqueCritico, rtPendentes };
  }, []);

  const cardData = [
    { label: 'Aeronaves em Operação', value: `${stats.aeronavesOperando}/${MOCK_AERONAVES.length}`, icon: <Plane className="h-5 w-5" />, variant: 'success' as const, subtitle: `${stats.aeronavesManutencao} em manutenção` },
    { label: 'OS Abertas', value: stats.osAbertas, icon: <Wrench className="h-5 w-5" />, variant: 'default' as const, subtitle: `${stats.osAguardandoMaterial} aguard. material` },
    { label: 'Vencimentos Críticos', value: stats.vencimentosCriticos, icon: <AlertTriangle className="h-5 w-5" />, variant: 'danger' as const, subtitle: `${stats.vencimentosProximos30d} nos próximos 30 dias` },
    { label: 'Estoque Crítico', value: stats.estoqueCritico, icon: <Package className="h-5 w-5" />, variant: 'warning' as const, subtitle: `${MOCK_ESTOQUE.filter((e) => e.status === 'critico').length} itens zerados` },
    { label: 'Registros Técnicos Pendentes', value: stats.rtPendentes, icon: <FileText className="h-5 w-5" />, variant: 'info' as const, subtitle: `${MOCK_REGISTROS_TECNICOS.filter((r) => r.status === 'aprovado').length} aprovados` },
    { label: 'OS Concluídas', value: MOCK_OS.filter((o) => o.status === 'concluida').length, icon: <CheckCircle className="h-5 w-5" />, variant: 'success' as const, subtitle: 'Total de OS finalizadas' },
    { label: 'Frota Monitorada', value: MOCK_AERONAVES.length, icon: <TrendingUp className="h-5 w-5" />, variant: 'info' as const, subtitle: 'ATR 72, E195-E2, C208B' },
  ];

  return (
    <AppLayout>
      <div className="w-full">
        <MroPageShell>
        <MroPageHeader title="Dashboard — MRO" description="Visão geral da manutenção de aeronaves" />
        <MroStatCards cards={cardData} className="mb-8" />
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/mro/aeronaves', icon: <Plane className="h-5 w-5 text-blue-500" />, label: 'Aeronaves' },
            { to: '/mro/componentes', icon: <Package className="h-5 w-5 text-purple-500" />, label: 'Componentes' },
            { to: '/mro/os', icon: <Wrench className="h-5 w-5 text-amber-500" />, label: 'Ordens de Serviço' },
            { to: '/mro/vencimentos', icon: <Clock className="h-5 w-5 text-red-500" />, label: 'Vencimentos' },
          ].map((link) => (
            <Link key={link.to} to={link.to} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-600">
              {link.icon}
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{link.label}</span>
            </Link>
          ))}
        </div>

        {/* Ações recomendadas */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Ações recomendadas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/mro/vencimentos" className="group flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 transition-all hover:border-red-300 hover:shadow-sm dark:border-red-800 dark:bg-red-950/20 dark:hover:border-red-700">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-200 text-xs font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300">{stats.vencimentosCriticos}</span>
              <div><p className="text-sm font-medium text-red-800 dark:text-red-200">Revisar vencimentos críticos</p><p className="text-xs text-red-500 dark:text-red-400">Tarefas com criticidade alta ou crítica próximas do vencimento</p></div>
            </Link>
            <Link to="/mro/estoque" className="group flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 transition-all hover:border-orange-300 hover:shadow-sm dark:border-orange-800 dark:bg-orange-950/20 dark:hover:border-orange-700">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-200 text-xs font-bold text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">{stats.estoqueCritico}</span>
              <div><p className="text-sm font-medium text-orange-800 dark:text-orange-200">Verificar estoque crítico</p><p className="text-xs text-orange-500 dark:text-orange-400">Itens abaixo do estoque mínimo ou zerados</p></div>
            </Link>
            <Link to="/mro/os" className="group flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition-all hover:border-amber-300 hover:shadow-sm dark:border-amber-800 dark:bg-amber-950/20 dark:hover:border-amber-700">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{stats.osAguardandoMaterial}</span>
              <div><p className="text-sm font-medium text-amber-800 dark:text-amber-200">OS aguardando material</p><p className="text-xs text-amber-500 dark:text-amber-400">Ordens de serviço paradas por falta de peças</p></div>
            </Link>
            <Link to="/mro/registros-tecnicos" className="group flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4 transition-all hover:border-purple-300 hover:shadow-sm dark:border-purple-800 dark:bg-purple-950/20 dark:hover:border-purple-700">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-200 text-xs font-bold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">{stats.rtPendentes}</span>
              <div><p className="text-sm font-medium text-purple-800 dark:text-purple-200">Validar registros técnicos</p><p className="text-xs text-purple-500 dark:text-purple-400">Registros pendentes de aprovação</p></div>
            </Link>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Frota</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Matrícula</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Modelo</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Total Horas</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Total Ciclos</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {MOCK_AERONAVES.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3"><Link to={`/mro/aeronaves/${a.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400" title={`${a.matricula} — ${a.modelo}`}>{a.matricula}</Link></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{a.modelo}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{formatFH(a.totalHoras)} FH</td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{formatCiclos(a.totalCiclos)}</td>
                    <td className="px-4 py-3"><MroStatusBadge status={a.status} /></td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.base}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Últimas Ordens de Serviço</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nº</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Título</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Emissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {MOCK_OS.slice(0, 6).map((os) => {
                  const aeronave = MOCK_AERONAVES.find((a) => a.id === os.aeronaveId);
                  return (
                    <tr key={os.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3"><Link to={`/mro/os/${os.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400" title={os.titulo}>{os.numero}</Link></td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-slate-700 dark:text-slate-300" title={os.titulo}>{os.titulo}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{aeronave?.matricula || '—'}</td>
                      <td className="px-4 py-3"><MroStatusBadge status={os.tipo} /></td>
                      <td className="px-4 py-3"><MroStatusBadge status={os.status} /></td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{os.dataEmissao}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <Link to="/mro/os" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Ver todas as OS →</Link>
            </div>
          </div>
        </section>
      </MroPageShell>
      </div>
    </AppLayout>
  );
}
