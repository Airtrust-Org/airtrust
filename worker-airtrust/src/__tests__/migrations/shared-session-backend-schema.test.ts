import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: `${sql}\n`,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function migrationSql(): string {
  return readFileSync(
    join(__dirname, '../../../migrations/0405_add_shared_session_backend.sql'),
    'utf8',
  );
}

function migration421Sql(): string {
  return readFileSync(
    join(__dirname, '../../../migrations/0421_shared_session_segment_curricula.sql'),
    'utf8',
  );
}

function migration422Sql(): string {
  return readFileSync(
    join(__dirname, '../../../migrations/0422_modelos_sessao_requisitos.sql'),
    'utf8',
  );
}

function migration423Sql(): string {
  return readFileSync(
    join(__dirname, '../../../migrations/0423_shared_session_multi_curricula_per_participant.sql'),
    'utf8',
  );
}

function setupDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-shared-session-0405-'));
  const dbPath = join(dir, 'shared-session.db');

  runSqlite(
    dbPath,
    `
      PRAGMA foreign_keys = ON;

      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY,
        nome TEXT
      );
      INSERT INTO empresas (id, nome) VALUES (6, 'AirTrust');

      CREATE TABLE simulador_agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        simulador_id INTEGER,
        funcionario_id INTEGER,
        data TEXT,
        hora_inicio TEXT,
        hora_fim TEXT,
        duracao_minutos INTEGER,
        instrutor_id INTEGER,
        tipo_sessao TEXT,
        template_id INTEGER,
        status TEXT,
        observacoes TEXT,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE sessoes_participantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        sessao_id INTEGER,
        funcionario_id INTEGER,
        funcao TEXT,
        status TEXT,
        deleted_at TEXT
      );

      CREATE TABLE treinamentos_planejados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE modelos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        agendamento_slot_id INTEGER,
        colaborador_id_aluno INTEGER,
        instrutor_id INTEGER,
        tipo_sessao TEXT,
        tipo_aeronave TEXT,
        data_sessao TEXT,
        status TEXT,
        template_id INTEGER,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      INSERT INTO simulador_agendamentos (
        uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
        instrutor_id, tipo_sessao, template_id, status, observacoes, nome, empresa_id, deleted_at
      ) VALUES (
        'sessao-legacy',
        10,
        101,
        '2026-06-09',
        '07:00',
        '09:00',
        120,
        201,
        'PER',
        301,
        'AGENDADO',
        NULL,
        'Sessão simples',
        6,
        NULL
      );

      INSERT INTO fichas_sessao (
        uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave,
        data_sessao, status, template_id, empresa_id, deleted_at
      ) VALUES (
        'ficha-legacy',
        1,
        101,
        201,
        'PER',
        'AW139',
        '2026-06-09',
        'AVALIACAO_PENDENTE',
        301,
        6,
        NULL
      );
    `,
  );

  return dbPath;
}

