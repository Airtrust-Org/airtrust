/**
 * MINHAS FICHAS DE TREINAMENTO DE VOO
 *
 * Tela dedicada ao usuário autenticado como PARTICIPANTE (aluno) avaliado.
 * Mostra apenas fichas onde colaborador_id_aluno === funcionario_id da
 * sessão autenticada (identidade resolvida no backend, GET /fichas/minhas).
 * Nunca inclui fichas onde o usuário é apenas o instrutor.
 */

import AppLayout from '@/react-app/components/AppLayout';
import { FichasAvaliacaoContent } from './index';

export default function MinhasFichasTreinamentoVoo() {
  return (
    <AppLayout>
      <FichasAvaliacaoContent mode="minhas" />
    </AppLayout>
  );
}
