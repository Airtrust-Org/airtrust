// source_reference: #1426, #776, reviewed CAS #1564 and controller #1581.
// operational_decision: private staging bindings only; no HTTP or remote SQL transport.
// dry_run_required: validate in disposable D1 before any approved deployment.
// rollback_plan_required: encrypted preimage, fresh Time Travel, independent compensation grant.
import { createHash, randomUUID } from 'node:crypto';
import { TARGET } from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import { evaluateQaCases } from '../../scripts/staging/inspect-frms-ux-cases.mjs';

export const LOCK = 'airtrust-staging-mutations-and-scorm-qa';
const fail = code => { throw new Error(code); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const marks = ids => ids.map(() => '?').join(',');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** storage is private DurableObjectStorage, never KV (eventually consistent).
 * No lease expiry: a crashed owner requires reviewed recovery, never concurrent takeover. */
export function durableCoordinator(storage) {
  return {
    async acquireLock(name) {
      if (name !== LOCK) fail('QA_LOCK_SCOPE_REJECTED');
      return storage.transaction(async tx => {
        if (await tx.get('lock')) return { held: false };
        const lock = { held: true, token: randomUUID() };
        await tx.put('lock', lock);
        return lock;
      });
    },
    async releaseLock(lock) {
      await storage.transaction(async tx => {
        if ((await tx.get('lock'))?.token !== lock.token) fail('QA_LOCK_OWNER_REJECTED');
        await tx.delete('lock');
      });
    },
    async reserveNonce({ nonce, sha, scope }) {
      if (!/^[a-f0-9]{64}$/.test(nonce)) fail('QA_NONCE_INVALID');
      return storage.transaction(async tx => {
        if (await tx.get('nonce:' + nonce)) return false;
        await tx.put('nonce:' + nonce, { sha, scope });
        return true;
      });
    },
    async audit(event) {
      await storage.transaction(async tx => {
        const sequence = (await tx.get('audit-sequence') ?? 0) + 1;
        await tx.put('audit:' + String(sequence).padStart(12, '0'), event);
        await tx.put('audit-sequence', sequence);
      });
    },
  };
}

/** Capture from the documented Time Travel API, NOT D1 session bookmarks.
 * fetcher is injected only by the test harness; deployed entrypoint uses global fetch. */
export function timeTravelReader({ accountId, token, fetcher = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId) || !token) fail('QA_RECOVERY_CREDENTIAL_REQUIRED');
  return async dbId => {
    if (dbId !== TARGET.db_id) fail('QA_RECOVERY_DATABASE_REJECTED');
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/time_travel/bookmark`, {
      method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) fail('QA_TIME_TRAVEL_UNAVAILABLE');
    const result = await response.json();
    if (result.success !== true || !String(result.result?.bookmark ?? '').trim()) fail('QA_TIME_TRAVEL_UNAVAILABLE');
    return { dbId, bookmark: result.result.bookmark, capturedAt: new Date().toISOString() };
  };
}

/** Trusted deployment supplies bindings, never the RPC caller. ACL/lifecycle are
 * infrastructure prerequisites; expiration is also enforced on every read. */
export function privateR2Store(bucket) {
  return {
    async storeProtected(encrypted) {
      const reference = 'frms-qa/999013/' + randomUUID();
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const stored = await bucket.put(reference, JSON.stringify({ encrypted, expiresAt }), {
        onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' },
      });
      if (!stored) fail('QA_ARTIFACT_STORAGE_FAILED');
      // Read back persisted ciphertext before issuing the review receipt.
      const verified = await bucket.get(reference);
      if (!verified || !same(await verified.json(), { encrypted, expiresAt })) fail('QA_ARTIFACT_STORAGE_FAILED');
      return { restricted: true, reference, expiresAt, sha256: encrypted.sha256 };
    },
    async readProtected(reference) {
      if (!/^frms-qa\/999013\/[a-f0-9-]{36}$/.test(reference)) fail('QA_ARTIFACT_REFERENCE_REJECTED');
      const object = await bucket.get(reference);
      if (!object) fail('QA_ARTIFACT_MISSING');
      const saved = await object.json();
      if (!Number.isFinite(Date.parse(saved.expiresAt)) || Date.parse(saved.expiresAt) <= Date.now()) fail('QA_ARTIFACT_EXPIRED');
      return saved.encrypted;
    },
  };
}

export function d1ScopeAdapter({ db, plan, expected }) {
  const ids = plan.operations.map(op => op.id);
  const journeys = plan.operations.filter(op => op.table === 'frms_jornada').map(op => op.id);
  const cases = plan.operations.filter(op => op.table === 'frms_alerta').map(op => op.id);
  const scope = input => {
    if (input?.tenantId !== 999013 || !same(input.ids, ids)) fail('QA_ADAPTER_SCOPE_REJECTED');
  };
  const query = async (sql, params = []) => (await db.prepare(sql).bind(...params).all()).results;
  const readScope = async input => {
    scope(input);
    const crew = await query("SELECT * FROM funcionarios WHERE empresa_id=999013 ORDER BY id");
    if (crew.length !== 14 || crew.some((f, i) => f.ativo !== 1 || f.deleted_at !== null ||
      !/^QA-FRMS-UX-(0[1-9]|1[0-4])$/.test(f.matricula) || crew.findIndex(x => x.matricula === f.matricula) !== i)) fail('QA_SYNTHETIC_TENANT_REQUIRED');
    const employees = crew.map(f => f.id);
    const users = await query('SELECT u.* FROM usuarios u JOIN usuarios_empresas e ON e.usuario_id=u.id WHERE e.empresa_id=999013 ORDER BY u.id');
    const membership = await query('SELECT * FROM usuarios_empresas WHERE empresa_id=999013 ORDER BY usuario_id');
    const roles = await query('SELECT * FROM usuarios_empresas_perfis WHERE empresa_id=999013 ORDER BY usuario_id,perfil');
    const allJourneys = await query('SELECT * FROM frms_jornada WHERE empresa_id=999013 ORDER BY id');
    const allCases = await query('SELECT a.* FROM frms_alerta a JOIN funcionarios f ON f.id=a.tripulante_id WHERE f.empresa_id=999013 ORDER BY a.id');
    const rows = plan.operations.map(op => {
      const original = (op.table === 'frms_jornada' ? allJourneys : allCases).find(row => row.id === op.id);
      if (!original || !employees.includes(Number(original.tripulante_id))) fail('QA_PREIMAGE_TENANT_OR_ID_REJECTED');
      return { table: op.table, id: op.id, updated_at: original.updated_at, original };
    });
    return { tenantId: 999013, dbId: TARGET.db_id, crewCount: crew.length, rows,
      usersFingerprint: hash([users, membership, roles]),
      untouchedFingerprint: hash([crew, allJourneys.filter(j => !journeys.includes(j.id)), allCases.filter(a => !cases.includes(a.id))]),
    };
  };
  return {
    readScope,
    async getDb(dbId) {
      if (dbId !== TARGET.db_id) fail('QA_DATABASE_REJECTED');
      return db;
    },
    async postcheck(input) {
      const snapshot = await readScope(input);
      const rows = await query(`SELECT a.id,a.tipo_limite,a.resolvido,a.valor_atual_min,a.jornada_id,
        f.matricula,j.id AS link_id,j.data AS jornada_date,j.origem,j.registrado_por,j.observacao,j.duracao_jornada_minutos
        FROM frms_alerta a JOIN funcionarios f ON f.id=a.tripulante_id AND f.empresa_id=999013
        JOIN frms_jornada j ON j.id=a.jornada_id AND j.empresa_id=999013 AND j.tripulante_id=f.id
        WHERE a.id IN (${marks(cases)}) AND a.deleted_at IS NULL AND j.deleted_at IS NULL`, cases);
      const { rows: _privateRows, ...identity } = snapshot;
      return { ...identity, valid: evaluateQaCases(rows, expected).valid };
    },
  };
}
