/** Isolated SCORM telemetry, preserving payload minimization and existing semantics. */
import type {Context} from 'hono';
import {createLogger} from '../utils/logger';
import {formatScormLocationTelemetry,summarizeScormTextPayload} from '../services/lms-matricula-runtime-domain';

export function emitScormCommitTelemetry(
  c: Context,
  params: {
    matriculaId: number;
    cursoTitulo: string;
    preferIncomingState: boolean;
    previousLocation: { current: number; total: number | null } | null;
    incomingLocation: { current: number; total: number | null } | null;
    finalLocation: { current: number; total: number | null } | null;
    previousSuspendData: string | null | undefined;
    incomingSuspendData: string | null | undefined;
    finalSuspendData: string | null | undefined;
    decisions: {
      blockedLocationRegression: boolean;
      blockedEmptySuspendData: boolean;
      blockedShorterSuspendData: boolean;
      blockedTerminalRegression: boolean;
      preservedLocationFromCurrent: boolean;
    };
  },
) {
  const { blockedLocationRegression, blockedEmptySuspendData, blockedShorterSuspendData, blockedTerminalRegression } = params.decisions;
  const blocked = blockedLocationRegression || blockedEmptySuspendData ||
    blockedShorterSuspendData || blockedTerminalRegression;

  const event = blocked ? 'SCORM_REGRESSION_BLOCKED' : 'SCORM_COMMIT';
  const reason = [
    params.decisions.blockedLocationRegression ? 'location-regression' : null,
    params.decisions.blockedEmptySuspendData ? 'empty-suspend-data' : null,
    params.decisions.blockedShorterSuspendData ? 'shorter-suspend-data' : null,
    params.decisions.blockedTerminalRegression ? 'terminal-status-regression' : null,
    !blocked && params.decisions.preservedLocationFromCurrent ? 'preserved-current-location' : null,
  ].filter(Boolean).join(',');

  createLogger(c, 'LmsMatriculas.scorm').info('lms_scorm_commit_telemetry', {
    matriculaId: params.matriculaId,
    cursoTitulo: params.cursoTitulo,
    event,
    decision: blocked ? 'blocked' : 'accepted',
    reason: reason || 'normal-merge',
    preferIncomingState: params.preferIncomingState,
    previousLocation: formatScormLocationTelemetry(params.previousLocation),
    incomingLocation: formatScormLocationTelemetry(params.incomingLocation),
    finalLocation: formatScormLocationTelemetry(params.finalLocation),
    previousSuspendData: summarizeScormTextPayload(params.previousSuspendData),
    incomingSuspendData: summarizeScormTextPayload(params.incomingSuspendData),
    finalSuspendData: summarizeScormTextPayload(params.finalSuspendData),
  });
}
