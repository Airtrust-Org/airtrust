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
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import AppLayout from '../components/AppLayout';
import api from '../services/api';
import { CardMeusEAD } from '../components/dashboard/CardMeusEAD';

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

function buildCards(role: string, can: (p: string) => boolean): AccessCard[] {
  const cards: AccessCard[] = [];

  // Fadiga Diária — primeiro card para tripulantes/instrutores
  if (['ALUNO', 'INSTRUTOR', 'USUARIO'].includes(role)) {
    cards.push({
      icon: <HeartPulse className="w-7 h-7" />,
      title: 'Fadiga Diária',
      description: 'Registre rapidamente seu estado antes da jornada.',
      route: '/frms/fadiga-checkin',
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
          : 'Visualize as sessões de simulador das quais você participa.',
      route: '/simuladores',
      color: 'bg-violet-50',
      iconColor: 'text-violet-600',
    });
  }

  // Minhas fichas (assinatura)
  if (can('self.ficha')) {
    cards.push({
      icon: <ClipboardList className="w-7 h-7" />,
      title: 'Minhas Fichas de Simulador',
      description: 'Acesse e assine suas fichas de avaliação em simulador.',
      route: '/simuladores/fichas',
      color: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    });
  }

  // Avaliar / assinar fichas de alunos (INSTRUTOR)
  if (can('simuladores.evaluate')) {
    cards.push({
      icon: <PenLine className="w-7 h-7" />,
      title: 'Avaliar / Assinar Fichas',
      description: 'Avalie e assine fichas de alunos nas sessões de simulador.',
      route: '/simuladores/fichas',
      color: 'bg-amber-50',
      iconColor: 'text-amber-600',
    });
  }

  if (['ALUNO', 'INSTRUTOR', 'USUARIO'].includes(role)) {
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

export default function HomePerfil() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can, role } = usePermissions();
  const [notificacoes, setNotificacoes] = React.useState<NotificacaoRecente[]>([]);
  const [carregandoNotificacoes, setCarregandoNotificacoes] = React.useState(true);

  const nome = user?.nome?.split(' ')[0] ?? 'Usuário';
  const perfilLabel =
    role === 'INSTRUTOR' ? 'Instrutor' : role === 'ALUNO' ? 'Aluno' : (role ?? 'Usuário');

  const cards = buildCards(role ?? '', can);

  React.useEffect(() => {
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
  }, []);

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
        {/* Saudação — compacta no mobile */}
        <div className="bg-white border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            {perfilLabel}
          </p>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Olá, {nome} 👋</h1>
          <p className="text-sm text-slate-500 mt-0.5">O que você quer fazer hoje?</p>
        </div>

        {/* Cards — full-width stacked on mobile, grid on tablet+ */}
        <div className="p-4 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 max-w-4xl">
            {cards.map((card) => (
              <button
                key={card.route + card.title}
                onClick={() => navigate(card.route)}
                className="group flex items-center gap-4 sm:flex-col sm:items-start bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 text-left shadow-sm active:scale-[0.98] hover:shadow-md hover:border-primary/30 transition-all duration-150"
              >
                {/* Icon — larger on mobile for tap targets */}
                <div
                  className={`w-14 h-14 sm:w-12 sm:h-12 shrink-0 rounded-2xl sm:rounded-xl flex items-center justify-center ${card.color} ${card.iconColor}`}
                >
                  {card.icon}
                </div>

                {/* Text */}
                <div className="flex-1 sm:flex-none">
                  <h2 className="text-base font-semibold text-slate-900 group-hover:text-primary transition-colors leading-tight">
                    {card.title}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5 leading-relaxed hidden sm:block">
                    {card.description}
                  </p>
                  {/* Mobile: show description smaller */}
                  <p className="text-xs text-slate-400 mt-0.5 sm:hidden">{card.description}</p>
                </div>

                {/* Arrow — right side on mobile, bottom on desktop */}
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors sm:hidden shrink-0" />
                <div className="hidden sm:flex items-center gap-1 text-xs font-semibold text-primary mt-1">
                  Acessar <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>

          <div className="max-w-4xl mt-4 sm:mt-6 space-y-4 sm:space-y-6">
            <CardMeusEAD />

            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-4 sm:px-5 sm:py-5 border-b border-slate-100 flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <BellRing className="w-4 h-4" />
                    Notificações de fichas
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">
                    O que ainda depende de você
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Apenas pendências e atualizações ligadas às suas fichas de simulador.
                  </p>
                </div>
                {notificacoes.length > 0 && (
                  <button
                    onClick={() => navigate('/simuladores/fichas')}
                    className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-primary transition-colors"
                  >
                    Ver fichas
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-4 sm:p-5">
                {carregandoNotificacoes ? (
                  <div className="text-sm text-slate-400">Carregando notificações...</div>
                ) : notificacoes.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-5 text-sm text-slate-500">
                    Nenhuma notificação de ficha pendente no momento.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notificacoes.map((notificacao) => (
                      <button
                        key={notificacao.id}
                        onClick={() => notificacao.link && navigate(notificacao.link)}
                        className="w-full text-left rounded-2xl border border-slate-200 bg-slate-50/80 hover:bg-white hover:border-primary/30 transition-all px-4 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900">
                                  {notificacao.titulo}
                                </h3>
                                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                                  {notificacao.mensagem}
                                </p>
                              </div>
                              <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                                {formatarData(notificacao.created_at)}
                              </span>
                            </div>

                            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary">
                              {notificacao.acao_primaria || 'Abrir'}
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
          {cards.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma seção disponível para seu perfil.</p>
              <p className="text-xs mt-1">Entre em contato com o administrador.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
