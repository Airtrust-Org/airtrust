import type {
  EdbFlightRecord,
  EdbOperatorRegulation,
  EdbSignatureProof,
} from './contracts';

export type EdbValidationSeverity = 'BLOCKING' | 'WARNING';

export interface EdbValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: EdbValidationSeverity;
  legalReference: string;
}

export interface EdbValidationResult {
  valid: boolean;
  issues: EdbValidationIssue[];
}

function missing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

function blocking(
  issues: EdbValidationIssue[],
  code: string,
  path: string,
  message: string,
  legalReference: string,
) {
  issues.push({ code, path, message, severity: 'BLOCKING', legalReference });
}

function warning(
  issues: EdbValidationIssue[],
  code: string,
  path: string,
  message: string,
  legalReference: string,
) {
  issues.push({ code, path, message, severity: 'WARNING', legalReference });
}

function requireField(
  issues: EdbValidationIssue[],
  value: unknown,
  code: string,
  path: string,
  message: string,
  legalReference: string,
) {
  if (missing(value)) blocking(issues, code, path, message, legalReference);
}

function validateAircraftIdentity(record: EdbFlightRecord, issues: EdbValidationIssue[]) {
  const aircraft = record.identity.aircraft;
  requireField(issues, aircraft.manufacturer, 'EDB_AIRCRAFT_MANUFACTURER_REQUIRED', 'identity.aircraft.manufacturer', 'Fabricante da aeronave obrigatorio.', 'Res. ANAC 773/2025 art. 5 I');
  requireField(issues, aircraft.model, 'EDB_AIRCRAFT_MODEL_REQUIRED', 'identity.aircraft.model', 'Modelo da aeronave obrigatorio.', 'Res. ANAC 773/2025 art. 5 I');
  requireField(issues, aircraft.serialNumber, 'EDB_AIRCRAFT_SERIAL_REQUIRED', 'identity.aircraft.serialNumber', 'Numero de serie da aeronave obrigatorio.', 'Res. ANAC 773/2025 art. 5 I');
  requireField(issues, aircraft.registrationMarks, 'EDB_AIRCRAFT_MARKS_REQUIRED', 'identity.aircraft.registrationMarks', 'Marcas de nacionalidade e matricula obrigatorias.', 'Res. ANAC 773/2025 art. 5 II');
  if (!aircraft.owners || aircraft.owners.length === 0) {
    blocking(issues, 'EDB_AIRCRAFT_OWNER_REQUIRED', 'identity.aircraft.owners', 'Ao menos um proprietario deve estar identificado.', 'Res. ANAC 773/2025 art. 5 III');
  }
  if (!aircraft.operators || aircraft.operators.length === 0) {
    blocking(issues, 'EDB_AIRCRAFT_OPERATOR_REQUIRED', 'identity.aircraft.operators', 'Ao menos um operador deve estar identificado.', 'Res. ANAC 773/2025 art. 5 III');
  }
}

function validateMaintenanceSnapshot(record: EdbFlightRecord, issues: EdbValidationIssue[]) {
  const { lastIntervention, nextIntervention } = record.maintenance;
  requireField(issues, lastIntervention.type, 'EDB_LAST_MAINTENANCE_TYPE_REQUIRED', 'maintenance.lastIntervention.type', 'Tipo da ultima intervencao de manutencao obrigatorio.', 'Res. ANAC 773/2025 art. 9 I');
  requireField(issues, lastIntervention.date, 'EDB_LAST_MAINTENANCE_DATE_REQUIRED', 'maintenance.lastIntervention.date', 'Data da ultima intervencao de manutencao obrigatoria.', 'Res. ANAC 773/2025 art. 9 I');
  requireField(issues, lastIntervention.returnToServiceApprovedBy, 'EDB_LAST_MAINTENANCE_RTS_REQUIRED', 'maintenance.lastIntervention.returnToServiceApprovedBy', 'Responsavel pela aprovacao para retorno ao servico obrigatorio.', 'Res. ANAC 773/2025 art. 9 I');
  requireField(issues, nextIntervention.type, 'EDB_NEXT_MAINTENANCE_TYPE_REQUIRED', 'maintenance.nextIntervention.type', 'Tipo da proxima intervencao de manutencao obrigatorio.', 'Res. ANAC 773/2025 art. 9 II');
  requireField(issues, nextIntervention.dueAtAirframeHours, 'EDB_NEXT_MAINTENANCE_HOURS_REQUIRED', 'maintenance.nextIntervention.dueAtAirframeHours', 'Horas de celula previstas para a proxima intervencao obrigatorias.', 'Res. ANAC 773/2025 art. 9 III');
}

