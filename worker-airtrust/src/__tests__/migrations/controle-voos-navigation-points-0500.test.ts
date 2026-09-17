import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const baseSql = readFileSync(join(root, 'migrations/0410_controle_voos_n1_schema.sql'), 'utf8');
const changeSql = readFileSync(join(root, 'schema-v2/changes/0500_controle_voos_navigation_points.sql'), 'utf8');
const csv = readFileSync(join(root, 'data/controle-voos/waypoints-flight-preview-2026-09-17.csv'), 'utf8');
const tempDirs: string[] = [];

function run(db: string, sql: string) {
  const result = spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

function query<T>(db: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? JSON.parse(result.stdout) as T[] : [];
}
function createDb() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-nav-0500-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(db, 'PRAGMA foreign_keys=ON;');
  run(db, baseSql);
  run(db, `
    INSERT INTO cv_aeroportos(id,empresa_id,codigo,codigo_icao,nome,tipo)
    VALUES (1,6,'SBME','SBME','MACAÉ','aeroporto'), (2,6,'SBCB',NULL,'CABO FRIO','aeroporto');
  `);
  run(db, changeSql);
  return db;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('schema-v2 0500 Controle de Voos navigation points', () => {
  it('keeps the extracted source cardinality and quality flags', () => {
    const db = createDb();
    const summary = query<{ total:number; unique_codes:number; invalid:number; missing_elevation:number }>(db, `
      SELECT COUNT(*) total, COUNT(DISTINCT codigo) unique_codes,
        SUM(coordenada_valida=0) invalid, SUM(elevacao_ft IS NULL) missing_elevation
      FROM cv_pontos_navegacao WHERE empresa_id=6 AND fonte='FLIGHT_PREVIEW_PDF_2026-09-17';
    `)[0];
    expect(summary).toEqual({ total: 3714, unique_codes: 3714, invalid: 30, missing_elevation: 166 });
    expect(csv.trim().split(/\r?\n/)).toHaveLength(3715);
  });
  it('separates platform ICAO codes from the aerodrome field and cleans the name', () => {
    const db = createDb();
    const row = query<{ codigo:string; codigo_icao:string; nome:string; tipo:string }>(db, `
      SELECT codigo,codigo_icao,nome,tipo FROM cv_pontos_navegacao
      WHERE empresa_id=6 AND codigo='FPAG';
    `)[0];
    expect(row).toEqual({ codigo: 'FPAG', codigo_icao: '9PLG', nome: 'ANITA GARIBALDI', tipo: 'plataforma' });
    const all9p = query<{ invalid:number }>(db, `
      SELECT COUNT(*) - SUM(tipo='plataforma') AS invalid
      FROM cv_pontos_navegacao WHERE empresa_id=6 AND codigo_icao LIKE '9P%';
    `)[0];
    expect(Number(all9p.invalid)).toBe(0);
  });

  it('preserves existing landing-point ids and enriches them from the canonical source', () => {
    const db = createDb();
    const rows = query<{ id:number; codigo:string; elevacao_ft:number; ponto_navegacao_id:number }>(db, `
      SELECT id,codigo,elevacao_ft,ponto_navegacao_id FROM cv_aeroportos
      WHERE empresa_id=6 AND codigo IN ('SBME','SBCB') ORDER BY id;
    `);
    expect(rows.map((row) => row.id)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ codigo: 'SBME', elevacao_ft: 8 });
    expect(rows.every((row) => Number(row.ponto_navegacao_id) > 0)).toBe(true);
    expect(query<{ total:number }>(db, `SELECT COUNT(*) total FROM cv_aeroportos WHERE empresa_id=6 AND deleted_at IS NULL;`)[0].total).toBe(3412);
  });

  it('keeps route-only waypoints out of the landing catalog and blocks invalid coordinates', () => {
    const db = createDb();
    expect(query<{ tipo:string }>(db, `SELECT tipo FROM cv_pontos_navegacao WHERE empresa_id=6 AND codigo='BIVUR';`)[0]?.tipo).toBe('waypoint');
    expect(query(db, `SELECT id FROM cv_aeroportos WHERE empresa_id=6 AND codigo='BIVUR';`)).toHaveLength(0);
    expect(query<{ coordenada_valida:number; permite_origem_destino:number; revisao_pendente:number }>(db, `
      SELECT coordenada_valida,permite_origem_destino,revisao_pendente
      FROM cv_pontos_navegacao WHERE empresa_id=6 AND codigo='AGIL';
    `)[0]).toEqual({ coordenada_valida: 0, permite_origem_destino: 0, revisao_pendente: 1 });
    expect(query(db, `PRAGMA foreign_key_check;`)).toHaveLength(0);
  });
});
