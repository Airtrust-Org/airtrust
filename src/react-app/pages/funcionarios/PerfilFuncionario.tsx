import { Navigate, useParams, useSearchParams } from 'react-router-dom';

const LEGACY_TAB_TO_CANONICAL: Record<string, string> = {
  dados: 'resumo',
  documentos: 'pasta',
  historico: 'auditoria',
  treinamentos: 'qualificacoes',
  acoes: 'resumo',
};

/**
 * Compatibility entry for the former second employee profile surface.
 *
 * The canonical employee detail is Ficha 360 at /funcionarios/:id. Old
 * bookmarks remain valid, but they no longer open a competing presentation
 * with its own fetches, actions, native controls and status summaries.
 */
export default function PerfilFuncionario() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  if (!id || !/^\d+$/.test(id)) {
    return <Navigate to="/funcionarios" replace />;
  }

  const legacyTab = String(searchParams.get('tab') || 'dados').trim().toLowerCase();

  if (legacyTab === 'escalas') {
    return <Navigate to={`/escalas?funcionario_id=${encodeURIComponent(id)}`} replace />;
  }

  const canonicalTab = LEGACY_TAB_TO_CANONICAL[legacyTab] || 'resumo';
  return <Navigate to={`/funcionarios/${id}?tab=${canonicalTab}`} replace />;
}
