import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CONFIRM, ACTIVE_BRIEF_PROTOCOL, sampleTrials, checkinPayload, localReferenceDate, syntheticPreflightSchedule,
} from '../staging/qa-frms-checkin-lifecycle.mjs';

test('synthetic check-in fixture explicitly identifies the authorized staging workflow', () => {
  assert.equal(CONFIRM,'AIRTRUST_STAGING_FRMS_CHECKIN_QA');
  assert.equal(localReferenceDate(new Date('2026-10-17T02:00:00Z')),'2026-10-16');
  assert.equal(localReferenceDate(new Date('2026-10-17T12:00:00Z')),'2026-10-17');
});

test('AirTrust brief-v1 sample contains 10 well-ordered synthetic responses within 60 seconds', () => {
  const trials=sampleTrials();
  assert.equal(trials.length,10);
  assert.equal(new Set(trials.map(x=>x.sequence)).size,10);
  assert(trials.every(x=>x.stimulusAtMs>=x.scheduledAtMs &&
    x.stimulusAtMs<60000 && x.responseAtMs>x.stimulusAtMs &&
    x.reactionTimeMs===x.responseAtMs-x.stimulusAtMs &&
    x.outcome==='response'));
});

test('initial submission embeds active brief protocol; same-day update omits objective trials', () => {
  const schedule=syntheticPreflightSchedule(new Date('2026-10-17T09:30:00Z'));
  const initial=checkinPayload('2026-10-17',3,true,schedule);
  const update=checkinPayload('2026-10-17',4,false,schedule);
  assert.equal(initial.reference_date,update.reference_date);
  assert.equal(initial.kss_score,3);
  assert.equal(update.kss_score,4);
  assert.equal(initial.readiness.protocol_version,ACTIVE_BRIEF_PROTOCOL);
  assert.equal(ACTIVE_BRIEF_PROTOCOL,'airtrust-brief-v1');
  assert.equal(initial.readiness.duration_ms,60000);
  assert.equal(update.readiness,undefined);
  assert.equal(initial.hora_apresentacao,'06:55');
  assert.equal(initial.wake_time,'05:00');
  assert.equal(initial.fit_for_duty,true);
  assert.equal(initial.horas_sono_24h,7);
  assert.deepEqual(Object.keys(initial).includes('empresa_id'),false);
  assert.deepEqual(Object.keys(update).includes('funcionario_id'),false);
});

test('rejects arbitrary day or KSS values before any request', () => {
  const schedule=syntheticPreflightSchedule(new Date('2026-10-17T09:30:00Z'));
  assert.throws(()=>checkinPayload('not-a-date',3,true,schedule),/QA_CHECKIN_PAYLOAD_INVALID/);
  assert.throws(()=>checkinPayload('2026-10-17',9,true,schedule),/QA_CHECKIN_PAYLOAD_INVALID/);
  assert.throws(()=>checkinPayload('2026-10-16',3,true,schedule),/QA_CHECKIN_PAYLOAD_INVALID/);
  assert.throws(()=>checkinPayload('2026-10-17',3,true),/QA_CHECKIN_PAYLOAD_INVALID/);
});

test('uses IANA-local clock and always creates a future same-day presentation', () => {
  const day=syntheticPreflightSchedule(new Date('2026-11-04T01:30:00Z'));
  assert.deepEqual(day,{date:'2026-11-03',presentationTime:'22:55',wakeTime:'21:00'});
  const afterMidnight=syntheticPreflightSchedule(new Date('2026-11-04T03:05:00Z'));
  assert.deepEqual(afterMidnight,{date:'2026-11-04',presentationTime:'00:30',wakeTime:'00:00'});
});

test('near-midnight or invalid clock fails before any synthetic check-in write', () => {
  assert.throws(()=>syntheticPreflightSchedule(new Date('2026-11-04T02:40:00Z')),
    /FRMS_QA_NO_SAME_DAY_PREFLIGHT_WINDOW/);
  assert.throws(()=>syntheticPreflightSchedule(new Date(Number.NaN)),
    /FRMS_QA_INVALID_SERVER_CLOCK/);
});
