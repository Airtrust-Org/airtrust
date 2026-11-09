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

  it('marcador expirado deixa de bloquear (depois do TTL maximo do access token)', async () => {
    const db = fixture();
    db.database.exec(
      "INSERT INTO token_blocklist (jti, expires_at) VALUES ('user-sessions:7', datetime('now','-1 minutes'))",
    );
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'a', sub: 7, iat: NOW - 600 })).toBe(false);
  });

  it('funciona no schema de migracao (revoked_at em vez de created_at)', async () => {
    const db = fixture(", revoked_at TEXT NOT NULL DEFAULT (datetime('now'))");
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'a', sub: 7, iat: NOW - 10 })).toBe(true);
  });

  it('o marcador cobre token de personificacao (1 h): ainda bloqueia 50 min depois da troca', async () => {
    const db = fixture();
    const agora = Math.floor(Date.now() / 1000);
    const trocaHa50min = agora - 50 * 60;
    await revokeAllUserAccessTokens(asD1(db), 7, trocaHa50min);
    // token de 1 h emitido 1 min antes da troca ainda nao expirou (vence em ~9 min)
    expect(
      await isAccessTokenRevoked(asD1(db), { jti: 'imp', sub: 7, iat: trocaHa50min - 60 }),
    ).toBe(true);
    // e depois da vida maxima do token + folga o marcador sai sozinho
    const trocaHa70min = agora - 70 * 60;
    const db2 = fixture();
    await revokeAllUserAccessTokens(asD1(db2), 7, trocaHa70min);
    expect(
      await isAccessTokenRevoked(asD1(db2), { jti: 'imp2', sub: 7, iat: trocaHa70min - 60 }),
    ).toBe(false);
  });

  it('nova troca de senha move o corte para frente, mantendo um unico marcador', async () => {
    const db = fixture();
    await revokeAllUserAccessTokens(asD1(db), 7, NOW);
    await revokeAllUserAccessTokens(asD1(db), 7, NOW + 120);
    const n = (db.database.prepare('SELECT COUNT(*) n FROM token_blocklist').get() as { n: number }).n;
    expect(n).toBe(1);
    // token emitido entre as duas trocas: so o segundo corte o derruba
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'mid', sub: 7, iat: NOW + 60 })).toBe(true);
    expect(await isAccessTokenRevoked(asD1(db), { jti: 'after', sub: 7, iat: NOW + 120 })).toBe(false);
  });

  it('a consulta por requisicao usa o indice de jti (sem varrer a token_blocklist)', () => {
    const db = fixture();
    const plan = db.database
      .prepare(
        `EXPLAIN QUERY PLAN SELECT 1 FROM token_blocklist
         WHERE expires_at > datetime('now')
           AND (jti = ? OR (jti = ? AND CAST(strftime('%s', expires_at) AS INTEGER) - ? > ?))
         LIMIT 1`,
      )
      .all('a', 'user-sessions:7', 3900, 0) as Array<{ detail: string }>;
    expect(plan.length).toBeGreaterThan(0);
    for (const step of plan) expect(step.detail).not.toMatch(/^SCAN/);
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
