import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge to resolve conflicts
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-primary', 'text-white')
 * cn({ 'bg-primary': isPrimary, 'bg-secondary': !isPrimary })
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency values
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function parseDateInput(value: string): Date {
  // IMPORTANT: date-only strings (YYYY-MM-DD) must be treated as local dates.
  // `new Date('YYYY-MM-DD')` is interpreted as UTC and can display as the previous day in Brazil.
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

/**
 * Format date to Brazilian format
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseDateInput(date) : date;
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/**
 * Format date to Brazilian format with time
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseDateInput(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
