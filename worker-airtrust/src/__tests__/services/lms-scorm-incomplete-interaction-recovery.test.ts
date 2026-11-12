import { describe, expect, it } from 'vitest';
import {
  parseImmutableCourseModel, planIncompleteInteractionRecovery,
} from '../../services/lms-scorm-incomplete-interaction-recovery';
import type { ActiveCompletionManifest } from '../../services/lms-completion-manifest-evidence';

const ids = ['intro', 'scenario-one', 'study', 'scenario-two', 'end'];
const manifest: ActiveCompletionManifest = {
  packageVersion: '2026-v4-controlled', requiredSlideIds: ids,
  assessmentMode: 'NONE', workerApprovalRequired: true,
};
const model = { packageVersion: manifest.packageVersion, slides: [
  { id: ids[0], kind: 'lesson' },
  { id: ids[1], kind: 'scenario', requiredDecision: true },
  { id: ids[2], kind: 'lesson' },
  { id: ids[3], kind: 'scenario', requiredDecision: true },
  { id: ids[4], kind: 'study_end' },
]};
function input(decisions: Record<string, number> = {}) {
  const suspend = JSON.stringify({ v: 4, p: manifest.packageVersion,
    a: 4, d: [0, 1, 2, 3], s: decisions, g: ['preserved'], h: {}, vs: {}, q: {}, c: false });
  return {
    manifest, model, suspendData: suspend, cmiJson: JSON.stringify({
      'cmi.suspend_data': suspend, 'cmi.core.lesson_location': '5/5',
      'cmi.core.lesson_status': 'incomplete', 'airtrust.total_slides': 5,
    }),
    enrollmentStatus: 'EM_ANDAMENTO', lessonStatus: 'incomplete',
  };
}
describe('recovery of missing mandatory authored scenario answers', () => {
  it('only removes invalid done markers and rewinds to the earliest missing decision', () => {
    const plan = planIncompleteInteractionRecovery(input({ 'scenario-two': 0 }));
    expect(plan).not.toBeNull();
    expect(plan?.missingSlideIds).toEqual(['scenario-one']);
    expect(plan?.resumePosition).toBe(2);
    const state = JSON.parse(plan!.suspendData);
    expect(state.d).toEqual([0, 2, 3]);
    expect(state.s['scenario-two']).toBe(0);
    expect(state.g).toEqual(['preserved']);
    expect(state.c).toBe(false);
    const cmi = JSON.parse(plan!.cmiJson);
    expect(cmi['cmi.core.lesson_location']).toBe('2/5');
    expect(cmi['cmi.core.lesson_status']).toBe('incomplete');
  });
  it('requires both missing scenarios to be answered without inventing responses', () => {
    const plan = planIncompleteInteractionRecovery(input());
    expect(plan?.missingSlideIds).toEqual(['scenario-one','scenario-two']);
    expect(JSON.parse(plan!.suspendData).d).toEqual([0, 2]);
    expect(JSON.parse(plan!.suspendData).s).toEqual({});
  });
  it('does not change a valid course or a recorded answer of zero', () => {
    expect(planIncompleteInteractionRecovery(input({
      'scenario-one': 0, 'scenario-two': 1,
    }))).toBeNull();
  });
  it('fails closed on different edition, partial journey, terminal status, absent manifest or model mismatch', () => {
    const valid = input();
    const state = JSON.parse(valid.suspendData);
    const cmi = JSON.parse(valid.cmiJson);
    for (const change of [
      { enrollmentStatus: 'CONCLUIDO' },
      { lessonStatus: 'completed' },
      { manifest: { ...manifest, assessmentMode: 'SCORM' as const } },
      { manifest: { ...manifest, packageVersion: 'changed' } },
      { model: { ...model, slides: model.slides.slice(1) } },
      { model: { ...model, slides: [...model.slides.slice(0, 4), {id:'end',kind:'lesson'}] } },
      { suspendData: JSON.stringify({ ...state, a: 2 }) },
      { suspendData: JSON.stringify({ ...state, d: [0,1] }) },
      { suspendData: JSON.stringify({ ...state, c: true }) },
      { cmiJson: JSON.stringify({ ...cmi, 'cmi.core.lesson_status': 'completed' }) },
      { cmiJson: JSON.stringify({ ...cmi, 'airtrust.total_slides': 4 }) },
    ]) expect(planIncompleteInteractionRecovery({ ...valid, ...change })).toBeNull();
  });
  it('parses only the bounded immutable JSON course model, not arbitrary JavaScript', () => {
    expect(parseImmutableCourseModel('window.COURSE_DATA='+JSON.stringify(model)+';')).toEqual(model);
    expect(parseImmutableCourseModel('window.COURSE_DATA={invalid};')).toBeNull();
    expect(parseImmutableCourseModel('function dangerous(){}')).toBeNull();
  });
});
