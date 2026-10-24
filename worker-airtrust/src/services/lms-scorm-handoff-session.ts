/** Current-cycle receipt binding for short-lived SCORM asset sessions. */
export function isScormHandoffSessionCurrent(input: {
  claimedCycleId: number;
  claimedHandoffId: number;
  activeCycleId: number;
  activeHandoffId: number | null;
}): boolean {
  const {claimedCycleId,claimedHandoffId,activeCycleId,activeHandoffId}=input;
  // Sessions minted before cycle-bound handoff support carried no cycle ID.
  // Once enabled, accepting that legacy (zero) scope would allow an old token
  // to survive an enrollment-cycle change whenever the new cycle has no receipt.
  // Reject those tokens and require a new authenticated asset session instead.
  if (!Number.isSafeInteger(activeCycleId) || activeCycleId <= 0 ||
      !Number.isSafeInteger(claimedCycleId) || claimedCycleId !== activeCycleId ||
      !Number.isSafeInteger(claimedHandoffId) || claimedHandoffId < 0) {
    return false;
  }
  if (activeHandoffId === null) return claimedHandoffId === 0;
  return Number.isSafeInteger(activeHandoffId) && activeHandoffId > 0 &&
    claimedHandoffId === activeHandoffId;
}