function validateChronology(record: EdbFlightRecord, issues: EdbValidationIssue[]) {
  const ordered = [
    ['engineStartAt', record.flight.times.engineStartAt],
    ['takeoffAt', record.flight.times.takeoffAt],
    ['landingAt', record.flight.times.landingAt],
    ['engineShutdownAt', record.flight.times.engineShutdownAt],
  ] as const;

  for (let index = 1; index < ordered.length; index += 1) {
    const [previousName, previousValue] = ordered[index - 1];
    const [currentName, currentValue] = ordered[index];
    if (!previousValue || !currentValue) continue;
    const previousTs = Date.parse(previousValue);
    const currentTs = Date.parse(currentValue);
    if (Number.isFinite(previousTs) && Number.isFinite(currentTs) && currentTs < previousTs) {
      blocking(
        issues,
        'EDB_FLIGHT_TIME_ORDER_INVALID',
        `flight.times.${currentName}`,
        `${currentName} nao pode ser anterior a ${previousName}.`,
        'Res. ANAC 773/2025 art. 6 IV',
      );
    }
  }
}

function validateFlightData(record: EdbFlightRecord, issues: EdbValidationIssue[]) {
  const flight = record.flight;
  if (flight.crew.length === 0) {
    blocking(issues, 'EDB_CREW_REQUIRED', 'flight.crew', 'Tripulacao obrigatoria.', 'Res. ANAC 773/2025 art. 6 I');
  }
  if (!flight.crew.some((member) => member.operationalRole === 'PIC')) {
    blocking(issues, 'EDB_PIC_REQUIRED', 'flight.crew', 'O piloto em comando deve estar identificado.', 'Res. ANAC 773/2025 arts. 6 I e 7');
  }
  for (const [index, member] of flight.crew.entries()) {
    requireField(issues, member.fullName, 'EDB_CREW_NAME_REQUIRED', `flight.crew.${index}.fullName`, 'Nome do tripulante obrigatorio.', 'Res. ANAC 773/2025 art. 6 I');
  }

  requireField(issues, flight.date, 'EDB_DATE_REQUIRED', 'flight.date', 'Data do voo obrigatoria.', 'Res. ANAC 773/2025 art. 6 II');
  requireField(issues, flight.origin, 'EDB_ORIGIN_REQUIRED', 'flight.origin', 'Local de origem obrigatorio.', 'Res. ANAC 773/2025 art. 6 III');
  requireField(issues, flight.destination, 'EDB_DESTINATION_REQUIRED', 'flight.destination', 'Local de destino obrigatorio.', 'Res. ANAC 773/2025 art. 6 III');
  requireField(issues, flight.times.engineStartAt, 'EDB_ENGINE_START_REQUIRED', 'flight.times.engineStartAt', 'Horario de partida dos motores obrigatorio.', 'Res. ANAC 773/2025 art. 6 IV');
  requireField(issues, flight.times.takeoffAt, 'EDB_TAKEOFF_REQUIRED', 'flight.times.takeoffAt', 'Horario de decolagem obrigatorio.', 'Res. ANAC 773/2025 art. 6 IV');
  requireField(issues, flight.times.landingAt, 'EDB_LANDING_REQUIRED', 'flight.times.landingAt', 'Horario de pouso obrigatorio.', 'Res. ANAC 773/2025 art. 6 IV');
  requireField(issues, flight.times.engineShutdownAt, 'EDB_ENGINE_SHUTDOWN_REQUIRED', 'flight.times.engineShutdownAt', 'Horario de corte dos motores obrigatorio.', 'Res. ANAC 773/2025 art. 6 IV');
  requireField(issues, flight.landingsTotal, 'EDB_LANDINGS_REQUIRED', 'flight.landingsTotal', 'Total de pousos obrigatorio.', 'Res. ANAC 773/2025 art. 6 V');
  requireField(issues, flight.cycles, 'EDB_CYCLES_REQUIRED', 'flight.cycles', 'Total de ciclos obrigatorio.', 'Res. ANAC 773/2025 art. 6 V');
  requireField(issues, flight.duration.dayMinutes, 'EDB_DAY_TIME_REQUIRED', 'flight.duration.dayMinutes', 'Tempo de voo diurno obrigatorio.', 'Res. ANAC 773/2025 art. 6 VI');
  requireField(issues, flight.duration.nightMinutes, 'EDB_NIGHT_TIME_REQUIRED', 'flight.duration.nightMinutes', 'Tempo de voo noturno obrigatorio.', 'Res. ANAC 773/2025 art. 6 VI');
  requireField(issues, flight.duration.totalMinutes, 'EDB_TOTAL_TIME_REQUIRED', 'flight.duration.totalMinutes', 'Tempo de voo total obrigatorio.', 'Res. ANAC 773/2025 art. 6 VI');
  requireField(issues, flight.duration.ifrActualMinutes, 'EDB_IFR_ACTUAL_REQUIRED', 'flight.duration.ifrActualMinutes', 'Tempo IFR real deve ser registrado, inclusive quando zero.', 'Res. ANAC 773/2025 art. 6 VII');
  requireField(issues, flight.duration.ifrSimulatedMinutes, 'EDB_IFR_SIMULATED_REQUIRED', 'flight.duration.ifrSimulatedMinutes', 'Tempo IFR simulado deve ser registrado, inclusive quando zero.', 'Res. ANAC 773/2025 art. 6 VII');
  requireField(issues, flight.fuelBeforeEngineStart, 'EDB_FUEL_PRESTART_REQUIRED', 'flight.fuelBeforeEngineStart', 'Combustivel total antes da partida dos motores obrigatorio.', 'Res. ANAC 773/2025 art. 6 VIII');
  requireField(issues, flight.personsOnBoard, 'EDB_POB_REQUIRED', 'flight.personsOnBoard', 'Quantidade total de pessoas a bordo obrigatoria.', 'Res. ANAC 773/2025 art. 6 IX');
  requireField(issues, flight.cargoKg, 'EDB_CARGO_REQUIRED', 'flight.cargoKg', 'Total de carga transportada deve ser registrado, inclusive quando zero.', 'Res. ANAC 773/2025 art. 6 X');
  requireField(issues, flight.nature, 'EDB_NATURE_REQUIRED', 'flight.nature', 'Natureza do voo obrigatoria.', 'Res. ANAC 773/2025 art. 6 XI');

  if (flight.occurrences === null) {
    blocking(issues, 'EDB_OCCURRENCES_NOT_RECORDED', 'flight.occurrences', 'Ocorrencias devem ser registradas; use lista vazia quando inexistentes.', 'Res. ANAC 773/2025 art. 6 XII');
  }
  if (flight.technicalDiscrepancies === null) {
    blocking(issues, 'EDB_TECH_DISCREPANCIES_NOT_RECORDED', 'flight.technicalDiscrepancies', 'Discrepancias tecnicas devem ser registradas; use lista vazia quando inexistentes.', 'Res. ANAC 773/2025 art. 6 XIII');
  } else {
    for (const [index, discrepancy] of flight.technicalDiscrepancies.entries()) {
      requireField(issues, discrepancy.description, 'EDB_TECH_DISCREPANCY_DESCRIPTION_REQUIRED', `flight.technicalDiscrepancies.${index}.description`, 'Descricao da discrepancia tecnica obrigatoria.', 'Res. ANAC 773/2025 art. 6 XIII');
      requireField(issues, discrepancy.detectedBy.fullName, 'EDB_TECH_DISCREPANCY_DETECTOR_REQUIRED', `flight.technicalDiscrepancies.${index}.detectedBy.fullName`, 'Pessoa que detectou a discrepancia deve ser identificada.', 'Res. ANAC 773/2025 art. 6 XIII');
    }
  }

  validateChronology(record, issues);

  const { dayMinutes, nightMinutes, totalMinutes } = flight.duration;
  if (dayMinutes !== null && nightMinutes !== null && totalMinutes !== null) {
    const delta = Math.abs(dayMinutes + nightMinutes - totalMinutes);
    if (delta > 1) {
      warning(issues, 'EDB_FLIGHT_TIME_TOTAL_MISMATCH', 'flight.duration', 'Tempo diurno + noturno difere do tempo total em mais de 1 minuto.', 'Res. ANAC 773/2025 art. 6 VI');
    }
  }
}

