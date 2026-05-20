/**
 * Formata uma data no formato YYYY-MM-DD para DD/MM/YYYY
 */
export function formatarData(data: string | Date | null | undefined): string {
  if (!data) return '-';

  const date = typeof data === 'string' ? new Date(data) : data;

  // Verifica se a data é válida
  if (isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('pt-BR');
}

/**
 * Formata um CPF no formato XXX.XXX.XXX-XX
 */
export function formatarCPF(cpf: string | null | undefined): string {
  if (!cpf) return '-';

  const apenasNumeros = cpf.replace(/\D/g, '');

  if (apenasNumeros.length !== 11) return cpf;

  return apenasNumeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata uma nota no formato X.X/5.0
 */
export function formatarNota(nota: number | null | undefined): string {
  if (nota === null || nota === undefined) return '-';

  return `${nota.toFixed(1)}/5.0`;
}

/**
 * Formata um número de telefone no formato (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
export function formatarTelefone(telefone: string | null | undefined): string {
  if (!telefone) return '-';

  const apenasNumeros = telefone.replace(/\D/g, '');

  if (apenasNumeros.length === 11) {
    return apenasNumeros.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  if (apenasNumeros.length === 10) {
    return apenasNumeros.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }

  return telefone;
}

/**
 * Formata uma matrícula com padding de zeros à esquerda
 */
export function formatarMatricula(matricula: string | number | null | undefined): string {
  if (!matricula) return '-';

  const matriculaStr = String(matricula);
  return matriculaStr.padStart(6, '0');
}
