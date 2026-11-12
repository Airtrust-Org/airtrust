import type { ActiveCompletionManifest } from './lms-completion-manifest-evidence';

/**
 * Compatibility projection for any VERIFIED same-cycle S-76 RC3 handoff.
 *
 * The governed handoff writer produces a V4 administrative checkpoint but
 * the already-active immutable RC3 SCO only reads V2 suspend_data.c. Without
 * this projection the learner can be sent to the start despite preserved
 * administrative credits. It must work at partial positions too (e.g. 26/49)
 * and never certify the final unit or invent answers.
 *
 * This changes the in-memory launch snapshot ONLY. It never writes D1/R2,
 * changes a score, forges interaction answers or declares the learner complete.
 * Native RC3 must still collect the final interaction and explicitly finish;
 * the Worker validates the normal manifest, session and tenant gates.
 */
export const S76_RC3_IMMUTABLE_SHA256 = '9c65dc726af8e57b2ac3424b0898559b1a80d00348605b6805eb155ad6a1bb12';
const RC3_PACKAGE_VERSION = 'v3.4-no-module-exams-rc2-2026-11-02';
const EXPECTED_SLIDES = 49;


export type S76Rc3ResumeBridgeInput = Readonly<{
  empresaId: number;
  cursoId: number;
  matriculaId: number;
  cicloId: number;
  handoffId: number | null;
  handoffPreviousProgressPct: number | null;
  handoffBookmark: { position: number; total: number } | null;
  activePackageSha256: string | null;
  assessmentPolicy: string | null;
  enrollmentStatus: string;
  qualificationHistoryId: number | null;
  manifest: ActiveCompletionManifest | null;
  initialCmiJson: string;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 65536) return null;
  try { return record(JSON.parse(value)); } catch { return null; }
}
function emptyObject(value: unknown): boolean {
  const r = record(value);
  return r !== null && Object.keys(r).length === 0;
}

/** Null = no bridge; original launch remains unchanged and historical data is untouched. */
export function projectS76Rc3AdministrativeResume(input: S76Rc3ResumeBridgeInput): string | null {
  const manifest = input.manifest;
  const position = input.handoffBookmark?.position ?? 0;
  const credited = position - 1;
  if (input.empresaId !== 6 || input.cursoId !== 39 ||
      !Number.isSafeInteger(input.matriculaId) || input.matriculaId <= 0 ||
      !Number.isSafeInteger(input.cicloId) || input.cicloId <= 0 ||
      !Number.isSafeInteger(input.handoffId) || Number(input.handoffId) <= 0 ||
      !Number.isSafeInteger(input.handoffPreviousProgressPct) ||
      Number(input.handoffPreviousProgressPct) < 1 ||
      Number(input.handoffPreviousProgressPct) > 100 ||
      !Number.isSafeInteger(position) || position < 2 || position > EXPECTED_SLIDES ||
      input.handoffBookmark?.total !== EXPECTED_SLIDES ||
      input.activePackageSha256 !== S76_RC3_IMMUTABLE_SHA256 ||
      input.assessmentPolicy !== 'FORMATIVE' ||
      input.enrollmentStatus !== 'EM_ANDAMENTO' ||
      input.qualificationHistoryId !== null ||
      manifest?.packageVersion !== RC3_PACKAGE_VERSION ||
      manifest.assessmentMode !== 'NONE' || manifest.workerApprovalRequired !== true ||
      manifest.requiredSlideIds.length !== EXPECTED_SLIDES ||
      manifest.requiredSlideIds[0] !== 'C00' ||
      manifest.requiredSlideIds[EXPECTED_SLIDES - 1] !== 'M6-07') return null;

  const cmi = parseObject(input.initialCmiJson);
  if (!cmi || cmi['cmi.core.lesson_status'] !== 'incomplete' ||
      cmi['cmi.core.lesson_mode'] !== 'normal' ||
      cmi['airtrust.total_slides'] !== EXPECTED_SLIDES ||
      cmi['cmi.core.score.raw'] !== undefined) return null;

  const marker = record(cmi['airtrust.administrative_credit']);
  if (!marker || marker.kind !== 'PREVIOUS_EDITION_UNITS_RECOGNIZED' ||
      marker.credited_units !== credited ||
      marker.previous_progress_pct !== Math.min(99, Number(input.handoffPreviousProgressPct)) ||
      marker.package_sha256 !== S76_RC3_IMMUTABLE_SHA256 ||
      (marker.handoff_id !== null && marker.handoff_id !== input.handoffId)) return null;

  const state = parseObject(cmi['cmi.suspend_data']);
  if (!state || state.v !== 4 || state.p !== RC3_PACKAGE_VERSION ||
      state.a !== credited || state.c !== false ||
      !Array.isArray(state.d) || state.d.length !== credited ||
      !state.d.every((n, i) => Number.isSafeInteger(n) && n === i) ||
      !Array.isArray(state.g) || state.g.length !== 0 ||
      !emptyObject(state.s) || !emptyObject(state.h) || !emptyObject(state.vs) ||
      state.x !== undefined) return null;
  if (state.ids !== undefined && (!Array.isArray(state.ids) ||
      state.ids.length !== EXPECTED_SLIDES ||
      !state.ids.every((id, i) => id === manifest.requiredSlideIds[i]))) return null;

  // The package accepts V2 {p,a,c,g}. Earlier units retain the explicit
  // administrative provenance in the unchanged CMI. The unvisited current
  // and later units still need the learner's own interactions.
  const c = [...state.d] as number[];
  const nativeState = {
    v: 2, p: RC3_PACKAGE_VERSION, a: credited,
    c, d: [...c], g: {},
  };
  return JSON.stringify({
    ...cmi,
    'cmi.suspend_data': JSON.stringify(nativeState),
    'cmi.core.lesson_location': `${position}/${EXPECTED_SLIDES}`,
  });
}
