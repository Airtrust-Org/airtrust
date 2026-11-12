import type { ActiveCompletionManifest } from './lms-completion-manifest-evidence';

/**
 * Fail-closed recovery of a v4 authored SCO with an inconsistent "visited"
 * marker: the learner reached its last study screen but an earlier mandatory
 * scenario was marked done without the corresponding decision being saved.
 *
 * This does not add credit, status, answers, or scores. It removes invalid
 * visited markers and rewinds the authentic SCO cursor to the first missing
 * decision. Subsequent SCORM commits and completion remain learner-owned.
 */
export type MissingInteractionRecovery = Readonly<{
  cmiJson: string;
  suspendData: string;
  resumePosition: number;
  previousDoneCount: number;
  remainingDoneCount: number;
  missingSlideIds: string[];
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseImmutableCourseModel(raw: string): unknown {
  if (raw.length === 0 || raw.length > 750_000) return null;
  const match = raw.trim().match(/^window\.COURSE_DATA\s*=\s*([\s\S]+?);?\s*$/);
  if (!match) return null;
  try { return JSON.parse(match[1].replace(/;\s*$/, '')); }
  catch { return null; }
}

export function planIncompleteInteractionRecovery(input: {
  manifest: ActiveCompletionManifest;
  model: unknown;
  cmiJson: string | null;
  suspendData: string | null;
  enrollmentStatus: string;
  lessonStatus: string | null;
}): MissingInteractionRecovery | null {
  const { manifest } = input;
  const total = manifest.requiredSlideIds.length;
  if (total < 2 || total > 1000 || manifest.assessmentMode !== 'NONE' ||
      !manifest.workerApprovalRequired || !manifest.packageVersion ||
      input.enrollmentStatus !== 'EM_ANDAMENTO' || input.lessonStatus !== 'incomplete') return null;

  const model = record(input.model);
  const slides = model?.slides;
  if (!Array.isArray(slides) || slides.length !== total ||
      model?.packageVersion !== manifest.packageVersion ||
      slides.some((slide, i) => record(slide)?.id !== manifest.requiredSlideIds[i]) ||
      record(slides[total - 1])?.kind !== 'study_end') return null;

  let cmi: Record<string, unknown> | null = null;
  let state: Record<string, unknown> | null = null;
  try {
    cmi = record(JSON.parse(input.cmiJson ?? ''));
    state = record(JSON.parse(input.suspendData ?? ''));
  } catch { return null; }
  if (!cmi || !state || cmi['cmi.suspend_data'] !== input.suspendData ||
      cmi['cmi.core.lesson_status'] !== 'incomplete' ||
      cmi['airtrust.total_slides'] !== total ||
      state.v !== 4 || state.p !== manifest.packageVersion ||
      state.a !== total - 1 || state.c !== false ||
      !Array.isArray(state.d) || state.d.length !== total - 1 ||
      state.d.some((x: unknown, i: number) => x !== i) ||
      !record(state.s) || typeof cmi['cmi.core.lesson_location'] !== 'string' ||
      !String(cmi['cmi.core.lesson_location']).startsWith(`${total}/`)) return null;

  const responses = record(state.s)!;
  const missingIndices: number[] = [];
  for (let i = 0; i < total - 1; i++) {
    const slide = record(slides[i]);
    if (slide?.kind === 'scenario' && slide.requiredDecision === true &&
        !Object.prototype.hasOwnProperty.call(responses, String(slide.id))) {
      missingIndices.push(i);
    }
  }
  if (missingIndices.length === 0) return null;
  const missing = new Set(missingIndices);
  const nextDone = (state.d as number[]).filter((index) => !missing.has(index));
  const nextState = { ...state, a: missingIndices[0], d: nextDone };
  const nextSuspend = JSON.stringify(nextState);
  const nextCmi = {
    ...cmi,
    'cmi.suspend_data': nextSuspend,
    'cmi.core.lesson_location': `${missingIndices[0] + 1}/${total}`,
  };
  return {
    cmiJson: JSON.stringify(nextCmi),
    suspendData: nextSuspend,
    resumePosition: missingIndices[0] + 1,
    previousDoneCount: total - 1,
    remainingDoneCount: nextDone.length,
    missingSlideIds: missingIndices.map((index) => manifest.requiredSlideIds[index]),
  };
}
