import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const wranglerPath = resolve(root, 'worker-airtrust/wrangler.toml');
const evidencePath = resolve(root, 'docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json');
const wrangler = readFileSync(wranglerPath, 'utf8');

function environmentVars(environment: 'staging' | 'production'): string {
  const match = wrangler.match(
    new RegExp(
      `\\[env\\.${environment}\\.vars\\]([\\s\\S]*?)(?=\\n\\[\\[env\\.${environment}\\.|\\n\\[env\\.${environment}\\.|$)`,
    ),
  );
  if (!match) {
    throw new Error(`env.${environment}.vars ausente em worker-airtrust/wrangler.toml`);
  }
  return match[1];
}

function productionVars(): string {
  return environmentVars('production');
}

function stagingVars(): string {
  return environmentVars('staging');
}

function isProductionPilotSyncEnabled(): boolean {
  return /^PILOT_OFFLINE_SYNC_ENABLED\s*=\s*"true"\s*$/m.test(productionVars());
}

type AcceptanceRow = {
  platform?: string;
  mode?: string;
  orientation?: string;
  result?: string;
  scenario_results?: Record<string, string>;
};

type AcceptanceEvidence = {
  status?: string;
  staging_release_sha?: string;
  worker_source_sha?: string;
  pages_source_sha?: string;
  validated_at?: string;
  rows?: AcceptanceRow[];
};

const requiredRows = [
  ['ipad', 'safari', 'portrait'],
  ['ipad', 'safari', 'landscape'],
  ['ipad', 'pwa', 'n/a'],
  ['android', 'chrome', 'portrait'],
  ['android', 'chrome', 'landscape'],
  ['android', 'pwa', 'n/a'],
] as const;

const mandatoryScenarios = [
  '1_vault_unlock','2_download_authorized_package','3_local_package_readiness',
  '4_rdv_saved_on_tablet','5_airplane_offline','6_refresh_reopen_offline',
  '7_restore_exact_saved_value','8_continue_offline_revision','9_reconnect_transmit',
  '10_idempotent_receipt_no_duplicate','11_explicit_conflict_handling',
  '12_finalize_separate_from_sync','13_coordination_handoff_receipt',
  '14_service_worker_scope_isolated','15_touch_scroll_no_critical_overflow',
] as const;

describe('Pilot production real-device gate', () => {
  it('mantem a configuracao Pilot versionada e permite ativacao de producao somente com o gate de evidencia', () => {
    const staging = stagingVars();
    const production = productionVars();

    expect(staging).toMatch(
      /^PILOT_OFFLINE_LEASE_KEY_ID\s*=\s*"pilot-staging-20260910-01"\s*$/m,
    );
    expect(staging).toMatch(/^PILOT_OFFLINE_LEASE_TTL_MINUTES\s*=\s*"720"\s*$/m);
    expect(staging).toMatch(/^PILOT_OFFLINE_SYNC_ENABLED\s*=\s*"true"\s*$/m);

    expect(production).toMatch(
      /^PILOT_OFFLINE_LEASE_KEY_ID\s*=\s*"pilot-production-20260910-02"\s*$/m,
    );
    expect(production).toMatch(/^PILOT_OFFLINE_LEASE_TTL_MINUTES\s*=\s*"720"\s*$/m);
    expect(production).toMatch(/^PILOT_OFFLINE_SYNC_ENABLED\s*=\s*"true"\s*$/m);

    expect(wrangler).not.toMatch(/^PILOT_OFFLINE_LEASE_PRIVATE_KEY_JWK\s*=/m);
  });

  it('mantem sync de producao fail-closed ate existir evidencia real completa da #580', () => {
    if (!isProductionPilotSyncEnabled()) {
      expect(isProductionPilotSyncEnabled()).toBe(false);
      return;
    }

    expect(
      existsSync(evidencePath),
      'PILOT_OFFLINE_SYNC_ENABLED=true em production exige docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json',
    ).toBe(true);

    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as AcceptanceEvidence;
    expect(evidence.status).toBe('PASS');
    expect(evidence.staging_release_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(evidence.validated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // An archived PASS is historical and NEVER approves a newer release.
    // Only the explicit Pilot release gate supplies the exact staging SHA.
    const releaseSha = process.env.PILOT_ACCEPTANCE_RELEASE_SHA;
    if (releaseSha) {
      expect(releaseSha).toMatch(/^[0-9a-f]{40}$/);
      expect(evidence.staging_release_sha).toBe(releaseSha);
      expect(evidence.worker_source_sha).toBe(releaseSha);
      expect(evidence.pages_source_sha).toBe(releaseSha);
    }
    expect(Array.isArray(evidence.rows)).toBe(true);

    for (const [platform, mode, orientation] of requiredRows) {
      const row = evidence.rows?.find(
        (candidate) =>
          candidate.platform?.toLowerCase() === platform &&
          candidate.mode?.toLowerCase() === mode &&
          candidate.orientation?.toLowerCase() === orientation,
      );
      expect(row?.result, `evidencia real obrigatoria ausente: ${platform}/${mode}/${orientation}`).toBe('PASS');
      for (const scenario of mandatoryScenarios) {
        expect(row?.scenario_results?.[scenario], `cenario ${scenario} pendente em ${platform}/${mode}/${orientation}`).toBe('PASS');
      }
    }
  });
});
