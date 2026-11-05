import { describe, expect, it } from 'vitest';
import { projectS76Rc3AdministrativeResume, type S76Rc3ResumeBridgeInput } from
  '../../services/lms-scorm-s76-rc3-resume-bridge';
import type { ActiveCompletionManifest } from '../../services/lms-completion-manifest-evidence';
import { buildScormLaunchState } from '../../services/lms-scorm-launch-state';

const sha = '9c65dc726af8e57b2ac3424b0898559b1a80d00348605b6805eb155ad6a1bb12';
const version = 'v3.4-no-module-exams-rc2-2026-11-02';
const ids = Array.from({ length: 49 }, (_, i) =>
  i === 0 ? 'C00' : i === 48 ? 'M6-07' : 'M' + i.toString().padStart(2, '0'));
const manifest: ActiveCompletionManifest = {
  packageVersion: version,
  requiredSlideIds: ids,
  assessmentMode: 'NONE',
  workerApprovalRequired: true,
};
const credit = () => ({
  v: 4, p: version, a: 48,
  d: Array.from({ length: 48 }, (_, i) => i),
  s: {}, g: [], h: {}, vs: {}, c: false,
});
const initialCmi = (state: object = credit()) => ({
  'cmi.core.lesson_status': 'incomplete',
  'cmi.core.lesson_mode': 'normal',
  'cmi.core.lesson_location': '3/49',
  'cmi.suspend_data': JSON.stringify(state),
  'airtrust.total_slides': 49,
  'airtrust.viewed_slides': [1, 2, 3],
  'airtrust.administrative_credit': {
    kind: 'PREVIOUS_EDITION_UNITS_RECOGNIZED',
    credited_units: 48,
    previous_progress_pct: 99,
    package_sha256: sha,
    handoff_id: null,
  },
});
const input = (): S76Rc3ResumeBridgeInput => ({
  empresaId: 6, cursoId: 39, matriculaId: 690, cicloId: 889,
  handoffId: 30, handoffPreviousProgressPct: 100,
  handoffBookmark: { position: 49, total: 49 },
  activePackageSha256: sha,
  assessmentPolicy: 'FORMATIVE',
  enrollmentStatus: 'EM_ANDAMENTO',
  qualificationHistoryId: null,
  manifest,
  initialCmiJson: JSON.stringify(initialCmi()),
});

describe('S-76 RC3 V4 administrative credit projection (launch-only)', () => {
  it('keeps exactly 48 credited indexes, never emits completion, quiz answers or score', () => {
    const original = input();
    const projected = projectS76Rc3AdministrativeResume(original);
    expect(projected).not.toBeNull();
    const cmi = JSON.parse(projected!);
    const state = JSON.parse(cmi['cmi.suspend_data']);
    expect(state).toEqual({
      v: 2, p: version, a: 48,
      c: Array.from({ length: 48 }, (_, i) => i),
      d: Array.from({ length: 48 }, (_, i) => i),
      g: {},
    });
    expect(cmi['cmi.core.lesson_location']).toBe('49/49');
    expect(cmi['cmi.core.lesson_status']).toBe('incomplete');
    expect(cmi['airtrust.viewed_slides']).toEqual([1, 2, 3]);
    expect(cmi['airtrust.administrative_credit']).toEqual(
      JSON.parse(original.initialCmiJson)['airtrust.administrative_credit']);
    expect(cmi).not.toHaveProperty('cmi.core.score.raw');
    expect(cmi).not.toHaveProperty('cmi.core.lesson_status', 'completed');
  });

  it('integrates the real launch-state assembler without mutating the original checkpoint', () => {
    const original = input();
    const launch = buildScormLaunchState(
      original.initialCmiJson, null, false, false, { position: 49, total: 49 },
      { persisted: { lesson_status: 'incomplete' }, formativeCourse: true },
    );
    expect(launch.hasResumeState).toBe(true);
    const before = JSON.parse(launch.initialCmiJson);
    expect(JSON.parse(before['cmi.suspend_data']).v).toBe(4);
    const bridged = projectS76Rc3AdministrativeResume({
      ...original, initialCmiJson: launch.initialCmiJson,
    });
    expect(bridged).not.toBeNull();
    const after = JSON.parse(bridged!);
    expect(JSON.parse(after['cmi.suspend_data']).c).toHaveLength(48);
    expect(JSON.parse(after['cmi.suspend_data']).d).toHaveLength(48);
    expect(after['cmi.core.lesson_location']).toBe('49/49');
    expect(before['cmi.core.lesson_location']).toBe('3/49');
  });

  it('rejects scope, handoff, identity, policy and completed-course mismatches', () => {
    const original = input();
    for (const delta of [
      { empresaId: 7 }, { cursoId: 40 }, { matriculaId: 691 },
      { cicloId: 890 }, { handoffId: 31 },
      { handoffPreviousProgressPct: 99 },
      { handoffBookmark: { position: 48, total: 49 } },
      { activePackageSha256: 'a'.repeat(64) }, { assessmentPolicy: 'SCORED' },
      { enrollmentStatus: 'CONCLUIDO' }, { qualificationHistoryId: 123 },
      { manifest: { ...manifest, assessmentMode: 'SCORM' as const } },
      { manifest: { ...manifest, packageVersion: 'other' } },
      { manifest: { ...manifest, requiredSlideIds: ids.slice(0, 48) } },
    ]) {
      expect(projectS76Rc3AdministrativeResume({ ...original, ...delta })).toBeNull();
    }
  });

  it('rejects fabricated coverage, premature completion, scores and non-administrative CMI', () => {
    const base = input();
    const bad = [
      initialCmi({ ...credit(), d: Array.from({ length: 49 }, (_, i) => i) }),
      initialCmi({ ...credit(), a: 47 }),
      initialCmi({ ...credit(), d: [...Array.from({ length: 47 }, (_, i) => i), 48] }),
      initialCmi({ ...credit(), c: true }),
      initialCmi({ ...credit(), p: 'another-version' }),
      initialCmi({ ...credit(), g: ['fabricated:gate'] }),
      initialCmi({ ...credit(), x: { M1: [0] } }),
      initialCmi({ ...credit(), ids: ids.map((s, i) => i === 12 ? 'wrong' : s) }),
      { ...initialCmi(), 'cmi.core.lesson_status': 'completed' },
      { ...initialCmi(), 'cmi.core.score.raw': '100' },
      { ...initialCmi(), 'airtrust.total_slides': 50 },
      { ...initialCmi(), 'airtrust.administrative_credit': null },
      { ...initialCmi(), 'airtrust.administrative_credit': {
        ...initialCmi()['airtrust.administrative_credit'], credited_units: 49,
      } },
    ];
    for (const cmi of bad) {
      expect(projectS76Rc3AdministrativeResume({
        ...base, initialCmiJson: JSON.stringify(cmi),
      })).toBeNull();
    }
  });
});
