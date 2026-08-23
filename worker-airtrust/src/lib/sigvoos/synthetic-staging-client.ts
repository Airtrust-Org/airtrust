/**
 * Synthetic SIGVOOS client — STAGING QA ONLY.
 *
 * Implements the exact same boundary `syncSigvoosForFrms` talks to
 * (`SigvoosSyncClient`: `authenticate()` + `postSearch()`), so every line of
 * the real pipeline downstream (normalization, tripulante matching, FIRA
 * preview + confirm, relabel-as-canonical, reprocessing) runs completely
 * unmodified. This client never performs network I/O of any kind — there is
 * no fallback path to a real transport, by construction (see the guard in
 * `postSearch`, which throws rather than ever reaching for `fetch`).
 *
 * Never imported by any production code path. Only a staging QA runner
 * (scripts/staging/frms-sigvoos-synthetic-sync.mjs) constructs this class,
 * and only ever passes it via `SigvoosSyncDeps.createClient` — an optional
 * parameter that defaults to the real `SigvoosApiClient` everywhere else.
 */

export interface SyntheticSigvoosLegInput {
  canac: string;
  staffId: string;
  flightReportId: string;
  tripulanteNome: string;
  date: string; // YYYY-MM-DD
  engineStartTime: string; // HH:MM
  engineShutoffTime: string; // HH:MM
  navigationTimeStr: string; // H:MM — flight duration
  departureIcao?: string;
  aircraftRegistration?: string;
}

export class SyntheticSigvoosClientNetworkViolation extends Error {
  constructor(attempted: string) {
    super(
      `SYNTHETIC_SIGVOOS_CLIENT_NETWORK_VIOLATION: attempted "${attempted}" — ` +
        'the synthetic staging client must never reach a real transport.',
    );
    this.name = 'SyntheticSigvoosClientNetworkViolation';
  }
}

export class SyntheticSigvoosStagingClient {
  private readonly legs: SyntheticSigvoosLegInput[];

  constructor(legs: SyntheticSigvoosLegInput[]) {
    this.legs = legs;
  }

  async authenticate(_force = false): Promise<string> {
    // No network call, ever — a real client would hit POST {base_url}/get/token.
    return 'QA-SYNTHETIC-SIGVOOS-20260823-TOKEN';
  }

  async postSearch(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      // Defense in depth: even if a caller passed a full URL instead of a
      // path, refuse rather than silently accepting something fetch-shaped.
      throw new SyntheticSigvoosClientNetworkViolation(endpoint);
    }
    const page = Number(payload.page ?? 1);
    if (page > 1) {
      // Exactly one synthetic page — mirrors how a real search response
      // ends pagination (fewer items than page_size).
      return { data: [] };
    }
    return { data: this.legs.map((leg) => this.toRawSigvoosRecord(leg)) };
  }

  private toRawSigvoosRecord(leg: SyntheticSigvoosLegInput): Record<string, unknown> {
    return {
      staff: {
        id: leg.staffId,
        inscription: leg.staffId,
        canac: leg.canac,
        name: leg.tripulanteNome,
      },
      flight_report: {
        id: leg.flightReportId,
        aircraft: { registration: leg.aircraftRegistration ?? 'QA-SYNTH-001' },
      },
      flight_report_leg: {
        number: 1,
        departure_location: { icao_code: leg.departureIcao ?? 'SBQA' },
        arrival_location: { icao_code: leg.departureIcao ?? 'SBQA' },
        engine_start_time_str: leg.engineStartTime,
        engine_shutoff_time_str: leg.engineShutoffTime,
        landing_time_str: leg.engineShutoffTime,
        navigation_time_str: leg.navigationTimeStr,
        night_time_str: '0:00',
        ifr_time_str: '0:00',
        day_landings: 1,
        night_landings: 0,
        starts: 1,
      },
      date: leg.date,
    };
  }
}

/** A client that always throws on any call — used by tests to prove that in
 * synthetic mode there is no code path that reaches for a real transport. */
export class AlwaysNetworkSigvoosClient {
  async authenticate(): Promise<string> {
    throw new SyntheticSigvoosClientNetworkViolation('authenticate() reached real transport');
  }
  async postSearch(): Promise<Record<string, unknown>> {
    throw new SyntheticSigvoosClientNetworkViolation('postSearch() reached real transport');
  }
}
