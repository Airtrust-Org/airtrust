// ── Config type alias for limites (partial, from API) ──
export type ConfigLimites = Partial<Record<string, number>> | null;

// ============================================================
// PAINEL A — Índice estimado de prontidão operacional (proxy local não validado)
// ============================================================

export function getEffectivenessColor(pct: number, config: ConfigLimites): string {
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct >= verde) return 'text-teal-700';
  if (pct <= vermelho) return 'text-rose-700';
  if (pct <= amarelo) return 'text-amber-700';
  return 'text-orange-600';
}

export function getEffectivenessBg(pct: number, config: ConfigLimites): string {
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct >= verde) return 'bg-teal-600';
  if (pct <= vermelho) return 'bg-rose-600';
  if (pct <= amarelo) return 'bg-amber-500';
  return 'bg-orange-500';
}

export function getEffectivenessHex(pct: number, config: ConfigLimites): string {
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct >= verde) return '#0F766E';
  if (pct <= vermelho) return '#BE123C';
  if (pct <= amarelo) return '#D97706';
  return '#EA580C';
}

export function getEffectivenessLabel(pct: number, config: ConfigLimites): string {
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct >= verde) return 'Sem degradação estimada';
  if (pct <= vermelho) return 'Degradação estimada elevada';
  if (pct <= amarelo) return 'Degradação estimada moderada';
  return 'Atenção operacional';
}

export function getEffectivenessStroke(pct: number, config: ConfigLimites): string {
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct >= verde) return '#0f766e';
  if (pct <= vermelho) return '#be123c';
  if (pct <= amarelo) return '#d97706';
  return '#ea580c';
}

// ============================================================
// Compliance Regulatório (ANAC RBAC 117)
// ============================================================

export function getComplianceColor(pct: number, config: ConfigLimites): string {
  const aviso = config?.ALERTA_AVISO_PCT ?? 80;
  const atencao = config?.ALERTA_ATENCAO_PCT ?? 90;
  const critico = config?.ALERTA_CRITICO_PCT ?? 95;
  const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
  if (pct >= violacao) return 'text-red-800';
  if (pct >= critico) return 'text-orange-800';
  if (pct >= atencao) return 'text-orange-600';
  if (pct >= aviso) return 'text-amber-700';
  return 'text-teal-700';
}

export function getComplianceBg(pct: number, config: ConfigLimites): string {
  const aviso = config?.ALERTA_AVISO_PCT ?? 80;
  const atencao = config?.ALERTA_ATENCAO_PCT ?? 90;
  const critico = config?.ALERTA_CRITICO_PCT ?? 95;
  const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
  if (pct >= violacao) return 'bg-red-700';
  if (pct >= critico) return 'bg-orange-700';
  if (pct >= atencao) return 'bg-orange-500';
  if (pct >= aviso) return 'bg-amber-500';
  return 'bg-teal-600';
}

export function getComplianceHex(pct: number, config: ConfigLimites): string {
  const aviso = config?.ALERTA_AVISO_PCT ?? 80;
  const atencao = config?.ALERTA_ATENCAO_PCT ?? 90;
  const critico = config?.ALERTA_CRITICO_PCT ?? 95;
  const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
  if (pct >= violacao) return '#991B1B';
  if (pct >= critico) return '#C2410C';
  if (pct >= atencao) return '#EA580C';
  if (pct >= aviso) return '#D97706';
  return '#0F766E';
}

export function getComplianceBarColor(pct: number, config: ConfigLimites): string {
  const aviso = config?.ALERTA_AVISO_PCT ?? 80;
  const atencao = config?.ALERTA_ATENCAO_PCT ?? 90;
  const critico = config?.ALERTA_CRITICO_PCT ?? 95;
  const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
  if (pct >= violacao) return '#991B1B';
  if (pct >= critico) return '#C2410C';
  if (pct >= atencao) return '#EA580C';
  if (pct >= aviso) return '#D97706';
  return '#0F766E';
}

export function getComplianceLabel(pct: number, config: ConfigLimites): string {
  const aviso = config?.ALERTA_AVISO_PCT ?? 80;
  const atencao = config?.ALERTA_ATENCAO_PCT ?? 90;
  const critico = config?.ALERTA_CRITICO_PCT ?? 95;
  const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
  if (pct >= violacao) return 'Violação Regulatória';
  if (pct >= critico) return 'Nível Crítico';
  if (pct >= atencao) return 'Nível de Atenção';
  if (pct >= aviso) return 'Aviso Preventivo';
  return 'Dentro do Limite';
}

// ============================================================
// STATUS CONSOLIDADO (pior dos dois painéis)
// ============================================================

