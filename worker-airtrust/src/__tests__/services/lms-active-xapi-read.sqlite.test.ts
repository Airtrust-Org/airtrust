import {afterEach,describe,expect,it} from 'vitest';
import {SqliteD1Database} from '../helpers/qualification-history-sqlite-d1';
import {activeXapiAll,activeXapiFirst} from '../../services/lms-active-xapi-read';

const opened:SqliteD1Database[]=[];
afterEach(()=>{for(const db of opened.splice(0))db.close()});

function fixture() {
  const db=new SqliteD1Database();opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_xapi_statements(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER);
    INSERT INTO lms_xapi_statements VALUES (1,1,10),(2,1,10),(3,2,20);
  `);
  return db;
}
const countSql = "SELECT COUNT(*) AS n FROM lms_xapi_statements x WHERE x.empresa_id=? AND x.matricula_id=? AND x.archived_cycle_id IS NULL";
const listSql = "SELECT id FROM lms_xapi_statements WHERE empresa_id=? AND matricula_id=? AND archived_cycle_id IS NULL ORDER BY id";

describe('xAPI reads are release-safe before and after Schema V2 0557',()=>{
  it('keeps original read-only tenant semantics before 0557 and never creates status',async()=>{
    const db=fixture();
    expect(await activeXapiFirst<{n:number}>(db.asD1(),countSql,[1,10])).toEqual({n:2});
    const rows=await activeXapiAll<{id:number}>(db.asD1(),listSql,[1,10]);
    expect(rows.results).toEqual([{id:1},{id:2}]);
    expect(await activeXapiFirst<{n:number}>(db.asD1(),countSql,[2,10])).toEqual({n:0});
  });
  it('excludes old-cycle records strictly after 0557',async()=>{
    const db=fixture();
    db.database.exec('ALTER TABLE lms_xapi_statements ADD COLUMN archived_cycle_id INTEGER');
    db.database.exec('UPDATE lms_xapi_statements SET archived_cycle_id=8 WHERE id=1');
    expect(await activeXapiFirst<{n:number}>(db.asD1(),countSql,[1,10])).toEqual({n:1});
    const rows=await activeXapiAll<{id:number}>(db.asD1(),listSql,[1,10]);
    expect(rows.results).toEqual([{id:2}]);
  });
  it('does not suppress unrelated DB errors',async()=>{
    const db=fixture();
    await expect(activeXapiFirst<{n:number}>(db.asD1(),
      'SELECT missing_field AS n FROM lms_xapi_statements WHERE archived_cycle_id IS NULL',[]))
      .rejects.toThrow(/no such column: missing_field/);
  });
  it('does not fall back on a missing different table',async()=>{
    const db=fixture();
    await expect(activeXapiAll<{id:number}>(db.asD1(),
      'SELECT id FROM unrelated_table WHERE archived_cycle_id IS NULL',[]))
      .rejects.toThrow(/no such table/);
  });
});
