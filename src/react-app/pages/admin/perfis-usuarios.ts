/**
 * Perfis da administração: opções novas canônicas e aliases de leitura.
 *
 * Apenas nomes de exibição são padronizados aqui. Os papéis recebidos do
 * backend continuam sendo a autoridade de autorização por empresa.
 */
export const PERFIS_USUARIOS = [
  { value: 'ADMINISTRADOR', label: 'Administrador', color: 'bg-red-100 text-red-800' },
  { value: 'GESTOR', label: 'Gestor', color: 'bg-blue-100 text-blue-700' },
  { value: 'COORDENACAO_VOO', label: 'Coordenação de Voo', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'INSTRUTOR', label: 'Instrutor', color: 'bg-green-100 text-green-800' },
  { value: 'ALUNO', label: 'Aluno', color: 'bg-gray-100 text-gray-600' },
] as const;

export function normalizePerfilUsuario(perfil: string | null | undefined): string {
  const normalized = (perfil || '').trim().toUpperCase();
  switch (normalized) {
    case 'ADMIN':
      return 'ADMINISTRADOR';
    case 'MANAGER':
      return 'GESTOR';
    case 'INSTRUCTOR':
      return 'INSTRUTOR';
    case 'STUDENT':
    case 'MEMBER':
      return 'ALUNO';
    case 'USER':
      return 'USUARIO';
    default:
      return normalized;
  }
}

export function perfilUsuarioLabel(perfil: string | null | undefined): string {
  const normalized = normalizePerfilUsuario(perfil);
  if (!normalized) return 'Sem perfil';
  const found = PERFIS_USUARIOS.find((p) => p.value === normalized);
  if (found) return found.label;
  if (normalized === 'USUARIO') return 'Usuário'; // legado: exibido, mas não atribuível em novos cadastros
  if (normalized === 'VIEWER') return 'Visualizador';
  if (normalized === 'EDITOR') return 'Editor';
  return normalized; // Perfis desconhecidos não são promovidos nem mascarados como Aluno.
}

export function perfilUsuarioBadge(perfil: string | null | undefined): string {
  const normalized = normalizePerfilUsuario(perfil);
  if (!normalized) return 'bg-gray-100 text-gray-500';
  return PERFIS_USUARIOS.find((p) => p.value === normalized)?.color ?? 'bg-gray-100 text-gray-700';
}

export function perfisUsuariosSelecionaveis(isAdmin: boolean) {
  return isAdmin
    ? PERFIS_USUARIOS
    : PERFIS_USUARIOS.filter(
        (p) => !['ADMINISTRADOR', 'GESTOR', 'COORDENACAO_VOO'].includes(p.value),
      );
}
