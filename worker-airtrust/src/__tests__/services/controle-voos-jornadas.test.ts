import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { listControleVoosJornadas } from '../../services/controle-voos/controle-voos-jornadas';

type SqliteD1 = D1Database & {
  databasePath: string;
  queryJson: <T>(sql: string) => T[];
};

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migration0410Sql = readFileSync(join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'), 'utf8');
const migration0411Sql = readFileSync(
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  'utf8',
);

function runSql(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], {
    input: sql,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createSqliteD1(): SqliteD1 {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-jornadas-'));
  const databasePath = join(tempDir, 'jornadas.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  runSql(databasePath, migration0410Sql);
  runSql(databasePath, migration0411Sql);
  runSql(
    databasePath,
    `
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );
    `,
  );

  runSql(
    databasePath,
    `
      INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
      VALUES
        (101, 1, 'SBRJ', 'SBRJ', 'Santos Dumont', 'aeroporto', 1, 1),
        (102, 1, 'SBSP', 'SBSP', 'Congonhas', 'aeroporto', 1, 2),
        (201, 2, 'SBBR', 'SBBR', 'Brasilia', 'aeroporto', 1, 1),
        (202, 2, 'SBCF', 'SBCF', 'Confins', 'aeroporto', 1, 2);

      INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (301, 1, 'REG', 'Regular', 1, 1), (302, 2, 'REG', 'Regular B', 1, 1);

      INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (401, 1, 'PAX', 'Passageiro', 1, 1), (402, 2, 'PAX', 'Passageiro B', 1, 1);

      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada,
        status, origem_importacao, sigvoos_flight_report_id, sigvoos_importado_em, created_by, updated_by
      ) VALUES
        (
          601, 1, 'ATX-1001', '2026-06-14', 101, 102,
          301, 401, '2026-06-14T10:00:00Z', '2026-06-14T11:00:00Z',
          'planejado', 'SIGVOOS', 700101, '2026-06-14T12:00:00Z', 10, 10
        ),
        (
          701, 2, 'BTX-2001', '2026-06-14', 201, 202,
          302, 402, '2026-06-14T12:00:00Z', '2026-06-14T13:00:00Z',
          'planejado', 'SIGVOOS', 800101, '2026-06-14T12:00:00Z', 20, 20
        );

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number,
        origem_icao, destino_icao, horario_motor_ligado, horario_decolagem,
        horario_pouso, horario_motor_desligado, tempo_total, tempo_navegacao,
        tempo_ifr, tempo_noturno, pousos_diurnos, pousos_noturnos, starts, pax,
        combustivel_inicio, combustivel_fim, origem_dados, sigvoos_importado_em
      ) VALUES
        (
          9001, 1, 601, 1, 1, 'SBRJ', 'SBSP', '08:00', '08:12', '09:08', '09:14',
          '01:14', '00:56', '00:30', NULL, 1, 0, 1, 10, 1086, 730, 'SIGVOOS', '2026-06-14T12:00:00Z'
        ),
        (
          9002, 2, 701, 1, 1, 'SBBR', 'SBCF', '10:00', '10:15', '11:00', '11:05',
          '01:05', '00:45', NULL, NULL, 1, 0, 1, 4, NULL, NULL, 'SIGVOOS', '2026-06-14T12:00:00Z'
        );

      INSERT INTO funcionarios (id, nome, empresa_id, deleted_at)
      VALUES (1001, 'Tripulante A', 1, NULL), (2001, 'Tripulante B', 2, NULL);

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, funcao_origem, created_by, updated_by
      ) VALUES
        (9101, 1, 601, 1001, 'PIC', 9001, 7001, NULL, 10, 10),
        (9102, 2, 701, 2001, 'PIC', 9002, 8001, NULL, 20, 20);
    `,
  );

  return {
    databasePath,
    queryJson: <T>(sql: string) => queryJson<T>(databasePath, sql),
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          const rows = queryJson<T>(databasePath, sql.replace(/\?/g, () => {
            const value = binds.shift();
            if (value == null) return 'NULL';
            if (typeof value === 'number') return String(value);
            return `'${String(value).replace(/'/g, "''")}'`;
          }));
          return rows[0] || null;
        },
        all: async <T = unknown>() => ({
          results: queryJson<T>(
            databasePath,
            sql.replace(/\?/g, () => {
              const value = binds.shift();
              if (value == null) return 'NULL';
              if (typeof value === 'number') return String(value);
              return `'${String(value).replace(/'/g, "''")}'`;
            }),
          ),
        }),
        run: async () => ({ meta: { changes: 1, last_row_id: 0 } }),
      };
      return statement;
    },
  } as unknown as SqliteD1;
}

afterAll(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('controle-voos jornadas read model', () => {
  it('lista jornadas tenant-scoped sem usar FRMS', async () => {
    const db = createSqliteD1();
    const result = await listControleVoosJornadas(db, 1, {
      dataInicio: '2026-06-14',
      dataFim: '2026-06-14',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      voo_id: 601,
      etapa_id: 9001,
      external_id_sigvoos: 700101,
      sigvoos_leg_number: 1,
      tripulante_id: 1001,
      nome: 'Tripulante A',
      funcao: 'PIC',
      aeronave: 'ATX-1001',
      origem_icao: 'SBRJ',
      destino_icao: 'SBSP',
      tempo_ifr: '00:30',
      pax: 10,
      fuel_start: 1086,
      fuel_end: 730,
      origem_dados: 'importado',
      qualidade_dado: 'completo',
    });
  });

  it('retorna empty state para periodo sem jornadas', async () => {
    const db = createSqliteD1();
    const result = await listControleVoosJornadas(db, 1, {
      dataInicio: '2026-06-01',
      dataFim: '2026-06-01',
    });

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('isola jornadas por empresa_id', async () => {
    const db = createSqliteD1();
    const tenantB = await listControleVoosJornadas(db, 2, {
      dataInicio: '2026-06-14',
      dataFim: '2026-06-14',
    });

    expect(tenantB.total).toBe(1);
    expect(tenantB.items[0]?.nome).toBe('Tripulante B');
    expect(tenantB.items[0]?.voo_id).toBe(701);
  });
});
