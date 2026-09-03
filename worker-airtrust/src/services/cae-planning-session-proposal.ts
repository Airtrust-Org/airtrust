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
};

export type SimulatorTrainingSessionBlock = {
  block_id: string;
  equipment: string;
  duration_minutes: number;
  target_date: string;
  pairing: 'MESMO_TREINAMENTO' | 'TREINAMENTOS_COMPATIVEIS' | 'SEM_DUPLA';
  sessions: SimulatorTrainingSessionNeed[];
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
    Math.round(
      (Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000,
    ),
  );
}

function isRecurrentFlightTraining(session: SimulatorTrainingSessionNeed): boolean {
  const identity = normalizeText(`${session.qualification_code || ''} ${session.qualification_name}`);
  return (
    identity.includes('CURRICULO DE VOO') ||
    identity.includes('PERIODICO') ||
    identity.includes('SEMESTRAL') ||
    /(^|\s)G\d(?:-SEM)?($|\s)/.test(identity)
  );
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

function partnerScore(
  primary: SimulatorTrainingSessionNeed,
  partner: SimulatorTrainingSessionNeed,
): [number, number, number, number, number] {
  const sameTraining = primary.qualification_type_id === partner.qualification_type_id;
  const sameModel = primary.session_model_id === partner.session_model_id;
  const complementaryRole =
    (roleKind(primary.employee_role) === 'PIC' && roleKind(partner.employee_role) === 'SIC') ||
    (roleKind(primary.employee_role) === 'SIC' && roleKind(partner.employee_role) === 'PIC');
  return [
    sameTraining ? 0 : 1,
    sameModel ? 0 : 1,
    complementaryRole ? 0 : 1,
    daysDistance(primary.expiry_date, partner.expiry_date),
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
 * pairEligibility é uma restrição operacional adicional (por exemplo, escala
 * publicada/quinzena). Ela nunca amplia compatibilidade curricular: somente
 * pode eliminar uma dupla que já seria estruturalmente válida.
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

  while (remaining.length > 0) {
    const primary = remaining.shift() as SimulatorTrainingSessionNeed;
    const candidates = remaining
      .map((partner, index) => ({ partner, index }))
      .filter(({ partner }) => {
        const crossTraining = primary.qualification_type_id !== partner.qualification_type_id;
        return (
          (!crossTraining || allowCrossTraining) &&
          canShareSimulatorTrainingSessions(primary, partner) &&
          daysDistance(primary.expiry_date, partner.expiry_date) <= Math.max(0, maxAnticipationDays) &&
          (!pairEligibility || pairEligibility(primary, partner))
        );
      })
      .sort((a, b) => compareTuple(partnerScore(primary, a.partner), partnerScore(primary, b.partner)));

    const selected = candidates[0];
    const sessions = [primary];
    let pairing: SimulatorTrainingSessionBlock['pairing'] = 'SEM_DUPLA';
    if (selected) {
      const partner = remaining.splice(selected.index, 1)[0];
      sessions.push(partner);
      pairing =
        primary.qualification_type_id === partner.qualification_type_id
          ? 'MESMO_TREINAMENTO'
          : 'TREINAMENTOS_COMPATIVEIS';
    }

    const targetDate = sessions.map((session) => session.expiry_date).sort()[0];
    blocks.push({
      block_id: sessions.map((session) => session.need_id).sort().join('+'),
      equipment: primary.equipment,
      duration_minutes: primary.duration_minutes,
      target_date: targetDate,
      pairing,
      sessions,
    });
  }

  return blocks;
}

function blocksShareCrew(
  left: SimulatorTrainingSessionBlock,
  right: SimulatorTrainingSessionBlock,
): boolean {
  const leftEmployees = new Set(left.sessions.map((session) => session.employee_id));
  return right.sessions.some((session) => leftEmployees.has(session.employee_id));
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
    (a, b) =>
      a.target_date.localeCompare(b.target_date) ||
      a.block_id.localeCompare(b.block_id),
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
          a.target_date.localeCompare(b.target_date) ||
          a.block_id.localeCompare(b.block_id),
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
