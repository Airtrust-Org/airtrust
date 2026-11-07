/**
 * Read-only planning for resuming an existing SCORM enrollment in the ACTIVE
 * course package. Never copy old CMI, scores or completion to the new edition.
 *
 * Navigation is independent from certification: a suggested bookmark or a
 * matching stable ID does NOT prove semantic equivalence or earned unit credit.
 */
export type ScormActiveResumeInput = Readonly<{
  activeSlideIds: readonly string[];
  previousSlideIds?: readonly string[] | null;
  previousVisitedIds?: readonly string[] | null;
  previousCursorId?: string | null;
  previousPosition?: number | null;
  previousTotal?: number | null;
  cycleId?: number | null;
  activePackageSha256?: string | null;
  previousPackageSha256?: string | null;
  /**
   * Reviewed equivalence may only be provided by an authenticated server
   * workflow after checking BOTH package hashes; never accept browser input.
   * Keys are historical unit IDs, values are active-package unit IDs.
   */
  reviewedEquivalence?: Readonly<Record<string, string>> | null;
}>;

export type ScormActiveResumePlan = Readonly<{
  status: 'MATCHED_ANCHOR' | 'SUGGESTED_ANCHOR' | 'START_ACTIVE' | 'INVALID_ACTIVE_PACKAGE';
  cycleId: number | null;
  activePackageSha256: string | null;
  previousPackageSha256: string | null;
  targetSlideId: string | null;
  targetPosition: number;
  activeTotal: number;
  /** Historical matches used only to choose an active-edition navigation anchor. */
  matchedNavigationUnitIds: readonly string[];
  /**
   * Active-package units without a historical visited unit mapped to them.
   * Navigation coverage only; never use this list to grant credit or skip review.
   */
  unmatchedNavigationUnitIds: readonly string[];
  /** Every active-package unit still requiring learner review in this edition. */
  pendingReviewUnitIds: readonly string[];
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
  const metadata = {
    cycleId: Number.isSafeInteger(input.cycleId) && Number(input.cycleId) > 0
      ? Number(input.cycleId) : null,
    activePackageSha256: typeof input.activePackageSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(input.activePackageSha256) ? input.activePackageSha256 : null,
    previousPackageSha256: typeof input.previousPackageSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(input.previousPackageSha256) ? input.previousPackageSha256 : null,
  };
  if (!safeIds(active)) {
    return {
      ...metadata,
      status: 'INVALID_ACTIVE_PACKAGE', targetSlideId: null,
      targetPosition: 1, activeTotal: 0, matchedNavigationUnitIds: [],
      unmatchedNavigationUnitIds: [], pendingReviewUnitIds: [],
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

  // Stable IDs may locate the navigation anchor; credit requires separate
  // server-side equivalence validation bound to package hashes.
  const matchedForNavigation = new Set<string>();
  if (previousSet) {
    for (const id of visited) {
      const matched = toActive(id);
      if (matched) matchedForNavigation.add(matched);
    }
  }
  const matchedNavigationUnitIds = active.filter((id) => matchedForNavigation.has(id));
  const unmatchedNavigationUnitIds = active.filter((id) => !matchedForNavigation.has(id));
  // A historical ID match can locate the bookmark only. Nothing is reviewed
  // or credited in the active edition until the learner completes it there.
  const pendingReviewUnitIds = active;

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
      ...metadata,
      status: 'MATCHED_ANCHOR', targetSlideId: chosen,
      targetPosition: active.indexOf(chosen) + 1, activeTotal: active.length,
      matchedNavigationUnitIds, unmatchedNavigationUnitIds, pendingReviewUnitIds,
      reviewRequired: true,
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
    ...metadata,
    status: index === 0 ? 'START_ACTIVE' : 'SUGGESTED_ANCHOR',
    targetSlideId: active[index], targetPosition: index + 1,
    activeTotal: active.length, matchedNavigationUnitIds,
    unmatchedNavigationUnitIds, pendingReviewUnitIds,
    reviewRequired: true, canTransferScore: false, canMarkComplete: false,
  };
}
