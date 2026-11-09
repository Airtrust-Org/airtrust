/**
 * P01-02: refresh tokens em repouso. Executa o servico real contra SQLite com o
 * schema de producao (refresh_tokens.token TEXT UNIQUE, empresa_id, access_token_jti).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  persistRefreshToken,
  resolveAndRotateRefreshToken,
} from '../../services/auth-refresh-token';
import {
  REFRESH_TOKEN_HASH_PREFIX,
  hashRefreshToken,
  refreshTokenKeys,
} from '../../services/refresh-token-key';
import { resetSchemaCache } from '../../utils/db-schema';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const RAW_A = 'a1'.repeat(32);
const RAW_B = 'b2'.repeat(32);
const FUTURE = '2099-01-01 00:00:00';

function fixture() {
  resetSchemaCache();
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, email TEXT, perfil TEXT, active INTEGER DEFAULT 1, deleted_at TEXT);
    ALTER TABLE empresas ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE empresas ADD COLUMN deleted_at TEXT;
    CREATE TABLE usuarios_empresas (usuario_id INTEGER, empresa_id INTEGER);
    CREATE TABLE refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      access_token_jti TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      empresa_id INTEGER
    );
    INSERT INTO usuarios (id, email, perfil) VALUES (7, 'u@example.invalid', 'ADMIN');
    INSERT INTO empresas (id) VALUES (3);
    INSERT INTO usuarios_empresas (usuario_id, empresa_id) VALUES (7, 3);
  `);
  return db;
}

function storedTokens(db: SqliteD1Database): string[] {
  return (
    db.database.prepare('SELECT token FROM refresh_tokens ORDER BY id').all() as Array<{
      token: string;
    }>
  ).map((row) => row.token);
}

async function persist(db: SqliteD1Database, raw: string) {
  await persistRefreshToken(db as unknown as D1Database, {
    userId: 7,
    refreshToken: raw,
    expiresAt: FUTURE,
    accessTokenJti: 'jti-1',
    empresaId: 3,
  });
}

describe('P01-02 refresh token em repouso', () => {
  it('grava apenas sha256 do token, nunca o valor entregue ao cliente', async () => {
    const db = fixture();
    await persist(db, RAW_A);

    const [stored] = storedTokens(db);
    expect(stored).toBe(await hashRefreshToken(RAW_A));
    expect(stored.startsWith(REFRESH_TOKEN_HASH_PREFIX)).toBe(true);
    expect(stored).not.toContain(RAW_A);
    expect(storedTokens(db).join('|')).not.toContain(RAW_A);
  });

  it('o hash e deterministico, distinto por token e sem colisao com o valor cru', async () => {
    expect(await hashRefreshToken(RAW_A)).toBe(await hashRefreshToken(RAW_A));
    expect(await hashRefreshToken(RAW_A)).not.toBe(await hashRefreshToken(RAW_B));
    expect(await hashRefreshToken(RAW_A)).not.toBe(RAW_A);
  });

  it('refresh com o valor do cliente rotaciona uma vez e rejeita replay', async () => {
    const db = fixture();
    await persist(db, RAW_A);

    const rotated = await resolveAndRotateRefreshToken(db as unknown as D1Database, RAW_A);
    expect(rotated.userId).toBe(7);
    expect(rotated.empresaId).toBe(3);
    expect(rotated.tokenKey).toBe(await hashRefreshToken(RAW_A));

    await expect(
      resolveAndRotateRefreshToken(db as unknown as D1Database, RAW_A),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REVOKED' });
  });

  it('apresentar o conteudo lido do D1 nao autentica (o hash nao e credencial)', async () => {
    const db = fixture();
    await persist(db, RAW_A);
    const [leaked] = storedTokens(db);

    await expect(
      resolveAndRotateRefreshToken(db as unknown as D1Database, leaked),
    ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    // A linha segue intacta e utilizavel pelo dono do valor cru.
    await expect(
      resolveAndRotateRefreshToken(db as unknown as D1Database, RAW_A),
    ).resolves.toMatchObject({ userId: 7 });
  });

  it('aceita sessao legada (valor cru no D1) e a rotaciona uma unica vez', async () => {
    const db = fixture();
    db.database
      .prepare(
        'INSERT INTO refresh_tokens (user_id, token, expires_at, empresa_id) VALUES (7, ?, ?, 3)',
      )
      .run(RAW_B, FUTURE);

    const rotated = await resolveAndRotateRefreshToken(db as unknown as D1Database, RAW_B);
    expect(rotated.tokenKey).toBe(RAW_B);
    await expect(
      resolveAndRotateRefreshToken(db as unknown as D1Database, RAW_B),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REVOKED' });
  });

  it('o fallback legado so vale para o formato de token cru (64 hex)', async () => {
    expect((await refreshTokenKeys(RAW_A)).legacyKey).toBe(RAW_A);
    expect((await refreshTokenKeys('sha256:' + 'a'.repeat(64))).legacyKey).toBeNull();
    expect((await refreshTokenKeys('curto')).legacyKey).toBeNull();
    expect((await refreshTokenKeys(RAW_A.toUpperCase())).legacyKey).toBeNull();
  });

  it('token desconhecido continua INVALID_REFRESH_TOKEN', async () => {
    const db = fixture();
    await expect(
      resolveAndRotateRefreshToken(db as unknown as D1Database, RAW_A),
    ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('o limite de sessoes ativas por usuario continua valendo com tokens em hash', async () => {
    const db = fixture();
    for (let i = 0; i < 10; i += 1) await persist(db, i.toString(16).padStart(64, '0'));
    const active = db.database
      .prepare('SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked_at IS NULL')
      .get() as { n: number };
    expect(active.n).toBe(8);
  });
});
