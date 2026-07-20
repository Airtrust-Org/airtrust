/**
 * FICHAS DE TREINAMENTO DE VOO PARA AVALIAR
 *
 * Tela dedicada ao usuário autenticado como INSTRUTOR formalmente
 * atribuído. Mostra apenas fichas onde instrutor_id === funcionario_id da
 * sessão autenticada (identidade resolvida no backend,
 * GET /fichas/para-avaliar). Nunca inclui fichas onde o usuário é apenas
 * o aluno/participante avaliado, mesmo quando o mesmo funcionário
 * acumula os dois papéis em fichas diferentes.
 *
 * Capability gate: além do `ProtectedRoute` (autenticação), esta tela
 * exige a permissão nomeada 'simuladores.evaluate' — o mesmo nome de
 * capability que o backend valida em GET /fichas/para-avaliar
 * (hasSimuladoresEvaluateCapability, 403 INSTRUCTOR_EVALUATION_FORBIDDEN).
 * Sem ela, o componente de lista nem chega a montar — o usuário é
 * redirecionado para a tela que sempre pode ver ("Minhas Fichas").
 */

import { Navigate } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { FichasAvaliacaoContent } from './index';

export default function FichasParaAvaliarTreinamentoVoo() {
  const { can } = usePermissions();

  if (!can('simuladores.evaluate')) {
    return <Navigate to="/simuladores/fichas/minhas" replace />;
  }

  return (
    <AppLayout>
      <FichasAvaliacaoContent mode="para-avaliar" />
    </AppLayout>
  );
}
