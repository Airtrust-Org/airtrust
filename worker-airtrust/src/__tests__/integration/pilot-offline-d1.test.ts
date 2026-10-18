import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateJWT } from '../../utils/security';
import { buildPilotOfflineLeaseClaims, signPilotOfflineLease } from '../../services/controle-voos/pilot-offline-lease';
import { computeOfflineSyncCommandHash, type PilotOfflineSyncCommand } from '../../services/controle-voos/pilot-offline-sync';
import type { Env } from '../../types';

// Resolve the explicitly pinned root dependency, independent of Wrangler's version.
const testDirectory = dirname(fileURLToPath(import.meta.url));
const rootRequire = createRequire(resolve(testDirectory, '../../../../package.json'));
const { Miniflare } = rootRequire('miniflare') as {
  Miniflare: new (options: { cf: boolean; modules: boolean; script: string; d1Databases: string[]; bindings: Record<string, string> }) => {
    ready: Promise<{ toString(): string }>;
    dispose(): Promise<void>;
  };
};
const { build } = rootRequire('esbuild') as typeof import('esbuild');
const secret = 'synthetic-local-test-only-secret-1234567890';
const device = 'synthetic-device-0001';
let script: string;
let miniflare: InstanceType<typeof Miniflare>;
let url: string;
let env: Env;
async function request(path: string, options?: RequestInit) { return fetch(new URL(path, url), options); }
async function state(): Promise<Record<string, any[]>> { return (await request('/__fixture/state')).json(); }
type ResultBody = { code: string; data: { results: Array<{ status: string; client_operation_id: string; canonical_entity_id: string; server_entity_version: number }> } };
async function responseBody(response: Response): Promise<ResultBody> { return response.json() as Promise<ResultBody>; }
async function token(user = 70, tenant = 7) {
  return (await generateJWT({ sub: user, email: 'synthetic@example.invalid', role: 'ALUNO', empresa_id: tenant, token_type: 'access' }, secret)).token;
}
async function command(overrides: Partial<PilotOfflineSyncCommand> = {}): Promise<PilotOfflineSyncCommand> {
  const tenant = overrides.tenant_id ?? 7;
  const user = overrides.user_id ?? 70;
  const deviceId = overrides.device_id ?? device;
  const employee = user === 70 ? 77 : user === 71 ? 78 : 88;
  const claims = buildPilotOfflineLeaseClaims({ env, tenantId: tenant, userId: user, funcionarioId: employee, flightId: 42, deviceId });
  const cmd: PilotOfflineSyncCommand = {
    client_operation_id: '123e4567-e89b-42d3-a456-426614174000', tenant_id: tenant, user_id: user,
    flight_id: 42, device_id: deviceId, command_type: 'rdv_snapshot_upsert_v1',
    entity_type: 'rdv_snapshot', operation_type: 'upsert', base_server_version: 3,
    base_flight_version: 6, local_sequence: 1, claimed_at: '2026-09-09T19:30:00.000Z',
    payload_hash: '0'.repeat(64), lease: await signPilotOfflineLease(env, claims),
    payload: {
      source_package_id: 'pilot-offline:v1:voo:42:v6:rdv:3', source_rdv_id: 90,
      rdv: { numero: 'RDV-TEST', data_voo: '2026-09-09', ocorrencias: 'offline preserved' },
      flight_update: { numero_db: 'DB-TEST' },
      stages: [
        { source_stage_id: 10, source_stage_updated_at: 'revision-1', fields: { numero_etapa: 1, origem_icao: 'SBME', destino_icao: '9PCP', pax: 7, peso_vazio: 9000 } },
        { source_stage_id: null, fields: { numero_etapa: 2, origem_icao: '9PCP', destino_icao: 'SBME', pax: 8, peso_vazio: 9000 } },
      ],
      fuelings: [{ client_local_id: 'fuel-1', data_hora: '2026-09-09T10:00:00Z', etapa_numero: 2, empresa_abastecimento_codigo: 'TEST', litros_abastecidos: 120, numero_nota: 'TEST-1', nota: 'fuel note' }],
      justifications: [{ justificativa_codigo: 'TEST', minutos: 20, observacao: 'reason' }],
    },
    ...overrides,
  };
  cmd.payload_hash = await computeOfflineSyncCommandHash(cmd);
  return cmd;
}
async function send(cmd: PilotOfflineSyncCommand, user = 70, tenant = 7, race?: 'rdv' | 'new-rdv' | 'duplicate', signal?: AbortSignal, holdResponse = false) {
  return request('/pilot/offline-sync', { method: 'POST', headers: { Authorization: `Bearer ${await token(user, tenant)}`, 'Content-Type': 'application/json', ...(race ? { 'X-Test-Race': race } : {}), ...(holdResponse ? { 'X-Test-Lose-Response': '1' } : {}) }, body: JSON.stringify({ commands: [cmd] }), signal });
}
async function commitThenDisconnect(cmd: PilotOfflineSyncCommand) {
  const controller = new AbortController();
  const pending = send(cmd, 70, 7, undefined, controller.signal, true);
  // Attach a rejection handler immediately so a failed request is never lost.
  const result = pending.then(() => 'received', (error: Error) => error.name);
  let committed: Record<string, any[]> | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    committed = await state();
    if (committed.cv_offline_sync_receipts.length) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
  expect(committed?.cv_offline_sync_receipts).toHaveLength(1);
  controller.abort();
  expect(await result).toBe('AbortError');
  return committed!;
}
beforeAll(async () => {
  const result = await build({ entryPoints: [resolve(testDirectory, 'fixtures/pilot-offline-d1-worker.ts')], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' });
  script = result.outputFiles[0].text;
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  env = { PILOT_OFFLINE_LEASE_PRIVATE_KEY_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey)), PILOT_OFFLINE_LEASE_KEY_ID: 'synthetic-test-key' } as Env;
});
beforeEach(async () => {
  miniflare = new Miniflare({ cf: false, modules: true, script, d1Databases: ['DB'], bindings: { ENVIRONMENT: 'test', JWT_SECRET: secret, PILOT_OFFLINE_SYNC_ENABLED: 'true', PILOT_OFFLINE_LEASE_PRIVATE_KEY_JWK: env.PILOT_OFFLINE_LEASE_PRIVATE_KEY_JWK!, PILOT_OFFLINE_LEASE_KEY_ID: env.PILOT_OFFLINE_LEASE_KEY_ID! } });
  url = (await miniflare.ready).toString();
  expect((await request('/__fixture/setup', { method: 'POST' })).status).toBe(200);
});
afterEach(async () => { await miniflare?.dispose(); });

