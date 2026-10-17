import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const ROOT=join(process.cwd(),'..');
const read=(p:string)=>readFileSync(join(ROOT,p),'utf8');
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
describe('0540 Maintenance manual identity bootstrap',()=>{
  it('pins identical migration and reviewed hashes',()=>{
    const m=read('worker-airtrust/migrations/0540_training_maintenance_catalog_identities_bootstrap.sql');
    const c=read('worker-airtrust/schema-v2/changes/0540_training_maintenance_catalog_identities_bootstrap.sql');
    const p=read('worker-airtrust/schema-v2/plans/training-maintenance-manuals-bootstrap-0540.md');
    const j=JSON.parse(read('worker-airtrust/schema-v2/training-maintenance-manuals-bootstrap-0540.json'));
    expect(m).toBe(c); expect(j.fileHash).toBe(hash(c)); expect(j.planHash).toBe(hash(p));
  });
  it('restores only canonical manual identities with no standalone hours',()=>{
    const s=read('worker-airtrust/schema-v2/changes/0540_training_maintenance_catalog_identities_bootstrap.sql');
    for(const code of ['MNT_MGM','MNT_MOM','MNT_MCQ']) expect(s).toContain(code);
    expect(s).toContain("'TREINAMENTO-DE-DOUTRINACAO'");
    expect(s).toContain("codigo='MANUTENCAO'");
    expect(s).toContain('carga_horaria=NULL');
    expect(s).not.toContain('lms_matriculas');
    expect(s).not.toContain('qualificacoes_historico');
  });
  it('keeps ordering before 0539, 0537 and 0538',()=>{
    const s=read('scripts/staging/validate-0540-preflight.sh');
    for(const label of ['unapplied-0537','unapplied-0538','unapplied-0539']) expect(s).toContain(label);
  });
});