export type FrmsStatus = 'normal' | 'atencao' | 'critico' | 'violacao';

export function getStatusConsolidado(
  effectivenessPct: number | null,
  maxCompliancePct: number | null,
  config: ConfigLimites,
): FrmsStatus {
  const statusCompliance = getComplianceStatus(maxCompliancePct ?? 0, config);
  const statusEffectiveness = getEffectivenessStatus(effectivenessPct ?? 100, config);
  const ordem: FrmsStatus[] = ['normal', 'atencao', 'critico', 'violacao'];
  const idxC = ordem.indexOf(statusCompliance);
  const idxE = ordem.indexOf(statusEffectiveness);
  return ordem[Math.max(idxC, idxE)];
}

function getComplianceStatus(pct: number, config: ConfigLimites): FrmsStatus {
  const aviso = config?.ALERTA_AVISO_PCT ?? 80;
  const critico = config?.ALERTA_CRITICO_PCT ?? 95;
  const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
  if (pct >= violacao) return 'violacao';
  if (pct >= critico) return 'critico';
  if (pct >= aviso) return 'atencao';
  return 'normal';
}

function getEffectivenessStatus(pct: number, config: ConfigLimites): FrmsStatus {
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct <= vermelho) return 'critico';
  if (pct <= amarelo) return 'atencao';
  if (pct >= verde) return 'normal';
  return 'atencao';
}

