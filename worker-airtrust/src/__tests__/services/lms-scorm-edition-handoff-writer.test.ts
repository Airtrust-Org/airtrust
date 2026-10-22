import {describe,expect,it,vi} from 'vitest';
import {writeScormEditionHandoff} from '../../services/lms-scorm-edition-handoff-writer';
const base={empresaId:6,matriculaId:100,actorId:9,operationId:'op_20261022_cycle_100',
 targetSha256:'b'.repeat(64),
 resumePlanJson:JSON.stringify({status:'MATCHED_ANCHOR',targetPosition:33,canTransferScore:false,canMarkComplete:false})};
function fake(opts:{target?:boolean;receipt?:boolean;batchError?:boolean;previousPackage?:boolean}={}) {
 const prepared:string[]=[];
 const bindings:Array<{sql:string;args:unknown[]}> = [];
 const db={
  prepare:vi.fn((sql:string)=>{
   prepared.push(sql);
   return {bind:vi.fn((...args:unknown[])=>{
    bindings.push({sql,args});
    return {first:vi.fn(async()=>{
     if(sql.includes('SELECT cy.id ciclo_id'))return opts.target===false?null:{
      ciclo_id:17,curso_id:88,funcionario_id:48,target_prefix:'lms/scorm/6/88/active/',
      cycle_started_at:opts.previousPackage?'2026-10-01 10:00:00':null};
     if(sql.includes('FROM lms_scorm_package_audit_log'))return opts.previousPackage
      ?{r2_prefix:'lms/scorm/6/88/prior/',package_sha256:'a'.repeat(64)}:null;
     if(sql.includes('FROM lms_scorm_edition_handoffs'))return opts.receipt?
      {id:200,ciclo_id:17,target_package_sha256:base.targetSha256,operation_id:base.operationId}:null;
     return null;
    })};
   })};
  }),
  batch:vi.fn(async()=>{if(opts.batchError)throw new Error('unique constraint failed');return [];}),
 };
 return {db:db as unknown as D1Database,prepared,bindings,batch:db.batch};
}
describe('SCORM in-cycle edition handoff batch',()=>{
 it('fails closed without an ACTIVE package and current cycle',async()=>{
  const f=fake({target:false});
  await expect(writeScormEditionHandoff(f.db,base)).rejects.toThrow('TARGET_OR_CYCLE_NOT_VERIFIED');
  expect(f.batch).not.toHaveBeenCalled();
 });
 it('never accepts forged automatic completion from a proposed bookmark',async()=>{
  const f=fake();
  await expect(writeScormEditionHandoff(f.db,{...base,
   resumePlanJson:JSON.stringify({canMarkComplete:true,canTransferScore:false})}))
   .rejects.toThrow('SCORM_HANDOFF_PLAN_UNSAFE');
  expect(f.batch).not.toHaveBeenCalled();
 });
 it('existing operation returns idempotent receipt without replaying resets',async()=>{
  const f=fake({receipt:true});
  const result=await writeScormEditionHandoff(f.db,base);
  expect(result).toMatchObject({id:200,cycleId:17,alreadyApplied:true});
  expect(f.batch).not.toHaveBeenCalled();
 });
 it('refuses cross-tenant/invalid identity before querying',async()=>{
  const f=fake();
  await expect(writeScormEditionHandoff(f.db,{...base,empresaId:0}))
   .rejects.toThrow('SCORM_HANDOFF_SCOPE_INVALID');
  expect(f.batch).not.toHaveBeenCalled();
 });
 it('writer orders immutable snapshot before clearing CMI and cycle progress',async()=>{
  const f=fake();
  await expect(writeScormEditionHandoff(f.db,base))
   .rejects.toThrow('SCORM_HANDOFF_BATCH_POSTCHECK_FAILED');
  const sql=f.prepared.join('\n');
  expect(sql.indexOf('INSERT INTO lms_scorm_edition_handoffs'))
   .toBeLessThan(sql.indexOf('UPDATE lms_progresso_scorm'));
  expect(sql).toContain('UPDATE lms_matriculas');
  expect(sql).toContain('DELETE FROM lms_completion_diagnostics_snapshots');
  expect(f.batch).toHaveBeenCalledOnce();
 });
 it('archives the historical package and exact cycle snapshot before resetting runtime state',async()=>{
  const f=fake({previousPackage:true});
  await expect(writeScormEditionHandoff(f.db,base))
   .rejects.toThrow('SCORM_HANDOFF_BATCH_POSTCHECK_FAILED');
  expect(f.prepared.join('\n')).toContain("a.action='ACTIVATED'");
  const insert=f.bindings.find(binding=>binding.sql.includes('INSERT INTO lms_scorm_edition_handoffs'));
  expect(insert?.args).toContain('lms/scorm/6/88/prior/');
  expect(insert?.args).toContain('a'.repeat(64));
  expect(insert?.sql).toContain("'cycle'");
  expect(insert?.sql).toContain("'previous_package_sha256'");
 });
 it('uncommitted batch failure does not acknowledge success',async()=>{
  const f=fake({batchError:true});
  await expect(writeScormEditionHandoff(f.db,base))
   .rejects.toThrow('unique constraint failed');
 });
});
