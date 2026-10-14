/**
 * Gate de despacho operacional: traduz o snapshot FRMS já existente
 * (`lib/frms/operational-snapshot.ts` + `lib/frms/frms-operational-decision.ts`)
 * em um estado único por tripulante/voo que a Coordenação consegue agir sem
 * interpretar métricas técnicas.
 *
 * Utilizado no painel consultivo de FRMS; seus alertas nunca impedem a
 * transição de voo. A Coordenação decide conforme os procedimentos aplicáveis.
 *
 * Deliberadamente um serviço separado de `routes/controle-voos.ts`, que
 * mantém um guard de arquitetura proibindo referências a FRMS/MRO/etc — ver
 * `nao referencia dominios externos fora do escopo da fase` em
 * `__tests__/routes/controle-voos.test.ts`.
 */
import type { D1Database } from '@cloudflare/workers-types';
import {
  listFrmsOperationalSnapshot,
  type FrmsOperationalSnapshotItem,
} from '../../lib/frms/operational-snapshot';
import type { FrmsFortnightStatus } from '../../lib/frms/fortnight-indicator';
import type { FrmsDecisaoOperacionalEstado } from '../../lib/frms/frms-operational-decision';

export type DispatchReadinessStatus = 'LIBERAVEL' | 'ATENCAO_COORDENACAO' | 'NAO_LIBERADO';

export type DispatchFadigaNivel = 'NORMAL' | 'ATENCAO' | 'CRITICO' | 'INDISPONIVEL';

export type DispatchCheckinStatus = 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL' | 'INDISPONIVEL';

export type DispatchGateReasonCode =
  | 'TRIPULACAO_AUSENTE'
  | 'CHECKIN_DIARIO_PENDENTE'
  | 'CHECKIN_INCONSISTENTE'
  | 'DECISAO_FRMS_CRITICA'
  | 'DECISAO_FRMS_MITIGACAO_NECESSARIA'
  | 'DECISAO_FRMS_NAO_AVALIADO'
  | 'FADIGA_ACUMULADA_CRITICA'
  | 'SNAPSHOT_FRMS_AUSENTE'
  | 'SNAPSHOT_FRMS_INCONSISTENTE'
  | 'DECISAO_FRMS_ATENCAO'
  | 'FADIGA_ACUMULADA_ATENCAO'
  | 'DADO_ESTIMADO';

/**
 * Ordem de severidade do alerta consultivo. Nao criar novos limites;
 * reutiliza os estados de `frms-operational-decision.ts` e `fortnight-indicator.ts`.
 */
const REASON_PRIORITY: DispatchGateReasonCode[] = [
  'TRIPULACAO_AUSENTE',
  'CHECKIN_DIARIO_PENDENTE',
  'CHECKIN_INCONSISTENTE',
  'DECISAO_FRMS_CRITICA',
  'DECISAO_FRMS_MITIGACAO_NECESSARIA',
  'DECISAO_FRMS_NAO_AVALIADO',
  'FADIGA_ACUMULADA_CRITICA',
  'SNAPSHOT_FRMS_AUSENTE',
  'SNAPSHOT_FRMS_INCONSISTENTE',
  'DECISAO_FRMS_ATENCAO',
  'FADIGA_ACUMULADA_ATENCAO',
  'DADO_ESTIMADO',
];

