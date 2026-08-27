import { Navigate } from 'react-router-dom';

/**
 * Compatibilidade com bookmarks e links antigos.
 * A operação FRMS agora possui uma única superfície canônica em /frms.
 */
export default function FrmsControleOperacional() {
  return <Navigate to="/frms" replace />;
}
