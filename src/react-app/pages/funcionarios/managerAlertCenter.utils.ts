import type { AlertaRaw, DashboardMetrics, FrmsAlertaRaw } from '@/react-app/pages/dashboard/types';
import type {
  FrmsOperationalSnapshotItem,
  FrmsOperationalSnapshotSummary,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';

export type ManagerAlertSeverity = 'CRITICO' | 'ATENCAO' | 'INFORMATIVO' | 'RESOLVIDO';

export interface ManagerAlertItem {
  id: string;
  severity: ManagerAlertSeverity;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  module: 'FRMS' | 'QUALIFICACOES' | 'LMS' | 'ESCALAS';
  freshness: string;
  count: number;
  orderWeight: number;
}

interface BuildManagerAlertsParams {
  todayLabel: string;
  metrics?: DashboardMetrics | null;
  dashboardAlerts?: AlertaRaw[];
  frmsAlerts?: FrmsAlertaRaw[];
  snapshotItems?: FrmsOperationalSnapshotItem[];
  snapshotSummary?: FrmsOperationalSnapshotSummary | null;
  enableFrms?: boolean;
  enableQualificacoes?: boolean;
  enableLms?: boolean;
}

const INTERNAL_ROUTE_RE = /^\/(?!\/)/;

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function sanitizeInternalHref(href: string | null | undefined, fallback: string) {
  const safeFallback = INTERNAL_ROUTE_RE.test(fallback) ? fallback : '/';
  const candidate = String(href || '').trim();
  if (!INTERNAL_ROUTE_RE.test(candidate)) return safeFallback;
  return candidate;
}

function severityRank(severity: ManagerAlertSeverity) {
  switch (severity) {
    case 'CRITICO':
      return 4;
    case 'ATENCAO':
      return 3;
    case 'INFORMATIVO':
      return 2;
    case 'RESOLVIDO':
      return 1;
    default:
      return 0;
  }
}

function countByAlertCode(
  items: FrmsOperationalSnapshotItem[],
  codes: string[],
  extraMatch?: (item: FrmsOperationalSnapshotItem) => boolean,
) {
  return items.filter(
    (item) =>
      item.alertas.some((alertCode) => codes.includes(alertCode)) ||
      (extraMatch ? extraMatch(item) : false),
  ).length;
}

function hasSeverity(alerts: AlertaRaw[], severities: string[]) {
  const target = new Set(severities.map((item) => item.toUpperCase()));
  return alerts.some((alert) => target.has(String(alert.criticidade || '').toUpperCase()));
}

function getQualificationUrgencyWeight(alerts: AlertaRaw[]) {
  const nearestDays = alerts
    .map((item) => Number(item.diasRestantes))
    .filter((days) => Number.isFinite(days) && days > 0)
    .sort((a, b) => a - b)[0];

  if (!Number.isFinite(nearestDays)) return 680;
  if (nearestDays <= 1) return 760;
  if (nearestDays <= 3) return 720;
  return 680;
}

export function buildManagerAlerts({
  todayLabel,
  metrics,
  dashboardAlerts = [],
  frmsAlerts = [],
  snapshotItems = [],
  snapshotSummary = null,
  enableFrms = true,
  enableQualificacoes = true,
  enableLms = true,
}: BuildManagerAlertsParams): ManagerAlertItem[] {
  const items: ManagerAlertItem[] = [];

  if (enableFrms) {
    const frmsCriticos = frmsAlerts.filter(
      (item) => item.nivel === 'CRITICO' || item.nivel === 'VIOLACAO',
    ).length;

    if (frmsCriticos > 0) {
      items.push({
        id: 'frms-critical',
        severity: 'CRITICO',
        title: `${pluralize(frmsCriticos, 'alerta')} FRMS crítico${frmsCriticos === 1 ? '' : 's'}`,
        description: 'Revisar fadiga e decisão operacional das jornadas com risco elevado.',
        actionLabel: 'Ver fadiga',
        href: '/frms/alertas',
        module: 'FRMS',
        freshness: `Mês atual · ${todayLabel}`,
        count: frmsCriticos,
        orderWeight: 980,
      });
    } else if (frmsAlerts.length > 0) {
      items.push({
        id: 'frms-attention',
        severity: 'ATENCAO',
        title: `${pluralize(frmsAlerts.length, 'alerta')} FRMS em acompanhamento`,
        description: 'Acompanhar fadiga e evitar que alertas de atenção evoluam para crítico.',
        actionLabel: 'Ver fadiga',
        href: '/frms/alertas',
        module: 'FRMS',
        freshness: `Mês atual · ${todayLabel}`,
        count: frmsAlerts.length,
        orderWeight: 620,
      });
    }

    const checkinCritico = countByAlertCode(snapshotItems, ['CHECKIN_CRITICO']);
    const checkinPendente =
      Number(snapshotSummary?.checkins_pendentes || 0) ||
      countByAlertCode(snapshotItems, ['CHECKIN_PENDENTE', 'CHECKIN_CRITICO'], (item) =>
        item.checkin_status === 'PENDENTE' || item.checkin_status === 'AUSENTE',
      );

    if (checkinPendente > 0) {
      items.push({
        id: 'frms-checkin',
        severity: checkinCritico > 0 ? 'CRITICO' : 'ATENCAO',
        title:
          checkinCritico > 0
            ? `${pluralize(checkinPendente, 'check-in')} de fadiga com ação imediata`
            : `${pluralize(checkinPendente, 'check-in')} de fadiga pendente${checkinPendente === 1 ? '' : 's'}`,
        description:
          checkinCritico > 0
            ? 'Solicitar retorno operacional e revisar tripulantes sem confirmação confiável.'
            : 'Solicitar check-in antes da jornada para reduzir incerteza operacional.',
        actionLabel: 'Solicitar check-in',
        href: '/frms/controle-operacional',
        module: 'FRMS',
        freshness: `Snapshot operacional · ${todayLabel}`,
        count: checkinPendente,
        orderWeight: checkinCritico > 0 ? 940 : 780,
      });
    }

    const escalaRisco = countByAlertCode(snapshotItems, [
      'ESCALADO_SEM_JORNADA_FRMS',
      'JORNADA_FRMS_SEM_ESCALA',
      'JORNADA_SEM_FATORIZACAO',
      'DADO_INCONSISTENTE',
    ]);

    if (escalaRisco > 0) {
      const escalaCritica = countByAlertCode(snapshotItems, [
        'JORNADA_SEM_FATORIZACAO',
        'DADO_INCONSISTENTE',
      ]);

      items.push({
        id: 'escala-risk',
        severity: escalaCritica > 0 ? 'CRITICO' : 'ATENCAO',
        title: `${pluralize(escalaRisco, 'risco', 'riscos')} de escala ou EVD para revisar`,
        description:
          escalaCritica > 0
            ? 'Reconciliar jornada, escala e fatorização antes de seguir com a operação.'
            : 'Revisar vínculos entre escala publicada, EVD e jornada FRMS.',
        actionLabel: 'Revisar escala',
        href: '/escalas/evd',
        module: 'ESCALAS',
        freshness: `Snapshot operacional · ${todayLabel}`,
        count: escalaRisco,
        orderWeight: escalaCritica > 0 ? 900 : 760,
      });
    }
  }

  if (enableQualificacoes) {
    const qualificationAlerts = dashboardAlerts.filter(
      (item) => ['qualificacao_vencendo', 'qualificacao_vencida'].includes(String(item.tipo || '').toLowerCase()),
    );
    const upcomingQualificationWeight = getQualificationUrgencyWeight(qualificationAlerts);

    const vencidas =
      Number(metrics?.qualificacoesVencidas || 0) ||
      qualificationAlerts.filter(
        (item) =>
          String(item.tipo || '').toLowerCase() === 'qualificacao_vencida' ||
          Number(item.diasRestantes || 0) <= 0,
      ).length;
    const vencendo =
      Number(metrics?.qualificacoesAVencer || 0) ||
      qualificationAlerts.filter(
        (item) =>
          String(item.tipo || '').toLowerCase() !== 'qualificacao_vencida' &&
          Number(item.diasRestantes || 0) > 0,
      ).length;

    if (vencidas > 0) {
      items.push({
        id: 'qualificacoes-expired',
        severity: 'CRITICO',
        title: `${pluralize(vencidas, 'qualificação', 'qualificações')} vencida${vencidas === 1 ? '' : 's'}`,
        description: 'Regularizar vencimentos que já impactam a disponibilidade operacional.',
        actionLabel: 'Regularizar qualificação',
        href: '/qualificacoes/alertas',
        module: 'QUALIFICACOES',
        freshness: `Janela de vencimento ativa · ${todayLabel}`,
        count: vencidas,
        orderWeight: 860,
      });
    } else if (vencendo > 0) {
      items.push({
        id: 'qualificacoes-upcoming',
        severity: 'ATENCAO',
        title: `${pluralize(vencendo, 'qualificação', 'qualificações')} a vencer`,
        description: 'Antecipar regularização para evitar bloqueio operacional nas próximas janelas.',
        actionLabel: 'Regularizar qualificação',
        href: '/qualificacoes/alertas',
        module: 'QUALIFICACOES',
        freshness: `Janela de vencimento ativa · ${todayLabel}`,
        count: vencendo,
        orderWeight: upcomingQualificationWeight,
      });
    }
  }

  if (enableLms) {
    const lmsAlerts = dashboardAlerts.filter(
      (item) => String(item.tipo || '').toLowerCase() === 'lms_curso_pendente',
    );

    if (lmsAlerts.length > 0) {
      const criticalLms = hasSeverity(lmsAlerts, ['CRITICA', 'ALTA']);
      items.push({
        id: 'lms-pending',
        severity: criticalLms ? 'CRITICO' : 'INFORMATIVO',
        title: `${pluralize(lmsAlerts.length, 'pendência')} de LMS obrigatória${lmsAlerts.length === 1 ? '' : 's'}`,
        description: 'Acompanhar cursos obrigatórios não concluídos antes que virem bloqueio operacional.',
        actionLabel: 'Ver detalhe',
        href: sanitizeInternalHref(lmsAlerts[0]?.urlAcao, '/lms/dashboard'),
        module: 'LMS',
        freshness: `Compliance LMS · ${todayLabel}`,
        count: lmsAlerts.length,
        orderWeight: criticalLms ? 820 : 380,
      });
    }
  }

  return items
    .slice()
    .sort((a, b) => {
      const severityDiff = severityRank(b.severity) - severityRank(a.severity);
      if (severityDiff !== 0) return severityDiff;
      if (b.orderWeight !== a.orderWeight) return b.orderWeight - a.orderWeight;
      if (b.count !== a.count) return b.count - a.count;
      return a.title.localeCompare(b.title, 'pt-BR');
    })
    .slice(0, 7);
}
