import { nameSimulatorPlanningClasses } from './cae-planning-class-name';

export type SimulatorTrainingSessionNeed = {
  need_id: string;
  employee_id: number;
  employee_name: string;
  employee_role: string | null;
  qualification_type_id: number;
  qualification_code: string | null;
  qualification_name: string;
  expiry_date: string;
  equipment: string;
  session_model_id: number;
  session_code: string;
  session_name: string;
  session_order: number;
  duration_minutes: number;
  training_session_count: number;
  curriculum_cycle?: number | null;
  curriculum_reference_year?: number | null;
  training_program_id?: number | null;
  training_program_type?: string | null;
  training_program_name?: string | null;
  requirement_qualification_type_id?: number | null;
  requirement_qualification_code?: string | null;
  requirement_qualification_name?: string | null;
  coverage_reason?: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL' | null;
  satisfies_qualification_type_ids?: number[];
};

export type SimulatorTrainingSessionBlock = {
  block_id: string;
  equipment: string;
  duration_minutes: number;
  target_date: string;
  pairing: 'MESMO_TREINAMENTO' | 'TREINAMENTOS_COMPATIVEIS' | 'APOIO_SEM_RENOVACAO' | 'SEM_DUPLA';
  sessions: SimulatorTrainingSessionNeed[];
  support?: Pick<SimulatorTrainingSessionNeed, 'employee_id' | 'employee_name' | 'employee_role'>;
};

export type SimulatorTrainingClass = {
  class_id: string;
  class_name: string;
  equipment: string;
  reference_date: string;
  blocks: SimulatorTrainingSessionBlock[];
};

export type SimulatorTrainingPairEligibility = (
  primary: SimulatorTrainingSessionNeed,
  partner: SimulatorTrainingSessionNeed,
) => boolean;

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function roleKind(value: string | null): 'PIC' | 'SIC' | 'OTHER' {
  const role = normalizeText(value);
  if (role.includes('COMANDANTE') || role === 'PIC' || role.startsWith('PIC_')) return 'PIC';
  if (role.includes('COPILOTO') || role === 'SIC' || role.startsWith('SIC_')) return 'SIC';
  return 'OTHER';
}

function daysDistance(left: string, right: string): number {
  return Math.abs(
    Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000),
  );
}

function isRecurrentFlightTraining(session: SimulatorTrainingSessionNeed): boolean {
  const identity = normalizeText(
    `${session.qualification_code || ''} ${session.qualification_name}`,
  );
  return (
    identity.includes('CURRICULO DE VOO') ||
    identity.includes('PERIODICO') ||
    identity.includes('SEMESTRAL') ||
    /(^|\s)G\d(?:-SEM)?($|\s)/.test(identity)
  );
}

function requirementQualificationTypeId(session: SimulatorTrainingSessionNeed): number {
  const requirement = Number(session.requirement_qualification_type_id);
  return Number.isInteger(requirement) && requirement > 0
    ? requirement
    : Number(session.qualification_type_id);
}

/**
 * Compartilhamento cruzado é deliberadamente conservador nesta camada:
 * mesmo equipamento, mesma duração e mesma posição curricular. O conteúdo
 * continua individual por tripulante, inclusive quando um cumpre Periódico
 * e o outro Semestral.
 */
export function canShareSimulatorTrainingSessions(
  left: SimulatorTrainingSessionNeed,
  right: SimulatorTrainingSessionNeed,
): boolean {
  if (left.employee_id === right.employee_id) return false;
  if (left.equipment !== right.equipment) return false;
  if (left.duration_minutes !== right.duration_minutes) return false;
  if (left.session_order !== right.session_order) return false;
  if (left.qualification_type_id === right.qualification_type_id) return true;
  return isRecurrentFlightTraining(left) && isRecurrentFlightTraining(right);
}

/**
 * Manual session reassignment may deliberately combine different curriculum
 * positions. It remains fail-closed on crew identity, equipment, duration and
 * recurrent-flight compatibility. Automatic pairing stays stricter and still
 * prefers the same session position through canShareSimulatorTrainingSessions.
 */
export function canManuallyShareSimulatorTrainingSessions(
  left: SimulatorTrainingSessionNeed,
  right: SimulatorTrainingSessionNeed,
): boolean {
  if (left.employee_id === right.employee_id) return false;
  if (left.equipment !== right.equipment) return false;
  if (left.duration_minutes !== right.duration_minutes) return false;
  if (left.qualification_type_id === right.qualification_type_id) return true;
  return isRecurrentFlightTraining(left) && isRecurrentFlightTraining(right);
}

