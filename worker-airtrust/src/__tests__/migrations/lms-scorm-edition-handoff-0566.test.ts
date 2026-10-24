import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../');
const read=(path:string)=>readFileSync(resolve(ROOT,path),'utf8');
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
const manifestPath='worker-airtrust/schema-v2/lms-scorm-edition-handoff-0566.json';

describe('Schema V2 0566 reviewed contract',()=>{
  it('pins the exact DDL and plan bytes in the manifest',()=>{
    const manifest=JSON.parse(read(manifestPath)) as {
      changeId:string;baselineId:string;filePath:string;fileHash:string;planPath:string;planHash:string;
    };
    expect(manifest).toMatchObject({
      changeId:'lms-scorm-edition-handoff-0566',
      baselineId:'production-d1-baseline-v2-20260714',
      filePath:'worker-airtrust/schema-v2/changes/0566_lms_scorm_edition_handoffs.sql',
      planPath:'worker-airtrust/schema-v2/plans/lms-scorm-edition-handoff-0566.md',
    });
    expect(manifest.fileHash).toBe(sha256(read(manifest.filePath)));
    expect(manifest.planHash).toBe(sha256(read(manifest.planPath)));
  });

  it('keeps the baseline explicit about pending remote apply and empty-snapshot intent',()=>{
    const manifest=JSON.parse(read(manifestPath)) as {changeId:string;fileHash:string;planPath:string};
    const baseline=JSON.parse(read('docs/database/schema-contracts/production-d1-baseline-v2.json')) as {
      schema_v2_since_baseline:Array<{
        change_id:string;sha256:string;coverage:string;governance_state:string;reviewed_manifest:string;evidence:string;note:string;
      }>;
    };
    const change=baseline.schema_v2_since_baseline.find((entry)=>entry.change_id===manifest.changeId);
    expect(change).toMatchObject({
      sha256:manifest.fileHash,
      coverage:'OUT_OF_CONTRACT_SCOPE',
      governance_state:'REMOTE_APPLY_PENDING',
      reviewed_manifest:'lms-scorm-edition-handoff-0566.json',
      evidence:manifest.planPath,
    });
    expect(change?.note).toMatch(/DDL only, no archive\/reset\/user write/i);
  });
});