/** Ações de coordenação baseadas na causa canônica, sem expor respostas sensíveis. */
const RECOMMENDED_ACTIONS: Readonly<Record<DispatchGateReasonCode, string>> = {
  TRIPULACAO_AUSENTE: 'Cadastrar e confirmar a tripulação na programação do voo.',
  CHECKIN_DIARIO_PENDENTE: 'Solicitar e confirmar o check-in de fadiga diária de cada tripulante.',
  CHECKIN_INCONSISTENTE: 'Conferir a inconsistência do FRMS e registrar a revisão.',
  DECISAO_FRMS_CRITICA: 'Encaminhar o alerta crítico à gestão operacional responsável e seguir o procedimento aplicável.',
  DECISAO_FRMS_MITIGACAO_NECESSARIA: 'Avaliar repouso, redução de demanda ou substituição e registrar a providência.',
  DECISAO_FRMS_NAO_AVALIADO: 'Completar as informações necessárias à análise operacional FRMS.',
  FADIGA_ACUMULADA_CRITICA: 'Revisar o histórico de jornadas e repouso; avaliar recuperação ou substituição.',
  SNAPSHOT_FRMS_AUSENTE: 'Verificar se a avaliação FRMS da tripulação está disponível.',
  SNAPSHOT_FRMS_INCONSISTENTE: 'Confirmar os dados inconsistentes do FRMS.',
  DECISAO_FRMS_ATENCAO: 'Revisar a condição pré-missão e registrar a providência da coordenação.',
  FADIGA_ACUMULADA_ATENCAO: 'Revisar a sequência de jornadas e períodos de recuperação antes da missão.',
  DADO_ESTIMADO: 'Confirmar na fonte os dados estimados antes da decisão operacional.',
};

export const DISPATCH_GATE_HARD_BLOCK_REASONS: ReadonlySet<DispatchGateReasonCode> = new Set([
  'TRIPULACAO_AUSENTE',
  'CHECKIN_DIARIO_PENDENTE',
  'CHECKIN_INCONSISTENTE',
  'DECISAO_FRMS_CRITICA',
  'DECISAO_FRMS_MITIGACAO_NECESSARIA',
  'DECISAO_FRMS_NAO_AVALIADO',
  'FADIGA_ACUMULADA_CRITICA',
  'SNAPSHOT_FRMS_AUSENTE',
  'SNAPSHOT_FRMS_INCONSISTENTE',
]);

export interface DispatchGateCrewMember {
  funcionario_id: number;
  nome: string | null;
  funcao: string | null;
}

/**
 * Avaliação sanitizada por tripulante — nunca carrega KSS, horas de sono,
 * qualidade do sono ou qualquer dado de medicação/álcool. Apenas a
 * consequência operacional (ver README/spec: "grade deve apresentar
 * somente consequência operacional sanitizada").
 */
export interface CrewDispatchAssessment extends DispatchGateCrewMember {
  frms_status: DispatchReadinessStatus;
  checkin_status: DispatchCheckinStatus;
  fadiga_diaria: DispatchFadigaNivel;
  fadiga_acumulada: DispatchFadigaNivel;
  reasons: DispatchGateReasonCode[];
  primary_reason: DispatchGateReasonCode | null;
  recommended_action: string;
  natureza_dado: string | null;
}

export interface FlightDispatchAssessmentAggregate {
  frms_status: DispatchReadinessStatus;
  frms_primary_reason: DispatchGateReasonCode | null;
  can_release: boolean;
}

export interface FlightDispatchAssessment extends FlightDispatchAssessmentAggregate {
  voo_id: number;
  data_operacional: string;
  evaluated_at: string;
  crew: CrewDispatchAssessment[];
}

function mapEstadoToFadigaNivel(
  estado: FrmsDecisaoOperacionalEstado | undefined,
): DispatchFadigaNivel {
  switch (estado) {
    case 'NORMAL':
      return 'NORMAL';
    case 'ATENCAO':
      return 'ATENCAO';
    case 'MITIGACAO_NECESSARIA':
    case 'CRITICO_VIOLACAO':
      return 'CRITICO';
    default:
      return 'INDISPONIVEL';
  }
}

function mapQuinzenaToFadigaNivel(status: FrmsFortnightStatus | undefined): DispatchFadigaNivel {
  switch (status) {
    case 'OK':
      return 'NORMAL';
    case 'ATENCAO':
      return 'ATENCAO';
    case 'CRITICO':
      return 'CRITICO';
    default:
      return 'INDISPONIVEL';
  }
}

function pickPrimaryReason(reasons: DispatchGateReasonCode[]): DispatchGateReasonCode | null {
  for (const code of REASON_PRIORITY) {
    if (reasons.includes(code)) return code;
  }
  return null;
}

