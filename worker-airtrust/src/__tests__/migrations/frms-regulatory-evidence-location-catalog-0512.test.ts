import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration0463 = readFileSync(join(testDir, '../../../migrations/0463_frms_iogp_schema_v2.sql'), 'utf8');
const change0512 = readFileSync(join(testDir, '../../../schema-v2/changes/0512_frms_regulatory_evidence_location_catalog.sql'), 'utf8');
const sourceManifestPath = join(testDir, '../../../../docs/regulatory/frms/costa-do-sol-frms-regulatory-source-manifest-2026-09-27.json');
const sourceManifest = readFileSync(sourceManifestPath);
const sourceManifestHash = createHash('sha256').update(sourceManifest).digest('hex');
const tempDirs: string[] = [];
afterAll(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function sqlite(db: string, sql: string) { return spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' }); }
function query<T>(db: string, sql: string): T[] {
  const r = spawnSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim() ? JSON.parse(r.stdout) as T[] : [];
}
function baseline() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-0512-')); tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  expect(sqlite(db, `CREATE TABLE empresas(id INTEGER PRIMARY KEY,nome TEXT); INSERT INTO empresas VALUES(6,'Costa do Sol');`).status).toBe(0);
  expect(sqlite(db, migration0463).status).toBe(0);
  expect(sqlite(db, `INSERT INTO frms_regulatory_profiles(id,empresa_id,profile_code,service_category,approval_reference,policy_version,effective_from,active,created_at,updated_at) VALUES('frms-regulatory-profile-6-helicopter-offshore-v1',6,'HELICOPTER_OFFSHORE','OFFSHORE_HELICOPTER','FRMS_HELICOPTER_OFFSHORE_BASELINE_V1','LEGACY_MODEL_V2','1970-01-01',1,'2026-08-24','2026-08-24');`).status).toBe(0);
  return db;
}
describe('Schema V2 0512 FRMS regulatory evidence + location catalogue', () => {
  it('binds the profile to the exact versioned source manifest while leaving B/C unselected', () => {
    const db=baseline(); expect(sqlite(db,change0512).status).toBe(0);
    const rows=query<{approval_reference:string;source_document_hash:string;appendices:number;status:string;grf:string}>(db, `SELECT approval_reference,source_document_hash,json_array_length(json_extract(limits_json,'$.rbac117_appendices')) appendices,json_extract(limits_json,'$.appendix_selection_status') status,json_extract(limits_json,'$.grf_status') grf FROM frms_regulatory_profiles WHERE empresa_id=6;`);
    expect(rows).toEqual([{approval_reference:'AIRTRUST_FRMS_REGULATORY_SOURCE_MANIFEST_2026-09-27',source_document_hash:sourceManifestHash,appendices:0,status:'UNCONFIRMED_OPERATOR_SELECTION',grf:'NOT_DOCUMENTED_IN_AIRTRUST'}]);
    expect(sourceManifestHash).toBe('c66536dba033f7854e2e1702418d1dbb4d4b45dc59e03dfa4cf949b645ec35cc');
  });
  it('seeds only SBME plus six explicit offshore helidecks with no weather fallback', () => {
    const db=baseline(); expect(sqlite(db,change0512).status).toBe(0);
    const rows=query<{location_code:string;operational_class:string;weather_source_kind:string;redemet_station_icao:string|null}>(db, `SELECT location_code,operational_class,weather_source_kind,redemet_station_icao FROM frms_location_catalog WHERE empresa_id=6 ORDER BY location_code;`);
    expect(rows).toHaveLength(7);
    expect(rows.find(r=>r.location_code==='SBME')).toEqual({location_code:'SBME',operational_class:'AERODROME',weather_source_kind:'REDEMET',redemet_station_icao:'SBME'});
    expect(rows.filter(r=>r.location_code!=='SBME').every(r=>r.operational_class==='HELIDECK' && r.weather_source_kind==='NONE' && r.redemet_station_icao===null)).toBe(true);
  });
  it('is one-shot under the active location uniqueness invariant', () => {
    const db=baseline(); expect(sqlite(db,change0512).status).toBe(0);
    const second=sqlite(db,change0512); expect(second.status).not.toBe(0); expect(second.stderr).toMatch(/UNIQUE constraint failed/i);
  });
});
