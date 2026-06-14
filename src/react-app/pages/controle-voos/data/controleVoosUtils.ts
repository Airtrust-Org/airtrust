// Formatação e utilitários para o módulo Controle de Voos

/**
 * Formata data ISO (YYYY-MM-DD) para DD/MM/YYYY
 */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Formata datetime ISO para DD/MM/YYYY HH:MM
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Formata datetime ISO para HH:MM apenas
 */
export function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formata horas em decimal para HH:MM
 */
export function formatHours(decimal: number | null | undefined): string {
  if (decimal == null) return '—';
  const hours = Math.floor(decimal);
  const minutes = Math.round((decimal - hours) * 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

/**
 * Formata nível de combustível
 */
export function formatCombustivel(valor: number | null | undefined): string {
  if (valor == null) return '—';
  return `${valor.toLocaleString('pt-BR')} kg`;
}

/**
 * Retorna label amigável para status do voo
 */
export function statusVooLabel(status: string): string {
  const map: Record<string, string> = {
    planejado: 'Planejado',
    liberado: 'Liberado',
    em_voo: 'Em Voo',
    pousado: 'Pousado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  };
  return map[status] || status;
}

/**
 * Retorna label amigável para status do RDV
 */
export function statusRdvLabel(status: string): string {
  const map: Record<string, string> = {
    rascunho: 'Rascunho',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
  };
  return map[status] || status;
}

/**
 * Retorna label amigável para função a bordo
 */
export function funcaoLabel(funcao: string): string {
  const map: Record<string, string> = {
    PIC: 'Comandante (PIC)',
    SIC: 'Co-piloto (SIC)',
    COM: 'Comissário(a)',
    MEC: 'Mecânico de Voo',
  };
  return map[funcao] || funcao;
}
