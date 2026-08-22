/**
 * FRMS governance readiness guard (4E preflight).
 *
 * READ ONLY. Never writes, never seeds, never invents a profile/assignment.
 * Reports whether each tenant's governed FRMS configuration is complete enough
 * for `resolveFrmsOperationalContext` to succeed at runtime, without actually
 * running an operational calculation. Used by the deploy preflight to decide
 * DEPLOY READY independently of MERGE READY.
 */
import { LIMITES_DEFAULT } from './types';
import {
  resolveEffectiveRevision,
  loadResolvedFrmsParameters,
  FrmsParameterResolutionError,
  type FrmsConfigRevision,
} from './parameter-governance';
import { resolveFadigaBusinessPolicy } from './fadiga-score';
import { resolveFortnightPolicy } from './fortnight-indicator';

export type FrmsGovernanceComponentState = 'READY' | 'MISSING' | 'AMBIGUOUS' | 'INVALID';

export interface FrmsGovernanceReadiness {
  empresaId: number;
  referenceAt: string;
  assignment: FrmsGovernanceComponentState;
  profile: FrmsGovernanceComponentState;
  revision: FrmsGovernanceComponentState;
  profileCode: string | null;
  missingParameters: string[];
  errors: string[];
  ready: boolean;
}

type ReadinessDb = {
  prepare(query: string): {
    bind(...args: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>;
    };
  };
};

export async function checkFrmsGovernanceReadiness(
  db: ReadinessDb,
  empresaId: number,
  referenceAt: string,
): Promise<FrmsGovernanceReadiness> {
  const errors: string[] = [];
  const missingParameters: string[] = [];
  let assignment: FrmsGovernanceComponentState = 'MISSING';
  let profile: FrmsGovernanceComponentState = 'MISSING';
  let revision: FrmsGovernanceComponentState = 'MISSING';
  let profileCode: string | null = null;

  const assignmentRows = await db
    .prepare(
      `SELECT regulatory_profile_id, profile_code
         FROM frms_profile_assignments
        WHERE empresa_id = ? AND status = 'ACTIVE'
          AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
    )
    .bind(empresaId, referenceAt, referenceAt)
    .all<{ regulatory_profile_id: string; profile_code: string }>();
  const assignments = assignmentRows.results ?? [];

  if (assignments.length === 0) {
    assignment = 'MISSING';
    errors.push(`No ACTIVE FRMS profile assignment for empresa=${empresaId} at ${referenceAt}.`);
  } else if (assignments.length > 1) {
    assignment = 'AMBIGUOUS';
    errors.push(`More than one ACTIVE FRMS profile assignment for empresa=${empresaId} at ${referenceAt}.`);
  } else {
    assignment = 'READY';
    profileCode = assignments[0].profile_code;
  }

  if (assignment === 'READY' && profileCode) {
    const profileRows = await db
      .prepare(
        `SELECT id, active
           FROM frms_regulatory_profiles
          WHERE empresa_id = ? AND profile_code = ? AND active = 1 AND deleted_at IS NULL
            AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
      )
      .bind(empresaId, profileCode, referenceAt, referenceAt)
      .all<{ id: string; active: number }>();
    const profiles = profileRows.results ?? [];
    if (profiles.length === 0) {
      profile = 'MISSING';
      errors.push(`No active FRMS regulatory profile "${profileCode}" for empresa=${empresaId} at ${referenceAt}.`);
    } else if (profiles.length > 1) {
      profile = 'AMBIGUOUS';
      errors.push(`More than one active FRMS regulatory profile "${profileCode}" for empresa=${empresaId} at ${referenceAt}.`);
    } else {
      profile = 'READY';
    }
  }

  if (assignment === 'READY' && profile === 'READY' && profileCode) {
    const revisionRows = await db
      .prepare(
        `SELECT * FROM frms_config_revisions
          WHERE profile_code = ? AND status = 'ACTIVE'
            AND (empresa_id = ? OR empresa_id IS NULL)
            AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
      )
      .bind(profileCode, empresaId, referenceAt, referenceAt)
      .all<FrmsConfigRevision>();
    let chosen: FrmsConfigRevision | null = null;
    try {
      chosen = resolveEffectiveRevision(revisionRows.results ?? [], empresaId, profileCode, referenceAt);
      revision = 'READY';
    } catch (e) {
      const err = e as FrmsParameterResolutionError;
      revision = err.code === 'FRMS_PARAMETER_REVISION_AMBIGUOUS' ? 'AMBIGUOUS' : 'MISSING';
      errors.push(err.message);
    }

    if (chosen) {
      if (!chosen.policy_version) {
        revision = 'INVALID';
        errors.push(`Revision ${chosen.id} has no model_version (policy_version).`);
      }
      try {
        const parameterSet = await loadResolvedFrmsParameters(
          db as never,
          empresaId,
          profileCode,
          referenceAt,
          Object.keys(LIMITES_DEFAULT),
        );
        resolveFadigaBusinessPolicy(parameterSet.values);
        resolveFortnightPolicy(parameterSet.values);
      } catch (e) {
        const err = e as Error;
        errors.push(err.message);
        const match = err.message.match(/^FRMS_PARAMETER_REQUIRED_MISSING:(\S+)$/) ?? err.message.match(/parameter (\S+) is missing/i);
        if (match) missingParameters.push(match[1]);
        revision = 'INVALID';
      }
    }
  }

  const ready =
    assignment === 'READY' && profile === 'READY' && revision === 'READY' && missingParameters.length === 0;

  return { empresaId, referenceAt, assignment, profile, revision, profileCode, missingParameters, errors, ready };
}
