/**
 * P01-03: troca/redefinicao de senha derruba os access tokens de TODOS os
 * dispositivos do usuario, sem coluna nova. SQLite com o schema de producao da
 * token_blocklist (jti, expires_at, created_at; sem revoked_at).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  isAccessTokenRevoked,
  revokeAllUserAccessTokens,
} from '../../services/auth-session-revocation';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

function fixture(extraColumns = ", created_at TEXT DEFAULT (datetime('now'))") {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(
    `CREATE TABLE token_blocklist (jti TEXT PRIMARY KEY, expires_at TEXT NOT NULL${extraColumns});`,
  );
  return db;
}

const asD1 = (db: SqliteD1Database) => db as unknown as D1Database;
const NOW = 1_800_000_000;

describe('P01-03 revogacao de todas as sessoes do usuario', () => {
  it('sem marcador, token valido continua valido', async () => {
    const db = fixture();
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'a', sub: 7, iat: NOW })).toBe(false);
  });

  it('marcador derruba tokens emitidos antes de T e preserva os emitidos em T ou depois', async () => {
    const db = fixture();
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'old', sub: 7, iat: NOW - 600 })).toBe(true);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'old2', sub: 7, iat: NOW - 1 })).toBe(true);
    // novo login logo apos a troca (mesmo segundo ou depois)
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'new', sub: 7, iat: NOW })).toBe(false);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'new2', sub: 7, iat: NOW + 5 })).toBe(false);
  });

  it('o marcador e do usuario: nao afeta outro usuario nem prefixo parecido', async () => {
    const db = fixture();
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'x', sub: 8, iat: NOW - 600 })).toBe(false);
    // usuario 70 nao casa com o marcador do usuario 7
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'y', sub: 70, iat: NOW - 600 })).toBe(false);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'z', sub: '7', iat: NOW - 600 })).toBe(true);
  });

  it('sem iat e com marcador vigente, falha fechado', async () => {
    const db = fixture();
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'noiat', sub: 7 })).toBe(true);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'other', sub: 9 })).toBe(false);
  });

  it('o jti revogado no logout continua valendo independentemente do marcador', async () => {
    const db = fixture();
    db.database.exec(
      "INSERT INTO token_blocklist (jti, expires_at) VALUES ('logged-out', datetime('now','+30 minutes'))",
    );
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'logged-out', sub: 7, iat: NOW })).toBe(true);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'other', sub: 7, iat: NOW })).toBe(false);
  });

  it('marcador expirado deixa de bloquear (so precisa viver o TTL do access token)', async () => {
    const db = fixture();
    db.database.exec(
      `INSERT INTO token_blocklist (jti, expires_at) VALUES ('user-sessions:7:${NOW}', datetime('now','-1 minutes'))`,
    );
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'a', sub: 7, iat: NOW - 600 })).toBe(false);
  });

  it('funciona no schema de migracao (revoked_at em vez de created_at)', async () => {
    const db = fixture(", revoked_at TEXT NOT NULL DEFAULT (datetime('now'))");
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'a', sub: 7, iat: NOW - 10 })).toBe(true);
  });

  it('repetir a troca no mesmo segundo e idempotente e usuario invalido e rejeitado', async () => {
    const db = fixture();
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    const n = (db.database.prepare('SELECT COUNT(*) n FROM token_blocklist').get() as { n: number }).n;
    expect(n).toBe(1);
    await expect(revokeAllUserAccessTokens(asD1(db), 0, NOW)).rejects.toThrow(
      'INVALID_USER_ID_FOR_SESSION_REVOCATION',
    );
  });
});
