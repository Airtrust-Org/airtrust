import { describe, expect, it, vi } from 'vitest';
import {
  EdbShadowPreviewError,
  loadEdbShadowPreview,
} from '../../services/edb/control-flight-shadow-preview';
import type {
  ControlFlightConflictSource,
  ControlFlightCrewSource,
  ControlFlightLegSource,
  ControlFlightRdvSource,
} from '../../services/edb/control-flight-draft-projection';

type FlightRow = {
  id: number;
  empresa_id: number;
  data_programacao: string;
  origem_importacao: string | null;
  operator_legal_name: string | null;
  operator_legal_identifier: string | null;
  aircraft_model: string | null;
  aircraft_registration: string | null;
  flight_nature_code: string | null;
};

type StatementTrace = {
  sql: string;
  binds: unknown[];
  method: 'first' | 'all';
};

type DbFixture = {
  flight: FlightRow | null;
  legs: ControlFlightLegSource[];
  crew: ControlFlightCrewSource[];
  conflicts: ControlFlightConflictSource[];
  rdv: ControlFlightRdvSource | null;
  crewTenantMismatch: { id: number } | null;
  crewLegMismatch: { id: number } | null;
};

const defaultFixture = (): DbFixture => ({
  flight: {
    id: 42,
    empresa_id: 7,
    data_programacao: '2026-08-02',
    origem_importacao: 'SIGVOOS',
    operator_legal_name: 'Operador Sintetico',
    operator_legal_identifier: '00000000000000',
    aircraft_model: 'AW139',
    aircraft_registration: 'PR-TST',
    flight_nature_code: 'PAX',
  },
  legs: [
    {
      id: 101,
      empresa_id: 7,
      voo_id: 42,
      numero_etapa: 1,
      origem_icao: 'SBRJ',
      destino_icao: 'SBSP',
      horario_motor_ligado: '08:00',
      horario_decolagem: '08:10',
      horario_pouso: '09:00',
      horario_motor_desligado: '09:10',
      tempo_decolagem_pouso: '00:50',
      tempo_total: '01:10',
      tempo_ifr: '00:30',
      tempo_noturno: '00:00',
      pousos_diurnos: 1,
      pousos_noturnos: 0,
      starts: 1,
      pax: 8,
      payload: null,
      combustivel_inicio: 850,
      combustivel_fim: 610,
      unidade_combustivel: 'KG',
      origem_dados: 'SIGVOOS',
      sigvoos_importado_em: '2026-08-02T10:00:00-03:00',
    },
  ],
  crew: [
    {
      id: 201,
      empresa_id: 7,
      voo_id: 42,
      etapa_id: 101,
      funcionario_id: 10,
      nome: 'Tripulante Sintetico',
      canac: null,
      funcao: 'PIC',
      horario_apresentacao: '07:20',
      base_contratual: null,
      funcao_origem: 'SIGVOOS',
    },
  ],
  conflicts: [
    {
      id: 301,
      empresa_id: 7,
      entidade_tipo: 'voo',
      entidade_id: 42,
      campo: 'horario_decolagem',
      severidade: 'MEDIA',
      status: 'ABERTO',
    },
  ],
  rdv: {
    id: 401,
    empresa_id: 7,
    voo_id: 42,
    ocorrencias: 'Ocorrencia operacional sintetica',
    divergencias: 'Divergencia tecnica sintetica',
    updated_at: '2026-08-02T13:00:00-03:00',
  },
  crewTenantMismatch: null,
  crewLegMismatch: null,
});