describe('Pilot offline sync with a disposable local D1 Worker', () => {
  it('replays the exact operation after the HTTP response is lost, preserving all committed data', async () => {
    const cmd = await command();
    const committed = await commitThenDisconnect(cmd);
    expect(committed.cv_rdv_operacional[0]).toMatchObject({ versao: 4, ocorrencias: 'offline preserved' });
    expect(committed.cv_voo_etapas).toHaveLength(2);
    expect(committed.cv_voo_etapas[0].pax).toBe(7);
    expect(committed.cv_voo_abastecimentos).toHaveLength(1);
    expect(committed.cv_voo_justificativas[0]).toMatchObject({ minutos: 20, observacao: 'reason', deleted_at: null });
    expect(committed.cv_voo_eventos).toHaveLength(1);
    expect(committed.cv_offline_sync_receipts).toHaveLength(1);
    expect(committed.cv_offline_sync_receipts[0]).toMatchObject({ payload_hash: cmd.payload_hash, result_status: 'accepted', canonical_entity_id: '90', server_entity_version: 4 });
    const replay = await send(cmd);
    expect(replay.status).toBe(200);
    const body = await responseBody(replay);
    expect(body.data.results[0]).toMatchObject({ client_operation_id: cmd.client_operation_id, status: 'already_accepted', canonical_entity_id: '90', server_entity_version: 4 });
    expect(await state()).toEqual(committed);
  });
  it('rejects divergent content, mismatched identities and cross-tenant replay without writes', async () => {
    const cmd = await command();
    expect((await send(cmd)).status).toBe(200);
    const committed = await state();
    const different = await command({ payload: { ...cmd.payload, rdv: { numero: 'RDV-TEST', data_voo: '2026-09-09', ocorrencias: 'changed' } } });
    let response = await send(different);
    expect(response.status).toBe(409);
    expect((await responseBody(response)).code).toBe('CONTROLE_VOOS_PILOT_SYNC_OPERATION_HASH_CONFLICT');
    response = await send({ ...different, payload_hash: cmd.payload_hash });
    expect(response.status).toBe(409);
    expect((await responseBody(response)).code).toBe('CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_HASH_MISMATCH');
    response = await send(cmd, 80, 8);
    expect(response.status).toBe(403);
    expect((await responseBody(response)).code).toBe('CONTROLE_VOOS_PILOT_SYNC_CONTEXT_MISMATCH');
    response = await send(await command({ tenant_id: 8, user_id: 80 }), 80, 8);
    expect(response.status).toBe(404);
    response = await send(await command({ user_id: 71 }), 71, 7);
    expect(response.status).toBe(409);
    expect((await responseBody(response)).code).toBe('CONTROLE_VOOS_PILOT_SYNC_OPERATION_CONTEXT_CONFLICT');
    response = await send(await command({ device_id: 'synthetic-device-0002' }));
    expect(response.status).toBe(409);
    expect((await responseBody(response)).code).toBe('CONTROLE_VOOS_PILOT_SYNC_OPERATION_CONTEXT_CONFLICT');
    expect(await state()).toEqual(committed);
  });
  it('does not apply any part of the snapshot if another writer wins after preflight', async () => {
    const before = await state();
    const cmd = await command();
    const response = await send(cmd, 70, 7, 'rdv');
    expect(response.status).toBe(200);
    const body = await responseBody(response);
    expect(body.data.results[0].status).toBe('conflict');
    const after = await state();
    expect(after.cv_rdv_operacional[0]).toMatchObject({ versao: 4, ocorrencias: 'coordination change' });
    expect(after.cv_voos).toEqual(before.cv_voos);
    expect(after.cv_voo_etapas).toEqual(before.cv_voo_etapas);
    expect(after.cv_voo_abastecimentos).toEqual(before.cv_voo_abastecimentos);
    expect(after.cv_voo_justificativas).toEqual(before.cv_voo_justificativas);
    expect(after.cv_voo_eventos).toEqual(before.cv_voo_eventos);
    expect(after.cv_offline_sync_receipts).toHaveLength(1);
    expect(after.cv_offline_sync_receipts[0].result_status).toBe('conflict');
    expect((await responseBody(await send(cmd))).data.results[0].status).toBe('conflict');
    expect(await state()).toEqual(after);
  });
  it('replays an identical command that commits while the first request is in flight', async () => {
    const cmd = await command();
    const response = await send(cmd, 70, 7, 'duplicate');
    expect(response.status).toBe(200);
    expect((await responseBody(response)).data.results[0].status).toBe('already_accepted');
    const committed = await state();
    expect(committed.cv_rdv_operacional[0]).toMatchObject({ versao: 4, ocorrencias: 'offline preserved' });
    expect(committed.cv_voo_etapas).toHaveLength(2);
    expect(committed.cv_voo_abastecimentos).toHaveLength(1);
    expect(committed.cv_voo_eventos).toHaveLength(1);
    expect(committed.cv_offline_sync_receipts).toHaveLength(1);
    expect((await responseBody(await send(cmd))).data.results[0].status).toBe('already_accepted');
    expect(await state()).toEqual(committed);
  });
  it('creates a new RDV and replays its receipt after a lost response', async () => {
    await request('/__fixture/no-rdv', { method: 'POST' });
    const initial = await command();
    const cmd = await command({ base_server_version: 0, payload: { ...initial.payload, source_package_id: 'pilot-offline:v1:voo:42:v6:rdv:0', source_rdv_id: null } });
    const committed = await commitThenDisconnect(cmd);
    expect(committed.cv_rdv_operacional).toHaveLength(1);
    expect(committed.cv_rdv_operacional[0]).toMatchObject({ versao: 1, ocorrencias: 'offline preserved' });
    expect(committed.cv_voo_etapas).toHaveLength(2);
    expect(committed.cv_offline_sync_receipts[0]).toMatchObject({ result_status: 'accepted', server_entity_version: 1, canonical_entity_id: String(committed.cv_rdv_operacional[0].id) });
    expect((await responseBody(await send(cmd))).data.results[0].status).toBe('already_accepted');
    expect(await state()).toEqual(committed);
  });
  it('rolls back all snapshot writes if another writer creates the RDV after preflight', async () => {
    await request('/__fixture/no-rdv', { method: 'POST' });
    const before = await state();
    const initial = await command();
    const cmd = await command({ base_server_version: 0, payload: { ...initial.payload, source_package_id: 'pilot-offline:v1:voo:42:v6:rdv:0', source_rdv_id: null } });
    const response = await send(cmd, 70, 7, 'new-rdv');
    expect(response.status).toBe(200);
    expect((await responseBody(response)).data.results[0].status).toBe('conflict');
    const after = await state();
    expect(after.cv_rdv_operacional[0]).toMatchObject({ id: 91, versao: 1, ocorrencias: 'coordination change' });
    for (const table of ['cv_voos', 'cv_voo_etapas', 'cv_voo_abastecimentos', 'cv_voo_justificativas', 'cv_voo_eventos']) expect(after[table]).toEqual(before[table]);
    expect(after.cv_offline_sync_receipts).toHaveLength(1);
    expect(after.cv_offline_sync_receipts[0].result_status).toBe('conflict');
  });
  it('rolls back RDV and receipt if a later stage write fails', async () => {
    await request('/__fixture/fail-stage', { method: 'POST' });
    const before = await state();
    expect((await send(await command())).status).toBe(500);
    expect(await state()).toEqual(before);
  });
});
