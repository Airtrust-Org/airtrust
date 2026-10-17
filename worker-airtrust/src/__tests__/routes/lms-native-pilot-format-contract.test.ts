import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const legacy=readFileSync(resolve(process.cwd(),'src/routes/lms-cursos-legacy.ts'),'utf8');
const uploads=readFileSync(resolve(process.cwd(),'src/routes/lms-cursos-upload-routes.ts'),'utf8');
const guard=readFileSync(resolve(process.cwd(),'src/services/lms-native-catalog-legacy-guard.ts'),'utf8');

describe('untrusted native_pilot_format must never turn a legacy course into Native/SCORM',()=>{
  it('rejects the marker in create, edit, structured upload and completed upload payloads',()=>{
    for(const [name,body] of [
      ['CursoCreateSchema',legacy],['CursoUpdateSchema',legacy],
      ['StructuredContentInitSchema',legacy],['StructuredContentCompleteSchema',legacy],
      ['InitSchema',uploads],['CompleteSchema',uploads],
    ] as const){
      const start=body.indexOf('const '+name+' = z.object({');
      expect(start,name).toBeGreaterThanOrEqual(0);
      const section=body.slice(start,start+330);
      expect(section,name).toContain('native_pilot_format: z.never().optional()');
      expect(section,name).toContain('nativePilotFormat: z.never().optional()');
    }
  });
  it('also rejects legacy multipart course creation marker before payload normalization',()=>{
    const start=legacy.indexOf('async function parseCursoCreateRequest');
    const end=legacy.indexOf('const payload =',start);
    const payload=legacy.slice(end,legacy.indexOf("const parsed = CursoCreateSchema",end));
    expect(payload).toContain("formData.get('native_pilot_format')");
    expect(payload).toContain("formData.get('nativePilotFormat')");
  });
  it('guards Native staging catalog activation independently of a disabled UI feature flag',()=>{
    expect(guard).toContain("hasSchemaTable(env.DB, 'lms_native_catalog_activation', { fresh: true })");
    expect(guard).toContain('NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED');
  });
});
