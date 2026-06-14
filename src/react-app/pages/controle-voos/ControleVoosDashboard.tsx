import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plane, Clock, FileText, AlertTriangle, Users, TrendingUp, Wrench } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatCards from './components/ControleVoosStatCards';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import {
  MOCK_VOOS,
  MOCK_RDVS,
  MOCK_AERONAVES,
  MOCK_TRIPULANTES,
  MOCK_INDISPONIBILIDADES,
  MOCK_ALERTAS,
  MOCK_HANGARAGENS,
  type AlertaOperacional,
} from './data/controleVoosMockData';
import { formatTime } from './data/controleVoosUtils';

export default function ControleVoosDashboard() {
  const stats = useMemo(() => {
    const hoje = '2026-06-13';
    const voosHoje = MOCK_VOOS.filter((v) => v.dataProgramacao === hoje);
    const programados = voosHoje.filter((v) => v.status === 'planejado' || v.status === 'liberado').length;
    const emExecucao = voosHoje.filter((v) => v.status === 'em_voo').length;
    const rdvsPendentes = MOCK_RDVS.filter((r) => r.status === 'rascunho').length;
    const aeronavesIndisponiveis = MOCK_AERONAVES.filter((a) => a.status === 'indisponivel' || a.status === 'hangarada').length;
    const tripulantesEmAtencao = MOCK_TRIPULANTES.filter((t) => t.frmsStatus === 'atencao' || t.frmsStatus === 'bloqueado').length;
    const alertasCriticos = MOCK_ALERTAS.filter((a) => a.gravidade === 'critico').length;
    const voosConcluidos = voosHoje.filter((v) => v.status === 'concluido').length;
    return { programados, emExecucao, rdvsPendentes, aeronavesIndisponiveis, tripulantesEmAtencao, alertasCriticos, voosConcluidos, totalVoosHoje: voosHoje.length };
  }, []);

  const cardData = [
    { label: 'Voos Programados', value: stats.programados, icon: <Plane className="h-5 w-5" />, variant: 'default' as const, subtitle: `${stats.totalVoosHoje} voos hoje` },
    { label: 'Em Execução', value: stats.emExecucao, icon: <TrendingUp className="h-5 w-5" />, variant: 'info' as const, subtitle: `${stats.voosConcluidos} concluídos` },
    { label: 'RDVs Pendentes', value: stats.rdvsPendentes, icon: <FileText className="h-5 w-5" />, variant: 'warning' as const, subtitle: `${MOCK_RDVS.filter((r) => r.status === 'finalizado').length} finalizados` },
    { label: 'Aeronaves Indisponíveis', value: stats.aeronavesIndisponiveis, icon: <Wrench className="h-5 w-5" />, variant: 'danger' as const, subtitle: `${MOCK_AERONAVES.filter((a) => a.status === 'disponivel').length} disponíveis` },
    { label: 'Trip. em Atenção/Bloqueio', value: stats.tripulantesEmAtencao, icon: <Users className="h-5 w-5" />, variant: 'warning' as const, subtitle: 'FRMS/Qualificações' },
    { label: 'Alertas Críticos', value: stats.alertasCriticos, icon: <AlertTriangle className="h-5 w-5" />, variant: 'danger' as const, subtitle: `${MOCK_ALERTAS.length} alertas no total` },
  ];

  const alertaIcon = (gravidade: AlertaOperacional['gravidade']) => {
    if (gravidade === 'critico') return <span className="flex h-2 w-2 shrink-0 rounded-full bg-red-500 mt-1.5" />;
    if (gravidade === 'alerta') return <span className="flex h-2 w-2 shrink-0 rounded-full bg-amber-500 mt-1.5" />;
    return <span className="flex h-2 w-2 shrink-0 rounded-full bg-blue-500 mt-1.5" />;
  };

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="Painel Operacional — Controle de Voos" description="Visão do dia operacional — 13 de junho de 2026" />
          <ControleVoosStatCards cards={cardData} className="mb-8" />

          {/* Links rápidos */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: '/controle-voos/voos', icon: <Plane className="h-5 w-5 text-blue-500" />, label: 'Voos / Programação' },
              { to: '/controle-voos/rdv', icon: <FileText className="h-5 w-5 text-purple-500" />, label: 'RDVs' },
              { to: '/controle-voos/jornadas', icon: <Clock className="h-5 w-5 text-teal-500" />, label: 'Jornadas' },
              { to: '/controle-voos/indisponibilidades', icon: <AlertTriangle className="h-5 w-5 text-amber-500" />, label: 'Indisponibilidades' },
            ].map((link) => (
              <Link key={link.to} to={link.to} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-600">
                {link.icon}
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{link.label}</span>
              </Link>
            ))}
          </div>

          {/* Alertas */}
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Alertas operacionais</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {MOCK_ALERTAS.map((alerta) => {
                const bgColor = alerta.gravidade === 'critico' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20' : alerta.gravidade === 'alerta' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20';
                const textColor = alerta.gravidade === 'critico' ? 'text-red-800 dark:text-red-200' : alerta.gravidade === 'alerta' ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200';
                const subColor = alerta.gravidade === 'critico' ? 'text-red-500 dark:text-red-400' : alerta.gravidade === 'alerta' ? 'text-amber-500 dark:text-amber-400' : 'text-blue-500 dark:text-blue-400';
                return (
                  <div key={alerta.id} className={`flex items-start gap-3 rounded-xl border p-4 ${bgColor}`}>
                    {alertaIcon(alerta.gravidade)}
                    <div>
                      <p className={`text-sm font-medium ${textColor}`}>{alerta.mensagem}</p>
                      <p className={`text-xs ${subColor}`}>{alerta.gravidade === 'critico' ? 'Crítico' : alerta.gravidade === 'alerta' ? 'Atenção' : 'Informativo'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Timeline do dia por aeronave */}
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Timeline do dia — por aeronave</h2>
            <div className="space-y-3">
              {MOCK_AERONAVES.map((aero) => {
                const voosAeronave = MOCK_VOOS.filter((v) => v.aeronaveId === aero.id && v.dataProgramacao === '2026-06-13');
                if (voosAeronave.length === 0 && aero.status === 'disponivel') return null;
                return (
                  <div key={aero.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{aero.matricula}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{aero.modelo}</span>
                      <ControleVoosStatusBadge status={aero.status} />
                    </div>
                    {voosAeronave.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {voosAeronave.map((voo) => (
                          <Link key={voo.id} to={`/controle-voos/voos/${voo.id}`} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs transition-colors hover:border-blue-200 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/30">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{voo.prefixo}</span>
                            <span className="text-slate-400">|</span>
                            <span className="text-slate-500 dark:text-slate-400">{formatTime(voo.horarioPrevisto)}</span>
                            <ControleVoosStatusBadge status={voo.status} />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Sem voos programados hoje</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Ações recomendadas */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Ações recomendadas</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/controle-voos/rdv" className="group flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition-all hover:border-amber-300 hover:shadow-sm dark:border-amber-800 dark:bg-amber-950/20 dark:hover:border-amber-700">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{stats.rdvsPendentes}</span>
                <div><p className="text-sm font-medium text-amber-800 dark:text-amber-200">Revisar RDVs pendentes</p><p className="text-xs text-amber-500 dark:text-amber-400">RDVs em rascunho aguardando finalização</p></div>
              </Link>
              <Link to="/controle-voos/indisponibilidades" className="group flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 transition-all hover:border-red-300 hover:shadow-sm dark:border-red-800 dark:bg-red-950/20 dark:hover:border-red-700">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-200 text-xs font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300">{stats.aeronavesIndisponiveis}</span>
                <div><p className="text-sm font-medium text-red-800 dark:text-red-200">Verificar aeronaves indisponíveis</p><p className="text-xs text-red-500 dark:text-red-400">{MOCK_INDISPONIBILIDADES.filter((i) => i.status === 'ativa').length} indisponibilidades ativas, {MOCK_HANGARAGENS.filter((h) => h.status === 'hangarada').length} hangaradas</p></div>
              </Link>
              <Link to="/controle-voos/voos" className="group flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 transition-all hover:border-blue-300 hover:shadow-sm dark:border-blue-800 dark:bg-blue-950/20 dark:hover:border-blue-700">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">{MOCK_VOOS.filter((v) => v.status === 'planejado').length}</span>
                <div><p className="text-sm font-medium text-blue-800 dark:text-blue-200">Programar voos para amanhã</p><p className="text-xs text-blue-500 dark:text-blue-400">Voos planejados para os próximos dias</p></div>
              </Link>
              <Link to="/controle-voos/jornadas" className="group flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4 transition-all hover:border-purple-300 hover:shadow-sm dark:border-purple-800 dark:bg-purple-950/20 dark:hover:border-purple-700">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-200 text-xs font-bold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">{stats.tripulantesEmAtencao}</span>
                <div><p className="text-sm font-medium text-purple-800 dark:text-purple-200">Revisar tripulantes em atenção</p><p className="text-xs text-purple-500 dark:text-purple-400">FRMS ou CMA próximos do vencimento</p></div>
              </Link>
            </div>
          </section>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
