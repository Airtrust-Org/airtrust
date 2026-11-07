// source_reference: PR #1623; dry_run_required: false; rollback_plan_required: false
// Fixed metadata-only SELECT. No SQL, database or endpoint supplied by a caller.
import { pathToFileURL } from 'node:url';
export const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const SQL = `SELECT
 (SELECT COUNT(*) FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE') AS baseline,
 (SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='controle-voos-pilot-fueling-identity-0563' AND baseline_id='production-d1-baseline-v2-20260714' AND file_hash='f920e8b75faab568c7abeaace086606d19904bc1a4b16fc010238d63fd572456' AND plan_hash='1be9c128e3f56e03f72a35702cd239735476460ba24209801d32bf10e44296ae') AS ledger0563,
 (SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='controle-voos-pilot-supplier-history-0564' AND baseline_id='production-d1-baseline-v2-20260714' AND file_hash='0474f9d87e419b85e6a851766a34a8a3c8a2a3728976bf52a4644a191d63c4b8' AND plan_hash='6e0b2968655fbb423d36f3413065120daa8f4c828e0e82cbeba2e01c32c97d81') AS ledger0564,
 (SELECT COUNT(*) FROM pragma_table_info('cv_voo_abastecimentos') WHERE name='client_local_id' AND type='TEXT' AND "notnull"=0) AS column0563,
 (SELECT COUNT(*) FROM pragma_table_info('cv_voo_abastecimentos') WHERE name='supplier_code_at_acceptance' AND type='TEXT' AND "notnull"=0) AS column0564,
 (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='cv_voo_abastecimentos' AND name='uq_cv_voo_abastecimentos_client_event' AND sql LIKE '%WHERE client_local_id IS NOT NULL%') AS index0563,
 (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='cv_voo_abastecimentos' AND name IN ('trg_cv_voo_abastecimentos_client_id_insert','trg_cv_voo_abastecimentos_client_id_immutable')) AS triggers0563,
 (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='cv_voo_abastecimentos' AND name='trg_cv_pilot_fueling_supplier_code_insert') AS insert0564,
 (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='cv_voo_abastecimentos' AND name='trg_cv_pilot_fueling_supplier_code_immutable') AS immutable0564`;
export const EXPECTED = Object.freeze({baseline:1,ledger0563:1,ledger0564:1,column0563:1,column0564:1,index0563:1,triggers0563:2,insert0564:1,immutable0564:1});

export function validateReadback(body) {
 if(body?.success!==true || !Array.isArray(body.result) || body.result.length!==1) throw Error('PILOT_READBACK_RESPONSE_INVALID');
 const entry=body.result[0];
 if(entry.success!==true || entry.meta?.changed_db!==false || entry.meta?.rows_written!==0 ||
    (entry.meta.changes!==undefined && entry.meta.changes!==0)) throw Error('PILOT_READBACK_NOT_PROVEN_READONLY');
 if(!Array.isArray(entry.results) || entry.results.length!==1) throw Error('PILOT_READBACK_ROW_INVALID');
 const row=entry.results[0];
 if(Object.keys(row).length!==Object.keys(EXPECTED).length ||
    Object.entries(EXPECTED).some(([key,value])=>row[key]!==value)) throw Error('PILOT_SCHEMA_0564_METADATA_MISMATCH');
 // Do not return/log raw API bodies, SQL, ledger rows or credential material.
 return {schemaMetadata:'PASS',databaseId:STAGING_DB_ID,rowsWritten:0,
   triggerDefinitions:'NOT_VERIFIED',runtimeProvenance:'NOT_VERIFIED',deviceAcceptance:'NOT_VERIFIED'};
}

export async function readback(env=process.env, request=fetch) {
 const account=env.CLOUDFLARE_ACCOUNT_ID, token=env.CLOUDFLARE_D1_READONLY_API_TOKEN;
 if(!/^[a-f0-9]{32}$/.test(account||'') || !token) throw Error('PILOT_READONLY_CREDENTIALS_REQUIRED');
 const sha=env.RELEASE_SHA;
 if(!/^[a-f0-9]{40}$/.test(sha||'')) throw Error('PILOT_RELEASE_SHA_REQUIRED');
 let response;
 try {
   response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${STAGING_DB_ID}/query`, {
     method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
     headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:SQL,params:[]})
   });
 } catch { throw Error('PILOT_READBACK_TRANSPORT_FAILED'); }
 if(!response.ok) throw Error('PILOT_READBACK_HTTP_'+response.status);
 let body;
 try { body=await response.json(); } catch { throw Error('PILOT_READBACK_JSON_INVALID'); }
 return {...validateReadback(body),candidateSha:sha};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 try { console.log(JSON.stringify(await readback())); }
 catch(error) { console.error(error.message);process.exitCode=1; }
}
