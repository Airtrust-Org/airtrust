export function normalizeCategoriaKey(value?: string | null) {
  return (value ?? '').toString().trim().toUpperCase();
}

export function getCategoriaCorDisplay(categoriaNome?: string | null, corOriginal?: string | null) {
  const categoriaKey = normalizeCategoriaKey(categoriaNome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (categoriaKey === 'LICENCA') {
    return '#0f766e';
  }
  return corOriginal || undefined;
}

export function parseDateLocal(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return new Date(year, month - 1, day);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function getStatusColor(status: string) {
  if (status === 'CONCLUIDA' || status === 'CONCLUIDO') return 'bg-emerald-600/10 text-emerald-700';
  if (status === 'RENOVADA') return 'bg-blue-600/10 text-blue-600';
  if (status === 'VALIDA') return 'bg-success-600/10 text-success-600';
  if (status === 'PROXIMA_VENCIMENTO' || status === 'VENCENDO_30')
    return 'bg-warning-600/10 text-warning-600';
  if (status === 'PLANEJADA') return 'bg-purple-600/10 text-purple-600';
  if (status === 'CANCELADA') return 'bg-slate-600/10 text-slate-600';
  return 'bg-danger-600/10 text-danger-600';
}

export function getStatusDotColor(status: string) {
  if (status === 'CONCLUIDA' || status === 'CONCLUIDO') return 'bg-emerald-700';
  if (status === 'VALIDA') return 'bg-success-600';
  if (status === 'PROXIMA_VENCIMENTO' || status === 'VENCENDO_30') return 'bg-warning-600';
  if (status === 'PLANEJADA') return 'bg-purple-600';
  if (status === 'CANCELADA') return 'bg-slate-600';
  return 'bg-danger-600';
}

export function getStatusLabel(status: string) {
  if (status === 'CONCLUIDA' || status === 'CONCLUIDO') return 'Sem vencimento';
  if (status === 'RENOVADA') return 'Renovada';
  if (status === 'VALIDA') return 'Válida';
  if (status === 'PROXIMA_VENCIMENTO' || status === 'VENCENDO_30') return 'Vencendo';
  if (status === 'PLANEJADA') return 'Planejada';
  if (status === 'CANCELADA') return 'Cancelada';
  return 'Vencida';
}
