import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CONFIRM, sampleTrials, checkinPayload, localReferenceDate,
} from '../staging/qa-frms-checkin-lifecycle.mjs';

test('synthetic check-in fixture explicitly identifies the authorized staging workflow', () => {
  assert.equal(CONFIRM,'AIRTRUST_STAGING_FRMS_CHECKIN_QA');
  assert.equal(localReferenceDate(new Date('2026-10-17T02:00:00Z')),'2026-10-16');
  assert.equal(localReferenceDate(new Date('2026-10-17T12:00:00Z')),'2026-10-17');
});

test('PVT-B V2 sample contains 10 well-ordered synthetic responses within 60 seconds', () => {
  const trials=sampleTrials();
  assert.equal(trials.length,10);
  assert.equal(new Set(trials.map(x=>x.sequence)).size,10);
  assert(trials.every(x=>x.stimulusAtMs>=x.scheduledAtMs &&
    x.stimulusAtMs<60000 && x.responseAtMs>x.stimulusAtMs &&
    x.reactionTimeMs===x.responseAtMs-x.stimulusAtMs &&
    x.outcome==='response'));
});

test('initial submission embeds protocol; same-day update omits PVT-B (no false redraw)', () => {
  const initial=checkinPayload('2026-10-17',3,true);
  const update=checkinPayload('2026-10-17',4,false);
  assert.equal(initial.reference_date,update.reference_date);
  assert.equal(initial.kss_score,3);
  assert.equal(update.kss_score,4);
  assert.equal(initial.readiness.protocol_version,'airtrust-pvtb-v2');
  assert.equal(initial.readiness.duration_ms,60000);
  assert.equal(update.readiness,undefined);
  assert.equal(initial.fit_for_duty,true);
  assert.equal(initial.horas_sono_24h,7);
  assert.deepEqual(Object.keys(initial).includes('empresa_id'),false);
  assert.deepEqual(Object.keys(update).includes('funcionario_id'),false);
});

test('rejects arbitrary day or KSS values before any request', () => {
  assert.throws(()=>checkinPayload('not-a-date',3,true),/QA_CHECKIN_PAYLOAD_INVALID/);
  assert.throws(()=>checkinPayload('2026-10-17',9,true),/QA_CHECKIN_PAYLOAD_INVALID/);
});
