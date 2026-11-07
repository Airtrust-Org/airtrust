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

/**
 * A URL de retorno pode ter sido guardada enquanto o usuário estava em outra
 * sessão (por exemplo, GESTOR na grade /lms/matriculas/67). Não transportar
 * uma rota administrativa para a sessão ALUNO/INSTRUTOR: a autorização deve
 * continuar negando acesso, mas a entrada operacional deve abrir o LMS aluno.
 *
 * A escolha de perfil/role é validada pelo servidor. Este helper só decide
 * navegação e nunca substitui permissões de rota ou API.
 */
export function resolveSessionEntryDestination(
  role: SessionRole,
  requestedDestination: string | null | undefined,
): string {
  const destination = requestedDestination || '/';
  // window.location.replace() não pode receber URL absoluta nem protocol-relative.
  if (
    !destination.startsWith('/') ||
    destination.startsWith('//') ||
    destination.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(destination)
  ) return role === 'ALUNO' || role === 'INSTRUTOR' ? '/lms' : '/';

  const pathname = destination.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  if (pathname === '/login') {
    return role === 'ALUNO' || role === 'INSTRUTOR' ? '/lms' : '/';
  }

  if (role === 'ALUNO' || role === 'INSTRUTOR') {
    const learnerDestination =
      pathname === '/lms' ||
      pathname === '/lms/cursos' ||
      /^\/lms\/cursos\/[1-9]\d*$/.test(pathname) ||
      /^\/lms\/player\/(?:(?:h5p|pdf|pptx)\/)?[1-9]\d*$/.test(pathname) ||
      pathname === '/treinamentos' ||
      pathname === '/conhecimento-ativo' ||
      /^\/conhecimento-ativo\/desafios\/[1-9]\d*$/.test(pathname) ||
      pathname === '/perfil/trocar-senha' ||
      (role === 'INSTRUTOR' && (pathname === '/simuladores' || pathname.startsWith('/simuladores/')));
    return learnerDestination ? destination : '/lms';
  }

  if (role === 'COORDENACAO_VOO') {
    return pathname === '/controle-voos' || pathname.startsWith('/controle-voos/')
      ? destination
      : '/controle-voos';
  }
  if (role === 'GESTOR' && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
    return '/';
  }
  return destination;
}
