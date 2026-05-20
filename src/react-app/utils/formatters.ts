/**
 * Formatters - Centralized formatting logic
 *
 * Elimina duplicação de formatações em múltiplos componentes
 * Uso: import { formatters } from '@/utils/formatters'
 */

// Legacy functions (mantidas para compatibilidade)
export function limparFormatacao(valor: string): string {
  if (!valor) return '';
  return valor.replace(/\D/g, '');
}

export function formatarCPF(cpf: string): string {
  const num = limparFormatacao(cpf);
  if (!num) return '';

  if (num.length <= 3) return num;
  if (num.length <= 6) return num.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  if (num.length <= 9) return num.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');

  return num.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
}

export function formatarTelefone(telefone: string): string {
  const num = limparFormatacao(telefone);
  if (!num) return '';

  if (num.length <= 2) return `(${num}`;
  if (num.length <= 6) return num.replace(/(\d{2})(\d{1,4})/, '($1) $2');
  if (num.length <= 10) return num.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');

  return num.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3');
}

export function formatarCodigoANAC(codigo: string): string {
  const num = limparFormatacao(codigo);
  if (!num) return '';
  if (num.length <= 6) return num;
  return num.replace(/(\d{6})(\d{1})/, '$1-$2');
}

export function formatarMatricula(matricula: string): string {
  const num = limparFormatacao(matricula);
  if (!num) return '';
  return num.padStart(5, '0').substring(0, 5);
}

export function formatarData(data: string): string {
  if (!data) return '';

  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, ano, mes, dia] = match;
    return `${dia}/${mes}/${ano}`;
  }

  return data;
}

export function dataParaInput(data: string): string {
  if (!data) return '';

  if (data.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return data;
  }

  const match = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, dia, mes, ano] = match;
    return `${ano}-${mes}-${dia}`;
  }

  return '';
}

// New unified formatters object
export const formatters = {
  cpf: (value: string | undefined | null): string => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  },

  cnpj: (value: string | undefined | null): string => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');
    return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  },

  phone: (value: string | undefined | null): string => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }

    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  },

  date: (
    value: string | Date | undefined | null,
    format: 'short' | 'long' | 'full' = 'short',
  ): string => {
    if (!value) return '';

    const date =
      typeof value === 'string'
        ? /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(value + 'T12:00:00')
          : new Date(value)
        : value;
    if (isNaN(date.getTime())) return '';

    if (format === 'long') {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }

    if (format === 'full') {
      return date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }

    return date.toLocaleDateString('pt-BR');
  },

  dateTime: (value: string | Date | undefined | null, showSeconds: boolean = false): string => {
    if (!value) return '';

    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '';

    const dateStr = date.toLocaleDateString('pt-BR');
    const timeStr = showSeconds
      ? date.toLocaleTimeString('pt-BR')
      : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `${dateStr} ${timeStr}`;
  },

  currency: (value: number | undefined | null): string => {
    if (value === undefined || value === null) return '';

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
      .format(value)
      .replace(/\u00A0/g, ' ');
  },

  percentage: (value: number | undefined | null, decimals: number = 0): string => {
    if (value === undefined || value === null) return '';

    const numValue = value > 1 ? value : value * 100;

    return new Intl.NumberFormat('pt-BR', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numValue / 100);
  },

  matricula: (value: string | undefined | null): string => {
    if (!value) return '';
    return `MAT-${value.padStart(6, '0')}`;
  },

  number: (value: number | undefined | null, decimals: number = 0): string => {
    if (value === undefined || value === null) return '';

    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  },

  timeFromMinutes: (minutes: number | undefined | null): string => {
    if (minutes === undefined || minutes === null) return '00:00';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  },

  duration: (seconds: number | undefined | null): string => {
    if (seconds === undefined || seconds === null) return '00:00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  },

  bytes: (bytes: number | undefined | null): string => {
    if (bytes === undefined || bytes === null) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  },

  capitalize: (value: string | undefined | null): string => {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  },

  fullName: (value: string | undefined | null): string => {
    if (!value) return '';

    return value
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
      .join(' ');
  },

  truncate: (value: string | undefined | null, length: number = 50): string => {
    if (!value) return '';
    if (value.length <= length) return value;
    return value.substring(0, length) + '...';
  },

  list: (items: (string | number)[] | undefined | null, separator: string = ', '): string => {
    if (!items || items.length === 0) return '';
    return items.join(separator);
  },

  boolean: (value: boolean | undefined | null): string => {
    if (value === undefined || value === null) return '-';
    return value ? 'Sim' : 'Não';
  },

  status: (status: string | undefined | null): string => {
    if (!status) return '-';

    const statusMap: Record<string, string> = {
      active: '✅ Ativo',
      inactive: '❌ Inativo',
      pending: '⏳ Pendente',
      approved: '✅ Aprovado',
      rejected: '❌ Rejeitado',
      expired: '⚠️ Vencido',
      expiring_soon: '⚠️ Próximo a vencer',
    };

    return statusMap[status] || formatters.capitalize(status);
  },
};

export default formatters;
