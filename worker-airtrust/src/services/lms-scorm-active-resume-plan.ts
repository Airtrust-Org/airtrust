/**
 * Read-only planning for resuming an existing SCORM enrollment in the ACTIVE
 * course package. Never copy old CMI, scores or completion to the new edition.
 *
 * Navigation is independent from certification: a suggested bookmark does NOT
 * prove that any new or changed training unit was completed.
 */
export type ScormActiveResumeInput = Readonly<{
  activeSlideIds: readonly string[];
  previousSlideIds?: readonly string[] | null;
  previousVisitedIds?: readonly string[] | null;
  previousCursorId?: string | null;
  previousPosition?: number | null;
  previousTotal?: number | null;
  /**
   * Reviewed equivalence may only be provided by an authenticated server
   * workflow after checking BOTH package hashes; never accept browser input.
   * Keys are historical unit IDs, values are active-package unit IDs.
   */
  reviewedEquivalence?: Readonly<Record<string, string>> | null;
}>;

export type ScormActiveResumePlan = Readonly<{
  status: 'VERIFIED_ANCHOR' | 'SUGGESTED_ANCHOR' | 'START_ACTIVE' | 'INVALID_ACTIVE_PACKAGE';
  targetSlideId: string | null;
  targetPosition: number;
  activeTotal: number;
  verifiedUnitIds: readonly string[];
  pendingUnitIds: readonly string[];
  reviewRequired: boolean;
  canTransferScore: false;
  canMarkComplete: false;
}>;

const safeIds = (ids: readonly string[] | null | undefined): ids is readonly string[] =>
  Array.isArray(ids) && ids.length > 0 && ids.length <= 1000 &&
  ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256) &&
  new Set(ids).size === ids.length;

const validPosition = (n: number | null | undefined, total: number): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 && n <= total;

export function planScormActiveResume(input: ScormActiveResumeInput): ScormActiveResumePlan {
  const active = input.activeSlideIds;
  if (!safeIds(active)) {
    return {
      status: 'INVALID_ACTIVE_PACKAGE', targetSlideId: null,
      targetPosition: 1, activeTotal: 0, verifiedUnitIds: [], pendingUnitIds: [],
      reviewRequired: true, canTransferScore: false, canMarkComplete: false,
    };
  }

  const previous = safeIds(input.previousSlideIds) ? input.previousSlideIds : null;
  const previousSet = previous ? new Set(previous) : null;
  const visited = previousSet && Array.isArray(input.previousVisitedIds)
    ? new Set(input.previousVisitedIds.filter((id) => previousSet.has(id))) : new Set<string>();
  const activeSet = new Set(active);

  const crosswalk = input.reviewedEquivalence ?? {};
  const targets = Object.values(crosswalk);
  const crosswalkIsOneToOne = new Set(targets).size === targets.length &&
    Object.entries(crosswalk).every(([from, to]) =>
      Boolean(previousSet?.has(from)) && activeSet.has(to));
  // Unsafe maps are discarded entirely rather than partly crediting them.
  const mapping = crosswalkIsOneToOne ? crosswalk : {};

  function toActive(id: string): string | null {
    if (Object.prototype.hasOwnProperty.call(mapping, id)) return mapping[id] ?? null;
    return activeSet.has(id) ? id : null;
  }

  // Visit evidence is kept separate from learner navigation. Even IDs that
  // match are merely eligible for server-side equivalence validation; they
  // do not constitute a passing score or course completion.
  const verified = new Set<string>();
  if (previousSet) {
    for (const id of visited) {
      const matched = toActive(id);
      if (matched) verified.add(matched);
    }
  }
  const verifiedUnitIds = active.filter((id) => verified.has(id));
  const pendingUnitIds = active.filter((id) => !verified.has(id));

  let chosen: string | null = null;
  if (previousSet && typeof input.previousCursorId === 'string' &&
      previousSet.has(input.previousCursorId)) {
    chosen = toActive(input.previousCursorId);
  }

  if (!chosen && previous && validPosition(input.previousPosition, previous.length)) {
    // The old cursor may have been removed: prefer the last genuinely matched
    // unit at or before the old cursor, never the same ordinal in a new edition.
    const studied = previous.slice(0, input.previousPosition).reverse();
    chosen = studied.map(toActive).find((id): id is string => id !== null) ?? null;
  }

  if (chosen) {
    return {
      status: 'VERIFIED_ANCHOR', targetSlideId: chosen,
      targetPosition: active.indexOf(chosen) + 1, activeTotal: active.length,
      verifiedUnitIds, pendingUnitIds, reviewRequired: pendingUnitIds.length > 0,
      canTransferScore: false, canMarkComplete: false,
    };
  }

  // A proportional bookmark is ONLY a navigation suggestion. This MUST NOT
  // become a persisted unit credit, pass, score, certificate, or server cursor
  // until the learner reviews the active content under a governed session.
  const previousTotal = input.previousTotal ?? previous?.length ?? 0;
  const index = validPosition(input.previousPosition, previousTotal) && previousTotal > 1
    ? Math.min(active.length - 1, Math.round((input.previousPosition - 1) *
        (active.length - 1) / (previousTotal - 1)))
    : 0;
  return {
    status: index === 0 ? 'START_ACTIVE' : 'SUGGESTED_ANCHOR',
    targetSlideId: active[index], targetPosition: index + 1,
    activeTotal: active.length, verifiedUnitIds, pendingUnitIds,
    reviewRequired: true, canTransferScore: false, canMarkComplete: false,
  };
}
