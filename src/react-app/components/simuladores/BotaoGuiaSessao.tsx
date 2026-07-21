/**
 * Botão contextual "Guia desta sessão" — aparece apenas quando o usuário é
 * instrutor autorizado e existe um guia ATIVO vinculado ao modelo_sessao da
 * sessão. Sem fallback aproximado: sem guia vinculado, não renderiza nada
 * (nunca um botão quebrado nem um guia de sessão vizinha).
 */

import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useGuiaDaSessao } from '@/react-app/lib/guias-instrutor/api';

export function BotaoGuiaSessao({ sessaoId }: { sessaoId: number }) {
  const { role } = usePermissions();
  const podeVer = role === 'INSTRUTOR' || role === 'GESTOR' || role === 'ADMIN';
  const { data: guia } = useGuiaDaSessao(podeVer ? sessaoId : null);
  const navigate = useNavigate();

  if (!podeVer || !guia) return null;

  return (
    <button
      onClick={() => navigate(`/instrutor/guias/${guia.id}`)}
      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded transition"
      title={`Guia desta sessão — ${guia.codigo}`}
    >
      <BookOpen size={14} />
      Guia desta sessão
    </button>
  );
}
