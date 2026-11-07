import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {SqliteD1Database} from '../helpers/qualification-history-sqlite-d1';
import {readScormActiveResumeProposal} from '../../services/lms-scorm-active-resume-readonly';

const opened:SqliteD1Database[]=[];
afterEach(()=>{for(const db of opened.splice(0))db.close()});
const root=(empresaId:number)=>`lms/scorm/${empresaId}/119/`;
const hash=(char:string)=>char.repeat(64);

function fixture(){
  const db=new SqliteD1Database();opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_cursos(id INTEGER NOT NULL,empresa_id INTEGER NOT NULL,tipo_conteudo TEXT,
      scorm_package_r2_prefix TEXT,deleted_at TEXT,PRIMARY KEY(id,empresa_id));
    CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
      funcionario_id INTEGER,status TEXT,deleted_at TEXT,qualificacao_historico_id INTEGER);
    CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,
      curso_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT);
    CREATE TABLE lms_scorm_package_versions(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
      r2_prefix TEXT,package_sha256 TEXT,status TEXT);
    CREATE TABLE lms_scorm_package_audit_log(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
      package_id INTEGER,action TEXT,created_at TEXT);
  `);
  db.database.exec(readFileSync(resolve(process.cwd(),
    'schema-v2/changes/0566_lms_scorm_edition_handoffs.sql'),'utf8'));
  for(const empresaId of [6,7]){
    db.database.prepare(`INSERT INTO lms_cursos VALUES(119,?,'scorm',?,NULL)`)
      .run(empresaId,root(empresaId)+'active/');
    db.database.prepare(`INSERT INTO lms_scorm_package_versions VALUES
      (?,?,119,?,?, 'ACTIVE')`).run(empresaId*10+1,empresaId,root(empresaId)+'active/',hash('f'));
  }
  db.database.prepare(`INSERT INTO lms_matriculas VALUES
    (100,6,119,500,'EM_ANDAMENTO',NULL,NULL),(101,6,119,501,'EM_ANDAMENTO',NULL,NULL),
    (200,7,119,700,'EM_ANDAMENTO',NULL,NULL)`).run();
  db.database.prepare(`INSERT INTO lms_matricula_ciclos VALUES
    (812,6,100,119,1,NULL),(800,6,101,119,1,NULL),(814,7,200,119,1,NULL)`).run();
  for(const empresaId of [6,7]){
    db.database.prepare(`INSERT INTO lms_scorm_package_versions VALUES
      (?,?,119,?,?, 'ARCHIVED'),(?,?,119,?,?, 'ARCHIVED')`)
      .run(empresaId*10+2,empresaId,root(empresaId)+'old/',hash('a'),
        empresaId*10+3,empresaId,root(empresaId)+'middle/',hash('b'));
    db.database.prepare(`INSERT INTO lms_scorm_package_audit_log VALUES
      (?,?,119,?,'ACTIVATED','2026-08-01 00:00:00'),
      (?,?,119,?,'ACTIVATED','2026-09-01 00:00:00')`)
      .run(empresaId*100+1,empresaId,empresaId*10+2,
        empresaId*100+2,empresaId,empresaId*10+3);
  }
  // Record historical receipts through the real scope trigger while each
  // package/cycle is active, then restore the actual current edition.
  db.database.prepare(`UPDATE lms_scorm_package_versions SET status='ACTIVE' WHERE id=63`).run();
  db.database.prepare(`UPDATE lms_cursos SET scorm_package_r2_prefix=? WHERE id=119 AND empresa_id=6`)
    .run(root(6)+'middle/');
  db.database.prepare(`INSERT INTO lms_scorm_edition_handoffs
    (empresa_id,matricula_id,ciclo_id,curso_id,funcionario_id,operation_id,actor_id,
     previous_enrollment_json,target_package_sha256,target_package_prefix,resume_plan_json)
    VALUES(6,100,812,119,500,'test_op_100_current',9,'{}',?,?,'{}')`)
    .run(hash('b'),root(6)+'middle/');
  db.database.prepare(`INSERT INTO lms_scorm_edition_handoffs
    (empresa_id,matricula_id,ciclo_id,curso_id,funcionario_id,operation_id,actor_id,
     previous_enrollment_json,target_package_sha256,target_package_prefix,resume_plan_json)
    VALUES(6,101,800,119,501,'test_op_101_stale',9,'{}',?,?,'{}')`)
    .run(hash('b'),root(6)+'middle/');
  db.database.prepare(`UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=800`).run();
  db.database.prepare(`INSERT INTO lms_matricula_ciclos VALUES(813,6,101,119,1,NULL)`).run();
  db.database.prepare(`UPDATE lms_scorm_package_versions SET status='ARCHIVED' WHERE id=63`).run();
  db.database.prepare(`UPDATE lms_scorm_package_versions SET status='ACTIVE' WHERE id=61`).run();
  db.database.prepare(`UPDATE lms_cursos SET scorm_package_r2_prefix=? WHERE id=119 AND empresa_id=6`)
    .run(root(6)+'active/');
  return db;
}

function makeBucket(){
  const manifests:Record<string,string[]>={};
  for(const empresaId of [6,7]){
    manifests[root(empresaId)+'old/airtrust-completion-manifest.json']=['old1','old2','old3'];
    manifests[root(empresaId)+'middle/airtrust-completion-manifest.json']=['mid1','unit2','mid3'];
    manifests[root(empresaId)+'active/airtrust-completion-manifest.json']=['new1','unit2','new3'];
  }
  const bucket={get:vi.fn(async(key:string)=>manifests[key]
    ? {size:100,text:async()=>JSON.stringify({content:{requiredSlides:manifests[key]}})}:null)};
  return bucket as unknown as R2Bucket;
}

describe('active SCORM resume provenance with SQLite/D1',()=>{
  it('binds tenant, course, enrollment and current cycle and reads only that enrollment receipt',async()=>{
    const db=fixture(),bucket=makeBucket();
    const before=db.database.prepare('SELECT * FROM lms_scorm_edition_handoffs ORDER BY id').all();
    const plan=await readScormActiveResumeProposal({db:db.asD1(),bucket,empresaId:6,cursoId:119,
      matriculaId:100,cycleId:812,activePrefix:root(6)+'active/',cycleStartedAt:'2026-09-15',
      handoffHistoryEnabled:true,cmiJson:'{"cmi.location":"2/3","airtrust.viewed_slides":[1,2]}'});
    expect(plan).toMatchObject({status:'MATCHED_ANCHOR',previousPackageSha256:hash('b'),
      activePackageSha256:hash('f'),canMarkComplete:false,canTransferScore:false,reviewRequired:true});
    expect(plan).not.toHaveProperty('score');expect(plan).not.toHaveProperty('passed');
    expect(plan).not.toHaveProperty('completed');expect(plan).not.toHaveProperty('certificate');
    expect(bucket.get).toHaveBeenCalledWith(root(6)+'middle/airtrust-completion-manifest.json');
    expect(bucket.get).not.toHaveBeenCalledWith(root(6)+'old/airtrust-completion-manifest.json');

    // A second enrollment in the same tenant/course has a receipt only in its
    // stale cycle. Exact enrollment+current-cycle binding must ignore it.
    const second=await readScormActiveResumeProposal({db:db.asD1(),bucket,empresaId:6,cursoId:119,
      matriculaId:101,cycleId:813,activePrefix:root(6)+'active/',cycleStartedAt:'2026-08-15',
      handoffHistoryEnabled:true,cmiJson:'{"cmi.location":"2/3"}'});
    expect(second).toMatchObject({status:'SUGGESTED_ANCHOR',previousPackageSha256:hash('a'),
      activePackageSha256:hash('f'),canMarkComplete:false,canTransferScore:false});
    expect(second).not.toHaveProperty('score');expect(second).not.toHaveProperty('passed');
    expect(second).not.toHaveProperty('completed');expect(second).not.toHaveProperty('certificate');
    expect(bucket.get).toHaveBeenCalledWith(root(6)+'old/airtrust-completion-manifest.json');
    expect(db.database.prepare('SELECT * FROM lms_scorm_edition_handoffs ORDER BY id').all()).toEqual(before);
    expect(db.database.prepare('SELECT status,qualificacao_historico_id FROM lms_matriculas ORDER BY id').all())
      .toEqual([{status:'EM_ANDAMENTO',qualificacao_historico_id:null},
        {status:'EM_ANDAMENTO',qualificacao_historico_id:null},
        {status:'EM_ANDAMENTO',qualificacao_historico_id:null}]);
  });

  it('cannot read another tenant or enrollment provenance and rejects invalid identifiers before R2',async()=>{
    const db=fixture(),bucket=makeBucket();
    const foreign=await readScormActiveResumeProposal({db:db.asD1(),bucket,empresaId:7,cursoId:119,
      matriculaId:100,cycleId:812,activePrefix:root(7)+'active/',cycleStartedAt:'2026-08-15',
      handoffHistoryEnabled:true,cmiJson:'{"cmi.location":"2/3"}'});
    const wrongCycle=await readScormActiveResumeProposal({db:db.asD1(),bucket,empresaId:6,cursoId:119,
      matriculaId:100,cycleId:813,activePrefix:root(6)+'active/',cycleStartedAt:'2026-08-15',
      handoffHistoryEnabled:true,cmiJson:'{"cmi.location":"2/3"}'});
    const invalidId=await readScormActiveResumeProposal({db:db.asD1(),bucket,empresaId:6,cursoId:119,
      matriculaId:0,cycleId:812,activePrefix:root(6)+'active/',cycleStartedAt:null,cmiJson:null});
    expect(foreign).toBeNull();expect(wrongCycle).toBeNull();expect(invalidId).toBeNull();
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('fails closed to navigation-only suggestion when the enabled ledger is missing or inconsistent',async()=>{
    for(const inconsistent of [false,true]){
      const db=fixture(),bucket=makeBucket();
      if(inconsistent){
        db.database.exec(`DROP TRIGGER trg_lms_scorm_handoff_no_update;
          UPDATE lms_scorm_edition_handoffs SET target_package_prefix='lms/scorm/7/119/evil/'
          WHERE matricula_id=100;`);
      }else db.database.exec('DROP TABLE lms_scorm_edition_handoffs');
      const plan=await readScormActiveResumeProposal({db:db.asD1(),bucket,empresaId:6,cursoId:119,
        matriculaId:100,cycleId:812,activePrefix:root(6)+'active/',
        cycleStartedAt:'2026-09-15',handoffHistoryEnabled:true,
        cmiJson:'{"cmi.location":"2/3"}'});
      expect(plan).toMatchObject({status:'SUGGESTED_ANCHOR',previousPackageSha256:null,
        canMarkComplete:false,canTransferScore:false,reviewRequired:true});
      expect(bucket.get).not.toHaveBeenCalledWith(root(6)+'old/airtrust-completion-manifest.json');
    }
  });
});
