import {
  ControlFlightProjectionError,
  projectControlFlightToEdbDraft,
  type ControlFlightConflictSource,
  type ControlFlightCrewSource,
  type ControlFlightDraftProjectionResult,
  type ControlFlightLegSource,
  type ControlFlightProjectionFinding,
  type ControlFlightRdvSource,
} from './control-flight-draft-projection';

type Nullable<T> = T | null;

type FlightSourceRow = {
  id: number;
  empresa_id: number;
  data_programacao: string;
  origem_importacao: Nullable<string>;
  operator_legal_name: Nullable<string>;
  operator_legal_identifier: Nullable<string>;
  aircraft_model: Nullable<string>;
  aircraft_registration: Nullable<string>;
  flight_nature_code: Nullable<string>;
};

type ScopeViolationRow = { id: number };

export type EdbShadowPreviewFinding =
  | ControlFlightProjectionFinding
  | {
      code: 'SOURCE_PROVENANCE_REQUIRED' | 'TECHNICAL_STATUS_SOURCE_UNAVAILABLE';
      path: string;
    };

export interface EdbShadowPreviewResult
  extends Omit<ControlFlightDraftProjectionResult, 'findings'> {
  findings: EdbShadowPreviewFinding[];
}

export type EdbShadowPreviewErrorCode =
  | 'FLIGHT_NOT_FOUND'
  | 'TENANT_MISMATCH'
  | 'FLIGHT_MISMATCH'
  | 'LEG_SCOPE_MISMATCH'
  | 'CREW_TENANT_MISMATCH'
  | 'CONFLICT_SCOPE_MISMATCH';

export class EdbShadowPreviewError extends Error {
  constructor(
    public readonly code: EdbShadowPreviewErrorCode,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'EdbShadowPreviewError';
  }
}

export interface LoadEdbShadowPreviewOptions {
  createdAt?: string;
  draftId?: string;
}

function assertPositiveInteger(
  value: number,
  code: EdbShadowPreviewErrorCode,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new EdbShadowPreviewError(code, 400);
  }
}

function assertRowsInScope(
  tenantId: number,
  flightId: number,
  legs: ControlFlightLegSource[],
  crew: ControlFlightCrewSource[],
  conflicts: ControlFlightConflictSource[],
  rdv: ControlFlightRdvSource | null,
): void {
  for (const leg of legs) {
    if (leg.empresa_id !== tenantId) {
      throw new EdbShadowPreviewError('TENANT_MISMATCH', 409);
    }
    if (leg.voo_id !== flightId) {
      throw new EdbShadowPreviewError('LEG_SCOPE_MISMATCH', 409);
    }
  }

  for (const member of crew) {
    if (member.empresa_id !== tenantId) {
      throw new EdbShadowPreviewError('CREW_TENANT_MISMATCH', 409);
    }
    if (member.voo_id !== flightId) {
      throw new EdbShadowPreviewError('FLIGHT_MISMATCH', 409);
    }
  }

  if (rdv) {
    if (rdv.empresa_id !== tenantId) {
      throw new EdbShadowPreviewError('TENANT_MISMATCH', 409);
    }
    if (rdv.voo_id !== flightId) {
      throw new EdbShadowPreviewError('FLIGHT_MISMATCH', 409);
    }
  }

  const legIds = new Set(legs.map((leg) => leg.id));
  const crewIds = new Set(crew.map((member) => member.id));
  for (const conflict of conflicts) {
    const belongsToProjectedSet =
      conflict.empresa_id === tenantId &&
      ((conflict.entidade_tipo === 'voo' && conflict.entidade_id === flightId) ||
        (conflict.entidade_tipo === 'etapa' && legIds.has(conflict.entidade_id)) ||
        (conflict.entidade_tipo === 'tripulante' && crewIds.has(conflict.entidade_id)));

    if (!belongsToProjectedSet) {
      throw new EdbShadowPreviewError('CONFLICT_SCOPE_MISMATCH', 409);
    }
  }
}

function buildProvenanceFindings(
  flight: FlightSourceRow,
  legs: ControlFlightLegSource[],
  crew: ControlFlightCrewSource[],
): EdbShadowPreviewFinding[] {
  const findings: EdbShadowPreviewFinding[] = [];
  const flightOrigin = flight.origem_importacao?.trim().toUpperCase();
  if (flightOrigin !== 'MANUAL' && flightOrigin !== 'SIGVOOS') {
    findings.push({
      code: 'SOURCE_PROVENANCE_REQUIRED',
      path: 'sourceFlightReference',
    });
  }

  legs.forEach((leg, index) => {
    const origin = leg.origem_dados?.trim().toUpperCase();
    if (origin !== 'MANUAL' && origin !== 'SIGVOOS') {
      findings.push({ code: 'SOURCE_PROVENANCE_REQUIRED', path: `legs.${index}.source` });
    }
  });

  crew.forEach((member, index) => {
    const origin = member.funcao_origem?.trim().toUpperCase();
    if (origin !== 'MANUAL' && origin !== 'SIGVOOS') {
      findings.push({ code: 'SOURCE_PROVENANCE_REQUIRED', path: `crew.${index}.source` });
    }
  });

  findings.push({
    code: 'TECHNICAL_STATUS_SOURCE_UNAVAILABLE',
    path: 'technicalStatus.source',
  });
  return findings;
}

