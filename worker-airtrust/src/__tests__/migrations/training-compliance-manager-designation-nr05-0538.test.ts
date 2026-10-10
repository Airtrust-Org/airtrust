import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const ROOT=join(process.cwd(),'..');
const read=(p:string)=>readFileSync(join(ROOT,p),'utf8');
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
describe('0538 Gestor + NR05',()=>{
  it('pins hashes and mirrors migration',()=>{
    const m=read('worker-airtrust/migrations/0538_training_compliance_manager_designation_nr05.sql');
    const c=read('worker-airtrust/schema-v2/changes/0538_training_compliance_manager_designation_nr05.sql');
    const p=read('worker-airtrust/schema-v2/plans/training-compliance-manager-designation-nr05-0538.md');
    const j=JSON.parse(read('worker-airtrust/schema-v2/training-compliance-manager-designation-nr05-0538.json'));
    expect(m).toBe(c); expect(j.fileHash).toBe(hash(c)); expect(j.planHash).toBe(hash(p));
  });
  it('uses GESTOR and supersedes title inference',()=>{
    const s=read('worker-airtrust/schema-v2/changes/0538_training_compliance_manager_designation_nr05.sql');
    expect(s).toContain("'GESTOR','Gestor','DESIGNACAO'");
    expect(s).toContain("qt.codigo IN ('PPSP_SUP','BOWTIEXP')");
    expect(s).not.toContain("LIKE 'GERENTE %'");
    expect(s).not.toContain('Gestor de Treinamento');
  });
  it('sets NR05 EAD 24 months 2h company-wide',()=>{
    const s=read('worker-airtrust/schema-v2/changes/0538_training_compliance_manager_designation_nr05.sql');
    expect(s).toContain("categoria='EAD'"); expect(s).toContain('validade=24'); expect(s).toContain('carga_horaria=2'); expect(s).toContain("'CLIENTE'");
  });
});
