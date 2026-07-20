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
 * exige a capability real 'simuladores.evaluate' — o mesmo nome que o
 * backend valida em GET /fichas/para-avaliar
 * (hasSimuladoresEvaluateCapability, 403 INSTRUCTOR_EVALUATION_FORBIDDEN).
 *
 * IMPORTANTE: aqui NÃO usamos `usePermissions().can('simuladores.evaluate')`
 * diretamente — esse `can()` genérico aplica o wildcard de
 * ADMINISTRADOR/GESTOR (podem fazer qualquer coisa por padrão no resto do
 * app), o que faria um admin/gestor sem vínculo de instrutor montar esta
 * tela mesmo sabendo que o backend vai recusar com 403. Usamos
 * `hasInstructorEvaluationCapability`, que espelha exatamente a mesma
 * regra do backend (sem wildcard de role). Sem a capability, o componente
 * de lista nem chega a montar:
 *   - admin/gestor → redireciona para a visão administrativa formal
 *     existente em /simuladores/fichas (getEmployeeSectorAccess).
 *   - qualquer outro papel → redireciona para "Minhas Fichas" (tela que
 *     qualquer vínculo funcional sempre pode ver).
 */

import { Navigate } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useAuth } from '@/react-app/hooks/useAuth';
import { hasInstructorEvaluationCapability } from '@/react-app/utils/simuladoresEvaluateCapability';
import { FichasAvaliacaoContent } from './index';

export default function FichasParaAvaliarTreinamentoVoo() {
  const { role, isAdmin, isGestor } = usePermissions();
  const { user } = useAuth();

  if (!hasInstructorEvaluationCapability(role, user?.permissions)) {
    return (
      <Navigate
        to={isAdmin || isGestor ? '/simuladores/fichas' : '/simuladores/fichas/minhas'}
        replace
      />
    );
  }

  return (
    <AppLayout>
      <FichasAvaliacaoContent mode="para-avaliar" />
    </AppLayout>
  );
}