function result(issues: EdbValidationIssue[]): EdbValidationResult {
  return {
    valid: !issues.some((issue) => issue.severity === 'BLOCKING'),
    issues,
  };
}

export function validateForPicTechnicalAcknowledgement(record: EdbFlightRecord): EdbValidationResult {
  const issues: EdbValidationIssue[] = [];
  validateAircraftIdentity(record, issues);
  validateMaintenanceSnapshot(record, issues);
  return result(issues);
}

export function validateForPicFlightSignature(record: EdbFlightRecord): EdbValidationResult {
  const issues: EdbValidationIssue[] = [];
  validateAircraftIdentity(record, issues);
  validateMaintenanceSnapshot(record, issues);
  validateFlightData(record, issues);

  if (!record.signatures.picTechnicalAcknowledgement) {
    blocking(issues, 'EDB_PIC_TECHNICAL_ACK_REQUIRED', 'signatures.picTechnicalAcknowledgement', 'A ciencia do PIC sobre a situacao tecnica deve ser assinada antes do voo.', 'Res. ANAC 773/2025 art. 9, paragrafo unico');
  }

  return result(issues);
}

export function operatorSignatureDeadlineDays(regulation: EdbOperatorRegulation): number {
  if (regulation === 'RBAC121') return 2;
  if (regulation === 'RBAC135') return 15;
  return 30;
}

