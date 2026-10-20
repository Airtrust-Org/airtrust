import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { EmployeeSectorAccess } from '../../services/employee-sector-access';
import {
  resolveBoaCrewIdentity, registerBoaCheckin, loadBoaOperationalCase,
  registerBoaCaseAction, BOA_CHECKIN_TYPE, BOA_CASE_OPEN_TYPE,
  BOA_CASE_TREATMENT_TYPE, BOA_CASE_CLOSED_TYPE,
} from '../../lib/frms/bombeiros-operational-events';

const policy = {
  profile_code: 'FIREFIGHTER_AVIATION',
  revision_id: 'BOA-QA-R1', policy_version: 'BOA-QA-POLICY',
};
const checkin = {
  mission_type: 'RESGATE' as const,
  duty_period: 'NOTURNO' as const,
  standby_activation: true, critical_mission: true,
  sleep_hours_24h: 4, sleep_fragmented: true,
  kss_reported: 8, pvt_60s_completed: null,
  self_declared_unfit: true, acknowledge_confidentiality: true as const,
};
const manager: EmployeeSectorAccess = { mode: 'restricted', setorIds: [9], funcionarioId: null };
const wrongSector: EmployeeSectorAccess = { mode: 'restricted', setorIds: [10], funcionarioId: null };
const intervention = {
  responsavel: 'Coordenador operacional BOA', prazo: '2026-10-30',
  acao_mitigacao: 'Revisar escala e disponibilidade de repouso da equipe.',
  justificativa: 'Tripulante comunicou impedimento e necessita decisão humana.',
};

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, cargo TEXT,
      funcao TEXT, setor_id INTEGER, ativo INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ATIVO', deleted_at TEXT
    );
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT);
    CREATE TABLE usuarios_empresas (usuario_id INTEGER, empresa_id INTEGER);
    CREATE TABLE frms_fadiga_evento (
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, checkin_id TEXT,
      tipo TEXT NOT NULL, payload_json TEXT, created_at TEXT
    );
    INSERT INTO funcionarios (id, empresa_id, cargo, funcao, setor_id)
      VALUES (21,130,'Bombeiro Militar','Operador Aerotático',9),
             (22,6,'Piloto','Piloto',9),
             (23,131,'Bombeiro Militar','Operador Aerotático',10);
    INSERT INTO usuarios VALUES (101,21,NULL), (102,22,NULL), (103,23,NULL);
    INSERT INTO usuarios_empresas VALUES (101,130),(102,6),(103,131);
  `);
  const prepare = (sql: string) => {
    const statement = sqlite.prepare(sql);
    let values: (string | number | null)[] = [];
    const bound = {
      bind(...args: (string | number | null)[]) { values = args; return bound; },
      async first() { return statement.get(...values) ?? null; },
      async all() { return { results: statement.all(...values) }; },
      async run() {
        const result = statement.run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return bound;
  };
  const db = {
    prepare,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      sqlite.exec('BEGIN');
      try {
        const values = [];
        for (const stmt of statements) values.push(await stmt.run());
        sqlite.exec('COMMIT');
        return values;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}

describe('BOA check-in -> case -> intervention -> efficacy (SQLite, no offshore schema)', () => {
  it('does not map cross-tenant user or generic firefighter without aviation role', async () => {
    const { db, sqlite } = createDatabase();
    try {
      expect(await resolveBoaCrewIdentity(db, 130, 101)).toBe(21);
      expect(await resolveBoaCrewIdentity(db, 130, 102)).toBeNull();
      expect(await resolveBoaCrewIdentity(db, 6, 102)).rejects.toThrow('BOMBEIROS_INVALID_TENANT');
      expect(await resolveBoaCrewIdentity(db, 130, 103)).toBeNull();
      sqlite.exec(`UPDATE funcionarios SET funcao = 'Atendimento geral' WHERE id = 21`);
      expect(await resolveBoaCrewIdentity(db, 130, 101)).toBeNull();
    } finally { sqlite.close(); }
  });

  it('atomically records exactly one tenant-owned daily check-in and one review case', async () => {
    const { db, sqlite } = createDatabase();
    try {
      const one = await registerBoaCheckin(db, 130, 21, 101, '2026-10-20', checkin, policy);
      expect(one).toMatchObject({
        accepted: true, status: 'HUMAN_REVIEW_REQUIRED', dispatch_permission: 'NOT_GRANTED',
      });
      const duplicate = await registerBoaCheckin(db, 130, 21, 101, '2026-10-20', checkin, policy);
      expect(duplicate).toMatchObject({ accepted: false, status: 'ALREADY_RECEIVED' });
      const events = sqlite.prepare(
        'SELECT * FROM frms_fadiga_evento ORDER BY created_at ASC',
      ).all() as Array<{ empresa_id: number; tipo: string; payload_json: string }>;
      expect(events).toHaveLength(2);
      expect(events.map(x => x.tipo).sort()).toEqual([BOA_CASE_OPEN_TYPE, BOA_CHECKIN_TYPE].sort());
      expect(events.every(x => x.empresa_id === 130)).toBe(true);
      expect(JSON.parse(events.find(x => x.tipo === BOA_CHECKIN_TYPE)!.payload_json)).toMatchObject({
        funcionario_id: 21, profile_code: 'FIREFIGHTER_AVIATION', revision_id: 'BOA-QA-R1',
        dispatch_permission: 'NOT_GRANTED', kss_reported: 8,
      });
      expect(JSON.stringify(events)).not.toMatch(/HELICOPTER_OFFSHORE|score_fadiga/);
      const denied = await loadBoaOperationalCase(db, 130, one.case_id!, wrongSector);
      expect(denied).toBeNull();
      const found = await loadBoaOperationalCase(db, 130, one.case_id!, manager);
      expect(found?.status).toMatchObject({ state: 'ABERTO', treatment_recorded: false });
    } finally { sqlite.close(); }
  });

  it('prevents treating a Costa do Sol employee under a Bombeiros ID', async () => {
    const { db, sqlite } = createDatabase();
    try {
      const result = await registerBoaCheckin(db, 130, 22, 102, '2026-10-20', checkin, policy);
      expect(result.accepted).toBe(false);
      expect(sqlite.prepare('SELECT COUNT(*) n FROM frms_fadiga_evento').get()).toMatchObject({ n: 0 });
    } finally { sqlite.close(); }
  });

  it('enforces manager sector, treatment-before-closure, and append-only immutable efficacy', async () => {
    const { db, sqlite } = createDatabase();
    try {
      const one = await registerBoaCheckin(db, 130, 21, 101, '2026-10-20', checkin, policy);
      const id = one.case_id!;
      expect(await registerBoaCaseAction(db, 130, id, 201,
        { avaliacao_eficacia: 'Repouso e missão revistos por profissional competente.' },
        'closure', manager)).toBe('NOT_ALLOWED');
      expect(await registerBoaCaseAction(db, 130, id, 201, intervention, 'treatment', wrongSector))
        .toBe('NOT_ALLOWED');
      expect(await registerBoaCaseAction(db, 130, id, 201, intervention, 'treatment', manager))
        .toBe('RECORDED');
      expect(await registerBoaCaseAction(db, 130, id, 201, intervention, 'treatment', manager))
        .toBe('NOT_ALLOWED');
      expect((await loadBoaOperationalCase(db, 130, id, manager))?.status.state).toBe('EM_TRATAMENTO');
      expect(await registerBoaCaseAction(db, 130, id, 201,
        { avaliacao_eficacia: 'sem prova' }, 'closure', manager)).toBe('INVALID');
      expect(await registerBoaCaseAction(db, 130, id, 201,
        { avaliacao_eficacia: 'Repouso documentado e revisão da escala conferidos em reunião técnica.' },
        'closure', manager)).toBe('RECORDED');
      expect((await loadBoaOperationalCase(db, 130, id, manager))?.status).toMatchObject({
        state: 'RESOLVIDO', treatment_recorded: true,
      });
      expect(await registerBoaCaseAction(db, 130, id, 201, intervention, 'treatment', manager))
        .toBe('NOT_ALLOWED');
      const counts = sqlite.prepare('SELECT tipo, COUNT(*) as n FROM frms_fadiga_evento GROUP BY tipo').all()
        as Array<{ tipo: string; n: number }>;
      expect(Object.fromEntries(counts.map(x => [x.tipo, x.n]))).toMatchObject({
        [BOA_CHECKIN_TYPE]: 1, [BOA_CASE_OPEN_TYPE]: 1,
        [BOA_CASE_TREATMENT_TYPE]: 1, [BOA_CASE_CLOSED_TYPE]: 1,
      });
      expect(await loadBoaOperationalCase(db, 6, id, manager))
        .rejects.toThrow('BOMBEIROS_INVALID_TENANT');
    } finally { sqlite.close(); }
  });
});
