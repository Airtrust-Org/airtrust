export const FADIGA_EMPLOYEE_HOME_PATH = '/home';

export function resolveFadigaPostSavePath(role?: string | null): string {
  // O check-in diario pertence a jornada individual do funcionario.
  // Ao concluir/fechar o formulario, nunca empurrar o usuario para a superficie
  // operacional do FRMS (/frms, /frms/controle-operacional, Casos ou Administracao).
  void role;
  return FADIGA_EMPLOYEE_HOME_PATH;
}
