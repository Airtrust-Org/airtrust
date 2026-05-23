import type { AlertaRaw } from './types';

export function isResolvedRenewalAlert(alerta: Record<string, unknown>) {
  const boolFlags = [
    alerta.renovada,
    alerta.is_renovada,
    alerta.eh_renovada,
    alerta.qualificacao_renovada,
  ];
  if (boolFlags.some((value) => value === true || value === 1 || value === '1')) return true;

  const status = String(alerta.status ?? alerta.status_qualificacao ?? '').trim().toUpperCase();
  if (status === 'RENOVADA' || status === 'RENOVADO') return true;

  const rawText = [
    alerta.mensagem,
    alerta.tipo,
    alerta.qualificacaoNome,
    alerta.qualificacao_nome,
  ]
    .map((value) => String(value ?? ''))
    .join(' ')
    .toUpperCase();
  return rawText.includes('RENOVAD');
}

export function formatRelativeTime(ts: string): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  if (hours < 24) return `há ${hours} h`;
  if (days < 7) return `há ${days} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function formatDisplayDate(date: Date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function safePct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

export function dateDiffInDays(dateOnly: string, base: Date) {
  const target = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.floor((target.getTime() - base.getTime()) / 86400000);
}

export function resolveTripulanteIdFromAlerta(alerta: AlertaRaw): string | null {
  const direct = String(alerta.tripulanteId || '').trim();
  if (direct) return direct;
  const fromUrl = String(alerta.urlAcao || '').match(/\/(?:tripulante|funcionarios?)\/(\d+)/i)?.[1];
  return fromUrl || null;
}

export function participantsCount(sessao: { participantes?: Array<{ id: number; nome: string; funcao?: string }> | string }): number {
  if (Array.isArray(sessao.participantes)) return sessao.participantes.length;
  if (typeof sessao.participantes === 'string') {
    try {
      const parsed = JSON.parse(sessao.participantes) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export function isCriticalFrms(nivel: string) {
  return nivel === 'CRITICO' || nivel === 'VIOLACAO';
}

export function getOperationStatus(complianceScore: number) {
  if (complianceScore >= 90)
    return { label: 'OPERACAO NORMAL', tone: 'border-emerald-500 text-emerald-700' };
  if (complianceScore >= 60)
    return { label: 'OPERACAO EM ATENCAO', tone: 'border-amber-500 text-amber-700' };
  return { label: 'OPERACAO SOB PRESSAO', tone: 'border-red-500 text-red-700' };
}
