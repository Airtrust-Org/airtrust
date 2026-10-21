import { describe, expect, it } from 'vitest';
import {
  resolveBoaCrewIdentity, registerBoaCheckin, loadBoaCrewCheckinStatus, loadBoaOperationalCase,
  registerBoaCaseAction, loadBoaCaseQueue, BOA_CHECKIN_TYPE, BOA_CASE_OPEN_TYPE,
} from '../../lib/frms/bombeiros-operational-events';
import type { EmployeeSectorAccess } from '../../services/employee-sector-access';

const authorized: EmployeeSectorAccess = {
  mode: 'restricted', setorIds: [9], funcionarioId: null,
};
const input = {
  mission_type: 'RESGATE' as const, duty_period: 'NOTURNO' as const,
  standby_activation: true, critical_mission: true,
  sleep_hours_24h: 4, sleep_fragmented: true, kss_reported: 8,
  pvt_60s_completed: null, self_declared_unfit: true,
  acknowledge_confidentiality: true as const,
};
const governance = {
  profile_code: 'FIREFIGHTER_AVIATION', revision_id: 'boa-r1',
  policy_version: 'boa-p1',
};
function fakeDb(options: {
  employee?: Record<string, unknown> | null;
  case?: Record<string, unknown> | null;
  receipt?: Record<string, unknown> | null;
  childEvents?: unknown[];
  batchChanges?: number[];
  writeChanges?: number;
} = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  let selectCount = 0;
  const db = {
    prepare(sql: string) {
      const record = { sql, values: [] as unknown[] };
      queries.push(record);
      const bound = {
        bind(...values: unknown[]) { record.values = values; return bound; },
        async first() {
          if (/FROM usuarios u/.test(sql)) return options.employee ?? null;
          selectCount += 1;
          if (selectCount === 1) return options.case ?? null;
          return options.receipt ?? null;
        },
        async all() { return { results: options.childEvents ?? [] }; },
        async run() { return { meta: { changes: options.writeChanges ?? 1 } }; },
      };
      return bound;
    },
    async batch(statements: unknown[]) {
      expect(statements).toHaveLength(2);
      return (options.batchChanges ?? [1, 1]).map(changes => ({ meta: { changes } }));
    },
  } as unknown as D1Database;
  return { db, queries };
}