function createDb(fixture: DbFixture) {
  const trace: StatementTrace[] = [];

  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          binds = values;
          return statement;
        },
        async first<T>() {
          trace.push({ sql, binds: [...binds], method: 'first' });
          if (sql.includes('FROM cv_voos v')) return fixture.flight as T | null;
          if (sql.includes('FROM cv_rdv_operacional')) return fixture.rdv as T | null;
          if (sql.includes('f.empresa_id <> ?')) return fixture.crewTenantMismatch as T | null;
          if (sql.includes('e.voo_id <> ?')) return fixture.crewLegMismatch as T | null;
          return null;
        },
        async all<T>() {
          trace.push({ sql, binds: [...binds], method: 'all' });
          if (sql.includes('FROM cv_conflitos_integracao c')) {
            return { results: fixture.conflicts as T[] };
          }
          if (sql.includes('FROM cv_voo_tripulantes t\n        LEFT JOIN')) {
            return { results: fixture.crew as T[] };
          }
          if (sql.includes('FROM cv_voo_etapas\n        WHERE')) {
            return { results: fixture.legs as T[] };
          }
          return { results: [] as T[] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { db, trace };
}

const options = {
  createdAt: '2026-08-02T14:30:00-03:00',
  draftId: '00000000-0000-4000-8000-000000000042',
};

async function expectPreviewError(
  fixture: DbFixture,
  code: EdbShadowPreviewError['code'],
): Promise<void> {
  const { db } = createDb(fixture);
  await expect(loadEdbShadowPreview(db, 7, 42, options)).rejects.toMatchObject({
    name: 'EdbShadowPreviewError',
    code,
  });
}

describe('eDB shadow preview adapter', () => {
  it('loads only tenant-scoped fields and projects a non-official shadow draft', async () => {
    const { db, trace } = createDb(defaultFixture());

    const result = await loadEdbShadowPreview(db, 7, 42, options);

    expect(result.draft).toMatchObject({
      schemaVersion: 'edb.draft.v1',
      draftId: options.draftId,
      tenantId: 7,
      status: 'shadow_draft',
      sourceFlightReference: 'cv_voos:42',
      operator: {
        legalName: 'Operador Sintetico',
        legalIdentifier: '00000000000000',
        operatingCertificate: null,
      },
      aircraft: {
        manufacturer: null,
        model: 'AW139',
        serialNumber: null,
        registration: 'PR-TST',
      },
      technicalStatus: {
        lastMaintenanceIntervention: null,
        nextMaintenanceIntervention: null,
        airframeHoursRemaining: null,
        returnToServiceReference: null,
        openDiscrepancyCount: null,
      },
    });
    expect(result.draft.legs[0]).toMatchObject({
      occurrenceSummary: 'Ocorrencia operacional sintetica',
      technicalDiscrepancySummary: null,
      cycles: null,
      times: {
        ifrActualMinutes: null,
        ifrSimulatedMinutes: null,
      },
    });
    expect(result.draft.legs[0].crew[0]).toMatchObject({
      displayName: 'Tripulante Sintetico',
      canac: null,
      function: 'P1',
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        { code: 'SOURCE_CONFLICT_OPEN', path: 'conflicts.0' },
        { code: 'TIMEZONE_REQUIRED', path: 'timezone' },
        {
          code: 'TECHNICAL_STATUS_SOURCE_UNAVAILABLE',
          path: 'technicalStatus.source',
        },
        { code: 'IFR_CLASSIFICATION_REQUIRED', path: 'legs.0.times.ifrActualMinutes' },
        { code: 'CYCLES_SOURCE_SEMANTICS_UNCONFIRMED', path: 'legs.0.cycles' },
        {
          code: 'TECHNICAL_DISCREPANCY_STRUCTURED_SOURCE_REQUIRED',
          path: 'rdv.divergencias',
        },
      ]),
    );
    expect(result.fieldSources).toEqual([
      {
        path: 'legs.0.occurrenceSummary',
        source: {
          kind: 'AIRTRUST_CONTROL_FLIGHTS',
          reference: 'cv_rdv_operacional:401',
          observedAt: '2026-08-02T13:00:00-03:00',
        },
      },
    ]);

    expect(trace.length).toBeGreaterThan(0);
    for (const statement of trace) {
      expect(statement.sql).not.toMatch(/SELECT\s+\*/i);
      expect(statement.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i);
      expect(statement.binds).toContain(7);
    }
  });

  it('returns not found without querying child records for a cross-tenant flight id', async () => {
    const { db, trace } = createDb({ ...defaultFixture(), flight: null });

    await expect(loadEdbShadowPreview(db, 7, 42, options)).rejects.toMatchObject({
      code: 'FLIGHT_NOT_FOUND',
      status: 404,
    });
    expect(trace).toHaveLength(1);
    expect(trace[0].binds).toEqual([42, 7]);
  });

  it('rejects a flight row returned outside the requested tenant', async () => {
    const fixture = defaultFixture();
    fixture.flight = { ...fixture.flight!, empresa_id: 8 };
    await expectPreviewError(fixture, 'TENANT_MISMATCH');
  });

  it('rejects a leg from another flight', async () => {
    const fixture = defaultFixture();
    fixture.legs[0] = { ...fixture.legs[0], voo_id: 99 };
    await expectPreviewError(fixture, 'LEG_SCOPE_MISMATCH');
  });

  it('rejects a crew row from another tenant', async () => {
    const fixture = defaultFixture();
    fixture.crew[0] = { ...fixture.crew[0], empresa_id: 8 };
    await expectPreviewError(fixture, 'CREW_TENANT_MISMATCH');
  });

  it('rejects a crew reference linked to an employee from another tenant', async () => {
    const fixture = defaultFixture();
    fixture.crewTenantMismatch = { id: 201 };
    await expectPreviewError(fixture, 'CREW_TENANT_MISMATCH');
  });

  it('rejects a crew stage linked to another flight', async () => {
    const fixture = defaultFixture();
    fixture.crewLegMismatch = { id: 201 };
    await expectPreviewError(fixture, 'LEG_SCOPE_MISMATCH');
  });

  it('rejects an RDV row from another tenant or flight', async () => {
    const tenantFixture = defaultFixture();
    tenantFixture.rdv = { ...tenantFixture.rdv!, empresa_id: 8 };
    await expectPreviewError(tenantFixture, 'TENANT_MISMATCH');

    const flightFixture = defaultFixture();
    flightFixture.rdv = { ...flightFixture.rdv!, voo_id: 99 };
    await expectPreviewError(flightFixture, 'FLIGHT_MISMATCH');
  });

  it('rejects a conflict outside the projected flight set', async () => {
    const fixture = defaultFixture();
    fixture.conflicts[0] = {
      ...fixture.conflicts[0],
      entidade_tipo: 'etapa',
      entidade_id: 999,
    };
    await expectPreviewError(fixture, 'CONFLICT_SCOPE_MISMATCH');
  });

  it('does not log names, CANAC or operational payloads on scope failure', async () => {
    const fixture = defaultFixture();
    fixture.conflicts[0] = { ...fixture.conflicts[0], entidade_id: 999 };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await expectPreviewError(fixture, 'CONFLICT_SCOPE_MISMATCH');
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      consoleLog.mockRestore();
    }
  });
});
