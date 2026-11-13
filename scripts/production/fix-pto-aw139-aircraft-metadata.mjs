#!/usr/bin/env node
// source_reference: PTO Rev.10 V18, A139-* session metadata; D1 tenant 6 read-only inspection, issue #2232.
// operational_decision: change only modelo_aeronave on nine identified AW139 catalog models; no maneuver, guide, score, signature, or historical writes.
// dry_run_required: exact 9-row preflight, link/tenant assertions, reviewed state SHA256, official 8 CI gates and production dry-run.
// rollback_plan_required: Cloudflare D1 time-travel checkpoint before apply; scoped corrective reversal requires new audited operation.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PAIRS,assertPtoAw139MetadataState,buildPtoAw139MetadataUpdateSql } from './lib/pto-aw139-aircraft-metadata.mjs';

const MODE=process.argv[2];
const TENANT=6;
const EXPECTED=MODE==='apply'
  ? 'AIRTRUST_PTO_AW139_METADATA_9_EXACT_ROWS_APPLY'
  : 'AIRTRUST_PTO_AW139_METADATA_9_DRY_RUN';
if(!['dry-run','apply'].includes(MODE))throw Error('MODE_INVALID');
if(process.env.PTO_AW139_CONFIRMATION!==EXPECTED)throw Error('CONFIRMATION_MISMATCH');
if(process.env.PTO_AW139_DB&&process.env.PTO_AW139_DB!=='airtrust-db')throw Error('DB_TARGET_INVALID');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ids=PAIRS.map(([id])=>id).join(',');

function d1(sql,write=false){
  if(!write&&!/^\s*SELECT\b/i.test(sql))throw Error('READONLY_SQL_REQUIRED');
  const child=spawnSync('npx',['wrangler','d1','execute','airtrust-db',
    '--env','production','--remote','--json','--command',sql],
    {cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',maxBuffer:16*1024*1024});
  if(child.status!==0)throw Error('D1_QUERY_FAILED');
  let data;try{data=JSON.parse(child.stdout);}catch{throw Error('D1_INVALID_JSON');}
  if(!Array.isArray(data)||data.some(x=>x.success!==true))throw Error('D1_OPERATION_FAILED');
  if(!write&&data.some(x=>x.meta?.changed_db!==false||Number(x.meta?.rows_written)!==0))
    throw Error('READ_ONLY_WROTE_DATA');
  return {rows:data.flatMap(x=>x.results||[]),
    changes:data.reduce((n,x)=>n+Number(x.meta?.changes||0),0)};
}
function readState(){
  const rows=d1(`SELECT id,codigo,empresa_id,ativo,deleted_at,modelo_aeronave
    FROM modelos_sessao WHERE empresa_id=${TENANT} AND id IN (${ids}) ORDER BY id`).rows;
  const links=d1(`SELECT m.id,COUNT(l.id) AS n,
      SUM(CASE WHEN UPPER(COALESCE(a.tipo_aeronave,'')) IN ('S76','SK76') THEN 1 ELSE 0 END) AS s76,
      SUM(CASE WHEN a.id IS NOT NULL AND a.empresa_id<>${TENANT} THEN 1 ELSE 0 END) AS cross_tenant,
      SUM(CASE WHEN l.id IS NOT NULL AND a.id IS NULL THEN 1 ELSE 0 END) AS orphan
    FROM modelos_sessao m
    LEFT JOIN modelos_sessao_manobras l ON l.modelo_id=m.id AND l.deleted_at IS NULL
    LEFT JOIN manobras a ON a.id=l.manobra_id
    WHERE m.empresa_id=${TENANT} AND m.id IN (${ids})
    GROUP BY m.id ORDER BY m.id`).rows;
  return {rows,links};
}
const before=readState();
assertPtoAw139MetadataState(before,'before');
const beforeHash=hash(before);
let changes=0;
if(MODE==='apply'){
  if(process.env.PTO_AW139_EXPECTED_HASH!==beforeHash)throw Error('REVIEWED_STATE_HASH_MISMATCH');
  changes=d1(buildPtoAw139MetadataUpdateSql(),true).changes;
  if(changes!==9)throw Error('EXACT_NINE_WRITES_REQUIRED');
}
const after=MODE==='apply'?readState():before;
assertPtoAw139MetadataState(after,MODE==='apply'?'after':'before');
process.stdout.write(JSON.stringify({
  mode:MODE,source_sha:process.env.GITHUB_SHA||null,tenant:TENANT,count:9,changes,
  before_hash:beforeHash,post_hash:hash(after),postconditions_verified:MODE==='apply'
})+'\n');