describe('BOA event intake and immutable case stream contracts', () => {
  it('refuses company 6 before performing any query or writing', async () => {
    const { db, queries } = fakeDb();
    await expect(resolveBoaCrewIdentity(db, 6, 19)).rejects.toThrow('BOMBEIROS_INVALID_TENANT');
    await expect(registerBoaCheckin(db, 6, 21, 19, '2026-10-20', input, governance))
      .rejects.toThrow('BOMBEIROS_INVALID_TENANT');
    expect(queries).toHaveLength(0);
  });

  it('only resolves employee through tenant-scoped authenticated user relation', async () => {
    const { db, queries } = fakeDb({ employee: {
      id: 21, empresa_id: 130, cargo: 'Bombeiro Militar', funcao: 'Operador Aerotático',
    } });
    expect(await resolveBoaCrewIdentity(db, 130, 19)).toBe(21);
    expect(queries[0].sql).toContain('usuarios_empresas ue');
    expect(queries[0].sql).toContain('f.empresa_id = ue.empresa_id');
    expect(queries[0].values).toEqual([130, 19, 130]);
  });

  it('rejects worker from another tenant even if user lookup returned data', async () => {
    const { db } = fakeDb({ employee: {
      id: 21, empresa_id: 6, cargo: 'Piloto', funcao: null,
    } });
    expect(await resolveBoaCrewIdentity(db, 130, 19)).toBeNull();
  });

  it('always writes receipt and review case atomically, without offshore score', async () => {
    const { db, queries } = fakeDb({ batchChanges: [1, 1] });
    const saved = await registerBoaCheckin(db, 130, 21, 19, '2026-10-20', input, governance);
    expect(saved).toMatchObject({
      accepted: true, dispatch_permission: 'NOT_GRANTED',
      status: 'HUMAN_REVIEW_REQUIRED',
    });
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain('NOT EXISTS');
    expect(queries[0].sql).toContain("json_extract(e.payload_json, '$.funcionario_id')");
    expect(queries[0].values).toContain(BOA_CHECKIN_TYPE);
    expect(queries[1].values).toContain(BOA_CASE_OPEN_TYPE);
    const receipt = String(queries[0].values[4]);
    expect(receipt).toContain('"profile_code":"FIREFIGHTER_AVIATION"');
    expect(receipt).not.toMatch(/score_fadiga|HELICOPTER_OFFSHORE/);
    expect(queries[1].sql).toContain('EXISTS');
  });

  it('treats duplicate daily receipt as NOT an operational clearance', async () => {
    const { db } = fakeDb({ batchChanges: [0, 0] });
    const result = await registerBoaCheckin(db, 130, 21, 19, '2026-10-20', input, governance);
    expect(result).toMatchObject({
      accepted: false, status: 'ALREADY_RECEIVED', dispatch_permission: 'NOT_GRANTED',
      case_id: null,
    });
  });

  it('rejects inconsistent two-write stream rather than claiming success', async () => {
    const { db } = fakeDb({ batchChanges: [1, 0] });
    await expect(registerBoaCheckin(db, 130, 21, 19, '2026-10-20', input, governance))
      .rejects.toThrow('BOMBEIROS_CASE_OPEN_INTEGRITY_ERROR');
  });

  it('case load checks owner, sector, exact event type and receipt linkage', async () => {
    const { db, queries } = fakeDb({
      case: { id: 'case-1', tipo: BOA_CASE_OPEN_TYPE,
        payload_json: '{"funcionario_id":21}', created_at: '2026-10-20' },
      receipt: { id: 'receipt-1' },
      childEvents: [],
    });
    const found = await loadBoaOperationalCase(db, 130, 'case-1', authorized);
    expect(found?.status.state).toBe('ABERTO');
    expect(queries[0].sql).toContain('f.empresa_id = ?');
    expect(queries[0].sql).toContain('f.setor_id IN (?)');
    expect(queries[0].sql).toContain('invalid_treatment_count');
    expect(queries[0].sql).toContain('invalid_closure_count');
    expect(queries[0].sql).toContain('opening_dispatch');
    expect(queries[0].values).toEqual(['case-1', 130, BOA_CASE_OPEN_TYPE, 130, 9]);
    expect(queries[1].sql).toContain('e.empresa_id = ?');
  });

  it('never reads cases with missing manager sector scope', async () => {
    const { db, queries } = fakeDb();
    const found = await loadBoaOperationalCase(db, 130, 'case-1',
      { mode: 'restricted', setorIds: [], funcionarioId: null });
    expect(found).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('returns own check-in receipt status without health values or any offshore inference', async () => {
    const queries: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const entry = { sql, binds: [] as unknown[] };
        queries.push(entry);
        return { bind(...args: unknown[]) {
          entry.binds = args;
          return { async all() {
            return { results: queries.length === 1 ? [{ id: 'boa-receipt-21' }]
              : [{ id: 'boa-case-21' }] };
          } };
        } };
      },
    } as unknown as D1Database;
    const status = await loadBoaCrewCheckinStatus(db, 130, 21, '2026-10-20');
    expect(status).toMatchObject({
      received: true, checkin_id: 'boa-receipt-21',
      case_id: 'boa-case-21', human_review_required: true,
      dispatch_permission: 'NOT_GRANTED',
    });
    expect(queries[0].binds).toEqual([
      130, 130, 21, BOA_CHECKIN_TYPE, BOA_CHECKIN_TYPE, '2026-10-20',
    ]);
    expect(queries[1].binds).toEqual([
      130, 130, 'boa-receipt-21', BOA_CASE_OPEN_TYPE, BOA_CHECKIN_TYPE, 21, 21,
    ]);
    expect(queries[1].sql).toContain("json_extract(c.payload_json, '$.funcionario_id')");
    expect(JSON.stringify(status)).not.toMatch(/kss|sleep|pvt|funcionario_id|HELICOPTER_OFFSHORE/i);
  });

  it('returns not received rather than a false approval when no check-in exists', async () => {
    const db = { prepare: () => ({
      bind: () => ({ async all() { return { results: [] }; } }),
    }) } as unknown as D1Database;
    expect(await loadBoaCrewCheckinStatus(db, 130, 21, '2026-10-20')).toMatchObject({
      received: false, case_id: null, dispatch_permission: 'NOT_GRANTED',
    });
  });

  it('blocks orphan or duplicate crew receipts instead of reporting success', async () => {
    for (const results of [
      [[{ id: 'one' }, { id: 'two' }]],
      [[{ id: 'one' }], []],
      [[{ id: 'one' }], [{ id: 'case-a' }, { id: 'case-b' }]],
    ]) {
      let n = 0;
      const db = { prepare: () => ({
        bind: () => ({ async all() { return { results: results[n++] }; } }),
      }) } as unknown as D1Database;
      await expect(loadBoaCrewCheckinStatus(db, 130, 21, '2026-10-20'))
        .rejects.toThrow('BOMBEIROS_CHECKIN_STATUS_INTEGRITY_ERROR');
    }
  });

  it('blocks any employee 6 status lookup before SQL', async () => {
    const { db, queries } = fakeDb();
    await expect(loadBoaCrewCheckinStatus(db, 6, 21, '2026-10-20'))
      .rejects.toThrow('BOMBEIROS_INVALID_TENANT');
    expect(queries).toHaveLength(0);
  });

  it('requires the opened case to reference a receipt owned by the same employee and tenant', async () => {
    const { db, queries } = fakeDb({
      case: { id: 'case-1', tipo: BOA_CASE_OPEN_TYPE,
        payload_json: '{"funcionario_id":21}', created_at: '2026-10-20T12:00:00Z' },
      receipt: null,
    });
    expect(await loadBoaOperationalCase(db, 130, 'case-1', authorized)).toBeNull();
    expect(queries[1].sql).toContain("json_extract(e.payload_json, '$.funcionario_id')");
    expect(queries[1].sql).toContain("json_extract(base.payload_json, '$.funcionario_id')");
    expect(queries[1].sql).toContain("'NOT_GRANTED'");
    expect(queries[1].values).toEqual([
      'case-1', 130, 130, BOA_CHECKIN_TYPE, BOA_CASE_OPEN_TYPE,
    ]);
  });

  it('refuses corrupt or out-of-order treatment and closure history', async () => {
    const base = {
      case: { id: 'case-1', tipo: BOA_CASE_OPEN_TYPE,
        payload_json: '{"funcionario_id":21}', created_at: '2026-10-20T12:00:00Z' },
      receipt: { id: 'receipt-1' },
    };
    const invalid = [
      [{ tipo: 'BOA_CASE_TREATMENT_V1', payload_json: 'not-json',
        created_at: '2026-10-20T13:00:00Z' }],
      [{ tipo: 'BOA_CASE_TREATMENT_V1',
          payload_json: '{"schema":"FRMS_CASE_TREATMENT_V1","responsavel":"AB","prazo":"2026-10-30"}',
          created_at: '2026-10-20T13:00:00Z' },
       { tipo: 'BOA_CASE_CLOSED_V1',
          payload_json: '{"schema":"FRMS_CASE_RESOLUTION_V1","avaliacao_eficacia":"ok"}',
          created_at: '2026-10-20T13:30:00Z' }],
      [{ tipo: 'BOA_CASE_CLOSED_V1', payload_json: '{}',
        created_at: '2026-10-20T13:30:00Z' }],
    ];
    for (const childEvents of invalid) {
      const { db } = fakeDb({ ...base, childEvents });
      await expect(loadBoaOperationalCase(db, 130, 'case-1', authorized))
        .rejects.toThrow('BOMBEIROS_CASE_STREAM_INTEGRITY_ERROR');
    }
  });

  it('case treatment write rechecks ownership and rejects concurrent duplicates', async () => {
    const { db, queries } = fakeDb({
      case: { id: 'case-1', tipo: BOA_CASE_OPEN_TYPE, payload_json: '{}', created_at: '2026-10-20' },
      receipt: { id: 'receipt-1' }, childEvents: [], writeChanges: 0,
    });
    const result = await registerBoaCaseAction(db, 130, 'case-1', 90, {
      responsavel: 'Coordenação BOA', prazo: '2026-10-30',
      acao_mitigacao: 'Aguardar revisão formal da escala e repouso do tripulante.',
      justificativa: 'Tripulante declarou indisponibilidade e requer ação responsável.',
    }, 'treatment', authorized);
    expect(result).toBe('NOT_ALLOWED');
    const insert = queries.find(q => q.sql.startsWith('INSERT INTO frms_fadiga_evento'));
    expect(insert?.sql).toContain('NOT EXISTS');
    expect(insert?.sql).toContain('f.empresa_id = ?');
    expect(insert?.sql).toContain("receipt.empresa_id = base.empresa_id");
    expect(insert?.sql).toContain("json_extract(receipt.payload_json, '$.funcionario_id')");
    expect(insert?.sql).toContain("json_extract(base.payload_json, '$.funcionario_id')");
    expect(insert?.values).toContain(130);
  });

  it('sanitizes BOA manager queue with tenant, sector and cursor limitation', async () => {
    const queries: Array<{ sql: string; bind: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const request = { sql, bind: [] as unknown[] };
        queries.push(request);
        return {
          bind(...values: unknown[]) {
            request.bind = values;
            return {
              async all() { return { results: [
                { case_id: 'case-a', created_at: '2026-10-20T10:00:00Z', opening_schema: 'BOA_CASE_OPENED_V1', opening_dispatch: 'NOT_GRANTED', treatment_count: 0, closure_count: 0, invalid_treatment_count: 0, invalid_closure_count: 0, treatment_at: null, closure_at: null },
                { case_id: 'case-b', created_at: '2026-10-19T10:00:00Z', opening_schema: 'BOA_CASE_OPENED_V1', opening_dispatch: 'NOT_GRANTED', treatment_count: 1, closure_count: 1, invalid_treatment_count: 0, invalid_closure_count: 0, treatment_at: '2026-10-19T11:00:00Z', closure_at: '2026-10-19T12:00:00Z' },
              ] }; },
            };
          },
        };
      },
    } as unknown as D1Database;
    const queue = await loadBoaCaseQueue(db, 130, authorized, 1);
    expect(queue?.items).toMatchObject([
      { case_id: 'case-a', state: 'ABERTO', treatment_recorded: false },
    ]);
    expect(queue?.next_cursor).toEqual({ created_at: '2026-10-20T10:00:00Z', id: 'case-a' });
    expect(queries[0].sql).toContain('e.empresa_id = ?');
    expect(queries[0].sql).toContain('f.empresa_id = ?');
    expect(queries[0].sql).toContain('f.setor_id IN (?)');
    expect(queries[0].bind).toEqual([130, 130, BOA_CASE_OPEN_TYPE, 9, 2]);
    expect(JSON.stringify(queue)).not.toMatch(/funcionario_id|kss_reported|sleep_hours/);
  });

  it('fails closed when manager queue has duplicate or impossible event transitions', async () => {
    const cases = [
      { treatment_count: 2, closure_count: 0 },
      { treatment_count: 0, closure_count: 1 },
      { treatment_count: 1, closure_count: 2 },
      { treatment_count: 1, closure_count: 1, invalid_treatment_count: 1 },
      { treatment_count: 1, closure_count: 1, invalid_closure_count: 1 },
      { treatment_count: 1, closure_count: 1, closure_at: '2026-10-20T11:00:00Z' },
      { opening_schema: 'HELICOPTER_OFFSHORE' },
      { opening_dispatch: 'GRANTED' },
    ];
    for (const counts of cases) {
      const db = {
        prepare: () => ({
          bind: () => ({
            async all() {
              return { results: [{
                case_id: 'bad-1', created_at: '2026-10-20T11:00:00Z',
                opening_schema: 'BOA_CASE_OPENED_V1', opening_dispatch: 'NOT_GRANTED',
                treatment_count: 0, closure_count: 0,
                invalid_treatment_count: 0, invalid_closure_count: 0,
                treatment_at: '2026-10-20T12:00:00Z',
                closure_at: '2026-10-20T13:00:00Z', ...counts,
              }] };
            },
          }),
        }),
      } as unknown as D1Database;
      await expect(loadBoaCaseQueue(db, 130, authorized))
        .rejects.toThrow('BOA_CASE_QUEUE_INTEGRITY_ERROR');
    }
  });

  it('never queries case queue under empresa 6 or without authorized manager sectors', async () => {
    const { db, queries } = fakeDb();
    await expect(loadBoaCaseQueue(db, 6, authorized)).rejects.toThrow('BOMBEIROS_INVALID_TENANT');
    const noSectors: EmployeeSectorAccess = { mode: 'restricted', setorIds: [], funcionarioId: null };
    expect(await loadBoaCaseQueue(db, 130, noSectors)).toBeNull();
    expect(queries).toHaveLength(0);
  });
});
