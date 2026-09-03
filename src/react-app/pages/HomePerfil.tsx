/**
 * HomePerfil — tela inicial para perfis com acesso restrito (ALUNO, INSTRUTOR)
 * Exibe cards de acesso direto às seções disponíveis para o perfil.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellRing,
  CalendarDays,
  ClipboardList,
  PenLine,
  ChevronRight,
  CalendarClock,
  CheckCircle2,
  LockKeyhole,
  HeartPulse,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import AppLayout from '../components/AppLayout';
import api from '../services/api';
import { CardMeusEAD } from '../components/dashboard/CardMeusEAD';
import type { HomeProfile, HomeProfileFuncionarioContext } from '../lib/home-profile';
import { buildPasta360Url } from '../utils/pasta360';

interface NotificacaoRecente {
  id: number;
  tipo?: string;
  titulo: string;
  mensagem: string;
  link?: string;
  acao_primaria?: string;
  prioridade: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAIXA';
  created_at: string;
}

interface AccessCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  route: string;
  color: string; // tailwind bg class for icon bg
  iconColor: string;
}

interface HomePerfilProps {
  homeProfile?: HomeProfile;
  funcionarioContext?: HomeProfileFuncionarioContext | null;
}

function getHomeProfileSubtitle(homeProfile: HomeProfile | undefined): string {
  switch (homeProfile) {
    case 'STUDENT_MANUTENCAO':
      return 'Acesse rapidamente sua rotina operacional de manutenção.';
    case 'STUDENT_TRIPULACAO':
      return 'Acompanhe sua jornada operacional e os itens do dia.';
    case 'STUDENT_ADMINISTRATIVO':
      return 'Centralize suas tarefas administrativas e treinamentos.';
    default:
      return 'O que você quer fazer hoje?';
  }
}

export function buildHomeAccessCards(params: {
  role: string;
  can: (permission: string) => boolean;
  homeProfile?: HomeProfile;
  funcionarioId?: number | null;
}): AccessCard[] {
  const { role, can, homeProfile, funcionarioId } = params;
  const cards: AccessCard[] = [];
  const isMaintenanceHome = homeProfile === 'STUDENT_MANUTENCAO';
  const isFlightCrewHome = homeProfile === 'STUDENT_TRIPULACAO';
  const isRestrictedOperationalRole = ['ALUNO', 'INSTRUTOR', 'USUARIO'].includes(role);
  const isLearnerRole = role === 'ALUNO' || role === 'USUARIO';
  const isInstructorRole = role === 'INSTRUTOR';

  // Manutenção tem uma home deliberadamente enxuta: fadiga, Pasta 360 e senha.
  // Não reaproveitar permissões amplas de simulador/fichas para montar a experiência.
  if (isMaintenanceHome) {
    if (isRestrictedOperationalRole) {
      cards.push({
        icon: <HeartPulse className="w-7 h-7" />,
        title: 'Fadiga Diária',
        description: 'Registre rapidamente seu estado antes da jornada.',
        route: '/frms/checkin',
        color: 'bg-amber-50',
        iconColor: 'text-amber-600',
      });
    }

    if (funcionarioId) {
      cards.push({
        icon: <ClipboardList className="w-7 h-7" />,
        title: 'Minha Pasta 360',
        description: 'Consulte documentos, registros e histórico do seu cadastro.',
        route:
          buildPasta360Url(funcionarioId, {
            tab: 'pasta',
            origem: 'home-perfil-manutencao',
          }) || '/funcionarios',
        color: 'bg-slate-100',
        iconColor: 'text-slate-700',
      });
    }

    if (isRestrictedOperationalRole) {
      cards.push({
        icon: <LockKeyhole className="w-7 h-7" />,
        title: 'Trocar Senha',
        description: 'Atualize sua senha de acesso com segurança.',
        route: '/perfil/trocar-senha',
        color: 'bg-slate-100',
        iconColor: 'text-slate-700',
      });
    }

    return cards;
  }

  // Fadiga Diária — perfis operacionais com rotina de jornada.
  if (isRestrictedOperationalRole) {
    cards.push({
      icon: <HeartPulse className="w-7 h-7" />,
      title: 'Fadiga Diária',
      description: 'Registre rapidamente seu estado antes da jornada.',
      route: '/frms/checkin',
      color: 'bg-amber-50',
      iconColor: 'text-amber-600',
    });
  }

  // Minha Escala
  if (can('self.escala')) {
    cards.push({
      icon: <CalendarDays className="w-7 h-7" />,
      title: 'Minha Escala',
      description: 'Visualize sua escala de voos publicada e próximas jornadas.',
      route: '/escalas/minha-escala',
      color: 'bg-sky-50',
      iconColor: 'text-sky-600',
    });
  }

  // Minhas sessões de simulador (ALUNO vê onde é participante, INSTRUTOR onde é instrutor)
  if (can('simuladores.view')) {
    cards.push({
      icon: <CalendarClock className="w-7 h-7" />,
      title: 'Minhas Sessões de Simulador',
      description:
        role === 'INSTRUTOR'
          ? 'Visualize as sessões de simulador onde você é o instrutor.'
          : isFlightCrewHome
            ? 'Visualize as sessões de simulador vinculadas à sua rotina operacional.'
            : 'Visualize as sessões de simulador das quais você participa.',
      route: '/simuladores',
      color: 'bg-violet-50',
      iconColor: 'text-violet-600',
    });
  }

  // Guias do Instrutor — biblioteca de material de preparação de sessão.
  // Gate visual apenas; a autorização real é validada no backend por
  // simuladores.guias_instrutor.read (vínculo ativo instrutor↔empresa).
  if (isInstructorRole) {
    cards.push({
      icon: <BookOpen className="w-7 h-7" />,
      title: 'Guias do Instrutor',
      description: 'Consulte os materiais das sessões iniciais, periódicas e semestrais.',
      route: '/instrutor/guias',
      color: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
    });
  }

  // Fichas próprias são uma responsabilidade do perfil ALUNO. Mesmo que
  // a mesma pessoa também seja instrutor, elas só aparecem quando o perfil
  // ativo é ALUNO (USUARIO permanece como compatibilidade do perfil legado).
  if (isLearnerRole && can('self.ficha')) {
    cards.push({
      icon: <ClipboardList className="w-7 h-7" />,
      title: 'Minhas Fichas de Treinamento de Voo',
      description: 'Consulte e assine suas próprias fichas como participante.',
      route: '/simuladores/fichas/minhas',
      color: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    });
  }

  // Avaliar / assinar fichas é responsabilidade do perfil INSTRUTOR. A
  // capability continua sendo exigida, mas não mistura a experiência do
  // aluno mesmo quando a mesma conta possui os dois papéis.
  if (isInstructorRole && can('simuladores.evaluate')) {
    cards.push({
      icon: <PenLine className="w-7 h-7" />,
      title: 'Fichas de Treinamento de Voo para Avaliar',
      description: 'Avalie e assine as fichas dos participantes sob sua instrução.',
      route: '/simuladores/fichas/para-avaliar',
      color: 'bg-amber-50',
      iconColor: 'text-amber-600',
    });
  }

  if (isRestrictedOperationalRole) {
    cards.push({
      icon: <LockKeyhole className="w-7 h-7" />,
      title: 'Trocar Senha',
      description: 'Atualize sua senha de acesso com segurança.',
      route: '/perfil/trocar-senha',
      color: 'bg-slate-100',
      iconColor: 'text-slate-700',
    });
  }

  return cards;
}

export default function HomePerfil({ homeProfile, funcionarioContext = null }: HomePerfilProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can, role } = usePermissions();
  const [notificacoes, setNotificacoes] = React.useState<NotificacaoRecente[]>([]);
  const [carregandoNotificacoes, setCarregandoNotificacoes] = React.useState(true);
  const isMaintenanceHome = homeProfile === 'STUDENT_MANUTENCAO';

  const nome = user?.nome?.split(' ')[0] ?? 'Usuário';
  const perfilLabel =
    role === 'INSTRUTOR' ? 'Instrutor' : role === 'ALUNO' ? 'Aluno' : (role ?? 'Usuário');
  const subtitle = getHomeProfileSubtitle(homeProfile);

  const cards = buildHomeAccessCards({
    role: role ?? '',
    can,
    homeProfile,
    funcionarioId: user?.funcionario_id ?? null,
  });

  React.useEffect(() => {
    if (isMaintenanceHome) {
      setNotificacoes([]);
      setCarregandoNotificacoes(false);
      return;
    }

    let ativo = true;

    async function carregarNotificacoes() {
      setCarregandoNotificacoes(true);
      try {
        const res = await api.get<{
          success: boolean;
          data: NotificacaoRecente[];
        }>('/notificacoes/sistema?limit=10&lida=false');
        const payload = res.data as { success?: boolean; data?: NotificacaoRecente[] } | undefined;

        if (!ativo) return;

        if (res.success && payload?.success) {
          const recentes = (Array.isArray(payload.data) ? payload.data : []).filter((item) =>
            String(item?.tipo || '').startsWith('FICHA_'),
          );
          setNotificacoes(
            [...recentes]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 4),
          );
        } else {
          setNotificacoes([]);
        }
      } catch (error) {
        console.error('Erro ao carregar notificações recentes:', error);
        if (ativo) setNotificacoes([]);
      } finally {
        if (ativo) setCarregandoNotificacoes(false);
      }
    }

    void carregarNotificacoes();
    const intervalo = window.setInterval(() => {
      if (!document.hidden) void carregarNotificacoes();
    }, 90 * 1000);

    return () => {
      ativo = false;
      window.clearInterval(intervalo);
    };
  }, [isMaintenanceHome]);

  function formatarData(isoDate: string): string {
    const data = new Date(isoDate);
    const agora = new Date();
    const diff = agora.getTime() - data.getTime();
    const minutos = Math.floor(diff / 60000);

    if (minutos < 1) return 'Agora';
    if (minutos < 60) return `${minutos}m atrás`;

    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas}h atrás`;

    const dias = Math.floor(horas / 24);
    return `${dias}d atrás`;
  }

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-48px)] bg-slate-50">
        {/* Saudação */}
        <div className="bg-white border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            {perfilLabel}
          </p>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Olá, {nome} 👋</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="p-3 sm:p-4 max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {funcionarioContext && !isMaintenanceHome && (
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Contexto derivado do funcionario
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Setor
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {funcionarioContext.setor || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Funcao
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {funcionarioContext.funcao || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Cargo
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {funcionarioContext.cargo || '-'}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Cards de acesso */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((card, i) => (
              <button
                key={card.route + card.title}
                onClick={() => navigate(card.route)}
                className="group flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 text-left shadow-sm active:scale-[0.98] hover:shadow-md hover:border-primary/30 transition-all duration-150 animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-xl flex items-center justify-center ${card.color} ${card.iconColor}`}
                >
                  {card.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 group-hover:text-primary transition-colors leading-tight">
                    {card.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                    {card.description}
                  </p>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>

          {cards.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma seção disponível para seu perfil.</p>
              <p className="text-xs mt-1">Entre em contato com o administrador.</p>
            </div>
          )}

          <CardMeusEAD />

          {!isMaintenanceHome && (
            <div className="space-y-4 sm:space-y-6">
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-4 sm:px-5 sm:py-5 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        <BellRing className="w-4 h-4" />
                        Notificações de fichas
                      </div>
                      <h2 className="mt-2 text-base sm:text-lg font-semibold text-slate-900">
                        O que ainda depende de você
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-slate-500">
                        Pendências e atualizações das suas fichas de treinamento de voo.
                      </p>
                    </div>
                    {notificacoes.length > 0 && (
                      <button
                        onClick={() => navigate('/simuladores/fichas')}
                        className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-primary transition-colors shrink-0"
                      >
                        Ver fichas
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 sm:p-5">
                  {carregandoNotificacoes ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                      ))}
                    </div>
                  ) : notificacoes.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-6 text-center">
                      <p className="text-sm text-slate-500">Nenhuma notificação de ficha pendente.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notificacoes.map((notificacao) => (
                        <button
                          key={notificacao.id}
                          onClick={() => notificacao.link && navigate(notificacao.link)}
                          className="w-full text-left rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-white hover:border-primary/30 transition-all duration-150 px-3 sm:px-4 py-3 active:scale-[0.99]"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                                  {notificacao.titulo}
                                </h3>
                                <span className="text-xs font-medium text-slate-400 whitespace-nowrap mt-0.5 hidden sm:inline">
                                  {formatarData(notificacao.created_at)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-2">
                                {notificacao.mensagem}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                                  {notificacao.acao_primaria || 'Abrir'}
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-xs text-slate-400 sm:hidden">
                                  {formatarData(notificacao.created_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {notificacoes.length > 0 && (
                  <div className="sm:hidden border-t border-slate-100 px-4 py-3">
                    <button
                      onClick={() => navigate('/simuladores/fichas')}
                      className="w-full flex items-center justify-center gap-2 text-sm font-medium text-primary"
                    >
                      Ver todas as fichas
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}