export async function loadEdbShadowPreview(
  db: D1Database,
  tenantId: number,
  flightId: number,
  options: LoadEdbShadowPreviewOptions = {},
): Promise<EdbShadowPreviewResult> {
  assertPositiveInteger(tenantId, 'TENANT_MISMATCH');
  assertPositiveInteger(flightId, 'FLIGHT_NOT_FOUND');

  const flight = await db
    .prepare(
      `
      SELECT
        v.id,
        v.empresa_id,
        v.data_programacao,
        v.origem_importacao,
        e.razao_social AS operator_legal_name,
        e.cnpj AS operator_legal_identifier,
        a.modelo AS aircraft_model,
        a.prefixo AS aircraft_registration,
        n.codigo AS flight_nature_code
      FROM cv_voos v
      JOIN empresas e
        ON e.id = v.empresa_id
       AND e.deleted_at IS NULL
      LEFT JOIN aeronaves a
        ON a.id = v.aeronave_id
       AND a.empresa_id = v.empresa_id
       AND a.deleted_at IS NULL
      LEFT JOIN cv_naturezas_voo n
        ON n.id = v.natureza_voo_id
       AND n.empresa_id = v.empresa_id
       AND n.deleted_at IS NULL
      WHERE v.id = ?
        AND v.empresa_id = ?
        AND v.deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(flightId, tenantId)
    .first<FlightSourceRow>();

  if (!flight) {
    throw new EdbShadowPreviewError('FLIGHT_NOT_FOUND', 404);
  }
  if (flight.empresa_id !== tenantId) {
    throw new EdbShadowPreviewError('TENANT_MISMATCH', 409);
  }
  if (flight.id !== flightId) {
    throw new EdbShadowPreviewError('FLIGHT_MISMATCH', 409);
  }

  const [legsResult, crewResult, conflictsResult, rdv, crewTenantMismatch, crewLegMismatch] =
    await Promise.all([
      db
        .prepare(
          `
        SELECT
          id, empresa_id, voo_id, numero_etapa,
          origem_icao, destino_icao,
          horario_motor_ligado, horario_decolagem, horario_pouso, horario_motor_desligado,
          tempo_decolagem_pouso, tempo_total, tempo_ifr, tempo_noturno,
          pousos_diurnos, pousos_noturnos, starts, pax, payload,
          combustivel_inicio, combustivel_fim, unidade_combustivel,
          origem_dados, sigvoos_importado_em
        FROM cv_voo_etapas
        WHERE empresa_id = ?
          AND voo_id = ?
          AND deleted_at IS NULL
        ORDER BY numero_etapa ASC, id ASC
      `,
        )
        .bind(tenantId, flightId)
        .all<ControlFlightLegSource>(),
      db
        .prepare(
          `
        SELECT
          t.id,
          t.empresa_id,
          t.voo_id,
          t.etapa_id,
          t.funcionario_id,
          f.nome,
          NULL AS canac,
          t.funcao,
          t.horario_apresentacao,
          NULL AS base_contratual,
          t.funcao_origem
        FROM cv_voo_tripulantes t
        LEFT JOIN funcionarios f
          ON f.id = t.funcionario_id
         AND f.empresa_id = t.empresa_id
         AND f.deleted_at IS NULL
        WHERE t.empresa_id = ?
          AND t.voo_id = ?
          AND t.deleted_at IS NULL
        ORDER BY t.etapa_id ASC, t.id ASC
      `,
        )
        .bind(tenantId, flightId)
        .all<ControlFlightCrewSource>(),
      db
        .prepare(
          `
        SELECT
          c.id,
          c.empresa_id,
          c.entidade_tipo,
          c.entidade_id,
          c.campo,
          c.severidade,
          c.status
        FROM cv_conflitos_integracao c
        WHERE c.empresa_id = ?
          AND c.deleted_at IS NULL
          AND (
            (c.entidade_tipo = 'voo' AND c.entidade_id = ?)
            OR (
              c.entidade_tipo = 'etapa'
              AND EXISTS (
                SELECT 1
                FROM cv_voo_etapas e
                WHERE e.id = c.entidade_id
                  AND e.empresa_id = ?
                  AND e.voo_id = ?
                  AND e.deleted_at IS NULL
              )
            )
            OR (
              c.entidade_tipo = 'tripulante'
              AND EXISTS (
                SELECT 1
                FROM cv_voo_tripulantes t
                WHERE t.id = c.entidade_id
                  AND t.empresa_id = ?
                  AND t.voo_id = ?
                  AND t.deleted_at IS NULL
              )
            )
          )
        ORDER BY c.id ASC
      `,
        )
        .bind(tenantId, flightId, tenantId, flightId, tenantId, flightId)
        .all<ControlFlightConflictSource>(),
      db
        .prepare(
          `
        SELECT
          id, empresa_id, voo_id, ocorrencias, divergencias, updated_at
        FROM cv_rdv_operacional
        WHERE empresa_id = ?
          AND voo_id = ?
          AND deleted_at IS NULL
          AND status <> 'cancelado'
        ORDER BY id DESC
        LIMIT 1
      `,
        )
        .bind(tenantId, flightId)
        .first<ControlFlightRdvSource>(),
      db
        .prepare(
          `
        SELECT t.id
        FROM cv_voo_tripulantes t
        JOIN funcionarios f
          ON f.id = t.funcionario_id
         AND f.deleted_at IS NULL
        WHERE t.empresa_id = ?
          AND t.voo_id = ?
          AND t.deleted_at IS NULL
          AND f.empresa_id <> ?
        LIMIT 1
      `,
        )
        .bind(tenantId, flightId, tenantId)
        .first<ScopeViolationRow>(),
      db
        .prepare(
          `
        SELECT t.id
        FROM cv_voo_tripulantes t
        JOIN cv_voo_etapas e
          ON e.id = t.etapa_id
        WHERE t.empresa_id = ?
          AND t.voo_id = ?
          AND t.deleted_at IS NULL
          AND (
            e.empresa_id <> ?
            OR e.voo_id <> ?
            OR e.deleted_at IS NOT NULL
          )
        LIMIT 1
      `,
        )
        .bind(tenantId, flightId, tenantId, flightId)
        .first<ScopeViolationRow>(),
    ]);

  if (crewTenantMismatch) {
    throw new EdbShadowPreviewError('CREW_TENANT_MISMATCH', 409);
  }
  if (crewLegMismatch) {
    throw new EdbShadowPreviewError('LEG_SCOPE_MISMATCH', 409);
  }

  const legs = legsResult.results ?? [];
  const crew = crewResult.results ?? [];
  const conflicts = conflictsResult.results ?? [];
  assertRowsInScope(tenantId, flightId, legs, crew, conflicts, rdv);

  const createdAt = options.createdAt ?? new Date().toISOString();
  let projection: ControlFlightDraftProjectionResult;
  try {
    projection = projectControlFlightToEdbDraft({
      draftId: options.draftId ?? crypto.randomUUID(),
      tenantId,
      flightId,
      createdAt,
      operationalDate: flight.data_programacao,
      timezone: null,
      sourceFlightReference: `cv_voos:${flightId}`,
      volumeNumber: null,
      flightNatureCode: flight.flight_nature_code,
      operator: {
        legalName: flight.operator_legal_name,
        legalIdentifier: flight.operator_legal_identifier,
        operatingCertificate: null,
      },
      owner: {
        legalName: null,
        legalIdentifier: null,
      },
      aircraft: {
        manufacturer: null,
        model: flight.aircraft_model,
        serialNumber: null,
        registration: flight.aircraft_registration,
      },
      legs,
      crew,
      conflicts,
      rdv,
      technicalStatus: {
        lastMaintenanceIntervention: null,
        nextMaintenanceIntervention: null,
        airframeHoursRemaining: null,
        returnToServiceReference: null,
        openDiscrepancyCount: null,
        sourceReference: null,
        observedAt: null,
      },
    });
  } catch (error) {
    if (error instanceof ControlFlightProjectionError) {
      const mappedCode: EdbShadowPreviewErrorCode =
        error.code === 'TENANT_MISMATCH'
          ? 'TENANT_MISMATCH'
          : error.code === 'FLIGHT_MISMATCH'
            ? 'FLIGHT_MISMATCH'
            : 'CONFLICT_SCOPE_MISMATCH';
      throw new EdbShadowPreviewError(mappedCode, 409);
    }
    throw error;
  }

  return {
    draft: projection.draft,
    findings: [
      ...projection.findings,
      ...buildProvenanceFindings(flight, legs, crew),
    ],
    fieldSources: projection.fieldSources,
  };
}
