/** Current-cycle receipt binding for short-lived SCORM asset sessions. */
export function isScormHandoffSessionCurrent(input: {
  claimedCycleId: number;
  claimedHandoffId: number;
  activeCycleId: number;
  activeHandoffId: number | null;
}): boolean {
  const {claimedCycleId,claimedHandoffId,activeCycleId,activeHandoffId}=input;
  if (!Number.isSafeInteger(activeCycleId) || activeCycleId <= 0) return false;
  if (claimedCycleId > 0 && claimedCycleId !== activeCycleId) return false;
  if (activeHandoffId != null) {
    return claimedCycleId === activeCycleId && claimedHandoffId === activeHandoffId;
  }
  return claimedHandoffId === 0;
}
