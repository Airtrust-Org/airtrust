import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const temporaryDirectories: string[] = [];
const migrationPath = resolve(
  process.cwd(),
  'migrations/0390_training_class_management.sql',
);

function sqlite(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return result.stdout.trim();
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('migration 0390 training class management', () => {
  it('mantem a migration aditiva e deixa compatibilidade legada para o runtime', () => {
    const directory = mkdtempSync(join(tmpdir(), 'airtrust-training-class-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'test.sqlite');

    sqlite(
      databasePath,
      `
      PRAGMA foreign_keys = OFF;
      CREATE TABLE treinamentos_planejados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        data_prevista TEXT NOT NULL,
        hora_inicio TEXT,
        hora_fim TEXT,
        status TEXT NOT NULL,
        instrutor_id INTEGER,
        simulador_id INTEGER,
        aeronave_id INTEGER,
        local TEXT,
        carga_horaria_prevista INTEGER,
        titulo TEXT,
        descricao TEXT,
        observacoes TEXT,
        motivo_cancelamento TEXT,
        efetivado_em TEXT,
        efetivado_por INTEGER,
        sessao_id INTEGER,
        created_by INTEGER,
        created_at TEXT,
        updated_at TEXT,
        deleted_at TEXT
      );
      CREATE TABLE treinamentos_participantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        treinamento_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        confirmado INTEGER,
        presente INTEGER,
        aprovado INTEGER,
        nota REAL,
        observacoes TEXT,
        qualificacao_historico_id INTEGER,
        created_at TEXT,
        updated_at TEXT,
        UNIQUE(treinamento_id, funcionario_id)
      );
      INSERT INTO treinamentos_planejados
        (id, empresa_id, qualificacao_tipo_id, data_prevista, hora_inicio, hora_fim,
         status, instrutor_id, local)
      VALUES (10, 1, 9, '2026-06-20', NULL, NULL, 'PLANEJADO', 5, 'Sala Alpha');
      `,
    );

    sqlite(databasePath, readFileSync(migrationPath, 'utf8'));

    expect(
      sqlite(
        databasePath,
        `SELECT COALESCE(data_inicio, 'NULL') || '|' || COALESCE(data_fim, 'NULL') || '|' || modalidade
           FROM treinamentos_planejados WHERE id = 10;`,
      ),
    ).toBe('NULL|NULL|TEORICO');
    expect(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM treinamentos_dias WHERE treinamento_id = 10;`,
      ),
    ).toBe('0');
    expect(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM treinamentos_instrutores WHERE treinamento_id = 10;`,
      ),
    ).toBe('0');

    const columns = sqlite(databasePath, "PRAGMA table_info('treinamentos_participantes');");
    expect(columns).toContain('data_conclusao_efetiva');
    expect(columns).toContain('resultado');
  });
});
