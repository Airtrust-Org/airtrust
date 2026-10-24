/**
 * BOA/CBMMG — synthetic-only methodological walkthrough for tender POC.
 *
 * This is a structured EVIDENCE triage, not a biomathematical fatigue model,
 * clinical recommendation, medical diagnosis or permission to fly.
 * Nothing here inherits Costa do Sol offshore limits, weights, or coefficients.
 */
import { z } from 'zod';

export const BombeirosScenarioSchema = z.object({
  mode: z.literal('SYNTHETIC'),
  mission_type: z.enum([
    'RESGATE', 'SALVAMENTO', 'TRANSPORTE_AEROMEDICO',
    'COMBATE_AEREO_INCENDIO', 'TREINAMENTO', 'OUTRA',
  ]),
  duty_period: z.enum(['DIURNO', 'NOTURNO', 'MISTO', 'DESCONHECIDO']),
  standby_activation: z.boolean().nullable(),
  critical_mission: z.boolean().nullable(),
  sleep_hours_24h: z.number().min(0).max(24).nullable(),
  sleep_fragmented: z.boolean().nullable(),
  kss_reported: z.number().int().min(1).max(9).nullable(),
  pvt_60s_completed: z.boolean().nullable(),
  self_declared_unfit: z.boolean().nullable(),
}).strict();
export type BombeirosScenario = z.infer<typeof BombeirosScenarioSchema>;

export interface BombeirosScenarioAssessment {
  method_version: 'BOA_SYNTHETIC_EVIDENCE_TRIAGE_V1';
  status: 'INCOMPLETE_EVIDENCE' | 'HUMAN_REVIEW_REQUIRED';
  dispatch_permission: 'NOT_GRANTED';
  persisted: false;
  evidence: Array<{
    factor: string;
    source: 'SYNTHETIC_SCENARIO';
    state: 'PRESENT' | 'MISSING';
    description: string;
  }>;
  actions: string[];
  references: string[];
  limitations: string[];
}

/**
 * Do not use numeric scores or thresholds to declare risk or fitness.
 * Missing records stay missing; an unfit declaration always requires urgent
 * human handling, regardless of any other apparently normal evidence.
 */
export function assessBombeirosSyntheticScenario(input: BombeirosScenario): BombeirosScenarioAssessment {
  const scenario = BombeirosScenarioSchema.parse(input);
  const evidence: BombeirosScenarioAssessment['evidence'] = [
    { factor: 'MISSION_CONTEXT', source: 'SYNTHETIC_SCENARIO', state: 'PRESENT',
      description: 'Tipo de missão aeronáutica documentado para contextualizar exposição.' },
    { factor: 'DUTY_PERIOD', source: 'SYNTHETIC_SCENARIO',
      state: scenario.duty_period === 'DESCONHECIDO' ? 'MISSING' : 'PRESENT',
      description: 'Período diurno/noturno ou misto, sem inferência sobre duração real.' },
    { factor: 'STANDBY_ACTIVATION', source: 'SYNTHETIC_SCENARIO',
      state: scenario.standby_activation === null ? 'MISSING' : 'PRESENT',
      description: 'Acionamento de sobreaviso e possível interrupção da recuperação.' },
    { factor: 'CRITICAL_MISSION', source: 'SYNTHETIC_SCENARIO',
      state: scenario.critical_mission === null ? 'MISSING' : 'PRESENT',
      description: 'Intensidade contextual declarada, sem limiar clínico.' },
    { factor: 'SLEEP_24H', source: 'SYNTHETIC_SCENARIO',
      state: scenario.sleep_hours_24h === null ? 'MISSING' : 'PRESENT',
      description: 'Horas de sono relatadas em 24h; autorrelato não mede recuperação fisiológica.' },
    { factor: 'SLEEP_FRAGMENTATION', source: 'SYNTHETIC_SCENARIO',
      state: scenario.sleep_fragmented === null ? 'MISSING' : 'PRESENT',
      description: 'Continuidade/fragmentação do sono, como fator contextual.' },
    { factor: 'KSS_SUBJECTIVE_SLEEPINESS', source: 'SYNTHETIC_SCENARIO',
      state: scenario.kss_reported === null ? 'MISSING' : 'PRESENT',
      description: 'KSS 1–9: escala subjetiva; não constitui diagnóstico ou aptidão isolada.' },
    { factor: 'PVT_60S_ADAPTED', source: 'SYNTHETIC_SCENARIO',
      state: scenario.pvt_60s_completed === null ? 'MISSING' : 'PRESENT',
      description: 'Registro de realização da adaptação local de 60s; não valida equivalência a testes PVT padronizados.' },
    { factor: 'SELF_DECLARED_FITNESS', source: 'SYNTHETIC_SCENARIO',
      state: scenario.self_declared_unfit === null ? 'MISSING' : 'PRESENT',
      description: 'Declaração de impossibilidade de serviço deve ser tratada por responsável habilitado.' },
  ];
  const incomplete = evidence.some(item => item.state === 'MISSING')
    || scenario.pvt_60s_completed === false;
  const actions = ['Submeter evidências e missão a responsável FRMS/coordenação operacional antes de qualquer decisão de despacho.'];
  if (scenario.self_declared_unfit === true) {
    actions.unshift('Declaração de não aptidão: impedir liberação automática e encaminhar imediatamente para avaliação humana competente.');
  }
  if (scenario.duty_period === 'NOTURNO' || scenario.duty_period === 'MISTO'
    || scenario.standby_activation || scenario.sleep_fragmented || scenario.critical_mission) {
    actions.push('Revisar carga e sequência de missões, escala, acionamento, oportunidades de repouso e opções de mitigação.');
  }
  if (incomplete) actions.push('Completar evidências ausentes sem preencher lacunas por suposição ou classificá-las como normais.');
  return {
    method_version: 'BOA_SYNTHETIC_EVIDENCE_TRIAGE_V1',
    status: incomplete ? 'INCOMPLETE_EVIDENCE' : 'HUMAN_REVIEW_REQUIRED',
    dispatch_permission: 'NOT_GRANTED',
    persisted: false,
    evidence, actions,
    references: [
      'Escala de Sonolência de Karolinska (KSS): autorrelato, não diagnóstico.',
      'Testes de Vigilância Psicomotora (PVT): aplicação local de 60 segundos requer validação própria.',
      'Procedimento FRMS BOA: enquadramento de limites/decisões ainda pendente de aprovação técnica.',
    ],
    limitations: [
      'Cenário 100% sintético e não registrado; nenhuma informação pessoal deve ser enviada.',
      'Não há score científico BOA aprovado, exposição contínua medida, prova de conclusão ou liberação de voo.',
      'Não reproduz a operação Costa do Sol nem estabelece limites técnicos/regulatórios offshore.',
      'Necessita de registro auditável, responsável, intervenção e verificação de eficácia para satisfazer o edital.',
    ],
  };
}
