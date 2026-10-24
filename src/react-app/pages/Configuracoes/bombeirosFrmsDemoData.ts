/**
 * Cenários didáticos inteiramente sintéticos. Não integram D1, snapshots,
 * certificações, cálculos regulatórios nem gates operacionais de qualquer tenant.
 * Exclusivos da prévia de administração da plataforma em staging.
 */
export type BombeirosFrmsScenario = {
  id: string;
  nome: string;
  funcao: string;
  missao: string;
  base: string;
  apresentacao: string;
  sonoHoras: number | null;
  kss: number | null;
  checkin: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE';
  accumulated: 'SEM_ALERTA' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
  estado: 'EM_ANALISE' | 'PENDENTE_CHECKIN' | 'CRITICO' | 'SEM_ALERTA';
  motivo: string;
  providencia: string;
  responsavel: string;
};

export const BOMBEIROS_DEMO_COMPANY = Object.freeze({
  nome: 'Bombeiros',
  codigo: 'bombeiros',
  maxFuncionarios: 130,
  ativo: false,
  modulosAtivos: [] as readonly string[],
  natureza: 'DEMONSTRACAO_SEM_PERSISTENCIA',
});

/** Only platform-admin workspace at the exact staging origin may open the preview. */
export function mayPreviewBombeirosFrmsDemo(
  isAdmin: boolean,
  currentEmpresaCodigo: string | null | undefined,
  hostname: string,
): boolean {
  return isAdmin
    && currentEmpresaCodigo === 'airtrust'
    && ['staging.airtrust.pages.dev', 'localhost', '127.0.0.1'].includes(hostname);
}

export const BOMBEIROS_FRMS_SCENARIOS: readonly BombeirosFrmsScenario[] = [
  {
    id: 'QA-BOM-001', nome: 'QA Ana Resgate', funcao: 'Piloto em comando',
    missao: 'Resgate aeromédico', base: 'Base A', apresentacao: '07:00',
    sonoHoras: 7.5, kss: 3, checkin: 'RECEBIDO',
    accumulated: 'SEM_ALERTA', estado: 'SEM_ALERTA',
    motivo: 'Check-in recebido e nenhum alerta no cenário fictício.',
    providencia: 'Conferir os demais requisitos reais da missão antes de decidir.',
    responsavel: 'Coordenação de voo',
  },
  {
    id: 'QA-BOM-002', nome: 'QA Bruno Salvamento', funcao: 'Copiloto',
    missao: 'Busca e salvamento', base: 'Base A', apresentacao: '07:00',
    sonoHoras: null, kss: null, checkin: 'PENDENTE',
    accumulated: 'INCOMPLETO', estado: 'PENDENTE_CHECKIN',
    motivo: 'Avaliação diária não recebida. Dados ausentes não significam risco baixo.',
    providencia: 'Solicitar check-in e manter liberação operacional bloqueada.',
    responsavel: 'Coordenação de voo',
  },
  {
    id: 'QA-BOM-003', nome: 'QA Carla Guincho', funcao: 'Operadora de guincho',
    missao: 'Resgate em área remota', base: 'Base B', apresentacao: '05:30',
    sonoHoras: 4, kss: 7, checkin: 'RECEBIDO',
    accumulated: 'ATENCAO', estado: 'EM_ANALISE',
    motivo: 'Sono declarado curto e sonolência elevada no exemplo.',
    providencia: 'Revisar missão, repouso e substituição com gestor responsável.',
    responsavel: 'Gestor FRMS',
  },
  {
    id: 'QA-BOM-004', nome: 'QA Diego Aerotático', funcao: 'Operador aerotático',
    missao: 'Combate aéreo a incêndio', base: 'Base B', apresentacao: '06:00',
    sonoHoras: 5, kss: 6, checkin: 'RECEBIDO',
    accumulated: 'CRITICO', estado: 'CRITICO',
    motivo: 'Acúmulo de acionamentos e recuperação insuficiente no cenário didático.',
    providencia: 'Não recomendar liberação; revisar escala, descanso e substituição.',
    responsavel: 'Gestor operacional',
  },
  {
    id: 'QA-BOM-005', nome: 'QA Elisa Médica', funcao: 'Médica de bordo',
    missao: 'Transporte aeromédico', base: 'Base A', apresentacao: '13:00',
    sonoHoras: null, kss: null, checkin: 'AUSENTE',
    accumulated: 'INCOMPLETO', estado: 'PENDENTE_CHECKIN',
    motivo: 'Check-in não localizado; nenhuma aptidão presumida.',
    providencia: 'Obter avaliação válida antes da decisão da tripulação.',
    responsavel: 'Coordenação de voo',
  },
] as const;

export function bombeirosDemoSummary(scenarios: readonly BombeirosFrmsScenario[] = BOMBEIROS_FRMS_SCENARIOS) {
  return {
    total: scenarios.length,
    recebidos: scenarios.filter(x => x.checkin === 'RECEBIDO').length,
    semCheckin: scenarios.filter(x => x.checkin !== 'RECEBIDO').length,
    criticos: scenarios.filter(x => x.estado === 'CRITICO').length,
    revisao: scenarios.filter(x => x.estado === 'EM_ANALISE').length,
  };
}

export function bombeirosDemoCrewCanBeReleased(scenarios: readonly BombeirosFrmsScenario[]): boolean {
  // Simulação didática; NUNCA substituir o serviço real de despacho.
  return scenarios.length > 0 && scenarios.every(x =>
    x.checkin === 'RECEBIDO' && x.estado === 'SEM_ALERTA' && x.accumulated === 'SEM_ALERTA');
}
