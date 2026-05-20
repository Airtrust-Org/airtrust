import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Notificacao {
  id: number;
  tipo: string;
  prioridade: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAIXA';
  titulo: string;
  mensagem: string;
  dados?: Record<string, unknown>;
  lida: boolean;
  link?: string;
  acao_primaria?: string;
  created_at: string;
}

const CORES_PRIORIDADE = {
  URGENTE: 'bg-red-500',
  ALTA: 'bg-orange-500',
  MEDIA: 'bg-blue-500',
  BAIXA: 'bg-gray-500',
};

export function NotificacoesSistema() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [contador, setContador] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  // Polling a cada 90 segundos; pausa quando aba está oculta
  useEffect(() => {
    buscarContador();
    const intervalo = setInterval(() => {
      if (!document.hidden) buscarContador();
    }, 90 * 1000);
    return () => clearInterval(intervalo);
  }, []);

  // Buscar lista quando abrir
  useEffect(() => {
    if (aberto) {
      buscarNotificacoes();
    }
  }, [aberto]);

  async function buscarContador() {
    try {
      const res = await api.get<{ success: boolean; total_nao_lidas: number }>(
        '/notificacoes/sistema/contador',
      );
      const payload = res.data as { success?: boolean; total_nao_lidas?: number } | undefined;
      if (res.success && payload?.success) {
        setContador(payload.total_nao_lidas || 0);
      }
    } catch (err) {
      console.error('Erro ao buscar contador de notificações:', err);
    }
  }

  async function buscarNotificacoes() {
    setCarregando(true);
    try {
      const res = await api.get<{
        success: boolean;
        data: Notificacao[];
        total_nao_lidas: number;
      }>('/notificacoes/sistema?limit=50&lida=false');
      const payload = res.data as
        | { success?: boolean; data?: Notificacao[]; total_nao_lidas?: number }
        | undefined;
      if (res.success && payload?.success) {
        setNotificacoes(Array.isArray(payload.data) ? payload.data : []);
        if (payload.total_nao_lidas !== undefined) {
          setContador(payload.total_nao_lidas);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
    } finally {
      setCarregando(false);
    }
  }

  async function marcarComoLida(id: number) {
    try {
      await api.put(`/notificacoes/sistema/${id}/marcar-lida`);
      setNotificacoes((prev) => prev.filter((n) => n.id !== id));
      setContador((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Erro ao marcar como lida:', err);
    }
  }

  async function marcarTodasComoLidas() {
    try {
      await api.put('/notificacoes/sistema/marcar-todas-lidas');
      setNotificacoes([]);
      setContador(0);
    } catch (err) {
      console.error('Erro ao marcar todas:', err);
    }
  }

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
    <div className="relative">
      {/* Badge com contador */}
      <button
        onClick={() => setAberto(!aberto)}
        className="relative p-2 rounded-full hover:bg-zinc-800 transition-colors"
        aria-label="Notificações"
      >
        <svg
          className="w-6 h-6 text-zinc-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {contador > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {contador > 9 ? '9+' : contador}
          </span>
        )}
      </button>

      {/* Painel de notificações */}
      {aberto && (
        <>
          {/* Overlay para fechar ao clicar fora */}
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />

          {/* Painel */}
          <div className="absolute right-0 mt-2 w-96 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl z-50 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Cabeçalho */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Notificações</h3>
              {notificacoes.length > 0 && (
                <button
                  onClick={marcarTodasComoLidas}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            {/* Lista de notificações */}
            <div className="overflow-y-auto flex-1">
              {carregando ? (
                <div className="p-8 text-center text-zinc-500">Carregando...</div>
              ) : notificacoes.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  <svg
                    className="w-12 h-12 mx-auto mb-2 text-zinc-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                  <p className="text-sm">Nenhuma notificação nova</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {notificacoes.map((notif) => (
                    <div key={notif.id} className="p-4 hover:bg-zinc-800/30 transition-colors">
                      <div className="flex items-start gap-3">
                        {/* Indicador de prioridade */}
                        <div
                          className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${CORES_PRIORIDADE[notif.prioridade]}`}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-sm font-medium text-white">{notif.titulo}</h4>
                            <span className="text-xs text-zinc-500 whitespace-nowrap">
                              {formatarData(notif.created_at)}
                            </span>
                          </div>

                          <p className="text-sm text-zinc-400 mb-3">{notif.mensagem}</p>

                          <div className="flex items-center gap-2">
                            {notif.link && (
                              <button
                                onClick={() => {
                                  marcarComoLida(notif.id);
                                  setAberto(false);
                                  navigate(notif.link!);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
                              >
                                {notif.acao_primaria || 'Abrir'}
                              </button>
                            )}
                            <button
                              onClick={() => marcarComoLida(notif.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 rounded-md transition-colors"
                            >
                              Ciente
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