function partnerScore(
  primary: SimulatorTrainingSessionNeed,
  partner: SimulatorTrainingSessionNeed,
): number[] {
  const sameTraining = primary.qualification_type_id === partner.qualification_type_id;
  const sameRequirement =
    requirementQualificationTypeId(primary) === requirementQualificationTypeId(partner);
  const sameModel = primary.session_model_id === partner.session_model_id;
  const complementaryRole =
    (roleKind(primary.employee_role) === 'PIC' && roleKind(partner.employee_role) === 'SIC') ||
    (roleKind(primary.employee_role) === 'SIC' && roleKind(partner.employee_role) === 'PIC');
  const distance = daysDistance(primary.expiry_date, partner.expiry_date);
  return [
    // Prefer proximity over a perfect curricular match many weeks ahead.
    // This is a preference, not a new regulatory validity window.
    distance > 60 ? 1 : 0,
    sameTraining ? 0 : 1,
    sameRequirement ? 0 : 1,
    sameModel ? 0 : 1,
    distance,
    // Two commanders or two copilots are allowed; role is only a tie-breaker.
    complementaryRole ? 0 : 1,
    partner.employee_id,
  ];
}

function compareTuple(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a - b;
  }
  return 0;
}

function normalizeTrainingSessionCounts(
  needs: SimulatorTrainingSessionNeed[],
): SimulatorTrainingSessionNeed[] {
  const totalByTraining = new Map<string, number>();
  for (const need of needs) {
    const key = `${need.employee_id}:${need.qualification_type_id}`;
    totalByTraining.set(
      key,
      Math.max(
        totalByTraining.get(key) || 0,
        Number(need.training_session_count || 0),
        Number(need.session_order || 0),
      ),
    );
  }
  return needs.map((need) => ({
    ...need,
    training_session_count:
      totalByTraining.get(`${need.employee_id}:${need.qualification_type_id}`) ||
      need.training_session_count,
  }));
}

/**
 * Forma blocos de sessão, não duplas fixas de treinamento. Assim um piloto
 * pode cumprir S1 com uma pessoa e S2 com outra; Periódico e Semestral podem
 * compartilhar quando as sessões forem compatíveis.
 *
 * Quando há mais de um candidato estruturalmente compatível, a necessidade
 * original do treinamento é critério operacional antes do desempate técnico.
 * Assim dois pilotos que realmente precisam do mesmo Periódico são pareados
 * antes de um terceiro que só foi elevado do Semestral para aproveitar o
 * Periódico. employee_id só estabiliza um empate operacional verdadeiro.
 *
 * pairEligibility é uma restrição operacional adicional (por exemplo, Escala
 * 1/2). Ela nunca amplia compatibilidade curricular: somente pode eliminar
 * uma dupla que já seria estruturalmente válida.
 */