describe('0405 shared session backend schema', () => {
  it('adds the additive shared-session tables, columns, and indexes without converting legacy rows', () => {
    const dbPath = setupDb();

    try {
      runSqlite(dbPath, migrationSql());

      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'simulador_atribuicoes_curriculares';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'simulador_agendamento_segmentos';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'simulador_segmento_participantes';`,
          ),
        ),
      ).toBe(1);

      expect(
        runSqlite(
          dbPath,
          `SELECT name FROM pragma_table_info('simulador_agendamentos') WHERE name = 'modo_compartilhado';`,
        ),
      ).toBe('modo_compartilhado');
      expect(
        runSqlite(
          dbPath,
          `SELECT name FROM pragma_table_info('fichas_sessao') WHERE name = 'atribuicao_curricular_id';`,
        ),
      ).toBe('atribuicao_curricular_id');

      expect(
        Number(runSqlite(dbPath, `SELECT COUNT(*) FROM simulador_agendamentos WHERE COALESCE(modo_compartilhado, 0) = 1;`)),
      ).toBe(0);
      expect(
        Number(runSqlite(dbPath, `SELECT COUNT(*) FROM fichas_sessao WHERE atribuicao_curricular_id IS NOT NULL;`)),
      ).toBe(0);

      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_sim_segmentos_ordem_ativa';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_fichas_sessao_atribuicao_ativa';`,
          ),
        ),
      ).toBe(1);

      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
      expect(runSqlite(dbPath, 'SELECT COUNT(*) FROM pragma_foreign_key_check();')).toBe('0');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('adds explicit segment-curriculum relations and controlled segment purpose metadata', () => {
    const dbPath = setupDb();

    try {
      runSqlite(dbPath, migrationSql());
      runSqlite(dbPath, migration421Sql());

      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'modelos_sessao_requisitos';`,
          ),
        ),
      ).toBe(0);
      expect(
        runSqlite(
          dbPath,
          `SELECT name FROM pragma_table_info('simulador_agendamento_segmentos') WHERE name = 'finalidade_codigo';`,
        ),
      ).toBe('finalidade_codigo');
      expect(
        runSqlite(
          dbPath,
          `SELECT name FROM pragma_table_info('simulador_agendamento_segmentos') WHERE name = 'finalidade_titulo';`,
        ),
      ).toBe('finalidade_titulo');
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_sim_segmento_atribuicoes_ativa';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'simulador_segmento_atribuicoes';`,
          ),
        ),
      ).toBe(1);
      runSqlite(
        dbPath,
        `
          PRAGMA foreign_keys = ON;
          INSERT INTO empresas (id, nome) VALUES (7, 'Outro tenant');
          INSERT INTO sessoes_participantes (
            id, uuid, sessao_id, funcionario_id, funcao, status, deleted_at
          ) VALUES (
            8001, 'participante-x-tenant', 1, 101, 'SIC', 'ATIVO', NULL
          );
          INSERT INTO simulador_agendamento_segmentos (
            id, uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, status
          ) VALUES (
            9001, 'segmento-x-tenant', 7, 1, 99, '10:00', '11:00', 60, 'ATIVO'
          );
          INSERT INTO simulador_atribuicoes_curriculares (
            id, uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, status
          ) VALUES (
            9101, 'atribuicao-x-tenant', 7, 1, 8001, NULL, NULL, 0, 'ATIVA'
          );
        `,
      );
      expect(() =>
        runSqlite(
          dbPath,
          `
            PRAGMA foreign_keys = ON;
            INSERT INTO simulador_segmento_atribuicoes (
              uuid, empresa_id, segmento_id, atribuicao_curricular_id, status
            ) VALUES (
              'segmento-atribuicao-invalido', 6, 9001, 9101, 'PLANEJADA'
            );
          `,
        ),
      ).toThrow(/FOREIGN KEY constraint failed/);
      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
      expect(runSqlite(dbPath, 'SELECT COUNT(*) FROM pragma_foreign_key_check();')).toBe('0');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('adds explicit model requirements in a separate additive migration', () => {
    const dbPath = setupDb();

    try {
      runSqlite(dbPath, migrationSql());
      runSqlite(dbPath, migration421Sql());
      runSqlite(dbPath, migration422Sql());

      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'modelos_sessao_requisitos';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_modelos_sessao_requisitos_ativo';`,
          ),
        ),
      ).toBe(1);
      runSqlite(
        dbPath,
        `
          PRAGMA foreign_keys = ON;
          INSERT INTO empresas (id, nome) VALUES (7, 'Outro tenant');
          INSERT INTO modelos_sessao (id, codigo, nome, empresa_id, deleted_at)
          VALUES (2001, 'MS-6', 'Modelo 6', 6, NULL);
          INSERT INTO modelos_sessao (id, codigo, nome, empresa_id, deleted_at)
          VALUES (2002, 'MS-7', 'Modelo 7', 7, NULL);
        `,
      );
      expect(() =>
        runSqlite(
          dbPath,
          `
            PRAGMA foreign_keys = ON;
            INSERT INTO modelos_sessao_requisitos (
              uuid, empresa_id, modelo_sessao_id, requisito_modelo_sessao_id, tipo_requisito, obrigatorio
            ) VALUES (
              'requisito-x-tenant', 6, 2001, 2002, 'ETAPA_ANTERIOR', 1
            );
          `,
        ),
      ).toThrow(/FOREIGN KEY constraint failed/);
      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
      expect(runSqlite(dbPath, 'SELECT COUNT(*) FROM pragma_foreign_key_check();')).toBe('0');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('allows multiple active curricular assignments for the same participant when the model differs', () => {
    const dbPath = setupDb();

    try {
      runSqlite(dbPath, migrationSql());
      runSqlite(dbPath, migration421Sql());
      runSqlite(dbPath, migration423Sql());

      expect(
        runSqlite(
          dbPath,
          `SELECT name FROM pragma_table_info('simulador_segmento_atribuicoes') WHERE name = 'gera_ficha';`,
        ),
      ).toBe('gera_ficha');
      expect(
        runSqlite(
          dbPath,
          `SELECT name FROM pragma_table_info('fichas_sessao') WHERE name = 'segmento_atribuicao_id';`,
        ),
      ).toBe('segmento_atribuicao_id');
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_sim_atribuicoes_ativas_por_participante_modelo';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_sim_atribuicoes_ativas_por_participante';`,
          ),
        ),
      ).toBe(0);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_fichas_sessao_segmento_atribuicao_ativa';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_fichas_sessao_atribuicao_ativa';`,
          ),
        ),
      ).toBe(0);

      runSqlite(
        dbPath,
        `
          INSERT INTO empresas (id, nome) VALUES (7, 'Outro tenant');

          INSERT INTO sessoes_participantes (
            id, uuid, sessao_id, funcionario_id, funcao, status, deleted_at
          ) VALUES
            (701, 'participante-1', 1, 101, 'PIC', 'ATIVO', NULL),
            (702, 'participante-2', 1, 102, 'SIC', 'ATIVO', NULL),
            (703, 'participante-3', 2, 101, 'PIC', 'ATIVO', NULL);

          INSERT INTO simulador_agendamentos (
            id, uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
            instrutor_id, tipo_sessao, template_id, status, observacoes, nome, empresa_id, deleted_at
          ) VALUES (
            2,
            'sessao-outra',
            10,
            101,
            '2026-06-10',
            '10:00',
            '12:00',
            120,
            201,
            'PER',
            301,
            'AGENDADO',
            NULL,
            'Sessão simples 2',
            6,
            NULL
          );
        `,
      );

      runSqlite(
        dbPath,
        `
          INSERT INTO modelos_sessao (id, codigo, nome, empresa_id, deleted_at)
          VALUES
            (301, 'MS-301', 'Modelo 301', 6, NULL),
            (302, 'MS-302', 'Modelo 302', 6, NULL),
            (303, 'MS-303', 'Modelo 303', 7, NULL);

          INSERT INTO simulador_atribuicoes_curriculares (
            uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status, deleted_at
          ) VALUES
            ('atr-modelo-301', 6, 1, 701, NULL, 301, 1, 60, 'ATIVA', NULL),
            ('atr-modelo-302', 6, 1, 701, NULL, 302, 1, 60, 'ATIVA', NULL),
            ('atr-outro-agendamento', 6, 2, 703, NULL, 301, 1, 60, 'ATIVA', NULL);
        `,
      );

      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM simulador_atribuicoes_curriculares WHERE agendamento_id = 1 AND participante_id = 701 AND deleted_at IS NULL;`,
          ),
        ),
      ).toBe(2);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM simulador_atribuicoes_curriculares WHERE agendamento_id = 2 AND participante_id = 703 AND deleted_at IS NULL;`,
          ),
        ),
      ).toBe(1);

      expect(() =>
        runSqlite(
          dbPath,
          `
            INSERT INTO simulador_atribuicoes_curriculares (
              uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status, deleted_at
            ) VALUES (
              'atr-modelo-301-duplicada', 6, 1, 701, NULL, 301, 1, 60, 'ATIVA', NULL
            );
          `,
        ),
      ).toThrow(/UNIQUE constraint failed/);

      expect(() =>
        runSqlite(
          dbPath,
          `
            INSERT INTO simulador_atribuicoes_curriculares (
              uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status, deleted_at
            ) VALUES (
              'atr-cross-tenant-modelo', 6, 1, 701, NULL, 303, 1, 60, 'ATIVA', NULL
            );
          `,
        ),
      ).toThrow(/modelo cross-tenant/);

      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
      expect(runSqlite(dbPath, 'SELECT COUNT(*) FROM pragma_foreign_key_check();')).toBe('0');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('blocks cross-tenant UPDATE on curricular assignments and ficha-segment links, and treats CANCELADA-without-delete as still occupying the unique key', () => {
    const dbPath = setupDb();

    try {
      runSqlite(dbPath, migrationSql());
      runSqlite(dbPath, migration421Sql());
      runSqlite(dbPath, migration423Sql());

      runSqlite(
        dbPath,
        `
          INSERT INTO empresas (id, nome) VALUES (7, 'Outro tenant');

          INSERT INTO sessoes_participantes (
            id, uuid, sessao_id, funcionario_id, funcao, status, deleted_at
          ) VALUES (701, 'participante-1', 1, 101, 'PIC', 'ATIVO', NULL);

          INSERT INTO modelos_sessao (id, codigo, nome, empresa_id, deleted_at)
          VALUES
            (301, 'MS-301', 'Modelo 301', 6, NULL),
            (303, 'MS-303', 'Modelo 303', 7, NULL);

          INSERT INTO simulador_atribuicoes_curriculares (
            id, uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status, deleted_at
          ) VALUES (
            9201, 'atr-update-guard', 6, 1, 701, NULL, 301, 1, 60, 'ATIVA', NULL
          );

          INSERT INTO simulador_agendamento_segmentos (
            id, uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, atribuicao_curricular_id, status
          ) VALUES (
            9202, 'segmento-update-guard', 6, 1, 50, '07:00', '08:00', 60, 9201, 'ATIVO'
          );

          INSERT INTO simulador_segmento_atribuicoes (
            id, uuid, empresa_id, segmento_id, atribuicao_curricular_id, status, gera_ficha
          ) VALUES (
            9203, 'segmento-atribuicao-update-guard', 6, 9202, 9201, 'PLANEJADA', 1
          );

          INSERT INTO fichas_sessao (
            id, uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave,
            data_sessao, status, template_id, empresa_id, segmento_atribuicao_id, deleted_at
          ) VALUES (
            9204, 'ficha-update-guard', 1, 101, 201, 'PER', 'AW139', '2026-06-09', 'AVALIACAO_PENDENTE', 301, 6, 9203, NULL
          );
        `,
      );

      // UPDATE cannot repoint an existing tenant-6 assignment at a tenant-7 modelo_sessao.
      expect(() =>
        runSqlite(
          dbPath,
          `UPDATE simulador_atribuicoes_curriculares SET modelo_sessao_id = 303 WHERE id = 9201;`,
        ),
      ).toThrow(/modelo cross-tenant/);

      // UPDATE cannot repoint a tenant-6 ficha's segmento_atribuicao_id at a tenant-7 link.
      runSqlite(
        dbPath,
        `
          INSERT INTO simulador_agendamentos (
            id, uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
            instrutor_id, tipo_sessao, template_id, status, observacoes, nome, empresa_id, deleted_at
          ) VALUES (
            50, 'sessao-outro-tenant', 10, 999, '2026-06-10', '07:00', '09:00', 120,
            201, 'PER', 301, 'AGENDADO', NULL, 'Sessão outro tenant', 7, NULL
          );
          INSERT INTO sessoes_participantes (
            id, uuid, sessao_id, funcionario_id, funcao, status, deleted_at
          ) VALUES (750, 'participante-outro-tenant', 50, 999, 'PIC', 'ATIVO', NULL);
          INSERT INTO simulador_agendamento_segmentos (
            id, uuid, empresa_id, agendamento_id, ordem, inicio, fim, duracao_minutos, status
          ) VALUES (
            9301, 'segmento-x-tenant-2', 7, 50, 51, '08:00', '09:00', 60, 'ATIVO'
          );
          INSERT INTO simulador_atribuicoes_curriculares (
            id, uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, status, deleted_at
          ) VALUES (
            9302, 'atr-x-tenant-2', 7, 50, 750, NULL, NULL, 0, 'ATIVA', NULL
          );
          INSERT INTO simulador_segmento_atribuicoes (
            id, uuid, empresa_id, segmento_id, atribuicao_curricular_id, status, gera_ficha
          ) VALUES (
            9303, 'link-x-tenant-2', 7, 9301, 9302, 'PLANEJADA', 0
          );
        `,
      );
      expect(() =>
        runSqlite(
          dbPath,
          `UPDATE fichas_sessao SET segmento_atribuicao_id = 9303 WHERE id = 9204;`,
        ),
      ).toThrow(/fichas_sessao\.segmento_atribuicao cross-tenant/);

      // A row that is CANCELADA but not yet soft-deleted still occupies the unique
      // (agendamento, participante, modelo) key — cancellation must always pair
      // status='CANCELADA' with deleted_at being set; this proves the app cannot
      // rely on status alone to "free" the slot.
      runSqlite(
        dbPath,
        `UPDATE simulador_atribuicoes_curriculares SET status = 'CANCELADA' WHERE id = 9201;`,
      );
      expect(() =>
        runSqlite(
          dbPath,
          `
            INSERT INTO simulador_atribuicoes_curriculares (
              uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status, deleted_at
            ) VALUES (
              'atr-still-blocked', 6, 1, 701, NULL, 301, 1, 60, 'ATIVA', NULL
            );
          `,
        ),
      ).toThrow(/UNIQUE constraint failed/);

      // Once actually soft-deleted, the slot is free again.
      runSqlite(
        dbPath,
        `UPDATE simulador_atribuicoes_curriculares SET deleted_at = datetime('now') WHERE id = 9201;`,
      );
      runSqlite(
        dbPath,
        `
          INSERT INTO simulador_atribuicoes_curriculares (
            uuid, empresa_id, agendamento_id, participante_id, treinamento_planejado_id, modelo_sessao_id, gera_ficha, carga_horaria_total_minutos, status, deleted_at
          ) VALUES (
            'atr-freed-after-delete', 6, 1, 701, NULL, 301, 1, 60, 'ATIVA', NULL
          );
        `,
      );
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*) FROM simulador_atribuicoes_curriculares WHERE agendamento_id = 1 AND participante_id = 701 AND modelo_sessao_id = 301 AND deleted_at IS NULL;`,
          ),
        ),
      ).toBe(1);

      expect(runSqlite(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
      expect(runSqlite(dbPath, 'SELECT COUNT(*) FROM pragma_foreign_key_check();')).toBe('0');
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });
});
