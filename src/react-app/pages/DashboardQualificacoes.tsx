import { Navigate } from 'react-router-dom';

/**
 * Legacy compatibility entry.
 *
 * Qualification status metrics are presented by /qualificacoes, backed by
 * /api/qualificacoes/historico stats. Keeping a second dashboard here used a
 * separate endpoint/definition and allowed the same labels to disagree.
 * Preserve old bookmarks without preserving the duplicate metric surface.
 */
export default function DashboardQualificacoes() {
  return <Navigate to="/qualificacoes" replace />;
}
