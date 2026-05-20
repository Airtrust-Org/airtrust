// Máscaras de input para formulários
// Funções utilitárias para aplicar máscaras em campos de formulário

/**
 * Aplica máscara de matrícula: 5 dígitos numéricos
 * Exemplo: 12345
 */
export function aplicarMascaraMatricula(valor: string): string {
  const numeros = valor.replace(/\D/g, '');
  return numeros.slice(0, 5);
}

/**
 * Aplica máscara de telefone brasileiro
 * Formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
export function aplicarMascaraTelefone(valor: string): string {
  const numeros = valor.replace(/\D/g, '');

  if (numeros.length <= 2) {
    return numeros;
  }

  if (numeros.length <= 6) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  }

  if (numeros.length <= 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  // Celular com 9 dígitos
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`;
}

/**
 * Aplica máscara de código ANAC
 * Formato: XXXXX-X (5 dígitos, hífen, 1 dígito)
 * Exemplo: 12694-7
 */
export function aplicarMascaraCodigoANAC(valor: string): string {
  const numeros = valor.replace(/\D/g, '');

  if (numeros.length <= 5) {
    return numeros;
  }

  return `${numeros.slice(0, 5)}-${numeros.slice(5, 6)}`;
}

/**
 * Remove a máscara de um valor, retornando apenas os números
 */
export function removerMascara(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Valida matrícula (deve ter 5 dígitos)
 */
export function validarMatricula(valor: string): boolean {
  const numeros = removerMascara(valor);
  return numeros.length === 5;
}

/**
 * Valida telefone brasileiro (10 ou 11 dígitos)
 */
export function validarTelefone(valor: string): boolean {
  const numeros = removerMascara(valor);
  return numeros.length === 10 || numeros.length === 11;
}

/**
 * Valida código ANAC (deve ter 6 dígitos)
 */
export function validarCodigoANAC(valor: string): boolean {
  const numeros = removerMascara(valor);
  return numeros.length === 6;
}
