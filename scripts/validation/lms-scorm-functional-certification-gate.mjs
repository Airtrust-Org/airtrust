// Authoritative, side-effect-free verdict for read-only end-to-end SCORM certification.
// Protocol-only Browser Run is intentionally NOT sufficient to call coursework certified.
function scoreValue(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function evaluateScormFunctionalCertification({ manifest, suspend, complete, reopen, phasePass }) {
  const phases = [suspend, complete, ...(reopen ? [reopen] : [])];
  const lifecyclePass = phases.every((phase) => phase != null && phasePass(phase));
  const completed = complete?.completion_reached === true;
  const statusPreserved = !completed || reopen?.completion_reached === true;
  const mastery = scoreValue(manifest?.masteryScore);
  const scoreRequired = manifest?.masteryScore != null || Number(manifest?.requiredInteractions ?? 0) > 0;
  const completeScore = scoreValue(complete?.score_raw);
  const reopenScore = scoreValue(reopen?.score_raw);
  const scorePresent = !scoreRequired || completeScore !== null;
  const masteryPass = mastery === null || (completeScore !== null && completeScore >= mastery);
  const scorePreserved = !completed || completeScore === null ||
    (reopenScore !== null && reopenScore >= completeScore);

  const pass = lifecyclePass && completed && statusPreserved && scorePresent && masteryPass && scorePreserved;
  const reason = pass ? null
    : !completed ? 'COMPLETION_NOT_REACHED'
    : !statusPreserved ? 'STATUS_DOWNGRADE_AFTER_REOPEN'
    : !scorePresent ? 'CERTIFYING_SCORE_MISSING'
    : !masteryPass ? 'MASTERY_SCORE_NOT_REACHED'
    : !scorePreserved ? 'SCORE_DOWNGRADE_AFTER_REOPEN'
    : 'SCORM_LIFECYCLE_OR_ASSET_FAILURE';

  return { pass, reason };
}
