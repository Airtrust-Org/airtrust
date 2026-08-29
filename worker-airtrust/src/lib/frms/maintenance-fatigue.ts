export type MaintenanceFatigueRisk = 'normal' | 'attention' | 'critical' | 'unfit_for_duty';

export type MaintenanceFatigueInput = {
  sleepHours24h: number;
  sleepQuality: number;
  kssScore: number;
  fitForDuty: boolean;
};

export type MaintenanceFatigueAssessment = {
  riskLevel: MaintenanceFatigueRisk;
  score: number;
  fatigueLevel: 'VERDE' | 'AMARELO' | 'VERMELHO';
  operationalStatus: 'APTO' | 'APTO_COM_RESSALVA' | 'RESTRITO' | 'NAO_APTO';
  requiresOperationalReview: 0 | 1;
  reasons: string[];
  recommendation: string;
  scoringVersion: 'maintenance-rules-v1';
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function assessMaintenanceFatigue(input: MaintenanceFatigueInput): MaintenanceFatigueAssessment {
  const sleepHours24h = clamp(Number(input.sleepHours24h), 0, 24);
  const sleepQuality = clamp(Math.round(Number(input.sleepQuality)), 1, 5);
  const kssScore = clamp(Math.round(Number(input.kssScore)), 1, 9);

  const reasons: string[] = [];
  if (sleepHours24h < 4) reasons.push('Sono nas últimas 24 h inferior a 4 h.');
  else if (sleepHours24h < 6) reasons.push('Sono nas últimas 24 h inferior a 6 h.');
  if (sleepQuality <= 2) reasons.push('Qualidade de sono baixa.');
  if (kssScore >= 8) reasons.push('Sonolência KSS elevada (8–9).');
  else if (kssScore >= 7) reasons.push('Sonolência KSS em faixa de atenção (7).');
  if (!input.fitForDuty) reasons.push('Profissional declarou não se sentir em condição segura para iniciar a jornada.');

  let riskLevel: MaintenanceFatigueRisk = 'normal';
  if (!input.fitForDuty) riskLevel = 'unfit_for_duty';
  else if (sleepHours24h < 4 || kssScore >= 8) riskLevel = 'critical';
  else if (sleepHours24h < 6 || kssScore >= 7 || sleepQuality <= 2) riskLevel = 'attention';

  // Escore operacional explicável, sem pretensão de modelo biomatemático validado.
  // O nível decisório acima é governado pelos limiares explícitos; o escore serve
  // para ordenação/tendência e não substitui a avaliação humana.
  const sleepPenalty = clamp(((8 - sleepHours24h) / 8) * 45, 0, 45);
  const kssPenalty = clamp(((kssScore - 1) / 8) * 40, 0, 40);
  const qualityPenalty = clamp(((5 - sleepQuality) / 4) * 15, 0, 15);
  const score = Math.round(clamp(sleepPenalty + kssPenalty + qualityPenalty, 0, 100));

  if (riskLevel === 'unfit_for_duty') {
    return {
      riskLevel,
      score: Math.max(score, 80),
      fatigueLevel: 'VERMELHO',
      operationalStatus: 'NAO_APTO',
      requiresOperationalReview: 1,
      reasons,
      recommendation: 'Revisão imediata pela gestão de manutenção antes de qualquer atividade operacional.',
      scoringVersion: 'maintenance-rules-v1',
    };
  }

  if (riskLevel === 'critical') {
    return {
      riskLevel,
      score: Math.max(score, 70),
      fatigueLevel: 'VERMELHO',
      operationalStatus: 'RESTRITO',
      requiresOperationalReview: 1,
      reasons,
      recommendation: 'Revisão imediata antes de atividade crítica, inspeção ou liberação de manutenção.',
      scoringVersion: 'maintenance-rules-v1',
    };
  }

  if (riskLevel === 'attention') {
    return {
      riskLevel,
      score: Math.max(score, 40),
      fatigueLevel: 'AMARELO',
      operationalStatus: 'APTO_COM_RESSALVA',
      requiresOperationalReview: 1,
      reasons,
      recommendation: 'Revisar fadiga e criticidade da tarefa; considerar pausa, redistribuição, supervisão ou inspeção independente.',
      scoringVersion: 'maintenance-rules-v1',
    };
  }

  return {
    riskLevel,
    score,
    fatigueLevel: 'VERDE',
    operationalStatus: 'APTO',
    requiresOperationalReview: 0,
    reasons,
    recommendation: 'Sem ação imediata; manter monitoramento normal da jornada.',
    scoringVersion: 'maintenance-rules-v1',
  };
}
