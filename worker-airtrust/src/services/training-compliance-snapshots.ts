type SnapshotPerson = {
  setor_id: number | null;
  funcao_id: number | null;
  total_obrigatorios: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
};

export type ComplianceSnapshotScope = { setor_id: number; funcao_id: number };

export type ComplianceDailySnapshot = {
  snapshot_date: string;
  setor_id: number;
  funcao_id: number;
  pessoas: number;
  pessoas_com_pendencia: number;
  requisitos_obrigatorios: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  compliance_pct: number | null;
};

async function snapshotTableExists(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='training_compliance_daily_snapshots' LIMIT 1")
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

function aggregate(
  people: SnapshotPerson[],
  setorId: number,
  funcaoId: number,
  date: string,
): ComplianceDailySnapshot {
  const total = people.reduce((sum, person) => sum + person.total_obrigatorios, 0);
  const conformes = people.reduce((sum, person) => sum + person.conformes, 0);
  return {
    snapshot_date: date,
    setor_id: setorId,
    funcao_id: funcaoId,
    pessoas: people.length,
    pessoas_com_pendencia: people.filter(
      (person) =>
        person.vencendo + person.vencidos + person.nao_realizados + person.em_andamento > 0,
    ).length,
    requisitos_obrigatorios: total,
    conformes,
    vencendo: people.reduce((sum, person) => sum + person.vencendo, 0),
    vencidos: people.reduce((sum, person) => sum + person.vencidos, 0),
    nao_realizados: people.reduce((sum, person) => sum + person.nao_realizados, 0),
    em_andamento: people.reduce((sum, person) => sum + person.em_andamento, 0),
    compliance_pct: total > 0 ? Math.round((conformes / total) * 1000) / 10 : null,
  };
}

export function buildDailyComplianceSnapshots(
  people: SnapshotPerson[],
  date = new Date().toISOString().slice(0, 10),
): ComplianceDailySnapshot[] {
  const snapshots = [aggregate(people, 0, 0, date)];
  const groups = new Map<string, { setor_id: number; funcao_id: number; people: SnapshotPerson[] }>();
  const add = (setorId: number, funcaoId: number, person: SnapshotPerson) => {
    if (setorId === 0 && funcaoId === 0) return;
    const key = `${setorId}:${funcaoId}`;
    const group = groups.get(key) || { setor_id: setorId, funcao_id: funcaoId, people: [] };
    group.people.push(person);
    groups.set(key, group);
  };
  for (const person of people) {
    const setorId = Number(person.setor_id || 0);
    const funcaoId = Number(person.funcao_id || 0);
    if (setorId > 0) add(setorId, 0, person);
    if (funcaoId > 0) add(0, funcaoId, person);
    if (setorId > 0 && funcaoId > 0) add(setorId, funcaoId, person);
  }
  for (const group of groups.values()) {
    snapshots.push(aggregate(group.people, group.setor_id, group.funcao_id, date));
  }
  return snapshots;
}

export async function persistTrainingComplianceDailySnapshots(
  db: D1Database,
  empresaId: number,
  people: SnapshotPerson[],
  date = new Date().toISOString().slice(0, 10),
): Promise<{ ready: boolean; written: number }> {
  if (!(await snapshotTableExists(db))) return { ready: false, written: 0 };
  const snapshots = buildDailyComplianceSnapshots(people, date);
  for (const snapshot of snapshots) {
    await db
      .prepare(
        `INSERT INTO training_compliance_daily_snapshots (
          empresa_id, setor_id, funcao_id, snapshot_date, pessoas, pessoas_com_pendencia,
          requisitos_obrigatorios, conformes, vencendo, vencidos, nao_realizados,
          em_andamento, compliance_pct, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(empresa_id, setor_id, funcao_id, snapshot_date) DO UPDATE SET
          pessoas = excluded.pessoas,
          pessoas_com_pendencia = excluded.pessoas_com_pendencia,
          requisitos_obrigatorios = excluded.requisitos_obrigatorios,
          conformes = excluded.conformes,
          vencendo = excluded.vencendo,
          vencidos = excluded.vencidos,
          nao_realizados = excluded.nao_realizados,
          em_andamento = excluded.em_andamento,
          compliance_pct = excluded.compliance_pct,
          updated_at = datetime('now')`,
      )
      .bind(
        empresaId,
        snapshot.setor_id,
        snapshot.funcao_id,
        snapshot.snapshot_date,
        snapshot.pessoas,
        snapshot.pessoas_com_pendencia,
        snapshot.requisitos_obrigatorios,
        snapshot.conformes,
        snapshot.vencendo,
        snapshot.vencidos,
        snapshot.nao_realizados,
        snapshot.em_andamento,
        snapshot.compliance_pct,
      )
      .run();
  }
  return { ready: true, written: snapshots.length };
}

export async function readTrainingComplianceTrend(
  db: D1Database,
  empresaId: number,
  scopes: ComplianceSnapshotScope[],
  days: number,
): Promise<{ ready: boolean; data: ComplianceDailySnapshot[] }> {
  if (!(await snapshotTableExists(db))) return { ready: false, data: [] };
  const boundedDays = Math.max(7, Math.min(365, Math.floor(days) || 90));
  if (!scopes.length) return { ready: true, data: [] };
  const scopeSql = scopes.map(() => '(setor_id = ? AND funcao_id = ?)').join(' OR ');
  const scopeBindings = scopes.flatMap((scope) => [scope.setor_id, scope.funcao_id]);
  const rows = await db
    .prepare(
      `SELECT snapshot_date,
              SUM(pessoas) AS pessoas,
              SUM(pessoas_com_pendencia) AS pessoas_com_pendencia,
              SUM(requisitos_obrigatorios) AS requisitos_obrigatorios,
              SUM(conformes) AS conformes,
              SUM(vencendo) AS vencendo,
              SUM(vencidos) AS vencidos,
              SUM(nao_realizados) AS nao_realizados,
              SUM(em_andamento) AS em_andamento
         FROM training_compliance_daily_snapshots
        WHERE empresa_id = ?
          AND (${scopeSql})
          AND snapshot_date >= date('now', ?)
        GROUP BY snapshot_date
        ORDER BY snapshot_date ASC`,
    )
    .bind(empresaId, ...scopeBindings, `-${boundedDays - 1} days`)
    .all<{
      snapshot_date: string;
      pessoas: number;
      pessoas_com_pendencia: number;
      requisitos_obrigatorios: number;
      conformes: number;
      vencendo: number;
      vencidos: number;
      nao_realizados: number;
      em_andamento: number;
    }>();
  const data = (rows.results || []).map((row) => ({
    ...row,
    setor_id: scopes.length === 1 ? scopes[0].setor_id : -1,
    funcao_id: scopes.length === 1 ? scopes[0].funcao_id : -1,
    compliance_pct:
      Number(row.requisitos_obrigatorios) > 0
        ? Math.round((Number(row.conformes) / Number(row.requisitos_obrigatorios)) * 1000) / 10
        : null,
  }));
  return { ready: true, data };
}
