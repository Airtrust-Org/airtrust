/**
 * Botão contextual "Guia desta sessão" — aparece apenas quando o usuário
 * tem `simuladores.guias.visualizar` (ou é Platform Admin/Administrador
 * Master) e existe um guia ATIVO vinculado ao modelo_sessao da sessão.
 * Autorização real vem de `useGuiasInstrutorPermissions()` — nunca de
 * texto de role/perfil. Sem fallback aproximado: sem guia vinculado, não
 * renderiza nada (nunca um botão quebrado nem um guia de sessão vizinha).
 */

import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useGuiasInstrutorPermissions } from '@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions';
import { useGuiaDaSessao } from '@/react-app/lib/guias-instrutor/api';

export function BotaoGuiaSessao({ sessaoId }: { sessaoId: number }) {
  const { podeVisualizar, isLoading } = useGuiasInstrutorPermissions();
  const podeVer = !isLoading && podeVisualizar;
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
