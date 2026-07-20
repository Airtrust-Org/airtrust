/**
 * FICHAS DE TREINAMENTO DE VOO PARA AVALIAR
 *
 * Tela dedicada ao usuário autenticado como INSTRUTOR formalmente
 * atribuído. Mostra apenas fichas onde instrutor_id === funcionario_id da
 * sessão autenticada (identidade resolvida no backend,
 * GET /fichas/para-avaliar). Nunca inclui fichas onde o usuário é apenas
 * o aluno/participante avaliado, mesmo quando o mesmo funcionário
 * acumula os dois papéis em fichas diferentes.
 */

import AppLayout from '@/react-app/components/AppLayout';
import { FichasAvaliacaoContent } from './index';

export default function FichasParaAvaliarTreinamentoVoo() {
  return (
    <AppLayout>
      <FichasAvaliacaoContent mode="para-avaliar" />
    </AppLayout>
  );
}