export function operatorSignatureDeadlineAt(
  picSignature: EdbSignatureProof,
  regulation: EdbOperatorRegulation,
): Date {
  const signedAt = new Date(picSignature.signedAt);
  if (!Number.isFinite(signedAt.getTime())) throw new Error('Invalid PIC signature timestamp');
  signedAt.setUTCDate(signedAt.getUTCDate() + operatorSignatureDeadlineDays(regulation));
  return signedAt;
}

export function validateForOperatorSignature(
  record: EdbFlightRecord,
  now = new Date(),
): EdbValidationResult {
  const issues: EdbValidationIssue[] = [...validateForPicFlightSignature(record).issues];
  const picSignature = record.signatures.picFlightRecord;

  if (!picSignature) {
    blocking(issues, 'EDB_PIC_FLIGHT_SIGNATURE_REQUIRED', 'signatures.picFlightRecord', 'Registro do voo deve estar assinado pelo piloto em comando antes da assinatura do operador.', 'Res. ANAC 773/2025 arts. 7 e 10');
    return result(issues);
  }

  const deadline = operatorSignatureDeadlineAt(picSignature, record.identity.operatorRegulation);
  if (now.getTime() > deadline.getTime()) {
    warning(issues, 'EDB_OPERATOR_SIGNATURE_OVERDUE', 'signatures.operatorRecord', `Prazo regulamentar para assinatura do operador expirou em ${deadline.toISOString()}.`, 'Res. ANAC 773/2025 art. 10, paragrafo unico');
  }

  return result(issues);
}
