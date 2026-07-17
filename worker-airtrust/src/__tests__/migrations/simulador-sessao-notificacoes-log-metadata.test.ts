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

function migrationSqlNamed(name: string): string {
  return readFileSync(join(__dirname, `../../../migrations/${name}`), 'utf8');
}

const MIGRATION_0123 = migrationSqlNamed('0123_notificacoes_config.sql');
const MIGRATION_0420 = migrationSqlNamed('0420_notificacoes_log_add_empresa_id.sql');
const MIGRATION_0436 = migrationSqlNamed('0436_simulador_sessao_notificacoes_log_metadata.sql');

function setupDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-notificacoes-log-0436-'));
  const dbPath = join(dir, 'notificacoes-log-0436.db');

  runSqlite(
    dbPath,
    `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        cpf TEXT NOT NULL,
        nome TEXT,
        email TEXT,
        deleted_at TEXT
      );

      CREATE TABLE qualificacoes_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        qualificacao_codigo TEXT,
        deleted_at TEXT
      );
    `,
  );

  runSqlite(dbPath, MIGRATION_0123);

  runSqlite(
    dbPath,
    `
      INSERT INTO funcionarios (id, empresa_id, cpf, nome, email, deleted_at) VALUES
        (101, 6, '11122233344', 'Treinando 101', 'treinando101@example.com', NULL),
        (102, 7, '99988877766', 'Outro Tenant', 'outro@example.com', NULL);

      INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_codigo, deleted_at) VALUES
        (501, 101, 'PER', NULL);

      INSERT INTO notificacoes_log (
        config_id,
        qualificacao_historico_id,
        funcionario_cpf,
        tipo,
        destinatario,
        assunto,
        corpo,
        status,
        erro_mensagem,
        enviado_em
      ) VALUES (
        NULL,
        501,
        '111.222.333-44',
        'EMAIL',
        'legacy@example.com',
        'Assunto legado',
        'Corpo legado',
        'enviada',
        NULL,
        datetime('now')
      );
    `,
  );

  runSqlite(dbPath, MIGRATION_0420);
  return dbPath;
}

describe('0436 simulador sessao notificacoes_log metadata', () => {
  it('adds the metadata columns, preserves legacy rows, and enforces tenant-scoped uniqueness', () => {
    const dbPath = setupDb();

    try {
      runSqlite(dbPath, MIGRATION_0436);

      const columns = runSqlite(
        dbPath,
        `
          SELECT name || '|' || type || '|' || IFNULL(dflt_value, '')
          FROM pragma_table_info('notificacoes_log')
          WHERE name IN (
            'empresa_id',
            'funcionario_id',
            'sessao_id',
            'notification_key',
            'tentativas_envio',
            'provedor_mensagem_id',
            'provedor_resultado',
            'updated_at'
          )
          ORDER BY cid;
        `,
      ).split('\n');

      expect(columns).toEqual([
        'empresa_id|INTEGER|',
        'funcionario_id|INTEGER|',
        'sessao_id|INTEGER|',
        'notification_key|TEXT|',
        'tentativas_envio|INTEGER|0',
        'provedor_mensagem_id|TEXT|',
        'provedor_resultado|TEXT|',
        'updated_at|TEXT|',
      ]);

      const legacyRow = runSqlite(
        dbPath,
        `
          SELECT empresa_id, funcionario_id, sessao_id, notification_key, tentativas_envio, provedor_mensagem_id, provedor_resultado, status, assunto, corpo
          FROM notificacoes_log
          WHERE destinatario = 'legacy@example.com';
        `,
      );
      expect(legacyRow).toBe('6||||0|||enviada|Assunto legado|Corpo legado');

      const uniqueIndex = runSqlite(
        dbPath,
        `
          SELECT sql
          FROM sqlite_master
          WHERE type = 'index'
            AND name = 'idx_notificacoes_log_empresa_notification_key';
        `,
      );
      expect(uniqueIndex).toContain('ON notificacoes_log(empresa_id, notification_key)');

      runSqlite(
        dbPath,
        `
          INSERT INTO notificacoes_log (
            empresa_id,
            funcionario_id,
            sessao_id,
            notification_key,
            tipo,
            destinatario,
            assunto,
            corpo,
            status,
            tentativas_envio
          ) VALUES (
            6,
            101,
            9001,
            'SIMULADOR|sessao:9001|funcionario:101|reason:updated',
            'SIMULADOR_SESSAO',
            'treinando101@example.com',
            'Sessão atualizada',
            'preview only',
            'pendente',
            0
          );
        `,
      );

      const duplicateSameTenant = spawnSync(
        'sqlite3',
        [dbPath],
        {
          input: `
            INSERT INTO notificacoes_log (
              empresa_id,
              funcionario_id,
              sessao_id,
              notification_key,
              tipo,
              destinatario,
              assunto,
              corpo,
              status,
              tentativas_envio
            ) VALUES (
              6,
              101,
              9001,
              'SIMULADOR|sessao:9001|funcionario:101|reason:updated',
              'SIMULADOR_SESSAO',
              'dupe@example.com',
              'Duplicado',
              'preview only',
              'pendente',
              0
            );
          `,
          encoding: 'utf8',
        },
      );
      expect(duplicateSameTenant.status).not.toBe(0);
      expect(String(duplicateSameTenant.stderr)).toMatch(/UNIQUE constraint failed/i);

      runSqlite(
        dbPath,
        `
          INSERT INTO notificacoes_log (
            empresa_id,
            funcionario_id,
            sessao_id,
            notification_key,
            tipo,
            destinatario,
            assunto,
            corpo,
            status,
            tentativas_envio
          ) VALUES (
            7,
            102,
            9001,
            'SIMULADOR|sessao:9001|funcionario:101|reason:updated',
            'SIMULADOR_SESSAO',
            'outro@example.com',
            'Outro tenant',
            'preview only',
            'pendente',
            0
          );
        `,
      );

      const oldWorkerCompatibleInsertCount = Number(
        runSqlite(
          dbPath,
          `
            INSERT INTO notificacoes_log (
              config_id,
              qualificacao_historico_id,
              funcionario_cpf,
              tipo,
              destinatario,
              assunto,
              corpo,
              status,
              erro_mensagem,
              enviado_em
            ) VALUES (
              NULL,
              NULL,
              '99988877766',
              'EMAIL',
              'legacy-new@example.com',
              'Assunto legado 2',
              'Corpo legado 2',
              'pendente',
              NULL,
              NULL
            );

            SELECT COUNT(*) FROM notificacoes_log WHERE destinatario = 'legacy-new@example.com';
          `,
        ),
      );

      expect(oldWorkerCompatibleInsertCount).toBe(1);
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });
});
