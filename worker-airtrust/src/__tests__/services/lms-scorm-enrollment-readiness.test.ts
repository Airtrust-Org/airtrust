import { describe, expect, it, vi } from 'vitest';
import { hasLaunchablePublishedScormPackage, assertPublishedScormEnrollmentReady } from '../../services/lms-scorm-enrollment-readiness';

const params = {
  empresaId: 6,
  cursoId: 23,
  tipoConteudo: 'scorm',
  publicado: 1,
  packagePrefix: 'lms/scorm/6/23/_candidates/123/',
};

function mockDb(active: boolean) {
  const first = vi.fn().mockResolvedValue(active ? {ready:1} : null);
  const bind = vi.fn().mockReturnValue({first});
  const prepare = vi.fn().mockReturnValue({bind});
  return {db: {prepare} as unknown as D1Database,first,bind,prepare};
}
describe('published SCORM enrollment package readiness, tenant-scoped',()=>{
  it('rejects unavailable published SCORM at the shared single/batch HTTP boundary',async()=>{
    const t=mockDb(false);
    await expect(assertPublishedScormEnrollmentReady(t.db,6,23,{tipo_conteudo:'scorm',publicado:1,scorm_package_r2_prefix:params.packagePrefix}))
      .rejects.toMatchObject({statusCode:409});
  });
  it('rejects ANAC #23 with only VALIDATED candidates and no ACTIVE',async()=>{
    const t=mockDb(false);
    expect(await hasLaunchablePublishedScormPackage(t.db,params)).toBe(false);
    expect(t.bind).toHaveBeenCalledWith(6,23,params.packagePrefix);
    expect(t.prepare.mock.calls[0][0]).toContain("status='ACTIVE'");
  });
  it('permits only the exact tenant/course/prefix ACTIVE package',async()=>{
    const t=mockDb(true);
    expect(await hasLaunchablePublishedScormPackage(t.db,params)).toBe(true);
    expect(await hasLaunchablePublishedScormPackage(t.db,{...params,empresaId:7})).toBe(false);
    expect(await hasLaunchablePublishedScormPackage(t.db,{...params,cursoId:68})).toBe(false);
    expect(t.first).toHaveBeenCalledTimes(1);
  });
  it('rejects package-less LGPD #69 and unsafe paths without any database lookup',async()=>{
    const t=mockDb(true);
    for(const prefix of [null,'','lms/scorm/6/23/../68/', 'lms/scorm/1/23/pkg']) {
      expect(await hasLaunchablePublishedScormPackage(t.db,{...params,packagePrefix:prefix})).toBe(false);
    }
    expect(t.prepare).not.toHaveBeenCalled();
  });
  it('keeps non-SCORM and unpublished admin draft enrollment policy unchanged',async()=>{
    const t=mockDb(false);
    expect(await hasLaunchablePublishedScormPackage(t.db,{...params,tipoConteudo:'pdf',packagePrefix:null})).toBe(true);
    expect(await hasLaunchablePublishedScormPackage(t.db,{...params,publicado:0,packagePrefix:null})).toBe(true);
    expect(t.prepare).not.toHaveBeenCalled();
  });
});
