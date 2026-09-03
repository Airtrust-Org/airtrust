import { canAccessModule, type EmpresaModuleState } from './module-access';

export interface TrainingEntryAccess {
  modulosAtivos: EmpresaModuleState;
  can: (permission: string) => boolean;
  isAluno: boolean;
  isInstrutor: boolean;
}

/**
 * Keeps the legacy /treinamentos link safe without preserving its former
 * card-only menu. The priority mirrors the primary training navigation.
 */
export function resolveTrainingEntryPath({
  modulosAtivos,
  can,
  isAluno,
  isInstrutor,
}: TrainingEntryAccess): string {
  const lmsAvailable = canAccessModule('lms', modulosAtivos);

  // Restricted roles only had LMS available from the legacy hub.
  if (isAluno || isInstrutor) {
    return lmsAvailable ? '/lms/cursos' : '/';
  }

  if (canAccessModule('qualificacoes', modulosAtivos) && can('qualificacoes.view')) {
    return '/qualificacoes';
  }

  if (lmsAvailable) {
    return '/lms';
  }

  if (canAccessModule('simuladores', modulosAtivos) && can('simuladores.view')) {
    return '/simuladores';
  }

  return '/';
}
