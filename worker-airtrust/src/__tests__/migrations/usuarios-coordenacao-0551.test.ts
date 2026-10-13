import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../../..');
const read=(p:string)=>readFileSync(join(root,p),'utf8');
const h=(s:string)=>createHash('sha256').update(s).digest('hex');
describe('Schema V2 0551 — restore coordination USER only',()=>{
 const sql=read('worker-airtrust/schema-v2/changes/0551_coordenacao_role_user_restore.sql');
 const plan=read('worker-airtrust/schema-v2/plans/coordenacao-role-user-restore-0551.md');
 const m=JSON.parse(read('worker-airtrust/schema-v2/coordenacao-role-user-restore-0551.json'));
 it('verifies reviewed SQL/plan SHA256 and baseline',()=>{
   expect(m.changeId).toBe('coordenacao-role-user-restore-0551');
   expect(m.baselineId).toBe('production-d1-baseline-v2-20260714');
   expect(m.fileHash).toBe(h(sql));expect(m.planHash).toBe(h(plan));
 });
 it('updates only USER coordination and does not rewrite student roles',()=>{
   expect(sql).toContain("SET role='user'");expect(sql).toContain('COORDENACAO_VOO');
   expect(sql).toContain('empresa_id=6');expect(sql).toContain('SELECT CASE WHEN');
   expect(sql).not.toContain("SET role='student'");
   expect(sql).not.toContain('CREATE TEMP TABLE');
 });
 it('tests real state and six fail-closed cases',()=>{
   const out=execFileSync('python3',[join(root,'scripts/__tests__/schema-v2-0551-coordenacao-fixture.py')],{cwd:root,encoding:'utf8',timeout:15000});
   expect(out).toContain('PASS 0551');
 });
 it('enforces governance preflight and postconditions',()=>{
   const workflow=read('.github/workflows/apply-schema-change-v2.yml');
   expect(workflow).toContain('validate-0551-production-preflight.sh');
   expect(workflow).toContain('validate-0551-production-postconditions.sh');
 });
});
