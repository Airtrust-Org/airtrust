import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePlayer3QaActivation, exactTenantAllowed,
  REQUIRED_TENANT_GATES} from '../staging/player3-technical-qa-activation-preflight.mjs';

const release = 'a'.repeat(40);
const tenant = '771';
const fixture = () => ({
  ENVIRONMENT: 'staging',
  PLAYER3_QA_SYNTHETIC_TENANT_ID: tenant,
  PLAYER3_QA_EXPECTED_SHA: release,
  PLAYER3_QA_SYNTHETIC_SOURCE_SHA256: 'b'.repeat(64),
  PLAYER3_QA_STAGING_ORIGIN: 'https://staging.airtrust.pages.dev',
  PLAYER3_QA_API_ORIGIN: 'https://airtrust-api-staging.airtrust.workers.dev',
  PLAYER3_AUTHORED_CONTENT_ORIGIN: 'https://content-qa.example.org',
  PLAYER3_QA_CONTENT_ORIGIN: 'https://content-qa.example.org',
  ...Object.fromEntries(REQUIRED_TENANT_GATES.map(g => [g,tenant])),
});
const verify = env =>
  evaluatePlayer3QaActivation({env,tenant,expectedSha:release});

test('staging-only synthetic tenant with all eight independent gates is eligible for later physical validation',() => {
  const result = verify(fixture());
  assert.equal(result.tenantGateReady,true);
  assert.equal(result.checkedTenantGateCount,8);
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.physicalSchemaVerified,false);
  assert.equal(result.syntheticEnrollmentsVerified,false);
  assert.equal(result.browserJourneysVerified,false);
  assert.equal(result.pdfVerified,false);
});

test('absent or unapproved flags reject writes, despite valid preview',() => {
  for(const gate of REQUIRED_TENANT_GATES) {
    const env = fixture();
    delete env[gate];
    const report=verify(env);
    assert.equal(report.tenantGateReady,false,gate);
    assert.ok(report.blockers.includes(gate),gate);
  }
});

test('wildcards, substring tenant matches, invalid IDs and cross-tenant scopes never grant access',() => {
  for(const raw of ['*','77','1771','7710','77,1','771,*','771,',
    '771,a','000771','0','-771','',' 771 ; 772 ','771,,771']) {
    assert.equal(exactTenantAllowed(raw,tenant),false,raw);
  }
  assert.equal(exactTenantAllowed('22, 771, 901',tenant),false);
  assert.equal(exactTenantAllowed('771,771',tenant),false);
  assert.equal(exactTenantAllowed('771',tenant),true);
});

test('independently pinned synthetic ZIP SHA-256 is mandatory and cannot reuse RC8.1',() => {
  for (const value of [undefined, '', 'b'.repeat(40), 'xyz',
    'a0a9e955368a8e7f4dd3072b7bd98eb8e5d7cab47d31cbd9335f4282dbba18a2']) {
    const env=fixture();
    if (value===undefined) delete env.PLAYER3_QA_SYNTHETIC_SOURCE_SHA256;
    else env.PLAYER3_QA_SYNTHETIC_SOURCE_SHA256=value;
    assert.ok(verify(env).blockers.includes('INDEPENDENT_SYNTHETIC_SOURCE_SHA256_REQUIRED'));
  }
});

test('a gate listing a second tenant never activates synthetic QA',() => {
  for (const gate of REQUIRED_TENANT_GATES) {
    const env=fixture();env[gate]=`${tenant},901`;
    assert.ok(verify(env).blockers.includes(gate),gate);
  }
});

test('a mismatch in the separately pinned QA tenant or SHA fails closed',() => {
  for(const [key,value,code] of [
    ['PLAYER3_QA_SYNTHETIC_TENANT_ID','772','SYNTHETIC_TENANT_PIN_MISSING'],
    ['PLAYER3_QA_EXPECTED_SHA','b'.repeat(40),'RELEASE_SHA_PIN_MISSING'],
  ]) {
    const env=fixture();env[key]=value;
    assert.ok(verify(env).blockers.includes(code));
  }
  assert.ok(evaluatePlayer3QaActivation({
    env:fixture(),tenant:'invalid',expectedSha:release,
  }).blockers.includes('EXACT_SYNTHETIC_TENANT_REQUIRED'));
});

test('production and altered origins never qualify as QA',() => {
  for(const [key,value,expected] of [
    ['ENVIRONMENT','production','STAGING_ONLY'],
    ['PLAYER3_QA_STAGING_ORIGIN','https://airtrust.online','STAGING_PAGE_ORIGIN_INVALID'],
    ['PLAYER3_QA_API_ORIGIN','https://qa-api.airtrust.online','STAGING_API_ORIGIN_INVALID'],
    ['PLAYER3_AUTHORED_CONTENT_ORIGIN','http://qa-content.example.org','AUTHORED_CONTENT_ORIGIN_INVALID'],
    ['PLAYER3_AUTHORED_CONTENT_ORIGIN','https://qa-content.example.org/path','AUTHORED_CONTENT_ORIGIN_INVALID'],
    ['PLAYER3_AUTHORED_CONTENT_ORIGIN','https://staging.airtrust.pages.dev','THREE_DISTINCT_STAGING_ORIGINS_REQUIRED'],
    ['PLAYER3_QA_CONTENT_ORIGIN','https://other-qa.example.org','QA_CONTENT_ORIGIN_PIN_MISMATCH'],
  ]) {
    const env=fixture();env[key]=value;
    assert.ok(verify(env).blockers.includes(expected),key);
  }
});

test('never embed user secrets, flag values or profile in the sanitized result',() => {
  const env={...fixture(),STAGING_SMOKE_PASSWORD:'top-secret-qa-password',
    PLAYER3_QA_READONLY_BEARER_TOKEN:'some-private-bearer-value'};
  const report=verify(env);
  const raw=JSON.stringify(report);
  assert.equal(report.tenantGateReady,true);
  assert.ok(!raw.includes('top-secret'));
  assert.ok(!raw.includes('some-private-bearer'));
  assert.ok(!raw.includes('771'));
});