/**
 * Pura: deriva o estado operacional de UM tripulante a partir do item de
 * snapshot já calculado (ou `undefined` se o tripulante nao aparece no
 * snapshot da data — fail-closed, nunca vira verde).
 */
export function deriveCrewDispatchAssessment(
  crewMember: DispatchGateCrewMember,
  item: FrmsOperationalSnapshotItem | undefined,
): CrewDispatchAssessment {
  const reasons = new Set<DispatchGateReasonCode>();

  if (!item) {
    reasons.add('SNAPSHOT_FRMS_AUSENTE');
  } else {
    // Toda tripulação designada para um voo exige check-in RECEBIDO na data operacional.
    // NAO_APLICAVEL e estados desconhecidos não equivalem a avaliação preenchida.
    if (item.checkin_status !== 'RECEBIDO') {
      reasons.add('CHECKIN_DIARIO_PENDENTE');
    }
    if (item.alertas.includes('DADO_INCONSISTENTE') || item.jornada_data_source === 'INCONSISTENTE') {
      reasons.add('CHECKIN_INCONSISTENTE');
    }
    if (item.snapshot_status === 'INCOMPLETO') {
      reasons.add('SNAPSHOT_FRMS_INCONSISTENTE');
    }
    if (item.estado_operacional === 'CRITICO_VIOLACAO') reasons.add('DECISAO_FRMS_CRITICA');
    if (item.estado_operacional === 'MITIGACAO_NECESSARIA') {
      reasons.add('DECISAO_FRMS_MITIGACAO_NECESSARIA');
    }
    if (item.estado_operacional === 'NAO_AVALIADO') reasons.add('DECISAO_FRMS_NAO_AVALIADO');
    if (item.estado_operacional === 'ATENCAO') reasons.add('DECISAO_FRMS_ATENCAO');

    const quinzenaStatus = item.fortnight_indicator?.status_quinzena;
    if (quinzenaStatus === 'CRITICO') reasons.add('FADIGA_ACUMULADA_CRITICA');
    else if (quinzenaStatus === 'ATENCAO') reasons.add('FADIGA_ACUMULADA_ATENCAO');

    if (
      item.sleep_data_source === 'ESTIMADO' ||
      item.wake_data_source === 'ESTIMADO' ||
      item.jornada_data_source === 'ESTIMADO'
    ) {
      reasons.add('DADO_ESTIMADO');
    }
  }

  const reasonList = REASON_PRIORITY.filter((code) => reasons.has(code));
  const hasHardBlock = reasonList.some((code) => DISPATCH_GATE_HARD_BLOCK_REASONS.has(code));
  const frms_status: DispatchReadinessStatus = hasHardBlock
    ? 'NAO_LIBERADO'
    : reasonList.length > 0
      ? 'ATENCAO_COORDENACAO'
      : 'LIBERAVEL';

  return {
    funcionario_id: crewMember.funcionario_id,
    nome: crewMember.nome,
    funcao: crewMember.funcao,
    frms_status,
    checkin_status: item?.checkin_status ?? 'INDISPONIVEL',
    fadiga_diaria: mapEstadoToFadigaNivel(item?.estado_operacional),
    fadiga_acumulada: mapQuinzenaToFadigaNivel(item?.fortnight_indicator?.status_quinzena),
    reasons: reasonList,
    primary_reason: pickPrimaryReason(reasonList),
    recommended_action: RECOMMENDED_ACTIONS[pickPrimaryReason(reasonList)!] ?? 'Sem pendência FRMS identificada; seguir verificações operacionais usuais.',
    natureza_dado: item?.natureza_dado ?? null,
  };
}

/**
 * Pura: agrega os alertas da tripulacao. `can_release` preserva o contrato
 * legado, mas o FRMS nao interfere na transicao operacional.
 */
