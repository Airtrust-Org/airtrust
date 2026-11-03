import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync('schema-v2/frms-checkin-kss-provenance-0571.json', 'utf8'),
) as { changeId: string; filePath: string; fileHash: string; planPath: string; planHash: string };
const migrationSql = readFileSync('../' + manifest.filePath, 'utf8');
const plan = readFileSync('../' + manifest.planPath, 'utf8');

describe('FRMS Schema V2 0571 — KSS source is never inferred from historical values', () => {
  it('pins the migration to the governed manifest and its plan', () => {
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    expect(manifest.changeId).toBe('frms-checkin-kss-provenance-0571');
    expect(hash(migrationSql)).toBe(manifest.fileHash);
    expect(hash(plan)).toBe(manifest.planHash);
    expect(migrationSql).not.toMatch(/\bUPDATE\s+frms_fadiga_checkin\b/i);
  });

  it('preserves legacy NULL, permits a new crew report, and rejects invented source values', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE frms_fadiga_checkin (
        id TEXT PRIMARY KEY, empresa_id INTEGER, data_checkin TEXT,
        kss_score INTEGER, deleted_at TEXT
      );`);
      db.prepare('INSERT INTO frms_fadiga_checkin (id, empresa_id, data_checkin, kss_score) VALUES (?, ?, ?, ?)')
        .run('legacy-1', 7, '2026-01-01', 5);
      db.exec(migrationSql);

      const legacy = db.prepare('SELECT kss_score, kss_provenance FROM frms_fadiga_checkin WHERE id = ?')
        .get('legacy-1');
      expect(legacy).toMatchObject({ kss_score: 5, kss_provenance: null });

      const put = db.prepare(
        'INSERT INTO frms_fadiga_checkin (id, empresa_id, data_checkin, kss_score, kss_provenance) VALUES (?, ?, ?, ?, ?)',
      );
      put.run('crew-1', 7, '2026-11-03', 8, 'CREW_REPORTED');
      expect(db.prepare('SELECT kss_provenance FROM frms_fadiga_checkin WHERE id = ?').get('crew-1'))
        .toMatchObject({ kss_provenance: 'CREW_REPORTED' });

      expect(() => put.run('invalid-1', 7, '2026-11-03', 5, 'CLIENT_GUESSED'))
        .toThrow();
      expect(db.prepare('PRAGMA index_list(frms_fadiga_checkin)').all().some(
        (index: { name: string }) => index.name === 'idx_frms_checkin_kss_provenance_scope',
      )).toBe(true);
    } finally {
      db.close();
    }
  });
});
