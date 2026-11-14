import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  buildExpiredCrewQualificationsSql,
  findExpiredCrewQualifications,
} from '../../../lib/qualificacoes/expired-crew-qualifications';

type Scalar = string | number | null;
type SqliteSync = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: Scalar[]): unknown;
    all(...args: Scalar[]): Record<string, unknown>[];
  };
  close(): void;
};
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (name: string) => SqliteSync;

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_tipos (
      id INTEGER, empresa_id INTEGER, nome TEXT, codigo TEXT,
      validade INTEGER, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER,
      qualificacao_id INTEGER, qualificacao_codigo TEXT, tipo TEXT,
      data_conclusao TEXT, data_vencimento TEXT, validade_meses INTEGER,
      renovacao_de INTEGER, deleted_at TEXT, status TEXT
    );

    INSERT INTO funcionarios VALUES
      (1,6,'PIC',NULL),(2,6,'SIC',NULL),(3,6,'TREINANDO',NULL),
      (4,6,'CALENDARIO',NULL),(5,6,'SEM_LINEAGE',NULL),
      (7,7,'TENANT_SEPARADO',NULL);

    INSERT INTO qualificacoes_tipos VALUES
      (10,6,'CMA','CMA',12,NULL),
      (20,6,'CRM','CRM',12,NULL),
      (10,7,'CMA OUTRO TENANT','CMA',12,NULL);

    INSERT INTO qualificacoes_historico VALUES
      (101,6,1,10,'CMA','CMA','2025-11-01','2026-11-01',12,NULL,NULL,'CONCLUIDA'),
      (100,6,1,10,'CMA','CMA','2026-10-01','2027-10-01',12,101,NULL,'CONCLUIDA'),
      (111,6,2,10,'CMA','CMA','2025-11-13','2026-11-13',12,NULL,NULL,'CONCLUIDA'),
      (112,6,2,20,'CRM','CRM','2025-11-13','2026-11-13',12,NULL,NULL,'CANCELADA'),
      (113,6,3,10,'CMA','CMA',NULL,'2026-11-13',12,NULL,NULL,'PLANEJADA'),
      (114,6,4,10,'CMA','CMA','2025-11-14','2026-11-14',12,NULL,NULL,'CONCLUIDA'),
      (115,6,5,20,'CRM','CRM','2025-10-01','2026-10-01',12,NULL,NULL,'CONCLUIDA'),
      (116,6,5,20,'CRM','CRM','2026-10-01','2027-10-01',12,NULL,NULL,'CONCLUIDA'),
      (117,7,7,10,'CMA','CMA','2025-09-01','2026-09-01',12,NULL,NULL,'CONCLUIDA'),
      (118,7,2,10,'CMA','CMA','2025-08-01','2026-08-01',12,NULL,NULL,'CONCLUIDA');
  `);
  const recorded: Array<{ sql: string; binds: Scalar[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: Scalar[]) => ({
        all: async () => {
          recorded.push({ sql, binds });
          return { results: sqlite.prepare(sql).all(...binds) };
        },
      }),
    }),
  } as unknown as D1Database;
  return { sqlite, db, recorded };
}

describe('F14-01/02 — consulta de qualificação vencida de tripulantes', () => {
  it('não acusa renovação válida nem PLAN/CANCELADA; usa data real, tenant e cronologia', async () => {
    const { sqlite, db } = fixture();
    try {
      const records = await findExpiredCrewQualifications(db, 6, [1, 2, 3, 4, 5, 7], '2026-11-14');
      expect(records.map((x) => [x.func_id, x.qual_codigo, x.data_vencimento_calc]))
        .toEqual([[2, 'CMA', '2026-11-13']]);
    } finally { sqlite.close(); }
  });

  it('fim da validade é inclusivo e só passa a vencida no dia seguinte em São Paulo', async () => {
    const { sqlite, db } = fixture();
    try {
      expect((await findExpiredCrewQualifications(db, 6, [4], '2026-11-14'))).toHaveLength(0);
      expect((await findExpiredCrewQualifications(db, 6, [4], '2026-11-15')).map(x => x.func_id))
        .toEqual([4]);
    } finally { sqlite.close(); }
  });

  it('zero ids não executa SQL; IDs repetidos não duplicam; sem interpolação de IDs no SQL', async () => {
    const { sqlite, db, recorded } = fixture();
    try {
      expect(await findExpiredCrewQualifications(db, 6, [], '2026-11-14')).toEqual([]);
      expect(recorded).toHaveLength(0);
      expect((await findExpiredCrewQualifications(db, 6, [2,2,2], '2026-11-14'))).toHaveLength(1);
      expect(recorded).toHaveLength(1);
      expect(recorded[0].binds).toEqual([6,2,'2026-11-14']);
      expect(recorded[0].sql).not.toContain('qh.renovada = 0');
    } finally { sqlite.close(); }
  });

  it('falha fechado para funcionário não-numérico, sem suprimir a verificação', async () => {
    const { sqlite, db, recorded } = fixture();
    try {
      await expect(findExpiredCrewQualifications(db, 6, [2, NaN], '2026-11-14'))
        .rejects.toThrow('INVALID_CREW_QUALIFICATION_EMPLOYEE_ID');
      expect(recorded).toHaveLength(0);
    } finally { sqlite.close(); }
  });

  it('mantém as 90 variáveis por lote D1, reservando binds para tenant e dia', async () => {
    const { sqlite, db, recorded } = fixture();
    try {
      const ids = Array.from({ length: 200 }, (_, i) => i + 1);
      const rows = await findExpiredCrewQualifications(db, 6, ids, '2026-11-14');
      expect(rows.map(x => x.func_id)).toEqual([2]);
      expect(recorded.map(x => x.binds.length)).toEqual([92,92,22]);
      expect(recorded.every(x => x.sql.includes('qh.empresa_id = ?'))).toBe(true);
      expect(() => buildExpiredCrewQualificationsSql(91)).toThrow('INVALID_CREW_QUALIFICATION_BIND_COUNT');
    } finally { sqlite.close(); }
  });
});