export function pairSimulatorTrainingSessions(
  needs: SimulatorTrainingSessionNeed[],
  maxAnticipationDays: number,
  allowCrossTraining = true,
  pairEligibility?: SimulatorTrainingPairEligibility,
): SimulatorTrainingSessionBlock[] {
  const remaining = normalizeTrainingSessionCounts(needs).sort(
    (a, b) =>
      a.expiry_date.localeCompare(b.expiry_date) ||
      a.session_order - b.session_order ||
      a.employee_id - b.employee_id ||
      a.need_id.localeCompare(b.need_id),
  );
  const blocks: SimulatorTrainingSessionBlock[] = [];
  const priorPartners = new Map<string, number>();
  const partnershipKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join(':');
  const pairAllowed = (left: SimulatorTrainingSessionNeed, right: SimulatorTrainingSessionNeed) => {
    const [earlier, later] = [left, right].sort(
      (a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.need_id.localeCompare(b.need_id),
    );
    return (
      (allowCrossTraining || earlier.qualification_type_id === later.qualification_type_id) &&
      canShareSimulatorTrainingSessions(earlier, later) &&
      daysDistance(earlier.expiry_date, later.expiry_date) <= Math.max(0, maxAnticipationDays) &&
      (!pairEligibility || pairEligibility(earlier, later))
    );
  };
  const createPairBlock = (
    left: SimulatorTrainingSessionNeed,
    right: SimulatorTrainingSessionNeed,
  ): SimulatorTrainingSessionBlock => {
    const sessions = [left, right].sort(
      (a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.need_id.localeCompare(b.need_id),
    );
    return {
      block_id: sessions.map((session) => session.need_id).sort().join('+'),
      equipment: sessions[0].equipment,
      duration_minutes: sessions[0].duration_minutes,
      target_date: sessions[0].expiry_date,
      pairing: sessions[0].qualification_type_id === sessions[1].qualification_type_id
        ? 'MESMO_TREINAMENTO'
        : 'TREINAMENTOS_COMPATIVEIS',
      sessions,
    };
  };

  while (remaining.length > 0) {
    const primary = remaining.shift() as SimulatorTrainingSessionNeed;
    const candidates = remaining
      .map((partner, index) => ({ partner, index }))
      .filter(({ partner }) => {
        return pairAllowed(primary, partner);
      })
      .sort((a, b) => {
        const score = (candidate: SimulatorTrainingSessionNeed) => {
          const tuple = partnerScore(primary, candidate);
          // Stable diversification only after proximity/curriculum fit: rotate 3+ pilots
          // across different sessions without changing any individual obligation.
          tuple.splice(tuple.length - 2, 0,
            priorPartners.get(partnershipKey(primary.employee_id, candidate.employee_id)) || 0,
          );
          return tuple;
        };
        return compareTuple(score(a.partner), score(b.partner));
      });

    const selected = candidates[0];
    const sessions = [primary];
    let pairing: SimulatorTrainingSessionBlock['pairing'] = 'SEM_DUPLA';
    if (selected) {
      const partner = remaining.splice(selected.index, 1)[0];
      sessions.push(partner);
      const key = partnershipKey(primary.employee_id, partner.employee_id);
      priorPartners.set(key, (priorPartners.get(key) || 0) + 1);
      pairing =
        primary.qualification_type_id === partner.qualification_type_id
          ? 'MESMO_TREINAMENTO'
          : 'TREINAMENTOS_COMPATIVEIS';
    }

    const targetDate = sessions.map((session) => session.expiry_date).sort()[0];
    blocks.push({
      block_id: sessions
        .map((session) => session.need_id)
        .sort()
        .join('+'),
      equipment: primary.equipment,
      duration_minutes: primary.duration_minutes,
      target_date: targetDate,
      pairing,
      sessions,
    });
  }

  // A greedy first pass can strand two pilots even though an existing pair
  // can be reorganized into two compatible pairs. Repair only when it reduces
  // the number of unmatched sessions; never change the required curricula.
  let repaired = true;
  while (repaired) {
    repaired = false;
    const singles = blocks.filter((block) => block.pairing === 'SEM_DUPLA');
    const paired = blocks.filter((block) => block.pairing !== 'SEM_DUPLA');
    repair: for (const current of paired) {
      for (let i = 0; i < singles.length; i += 1) {
        for (let j = i + 1; j < singles.length; j += 1) {
          const a = current.sessions[0];
          const b = current.sessions[1];
          const x = singles[i].sessions[0];
          const y = singles[j].sessions[0];
          const options: Array<[[SimulatorTrainingSessionNeed, SimulatorTrainingSessionNeed], [SimulatorTrainingSessionNeed, SimulatorTrainingSessionNeed]]> = [
            [[a, x], [b, y]],
            [[a, y], [b, x]],
          ];
          const replacement = options.find(([[p, q], [r, t]]) =>
            pairAllowed(p, q) && pairAllowed(r, t),
          );
          if (!replacement) continue;
          const surviving = blocks.filter(
            (block) => block !== current && block !== singles[i] && block !== singles[j],
          );
          blocks.splice(0, blocks.length, ...surviving,
            createPairBlock(...replacement[0]),
            createPairBlock(...replacement[1]));
          repaired = true;
          break repair;
        }
      }
    }
  }

  return blocks.sort(
    (a, b) => a.target_date.localeCompare(b.target_date) || a.block_id.localeCompare(b.block_id),
  );
}

/**
 * A pilot in the same tenant-scoped proposal may occupy the second cockpit seat
 * as operational support. This is NOT a qualification requirement: no need ID,
 * training completion, check or expiry is generated for that person.
 * Selection is explicit, and subsequent scheduling must verify roster.
 */
export function attachSimulatorSupportCrew(params: {
  blocks: SimulatorTrainingSessionBlock[];
  needs: SimulatorTrainingSessionNeed[];
  assignments: Array<{ anchor_need_id: string; support_employee_id: number }>;
}): SimulatorTrainingSessionBlock[] {
  const indexed = new Map(params.blocks.flatMap((block) =>
    block.sessions.map((need) => [need.need_id, block] as const),
  ));
  const selected = new Set<string>();
  const additions = new Map<SimulatorTrainingSessionBlock, SimulatorTrainingSessionBlock>();
  for (const item of params.assignments) {
    const key = String(item.anchor_need_id || '');
    const employeeId = Number(item.support_employee_id);
    const block = indexed.get(key);
    if (
      !block ||
      block.sessions.length !== 1 ||
      block.sessions[0].need_id !== key ||
      selected.has(key) ||
      !Number.isInteger(employeeId) ||
      employeeId <= 0
    ) throw new Error('Apoio operacional exige sessão individual válida e não duplicada.');
    const need = block.sessions[0];
    const eligible = params.needs.find((candidate) =>
      candidate.employee_id === employeeId &&
      candidate.employee_id !== need.employee_id &&
      candidate.equipment === need.equipment,
    );
    if (!eligible) throw new Error('Piloto de apoio não pertence à proposta/equipamento.');
    selected.add(key);
    additions.set(block, {
      ...block,
      pairing: 'APOIO_SEM_RENOVACAO',
      support: {
        employee_id: eligible.employee_id,
        employee_name: eligible.employee_name,
        employee_role: eligible.employee_role,
      },
    });
  }
  return params.blocks.map((block) => additions.get(block) || block);
}

function blocksShareCrew(
  left: SimulatorTrainingSessionBlock,
  right: SimulatorTrainingSessionBlock,
): boolean {
  const leftEmployees = new Set([
    ...left.sessions.map((session) => session.employee_id),
    ...(left.support ? [left.support.employee_id] : []),
  ]);
  const rightEmployees = [
    ...right.sessions.map((session) => session.employee_id),
    ...(right.support ? [right.support.employee_id] : []),
  ];
  return rightEmployees.some((employeeId) => leftEmployees.has(employeeId));
}

/**
 * Uma turma operacional é um componente conexo por tripulante. Isso mantém
 * juntas as S1..SN de uma mesma cadeia de pessoas mesmo quando a dupla muda
 * entre sessões, mas separa grupos independentes no mesmo equipamento/mês.
 */
function splitOperationalCohorts(
  blocks: SimulatorTrainingSessionBlock[],
): SimulatorTrainingSessionBlock[][] {
  const ordered = [...blocks].sort(
    (a, b) => a.target_date.localeCompare(b.target_date) || a.block_id.localeCompare(b.block_id),
  );
  const visited = new Set<number>();
  const cohorts: SimulatorTrainingSessionBlock[][] = [];

  for (let start = 0; start < ordered.length; start += 1) {
    if (visited.has(start)) continue;
    const queue = [start];
    const cohort: SimulatorTrainingSessionBlock[] = [];
    visited.add(start);

    while (queue.length > 0) {
      const index = queue.shift() as number;
      const current = ordered[index];
      cohort.push(current);
      for (let candidate = 0; candidate < ordered.length; candidate += 1) {
        if (visited.has(candidate)) continue;
        if (blocksShareCrew(current, ordered[candidate])) {
          visited.add(candidate);
          queue.push(candidate);
        }
      }
    }

    cohorts.push(
      cohort.sort(
        (a, b) =>
          a.target_date.localeCompare(b.target_date) || a.block_id.localeCompare(b.block_id),
      ),
    );
  }

  return cohorts.sort(
    (a, b) =>
      a[0].target_date.localeCompare(b[0].target_date) ||
      a[0].block_id.localeCompare(b[0].block_id),
  );
}

export function buildSimulatorTrainingClasses(
  blocks: SimulatorTrainingSessionBlock[],
): SimulatorTrainingClass[] {
  const monthly = new Map<string, SimulatorTrainingSessionBlock[]>();
  for (const block of blocks) {
    const month = block.target_date.slice(0, 7);
    const key = `${block.equipment}|${month}`;
    const bucket = monthly.get(key) || [];
    bucket.push(block);
    monthly.set(key, bucket);
  }

  const cohorts = [...monthly.entries()].flatMap(([monthlyKey, monthlyBlocks]) =>
    splitOperationalCohorts(monthlyBlocks).map((cohortBlocks, index) => ({
      id: `${monthlyKey}|${String(index + 1).padStart(2, '0')}`,
      equipment: cohortBlocks[0].equipment,
      reference_date: cohortBlocks.map((block) => block.target_date).sort()[0],
      blocks: cohortBlocks,
    })),
  );

  const named = nameSimulatorPlanningClasses(
    cohorts.map((cohort) => ({
      id: cohort.id,
      equipment: cohort.equipment,
      reference_date: cohort.reference_date,
    })),
  );
  const nameById = new Map(named.map((item) => [String(item.id), item.class_name]));

  return cohorts
    .map((cohort) => ({
      class_id: cohort.id,
      class_name: nameById.get(cohort.id) || cohort.id,
      equipment: cohort.equipment,
      reference_date: cohort.reference_date,
      blocks: [...cohort.blocks].sort(
        (a, b) =>
          a.target_date.localeCompare(b.target_date) ||
          Math.min(...a.sessions.map((session) => session.session_order)) -
            Math.min(...b.sessions.map((session) => session.session_order)) ||
          a.block_id.localeCompare(b.block_id),
      ),
    }))
    .sort(
      (a, b) =>
        a.reference_date.localeCompare(b.reference_date) ||
        a.equipment.localeCompare(b.equipment) ||
        a.class_name.localeCompare(b.class_name),
    );
}
