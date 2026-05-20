// src/react-app/components/NotificacoesEscala.tsx
// UX-10: Bell de notificações in-app de escalas (publicação, conflito, etc.)

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, BellOff } from 'lucide-react';
import { API_BASE_URL, fetchWithAuth } from '../config/api';

interface NotifEscala {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: string;
  lida: boolean;
  referencia_id: string | null;
  referencia_tipo: string | null;
  created_at: string;
}

export function NotificacoesEscala() {
  const [notifs, setNotifs] = useState<NotifEscala[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const apiBase = API_BASE_URL.replace(/\/api$/, '');

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${apiBase}/api/escalas/notificacoes?limit=1`);
      if (!res.ok) return;
      const json = await res.json();
      setUnread(json.data?.nao_lidas ?? 0);
    } catch {
      // silencioso
    }
  }, [apiBase]);

  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${apiBase}/api/escalas/notificacoes?limit=20`);
      if (!res.ok) return;
      const json = await res.json();
      setNotifs(json.data?.notificacoes ?? []);
      setUnread(json.data?.nao_lidas ?? 0);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  async function marcarLida(id: string) {
    try {
      await fetchWithAuth(`${apiBase}/api/escalas/notificacoes/${id}/lida`, {
        method: 'PATCH',
      });
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      // silencioso
    }
  }

  async function marcarTodas() {
    try {
      await fetchWithAuth(`${apiBase}/api/escalas/notificacoes/marcar-todas-lidas`, {
        method: 'PATCH',
      });
      setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
      setUnread(0);
    } catch {
      // silencioso
    }
  }

  // Polling a cada 30 minutos (era 5min); pausa quando aba está oculta
  useEffect(() => {
    fetchCount();
    const t = setInterval(() => {
      if (!document.hidden) fetchCount();
    }, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchNotifs();
  }, [open, fetchNotifs]);

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function tipoIcon(tipo: string) {
    if (tipo === 'escala_publicada') return '📢';
    if (tipo === 'conflito') return '⚠️';
    if (tipo === 'aprovada') return '✅';
    return '🔔';
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
        title="Notificações de Escala"
      >
        <CalendarClock className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[200] w-80 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-slate-800 text-sm">Notificações de Escala</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={marcarTodas}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  Marcar todas
                </button>
              )}
              <button
                onClick={() => navigate('/escalas')}
                className="text-[10px] text-slate-400 hover:text-slate-600"
              >
                ver escalas →
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <BellOff className="w-8 h-8 mb-1" />
                <p className="text-xs">Nenhuma notificação</p>
              </div>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    marcarLida(n.id);
                    if (n.referencia_id && n.referencia_tipo === 'escala') {
                      navigate('/escalas');
                    }
                    setOpen(false);
                  }}
                  className={[
                    'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors',
                    !n.lida ? 'bg-blue-50/40' : '',
                  ].join(' ')}
                >
                  <span className="text-xl mt-0.5 flex-shrink-0">{tipoIcon(n.tipo)}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${n.lida ? 'text-slate-600' : 'text-slate-900'}`}
                    >
                      {n.titulo}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-tight">
                      {n.mensagem}
                    </p>
                    <p className="text-[9px] text-slate-300 mt-1">{formatDate(n.created_at)}</p>
                  </div>
                  {!n.lida && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
