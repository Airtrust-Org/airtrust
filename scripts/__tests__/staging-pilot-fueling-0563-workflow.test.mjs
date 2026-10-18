// source_reference: Pilot fueling 0563 governed Schema V2 staging workflow
// operational_decision: enforce exact hash and physical pre/post checks for schema-only stage
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source=readFileSync('.github/workflows/staging-apply-schema-v2.yml','utf8');
test('0563 release remains SHA-bound to trusted main and staging D1',()=>{
for(const s of ['refs/heads/main','AIRTRUST_STAGING_SCHEMA_V2','REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH','WORKFLOW_ACTOR_NOT_AUTHORIZED','verify-release-gates.mjs','STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS','bf9963f4-eb12-439b-a830-20bbf577ac22','controle-voos-pilot-fueling-identity-0563','f920e8b75faab568c7abeaace086606d19904bc1a4b16fc010238d63fd572456','1be9c128e3f56e03f72a35702cd239735476460ba24209801d32bf10e44296ae','0563_controle_voos_pilot_fueling_identity.sql']) assert.ok(source.includes(s),s);
});
test('0563 preflight and postcheck protect legacy fuelings',()=>{
for(const s of ['PILOT_FUELING_SOURCE_TABLE_MISSING','PILOT_FUELING_CLIENT_ID_ALREADY_PRESENT','PILOT_FUELING_INDEX_ALREADY_PRESENT','PILOT_FUELING_TRIGGER_ALREADY_PRESENT','PILOT_FUELING_CLIENT_ID_POSTCONDITION_FAILED','PILOT_FUELING_UNIQUE_PARTIAL_INDEX_MISSING','PILOT_FUELING_ID_GUARDS_MISSING','PILOT_FUELING_LEGACY_ROW_COUNT_CHANGED','PILOT_FUELING_UNEXPECTED_BACKFILL','FUELING_COUNT_BEFORE:']) assert.ok(source.includes(s),s);
});
