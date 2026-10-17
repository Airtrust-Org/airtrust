/** Presentation grouping only. Authorization and JWT roles remain server-owned. */
export type SessionRole =
  | 'ADMINISTRADOR' | 'GESTOR' | 'COORDENACAO_VOO'
  | 'INSTRUTOR' | 'ALUNO' | 'USUARIO';

export interface SessionEntryOption {
  id: 'admin' | 'manager' | 'learning' | 'flight-coordination' | 'user';
  role: SessionRole;
  label: string;
  description: string;
}

/** One Aluno / Instrutor entry represents BOTH learner/instructor modes.
 * Selecting it uses INSTRUTOR only when the backend actually grants that role.
 */
export function sessionEntryOptions(available: readonly SessionRole[]): SessionEntryOption[] {
  const roles = new Set(available);

  // Fail closed at the UI as well: the persisted platform-admin guard in the
  // backend still authorizes (or denies) every session-role selection.
  if (roles.has('ADMINISTRADOR')) {
    return [{
      id: 'admin', role: 'ADMINISTRADOR', label: 'Administrador',
      description: 'Acesso administrativo da plataforma.',
    }];
  }

  const options: SessionEntryOption[] = [];
  if (roles.has('GESTOR')) {
    options.push({
      id: 'manager', role: 'GESTOR', label: 'Gestor',
      description: 'Gestão operacional da empresa e dos setores autorizados.',
    });
  }

  if (roles.has('INSTRUTOR') || roles.has('ALUNO')) {
    options.push({
      id: 'learning',
      role: roles.has('INSTRUTOR') ? 'INSTRUTOR' : 'ALUNO',
      label: 'Aluno / Instrutor',
      description: 'Seus treinamentos e, quando autorizado, suas atividades como instrutor.',
    });
  }

  if (roles.has('COORDENACAO_VOO')) {
    options.push({
      id: 'flight-coordination', role: 'COORDENACAO_VOO', label: 'Coordenação de Voo',
      description: 'Programação e acompanhamento dos voos da empresa.',
    });
  }
  if (roles.has('USUARIO') && options.length === 0) {
    options.push({
      id: 'user', role: 'USUARIO', label: 'Usuário',
      description: 'Atividades operacionais permitidas para sua conta.',
    });
  }

  return options;
}
