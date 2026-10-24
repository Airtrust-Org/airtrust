// Read-only QA diagnostics: never infer a defective ZIP from a driver stall.
export function collectRequiredDecisionSlideIndices(model) {
  if (!Array.isArray(model?.slides)) return [];
  return model.slides.flatMap((slide, index) =>
    slide && slide.requiredDecision === true ? [index + 1] : []
  );
}

export function classifyRequiredDecisionStall({
  stalledSlide,
  driverState,
  driveDiagnostics,
  completionReached = false,
} = {}) {
  if (completionReached || stalledSlide?.required_decision !== true) return null;
  const location = String(stalledSlide.location ?? '');
  const actions = Array.isArray(driverState?.recent_actions)
    ? driverState.recent_actions.filter((entry) =>
        String(entry.location || '').split(':')[0] === location
      )
    : [];
  const navigationAttempts = actions.filter((entry) => entry.type === 'next').length;
  const decisionAttempts = Math.max(
    Number(driveDiagnostics?.required_decision_choice_attempts || 0),
    actions.filter((entry) => entry.type === 'required-decision-choice').length,
  );
  const block = driveDiagnostics?.required_decision_block || null;
  if (block === 'required-decision-unresolved') {
    return { code: 'DRIVER_REQUIRED_DECISION_CONTROL_UNRESOLVED', navigation_attempts: navigationAttempts, decision_attempts: decisionAttempts, package_defect_proven: false };
  }
  if (block === 'required-decision-navigation-stall') {
    return { code: 'REQUIRED_DECISION_NO_ADVANCE_AFTER_LEARNER_CHOICE', navigation_attempts: navigationAttempts, decision_attempts: decisionAttempts, package_defect_proven: false };
  }
  if (decisionAttempts === 0 && navigationAttempts >= 3) {
    return { code: 'DRIVER_NAVIGATED_BEFORE_REQUIRED_DECISION', navigation_attempts: navigationAttempts, decision_attempts: 0, package_defect_proven: false };
  }
  return null;
}
