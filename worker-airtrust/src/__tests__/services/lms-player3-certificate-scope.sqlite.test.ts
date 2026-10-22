import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { readPlayer3CertificateStatus } from '../../services/lms-player3-certificate-status';
import type { Env } from '../../types';

const Database = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (filename: string): DatabaseSync;
};
const opened: DatabaseSync[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

function fixture() {
  const sqlite = new Database(':memory:');
  opened.push(sqlite);
  sqlite.exec(`
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, gerar_qualificacao_ao_concluir INTEGER,
      qualificacao_tipo_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER,
      curso_id INTEGER, status TEXT, qualificacao_historico_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER, curso_id INTEGER,
      ciclo_atual INTEGER, status TEXT, qualificacao_historico_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER,
      qualificacao_id INTEGER, status TEXT, data_conclusao TEXT,
      certificado_arquivo_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE documentos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER,
      r2_key TEXT, deleted_at TEXT
    );
    INSERT INTO lms_cursos VALUES (20,6,1,87,NULL),(21,7,1,87,NULL);
    INSERT INTO lms_matriculas VALUES
      (101,6,51,20,'CONCLUIDO',333,NULL),
      (102,7,51,21,'CONCLUIDO',334,NULL);
    INSERT INTO lms_matricula_ciclos VALUES
      (1001,6,101,20,1,'CONCLUIDO',333,NULL),
      (1002,7,102,21,1,'CONCLUIDO',334,NULL);
    INSERT INTO qualificacoes_historico VALUES
      (333,6,51,87,'CONCLUIDA','2026-10-14',44,NULL),
      (334,7,51,87,'CONCLUIDA','2026-10-14',45,NULL);
    INSERT INTO documentos VALUES
      (44,6,51,'certificados/empresa-6/funcionario-51/historico-333/doc.pdf',NULL),
      (45,7,51,'certificados/empresa-7/funcionario-51/historico-334/doc.pdf',NULL);
  `);
  const get = vi.fn(async () => ({
    size: 123, arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer,
  }));
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              first: async () => sqlite.prepare(sql).get(...args as (string | number | null)[]),
            };
          },
        };
      },
    },
    BUCKET: { get },
  } as unknown as Env;
  const read = (matriculaId = 101, empresaId = 6) =>
    readPlayer3CertificateStatus({
      env, empresaId, matriculaId, funcionarioId: 51,
    });
  return { sqlite, get, read };
}

describe('Player3 certificate: D1 tenant/cycle/qualification integrity', () => {
  it('verifies the current cycle with a matching course qualification and tenant document', async () => {
    const { read, get } = fixture();
    const result = await read();
    expect(result.certificate_state).toBe('PDF_HEADER_VERIFIED');
    expect(result).toMatchObject({ ciclo_id: 1001, historico_id: 333, documento_id: 44 });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('never uses a qualification of a different course type as the certificate proof', async () => {
    const { sqlite, read, get } = fixture();
    sqlite.exec('UPDATE qualificacoes_historico SET qualificacao_id=99 WHERE id=333');
    expect((await read()).certificate_state).toBe('HISTORY_INVALID');
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a certificate document assigned to another tenant before accessing R2', async () => {
    const { sqlite, read, get } = fixture();
    sqlite.exec('UPDATE documentos SET empresa_id=7 WHERE id=44');
    expect((await read()).certificate_state).toBe('CERTIFICATE_PDF_INVALID');
    expect(get).not.toHaveBeenCalled();
  });

  it('does not accept a previous-cycle qualification as proof of the active cycle', async () => {
    const { sqlite, read, get } = fixture();
    sqlite.exec('UPDATE lms_matricula_ciclos SET qualificacao_historico_id=334 WHERE id=1001');
    expect((await read()).certificate_state).toBe('HISTORY_NOT_LINKED');
    expect(get).not.toHaveBeenCalled();
  });

  it('does not look up another tenant enrollment by a chosen enrollment ID', async () => {
    const { read, get } = fixture();
    await expect(read(102,6)).rejects.toMatchObject({
      code: 'PLAYER3_CERTIFICATE_ENROLLMENT_NOT_FOUND',
    });
    expect(get).not.toHaveBeenCalled();
  });
});