export const STATUS_CONFIG = {
  normal: {
    label: 'Normal',
    textColor: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
  },
  atencao: {
    label: 'Atenção',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  critico: {
    label: 'Crítico',
    textColor: 'text-orange-800',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  violacao: {
    label: 'Violação',
    textColor: 'text-red-800',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
  },
} as const;

// ============================================================
// HEATMAP
// ============================================================

export function getHeatmapCellColor(
  pct: number | null | undefined,
  modo: 'compliance' | 'effectiveness',
  config: ConfigLimites,
): string {
  if (pct == null) return 'bg-transparent';
  if (modo === 'compliance') {
    const aviso = config?.ALERTA_AVISO_PCT ?? 80;
    const atencao = config?.ALERTA_ATENCAO_PCT ?? 90;
    const critico = config?.ALERTA_CRITICO_PCT ?? 95;
    const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
    if (pct >= violacao) return 'bg-red-700';
    if (pct >= critico) return 'bg-orange-700';
    if (pct >= atencao) return 'bg-orange-500';
    if (pct >= aviso) return 'bg-amber-400';
    return 'bg-teal-600';
  } else {
    const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
    const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
    const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
    if (pct >= verde) return 'bg-teal-600';
    if (pct <= vermelho) return 'bg-rose-600';
    if (pct <= amarelo) return 'bg-amber-400';
    return 'bg-orange-400';
  }
}

export function buildHeatmapLegend(
  modo: 'compliance' | 'effectiveness',
  config: ConfigLimites,
): Array<{ label: string; color: string }> {
  if (modo === 'compliance') {
    const aviso = config?.ALERTA_AVISO_PCT ?? 80;
    const atencao = config?.ALERTA_ATENCAO_PCT ?? 90;
    const critico = config?.ALERTA_CRITICO_PCT ?? 95;
    const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
    return [
      { label: `< ${aviso}%`, color: 'bg-teal-600' },
      { label: `${aviso}–${atencao - 1}% (Aviso)`, color: 'bg-amber-400' },
      { label: `${atencao}–${critico - 1}% (Atenção)`, color: 'bg-orange-500' },
      { label: `${critico}–${violacao - 1}% (Crítico)`, color: 'bg-orange-700' },
      { label: `≥ ${violacao}% (Violação)`, color: 'bg-red-700' },
      { label: 'Sem dado', color: 'bg-white border border-slate-300' },
    ];
  } else {
    const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
    const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
    const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
    return [
      { label: `≥ ${verde}% (Pleno)`, color: 'bg-teal-600' },
      { label: `${amarelo + 1}–${verde - 1}% (Atenção)`, color: 'bg-orange-400' },
      { label: `${vermelho + 1}–${amarelo}% (Degradação)`, color: 'bg-amber-400' },
      { label: `≤ ${vermelho}% (Degradação severa)`, color: 'bg-rose-600' },
      { label: 'Sem dado', color: 'bg-white border border-slate-300' },
    ];
  }
}

// ============================================================
// LEGACY — kept for backward compatibility with alertas + dashboard
// ============================================================

export type FrmsVisualNivel = 'OK' | 'ATENCAO' | 'CRITICO';
export type FrmsDashboardNivel = 'OK' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';

export function normalizeFrmsAlertNivel(nivel?: string | null): FrmsDashboardNivel {
  if (nivel === 'VIOLACAO') return 'VIOLACAO';
  if (nivel === 'CRITICO') return 'CRITICO';
  if (nivel === 'ATENCAO' || nivel === 'AVISO') return 'ATENCAO';
  return 'OK';
}

export function resolveFrmsComplianceDashboardNivel(
  pct: number,
  config: ConfigLimites,
): FrmsDashboardNivel {
  const aviso = config?.ALERTA_AVISO_PCT ?? 80;
  const critico = config?.ALERTA_CRITICO_PCT ?? 95;
  const violacao = config?.ALERTA_VIOLACAO_PCT ?? 101;
  if (pct >= violacao) return 'VIOLACAO';
  if (pct >= critico) return 'CRITICO';
  if (pct >= aviso) return 'ATENCAO';
  return 'OK';
}

export function resolveFrmsEffectivenessDashboardNivel(
  pct: number | null | undefined,
  config: ConfigLimites,
): FrmsDashboardNivel {
  if (pct == null) return 'OK';
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct <= vermelho) return 'CRITICO';
  if (pct <= amarelo) return 'ATENCAO';
  if (pct >= verde) return 'OK';
  return 'ATENCAO';
}

export function resolveFrmsDashboardNivelCompleto(params: {
  effectivenessPct: number | null | undefined;
  maxCompliancePct: number;
  alertNivel?: string | null;
  config: ConfigLimites;
}): FrmsDashboardNivel {
  const complianceNivel = resolveFrmsComplianceDashboardNivel(
    params.maxCompliancePct,
    params.config,
  );
  const effectivenessNivel = resolveFrmsEffectivenessDashboardNivel(
    params.effectivenessPct,
    params.config,
  );
  const regulatoryNivel = normalizeFrmsAlertNivel(params.alertNivel);

  const complianceWeight = getFrmsNivelWeight(complianceNivel);
  const effectivenessWeight = getFrmsNivelWeight(effectivenessNivel);
  const regulatoryWeight = getFrmsNivelWeight(regulatoryNivel);

  if (regulatoryWeight >= complianceWeight && regulatoryWeight >= effectivenessWeight) {
    return regulatoryNivel;
  }
  if (effectivenessWeight > complianceWeight) return effectivenessNivel;
  return complianceNivel;
}

export function resolveFrmsDashboardNivel(
  pct: number,
  alertNivel?: string | null,
): FrmsDashboardNivel {
  const aviso = 85;
  const critico = 95;
  const violacao = 101;
  let visualNivel: FrmsDashboardNivel = 'OK';
  if (pct >= violacao) visualNivel = 'VIOLACAO';
  else if (pct >= critico) visualNivel = 'CRITICO';
  else if (pct >= aviso) visualNivel = 'ATENCAO';

  const regulatoryNivel = normalizeFrmsAlertNivel(alertNivel);
  return getFrmsNivelWeight(regulatoryNivel) > getFrmsNivelWeight(visualNivel)
    ? regulatoryNivel
    : visualNivel;
}

export function getFrmsNivelWeight(nivel: string): number {
  const order: Record<string, number> = {
    OK: 0,
    AVISO: 1,
    ATENCAO: 1,
    CRITICO: 2,
    VIOLACAO: 3,
  };
  return order[nivel] ?? 0;
}

// ============================================================
// UTILIDADES DE DATA / MÊS / PERÍODO
// ============================================================

export function toMonthKey(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

export function toDateKeyLocal(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function monthLabel(mesRef: string): string {
  const [ano, mes] = mesRef.split('-').map(Number);
  const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonthKey(mesRef: string, delta: number): string {
  const [ano, mes] = mesRef.split('-').map(Number);
  return toMonthKey(new Date(ano, mes - 1 + delta, 1));
}

export function getMonthRange(mesRef: string): {
  start: string;
  end: string;
  daysInMonth: number;
} {
  const [ano, mes] = mesRef.split('-').map(Number);
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const mesPad = String(mes).padStart(2, '0');
  return {
    start: `${ano}-${mesPad}-01`,
    end: `${ano}-${mesPad}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  };
}

export function getRollingRange(periodoNumDias: number): { start: string; end: string } {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - (periodoNumDias - 1));
  return {
    start: toDateKeyLocal(startDate),
    end: toDateKeyLocal(endDate),
  };
}

export function getMonthDays(mesRef: string): string[] {
  const { start, daysInMonth } = getMonthRange(mesRef);
  const [ano, mes] = start.split('-').map(Number);
  return Array.from({ length: daysInMonth }, (_, index) => {
    return toDateKeyLocal(new Date(ano, mes - 1, index + 1));
  });
}
