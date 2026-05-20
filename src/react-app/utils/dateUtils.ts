/**
 * Utilitários para conversão de datas
 * Suporta ambos os formatos: DD/MM/YYYY e YYYY-MM-DD
 */

/**
 * Converte data de DD/MM/YYYY para YYYY-MM-DD (formato HTML input date)
 */
export function converterParaFormatoHTML(data: string | null | undefined): string {
  if (!data) return '';
  const str = String(data);
  const ymd = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dia, mes, ano] = br;
    return `${ano}-${mes}-${dia}`;
  }
  return '';
}

/**
 * Converte data de YYYY-MM-DD para DD/MM/YYYY (formato brasileiro)
 */
export function converterParaFormatoBR(data: string | null | undefined): string {
  if (!data) return '';

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    return data;
  }

  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, ano, mes, dia] = match;
    return `${dia}/${mes}/${ano}`;
  }

  return '';
}

/**
 * Formata data para exibição (sempre retorna DD/MM/YYYY)
 */
export function formatarDataExibicao(data: string | null | undefined): string {
  if (!data) return '-';
  return converterParaFormatoBR(data) || data;
}

/**
 * Valida se uma data está em formato válido (DD/MM/YYYY ou YYYY-MM-DD)
 */
export function validarData(data: string): boolean {
  if (!data) return false;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [dia, mes, ano] = data.split('/').map(Number);
    const dataObj = new Date(ano, mes - 1, dia);
    return (
      dataObj.getFullYear() === ano && dataObj.getMonth() === mes - 1 && dataObj.getDate() === dia
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [ano, mes, dia] = data.split('-').map(Number);
    const dataObj = new Date(ano, mes - 1, dia);
    return (
      dataObj.getFullYear() === ano && dataObj.getMonth() === mes - 1 && dataObj.getDate() === dia
    );
  }

  return false;
}

/**
 * Formata data para exibição em português brasileiro
 * CORRIGE PROBLEMA DE TIMEZONE: adiciona T00:00:00 para interpretar como horário local
 *
 * @param data - Data em formato YYYY-MM-DD ou DD/MM/YYYY
 * @returns Data formatada em DD/MM/YYYY ou '-' se inválida
 *
 * @example
 * formatarDataBR('2025-11-01') // '01/11/2025'
 * formatarDataBR('01/11/2025') // '01/11/2025'
 * formatarDataBR(null) // '-'
 */
export function formatarDataBR(data: string | null | undefined): string {
  if (!data) return '-';

  // Se já está em formato BR, retorna
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    return data;
  }

  // Se está em formato ISO (YYYY-MM-DD), converte corrigindo timezone
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    // Adiciona T00:00:00 para interpretar como horário local, não UTC
    const dataObj = new Date(data + 'T00:00:00');
    return dataObj.toLocaleDateString('pt-BR');
  }

  return '-';
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD (para inputs HTML)
 * IMPORTANTE: Usa horário LOCAL, não UTC, para evitar problemas de fuso horário
 *
 * @example
 * getDataHojeHTML() // '2025-12-05' (no Brasil, mesmo às 22h UTC)
 */
export function getDataHojeHTML(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Converte um objeto Date para string YYYY-MM-DD usando horário LOCAL
 * IMPORTANTE: Não usa toISOString() que converte para UTC
 *
 * @example
 * dateToHTMLFormat(new Date()) // '2025-12-05' (horário local)
 */
export function dateToHTMLFormat(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
