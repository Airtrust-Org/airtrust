import type {
  SimulatorPlanningConfig,
  SimulatorRosterDayState,
} from './cae-planning-policy';

export type SimulatorOperationalEmployeeState = {
  employee_id: number;
  active: boolean;
  equipment: string | null;
  role_code?: string | null;
  sector_id?: number | null;
  source_revision?: string | null;
};

export type SimulatorOperationalRosterState = {
  employee_id: number;
  date: string;
  day_state: SimulatorRosterDayState;
  reason?: string | null;
  source_type?: string | null;
  source_id?: string | number | null;
  source_revision?: string | null;
};

export type SimulatorOperationalQualificationState = {
  employee_id: number;
  qualification_history_id?: number | null;
  qualification_type_id?: number | null;
  qualification_code?: string | null;
  expiry_date?: string | null;
  source_revision?: string | null;
};

export type SimulatorOperationalSessionState = {
  training_id: string | number;
  session_model_id: string | number;
  session_order: number;
  duration_minutes: number;
  equipment: string;
  session_kind?: string | null;
  canonical_code?: string | null;
  source_revision?: string | null;
};

export type SimulatorCanonicalPairingState = {
  compatible: boolean;
  reason?: string | null;
  fingerprint: string;
};

export type SimulatorCaeSlotLiveState = {
  slot_key: string;
  equipment: string;
  date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  duration_minutes: number;
  state: string;
  source_revision?: string | null;
};

/**
 * Contrato de leitura das fontes canônicas.
 * A implementação real deve delegar aos serviços/módulos atuais do AirTrust.
 * Nenhum estado mutável (quinzena, escala, funcionário, currículo, slot CAE) é cacheado aqui.
 */
export interface SimulatorPlanningLiveDataProvider {
  loadPlanningConfig(empresaId: number): Promise<SimulatorPlanningConfig>;

  loadEmployeeState(params: {
    empresaId: number;
    employeeId: number;
  }): Promise<SimulatorOperationalEmployeeState | null>;

  resolveRosterState(params: {
    empresaId: number;
    employeeId: number;
    date: string;
  }): Promise<SimulatorOperationalRosterState>;

  loadQualificationState(params: {
    empresaId: number;
    employeeId: number;
    qualificationHistoryId?: number | null;
    qualificationTypeId?: number | null;
  }): Promise<SimulatorOperationalQualificationState | null>;

  loadTrainingSessions(params: {
    empresaId: number;
    trainingId: string | number;
  }): Promise<SimulatorOperationalSessionState[]>;

  resolveCanonicalSharedCompatibility(params: {
    empresaId: number;
    left: SimulatorOperationalSessionState;
    right: SimulatorOperationalSessionState;
  }): Promise<SimulatorCanonicalPairingState>;

  loadCaeSlot(params: {
    empresaId: number;
    slotKey: string;
  }): Promise<SimulatorCaeSlotLiveState | null>;
}

export type ProposalLiveDependencySet = {
  config: SimulatorPlanningConfig;
  employee_states: SimulatorOperationalEmployeeState[];
  roster_states: SimulatorOperationalRosterState[];
  qualification_states: SimulatorOperationalQualificationState[];
  training_sessions: SimulatorOperationalSessionState[];
  cae_slots: SimulatorCaeSlotLiveState[];
  pairing_fingerprints: string[];
};

/**
 * Resolve novamente todas as dependências materiais de uma proposta.
 * O chamador informa somente IDs/datas da proposta; o estado é sempre relido.
 */
export async function resolveProposalLiveDependencies(params: {
  provider: SimulatorPlanningLiveDataProvider;
  empresaId: number;
  participants: Array<{
    employee_id: number;
    training_id: string | number;
    qualification_history_id?: number | null;
    qualification_type_id?: number | null;
  }>;
  dates: string[];
  slot_keys: string[];
}): Promise<ProposalLiveDependencySet> {
  const uniqueDates = [...new Set(params.dates)].sort();
  const uniqueSlotKeys = [...new Set(params.slot_keys)].sort();
  const uniqueParticipants = [...new Map(
    params.participants.map((item) => [item.employee_id, item]),
  ).values()];

  const config = await params.provider.loadPlanningConfig(params.empresaId);

  const employeeStates = (
    await Promise.all(
      uniqueParticipants.map((item) =>
        params.provider.loadEmployeeState({
          empresaId: params.empresaId,
          employeeId: item.employee_id,
        }),
      ),
    )
  ).filter((value): value is SimulatorOperationalEmployeeState => Boolean(value));

  const rosterStates = await Promise.all(
    uniqueParticipants.flatMap((item) =>
      uniqueDates.map((date) =>
        params.provider.resolveRosterState({
          empresaId: params.empresaId,
          employeeId: item.employee_id,
          date,
        }),
      ),
    ),
  );

  const qualificationStates = (
    await Promise.all(
      uniqueParticipants.map((item) =>
        params.provider.loadQualificationState({
          empresaId: params.empresaId,
          employeeId: item.employee_id,
          qualificationHistoryId: item.qualification_history_id,
          qualificationTypeId: item.qualification_type_id,
        }),
      ),
    )
  ).filter((value): value is SimulatorOperationalQualificationState => Boolean(value));

  const trainingIds = [...new Set(uniqueParticipants.map((item) => String(item.training_id)))];
  const trainingSessionsNested = await Promise.all(
    trainingIds.map((trainingId) =>
      params.provider.loadTrainingSessions({
        empresaId: params.empresaId,
        trainingId,
      }),
    ),
  );
  const trainingSessions = trainingSessionsNested.flat();

  const caeSlots = (
    await Promise.all(
      uniqueSlotKeys.map((slotKey) =>
        params.provider.loadCaeSlot({ empresaId: params.empresaId, slotKey }),
      ),
    )
  ).filter((value): value is SimulatorCaeSlotLiveState => Boolean(value));

  return {
    config,
    employee_states: employeeStates,
    roster_states: rosterStates,
    qualification_states: qualificationStates,
    training_sessions: trainingSessions,
    cae_slots: caeSlots,
    pairing_fingerprints: [],
  };
}
