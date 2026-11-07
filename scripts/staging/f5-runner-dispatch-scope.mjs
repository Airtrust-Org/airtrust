#!/usr/bin/env node
/** Fail closed if a private F5 plan differs from the trusted dispatch scope. */
import { validateF5ExecutionPlan } from './f5-inactive-candidate-executor.mjs';

const fail = code => { throw new Error(`F5_RUNNER_${code}`); };
const expectedContext = Object.freeze({
  GITHUB_REPOSITORY: 'Airtrust-Org/airtrust',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  F5_CONFIRMATION: 'AIRTRUST_F5_STAGING_CANDIDATE',
});

export function assertF5RunnerDispatchScope(plan, env) {
  validateF5ExecutionPlan(plan);
  if (!env || Object.entries(expectedContext).some(([key, value]) => env[key] !== value)) {
    fail('TRUSTED_DISPATCH_CONTEXT_REQUIRED');
  }
  const candidate = plan.candidate;
  const scopes = {
    F5_RELEASE_SHA: plan.releaseSha,
    GITHUB_SHA: plan.harnessSha,
    F5_TENANT_ID: String(candidate.tenantId),
    F5_COURSE_ID: String(candidate.courseId),
    F5_PACKAGE_SHA256: candidate.packageSha256,
    F5_ZIP_BYTES: String(candidate.zipBytes),
    F5_OPERATION_ID: candidate.operationId,
  };
  if (Object.entries(scopes).some(([key, value]) => env[key] !== value)) {
    fail('PLAN_DISPATCH_SCOPE_MISMATCH');
  }
  return true;
}
