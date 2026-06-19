#!/usr/bin/env node

// source_reference: reads only the public/authenticated staging shadow-compare endpoint and emits sanitized aggregates for the current observation window.
// operational_decision: use only against staging, require token from env, and never persist or print secrets.
// dry_run_required: run without --write-report first to inspect stdout-only sanitized output.
// rollback_plan_required: no rollback needed because this script is read-only and performs no writes.

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const DEFAULT_FROM = '2026-06-12';
const DEFAULT_TO = '2026-06-18';
const DEFAULT_DAY = 'day-0';

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    dayLabel: DEFAULT_DAY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') args.baseUrl = argv[index + 1] ?? args.baseUrl, (index += 1);
    else if (arg === '--from') args.from = argv[index + 1] ?? args.from, (index += 1);
    else if (arg === '--to') args.to = argv[index + 1] ?? args.to, (index += 1);
    else if (arg === '--day-label') args.dayLabel = argv[index + 1] ?? args.dayLabel, (index += 1);
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  AIRTRUST_STAGING_TOKEN=... node scripts/staging/collect-sigvoos-shadow-compare-7d.mjs',
      '  AIRTRUST_STAGING_TOKEN=... node scripts/staging/collect-sigvoos-shadow-compare-7d.mjs --from 2026-06-12 --to 2026-06-18 --day-label day-3',
      '',
      'Safety:',
      '  - staging only',
      '  - reads AIRTRUST_STAGING_TOKEN from env only',
      '  - prints sanitized aggregates only',
    ].join('\n'),
  );
}

function assertStagingBaseUrl(baseUrl) {
  if (!baseUrl.includes('airtrust-api-staging.airtrust.workers.dev')) {
    throw new Error('Refusing to run outside the staging API host.');
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { response, json, text };
}

function sanitizeHealth(json) {
  return {
    success: Boolean(json?.success),
    status: json?.status || null,
    environment: json?.stats?.environment || null,
  };
}

function sanitizeVersion(json) {
  return {
    success: Boolean(json?.success),
    environment: json?.data?.environment || null,
    version: json?.data?.version || null,
  };
}

function sanitizeCompare(json) {
  const data = json?.data || {};
  const totals = data.totals || {};
  const rec = data.recommendation || {};
  const aggregateStatus = {
    byDateAllMatch: Array.isArray(data.divergences?.byDate)
      ? data.divergences.byDate.every((row) => row?.status === 'MATCH')
      : null,
    byBaseAllMatch: Array.isArray(data.divergences?.byBase)
      ? data.divergences.byBase.every((row) => row?.status === 'MATCH')
      : null,
    byAircraftAllMatch: Array.isArray(data.divergences?.byAircraft)
      ? data.divergences.byAircraft.every((row) => row?.status === 'MATCH')
      : null,
  };

  return {
    success: Boolean(json?.success),
    authContext: {
      role: data.authContext?.role || null,
      empresaId: data.authContext?.empresaId ?? null,
      tenantScoped: data.authContext?.tenantScoped ?? null,
    },
    writesEnabled: data.writesEnabled ?? null,
    recommendation: {
      status: rec.status || null,
      reasons: Array.isArray(rec.reasons) ? rec.reasons : [],
    },
    totals: {
      previewStagingRecords: totals.previewStagingRecords ?? null,
      cvFlights: totals.cvFlights ?? null,
      cvStages: totals.cvStages ?? null,
      cvCrew: totals.cvCrew ?? null,
      frmsJourneysSigvoos: totals.frmsJourneysSigvoos ?? null,
      frmsAlertsSigvoos: totals.frmsAlertsSigvoos ?? null,
      openIntegrationConflicts: totals.openIntegrationConflicts ?? null,
    },
    missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
    normalizationErrors: Array.isArray(data.normalizationErrors) ? data.normalizationErrors : [],
    aggregateStatus,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertStagingBaseUrl(args.baseUrl);

  const token = process.env.AIRTRUST_STAGING_TOKEN;
  if (!token) {
    throw new Error('AIRTRUST_STAGING_TOKEN is required.');
  }

  const compareUrl = `${args.baseUrl}/api/controle-voos/sigvoos/shadow-compare?from=${encodeURIComponent(args.from)}&to=${encodeURIComponent(args.to)}`;

  const [version, health, compare] = await Promise.all([
    fetchJson(`${args.baseUrl}/api/version`),
    fetchJson(`${args.baseUrl}/api/health`),
    fetchJson(compareUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
  ]);

  if (!compare.response.ok || !compare.json?.success) {
    throw new Error(`Shadow compare request failed with status ${compare.response.status}.`);
  }

  const output = {
    observedAt: new Date().toISOString(),
    dayLabel: args.dayLabel,
    window: {
      from: args.from,
      to: args.to,
    },
    version: sanitizeVersion(version.json),
    health: sanitizeHealth(health.json),
    shadowCompare: sanitizeCompare(compare.json),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
