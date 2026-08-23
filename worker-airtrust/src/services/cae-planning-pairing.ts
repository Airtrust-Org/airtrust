import {
  evaluateCrewPairing,
  evaluateRosterEligibility,
  type SimulatorPairingMode,
  type SimulatorPlanningConfig,
  type SimulatorRosterDayState,
} from './cae-planning-policy';
import type {
  SimulatorCanonicalPairingState,
  SimulatorOperationalSessionState,
} from './cae-planning-operational-context';

export type CaeParticipantSessionNeed = {
  employee_id: number;
  training_id: string | number;
  session: SimulatorOperationalSessionState;
  expiry_date: string;
  roster_state: SimulatorRosterDayState;
};

export type CaePairingCandidate = {
  left: CaeParticipantSessionNeed;
  right: CaeParticipantSessionNeed;
  mode: SimulatorPairingMode;
  preference_penalty: number;
  compatibility_fingerprint: string;
  reasons: string[];
};

export type PairingResolver = (params: {
  left: SimulatorOperationalSessionState;
  right: SimulatorOperationalSessionState;
}) => Promise<SimulatorCanonicalPairingState>;

function sameTraining(left: CaeParticipantSessionNeed, right: CaeParticipantSessionNeed): boolean {
  return String(left.training_id) === String(right.training_id);
}

function sameSessionModel(left: CaeParticipantSessionNeed, right: CaeParticipantSessionNeed): boolean {
  return String(left.session.session_model_id) === String(right.session.session_model_id);
}

/**
 * Avalia uma dupla para UMA data candidata da CAE.
 * - escala é live state já resolvido para a data;
 * - compatibilidade de compartilhamento é delegada ao módulo Simulador;
 * - não existem códigos/nomenclaturas curriculares hardcoded.
 */
export async function evaluateCaePairingCandidate(params: {
  left: CaeParticipantSessionNeed;
  right: CaeParticipantSessionNeed;
  config: SimulatorPlanningConfig;
  resolveSharedCompatibility: PairingResolver;
}): Promise<CaePairingCandidate | null> {
  if (params.left.employee_id === params.right.employee_id) return null;

  const leftRoster = evaluateRosterEligibility(params.config.roster_policy, params.left.roster_state);
  const rightRoster = evaluateRosterEligibility(params.config.roster_policy, params.right.roster_state);
  if (!leftRoster.eligible || !rightRoster.eligible) return null;

  const sameEquipment = params.left.session.equipment === params.right.session.equipment;
  if (!sameEquipment) return null;

  const sameTrainingValue = sameTraining(params.left, params.right);
  const sameSessionValue = sameSessionModel(params.left, params.right);

  let canonicalCompatibility: SimulatorCanonicalPairingState = {
    compatible: true,
    fingerprint: `normal:${String(params.left.session.session_model_id)}`,
    reason: 'Mesma sessão/modelo.',
  };

  if (!(sameTrainingValue && sameSessionValue)) {
    canonicalCompatibility = await params.resolveSharedCompatibility({
      left: params.left.session,
      right: params.right.session,
    });
  }

  const pairing = evaluateCrewPairing({
    same_equipment: sameEquipment,
    same_training: sameTrainingValue,
    same_session_model: sameSessionValue,
    canonical_shared_compatibility: canonicalCompatibility.compatible,
    config: params.config,
  });

  if (!pairing.eligible || !pairing.mode) return null;

  return {
    left: params.left,
    right: params.right,
    mode: pairing.mode,
    preference_penalty: pairing.preference_penalty,
    compatibility_fingerprint: canonicalCompatibility.fingerprint,
    reasons: [
      leftRoster.reason,
      rightRoster.reason,
      ...(canonicalCompatibility.reason ? [canonicalCompatibility.reason] : []),
      ...pairing.reasons,
    ],
  };
}

export async function buildCaePairingCandidates(params: {
  needs: CaeParticipantSessionNeed[];
  config: SimulatorPlanningConfig;
  resolveSharedCompatibility: PairingResolver;
}): Promise<CaePairingCandidate[]> {
  const result: CaePairingCandidate[] = [];

  for (let leftIndex = 0; leftIndex < params.needs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < params.needs.length; rightIndex += 1) {
      const candidate = await evaluateCaePairingCandidate({
        left: params.needs[leftIndex],
        right: params.needs[rightIndex],
        config: params.config,
        resolveSharedCompatibility: params.resolveSharedCompatibility,
      });
      if (candidate) result.push(candidate);
    }
  }

  return result.sort((left, right) =>
    left.preference_penalty - right.preference_penalty ||
    Number(left.mode === 'COMPARTILHADA') - Number(right.mode === 'COMPARTILHADA') ||
    left.left.expiry_date.localeCompare(right.left.expiry_date) ||
    left.right.expiry_date.localeCompare(right.right.expiry_date) ||
    left.left.employee_id - right.left.employee_id ||
    left.right.employee_id - right.right.employee_id,
  );
}