export function aggregateFlightDispatchAssessment(
  crew: CrewDispatchAssessment[],
): FlightDispatchAssessmentAggregate {
  if (crew.length === 0) {
    return {
      frms_status: 'NAO_LIBERADO',
      frms_primary_reason: 'TRIPULACAO_AUSENTE',
      can_release: true,
    };
  }

  const anyBlocked = crew.some((member) => member.frms_status === 'NAO_LIBERADO');
  const anyAttention = crew.some((member) => member.frms_status === 'ATENCAO_COORDENACAO');

  const frms_status: DispatchReadinessStatus = anyBlocked
    ? 'NAO_LIBERADO'
    : anyAttention
      ? 'ATENCAO_COORDENACAO'
      : 'LIBERAVEL';

  const relevantMembers = anyBlocked
    ? crew.filter((member) => member.frms_status === 'NAO_LIBERADO')
    : anyAttention
      ? crew.filter((member) => member.frms_status === 'ATENCAO_COORDENACAO')
      : [];

  const frms_primary_reason = pickPrimaryReason(
    relevantMembers.flatMap((member) => member.reasons),
  );

  // FRMS e consultivo: o estado alerta nao veta a operacao. Outras regras
  // de liberacao permanecem sob o handler canonico de Controle de Voos.
  return { frms_status, frms_primary_reason, can_release: true };
}

/** Tripulação real do voo (Controle de Voos), tenant-scoped. */
export async function loadFlightCrewForDispatchGate(
  db: D1Database,
  empresaId: number,
  vooId: number,
): Promise<DispatchGateCrewMember[]> {
  const result = await db
    .prepare(
      `SELECT t.funcionario_id AS funcionario_id, t.funcao AS funcao, f.nome AS nome
       FROM cv_voo_tripulantes t
       JOIN funcionarios f ON f.id = t.funcionario_id AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL
       WHERE t.voo_id = ? AND t.empresa_id = ? AND t.deleted_at IS NULL`,
    )
    .bind(vooId, empresaId)
    .all<{ funcionario_id: number; funcao: string | null; nome: string | null }>();

  return (result.results || []).map((row) => ({
    funcionario_id: Number(row.funcionario_id),
    nome: row.nome,
    funcao: row.funcao,
  }));
}

export interface DispatchGateSnapshotIndex {
  itemsByFuncionario: Map<number, FrmsOperationalSnapshotItem>;
}

/**
 * Snapshot FRMS em lote para UMA data operacional (todo o tenant). Reusar
 * o mesmo índice entre vários voos da mesma data evita repetir a mesma
 * consulta em lote por voo (N+1 no nível de "voo", não no nível de linha).
 */
export async function loadDispatchGateSnapshotIndex(
  db: D1Database,
  empresaId: number,
  dataOperacional: string,
): Promise<DispatchGateSnapshotIndex> {
  const result = await listFrmsOperationalSnapshot(db, {
    empresaId,
    dataInicio: dataOperacional,
    dataFim: dataOperacional,
  });

  const itemsByFuncionario = new Map<number, FrmsOperationalSnapshotItem>();
  for (const item of result.items) {
    if (item.data_operacional === dataOperacional) {
      itemsByFuncionario.set(item.funcionario_id, item);
    }
  }
  return { itemsByFuncionario };
}

export async function assessFlightDispatchGate(
  db: D1Database,
  empresaId: number,
  vooId: number,
  dataOperacional: string,
  snapshotIndex?: DispatchGateSnapshotIndex,
): Promise<FlightDispatchAssessment> {
  const [crew, index] = await Promise.all([
    loadFlightCrewForDispatchGate(db, empresaId, vooId),
    snapshotIndex ?? loadDispatchGateSnapshotIndex(db, empresaId, dataOperacional),
  ]);

  const crewAssessments = crew.map((member) =>
    deriveCrewDispatchAssessment(member, index.itemsByFuncionario.get(member.funcionario_id)),
  );
  const aggregate = aggregateFlightDispatchAssessment(crewAssessments);

  return {
    voo_id: vooId,
    data_operacional: dataOperacional,
    evaluated_at: new Date().toISOString(),
    crew: crewAssessments,
    ...aggregate,
  };
}
