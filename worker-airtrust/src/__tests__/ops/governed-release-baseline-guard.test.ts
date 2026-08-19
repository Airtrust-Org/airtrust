import { describe, expect, it } from 'vitest';

export interface ReleaseState {
  releaseSha: string;
  workerVersionId: string;
  pagesDeploymentId: string;
  schemaCompatibility: string;
}

export interface DeploymentEventLog {
  workerDeployCalled: boolean;
  workerDeployedVersionId?: string;
  pagesDeployCalled: boolean;
  pagesDeployedId?: string;
  workerRollbackCalled: boolean;
  workerRolledBackTo?: string;
  pagesRollbackCalled: boolean;
  pagesRolledBackTo?: string;
  baselineRegistered?: boolean;
}

export interface PipelineExecutionPlan {
  workerName: string;
  dbId: string;
  r2Bucket: string;
  pagesProjectName: string;
  pagesBranch: string;
  allowBootstrap: boolean;
  previousBaseline: ReleaseState | null;
  newCommitSha: string;
  // Simulation switches
  simulateWorkerDeploySuccess?: boolean;
  simulatePagesDeploySuccess?: boolean;
  simulateSmokeSuccess?: boolean;
  simulateWorkerRollbackSuccess?: boolean;
  simulatePostRollbackHealthSuccess?: boolean;
}

export function executeGovernedPipeline(plan: PipelineExecutionPlan): {
  status: 'SUCCESS' | 'FAILED' | 'ROLLBACK_FAILED';
  error?: string;
  logs: DeploymentEventLog;
  registeredBaseline?: ReleaseState;
} {
  const logs: DeploymentEventLog = {
    workerDeployCalled: false,
    pagesDeployCalled: false,
    workerRollbackCalled: false,
    pagesRollbackCalled: false,
  };

  // Guard 0: Production Identifiers Check
  if (plan.pagesProjectName === 'airtrust') {
    return {
      status: 'FAILED',
      error: "PAGES_PROJECT_NAME must never be 'airtrust' (production Pages project).",
      logs,
    };
  }

  if (plan.dbId === '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae') {
    return {
      status: 'FAILED',
      error: 'Blocked production target: staging DB resolves to production DB ID.',
      logs,
    };
  }

  if (plan.r2Bucket === 'airtrust-storage') {
    return {
      status: 'FAILED',
      error: 'Blocked production target: staging bucket resolves to production R2 bucket.',
      logs,
    };
  }

  if (plan.workerName === 'airtrust-api-production') {
    return {
      status: 'FAILED',
      error: 'Blocked production target: worker name resolves to production.',
      logs,
    };
  }

  // Pre-deploy Release / Rollback Target Validation
  if (plan.previousBaseline) {
    // If a baseline already exists, bootstrap mode CANNOT be reused
    if (plan.allowBootstrap) {
      return {
        status: 'FAILED',
        error: 'ALLOW_BRIDGE_BASELINE_BOOTSTRAP cannot be reused once a baseline is established.',
        logs,
      };
    }

    // Require schema_compatibility >= 0462
    const compatNum = parseInt(plan.previousBaseline.schemaCompatibility.replace(/\D/g, ''), 10);
    if (isNaN(compatNum) || compatNum < 462) {
      return {
        status: 'FAILED',
        error: `Rollback target is not schema compatible (required >= 0462, got ${plan.previousBaseline.schemaCompatibility}).`,
        logs,
      };
    }
  } else {
    // No previous baseline
    if (!plan.allowBootstrap) {
      return {
        status: 'FAILED',
        error: 'No prior baseline found and ALLOW_BRIDGE_BASELINE_BOOTSTRAP is false.',
        logs,
      };
    }
  }

  // Deploy Step 1: Worker
  logs.workerDeployCalled = true;
  if (plan.simulateWorkerDeploySuccess === false) {
    // Worker deploy failed before publishing
    return {
      status: 'FAILED',
      error: 'Worker deploy failed.',
      logs,
    };
  }
  const newWorkerVersionId = `wv-${plan.newCommitSha.slice(0, 7)}`;
  logs.workerDeployedVersionId = newWorkerVersionId;

  // Deploy Step 2: Pages
  logs.pagesDeployCalled = true;
  if (plan.simulatePagesDeploySuccess === false) {
    // Pages deploy failed -> Rollback Worker
    logs.workerRollbackCalled = true;
    if (plan.simulateWorkerRollbackSuccess === false) {
      return {
        status: 'ROLLBACK_FAILED',
        error: 'Worker rollback failed after Pages deploy failure.',
        logs,
      };
    }
    logs.workerRolledBackTo = plan.previousBaseline?.workerVersionId || 'initial-state';
    return {
      status: 'FAILED',
      error: 'Pages deploy failed, Worker rolled back successfully.',
      logs,
    };
  }
  const newPagesDeploymentId = `pg-${plan.newCommitSha.slice(0, 7)}`;
  logs.pagesDeployedId = newPagesDeploymentId;

  // Deploy Step 3: Smoke Tests
  if (plan.simulateSmokeSuccess === false) {
    // Smoke failed -> Rollback Pages + Worker
    logs.pagesRollbackCalled = true;
    logs.workerRollbackCalled = true;
    logs.pagesRolledBackTo = plan.previousBaseline?.pagesDeploymentId || 'initial-pages';
    logs.workerRolledBackTo = plan.previousBaseline?.workerVersionId || 'initial-worker';

    if (plan.simulatePostRollbackHealthSuccess === false) {
      return {
        status: 'ROLLBACK_FAILED',
        error: 'Post-rollback health check failed.',
        logs,
      };
    }

    return {
      status: 'FAILED',
      error: 'Smoke tests failed. Both Worker and Pages rolled back successfully.',
      logs,
    };
  }

  // Success: Register baseline if bootstrap mode was active
  let registeredBaseline: ReleaseState | undefined;
  if (plan.allowBootstrap && !plan.previousBaseline) {
    logs.baselineRegistered = true;
    registeredBaseline = {
      releaseSha: plan.newCommitSha,
      workerVersionId: newWorkerVersionId,
      pagesDeploymentId: newPagesDeploymentId,
      schemaCompatibility: '0462',
    };
  }

  return {
    status: 'SUCCESS',
    logs,
    registeredBaseline,
  };
}

describe('Governed Release Operational Rollback Harness & Baseline Guards', () => {
  const validSha = 'a'.repeat(40);
  const nextSha = 'b'.repeat(40);

  it('1. Bootstrap baseline: registers BRIDGE_BASELINE_ESTABLISHED on first release', () => {
    const result = executeGovernedPipeline({
      workerName: 'airtrust-api-staging',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      r2Bucket: 'airtrust-storage-staging',
      pagesProjectName: 'airtrust-staging',
      pagesBranch: 'main',
      allowBootstrap: true,
      previousBaseline: null,
      newCommitSha: validSha,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.logs.baselineRegistered).toBe(true);
    expect(result.registeredBaseline).toEqual({
      releaseSha: validSha,
      workerVersionId: `wv-${validSha.slice(0, 7)}`,
      pagesDeploymentId: `pg-${validSha.slice(0, 7)}`,
      schemaCompatibility: '0462',
    });
  });

  it('2. Bootstrap guard: re-using ALLOW_BRIDGE_BASELINE_BOOTSTRAP after baseline established is rejected', () => {
    const result = executeGovernedPipeline({
      workerName: 'airtrust-api-staging',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      r2Bucket: 'airtrust-storage-staging',
      pagesProjectName: 'airtrust-staging',
      pagesBranch: 'main',
      allowBootstrap: true, // Forbidden when previousBaseline exists
      previousBaseline: {
        releaseSha: validSha,
        workerVersionId: 'wv-1111111',
        pagesDeploymentId: 'pg-1111111',
        schemaCompatibility: '0462',
      },
      newCommitSha: nextSha,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/cannot be reused once a baseline is established/i);
  });

  it('3. Schema compatibility guard: rejects previous rollback target without schema_compatibility >= 0462', () => {
    const result = executeGovernedPipeline({
      workerName: 'airtrust-api-staging',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      r2Bucket: 'airtrust-storage-staging',
      pagesProjectName: 'airtrust-staging',
      pagesBranch: 'main',
      allowBootstrap: false,
      previousBaseline: {
        releaseSha: validSha,
        workerVersionId: 'wv-old',
        pagesDeploymentId: 'pg-old',
        schemaCompatibility: '0450', // Incompatible legacy schema
      },
      newCommitSha: nextSha,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/not schema compatible/i);
  });

  it('4. Scenario A: Worker novo PASS / Pages FAIL -> rolls back Worker to previous version', () => {
    const result = executeGovernedPipeline({
      workerName: 'airtrust-api-staging',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      r2Bucket: 'airtrust-storage-staging',
      pagesProjectName: 'airtrust-staging',
      pagesBranch: 'main',
      allowBootstrap: false,
      previousBaseline: {
        releaseSha: validSha,
        workerVersionId: 'wv-baseline-1',
        pagesDeploymentId: 'pg-baseline-1',
        schemaCompatibility: '0462',
      },
      newCommitSha: nextSha,
      simulateWorkerDeploySuccess: true,
      simulatePagesDeploySuccess: false, // Pages fails
    });

    expect(result.status).toBe('FAILED');
    expect(result.logs.workerDeployCalled).toBe(true);
    expect(result.logs.pagesDeployCalled).toBe(true);
    expect(result.logs.workerRollbackCalled).toBe(true);
    expect(result.logs.workerRolledBackTo).toBe('wv-baseline-1');
  });

  it('5. Scenario B: Worker+Pages PASS / Smoke FAIL -> rolls back both Pages and Worker', () => {
    const result = executeGovernedPipeline({
      workerName: 'airtrust-api-staging',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      r2Bucket: 'airtrust-storage-staging',
      pagesProjectName: 'airtrust-staging',
      pagesBranch: 'main',
      allowBootstrap: false,
      previousBaseline: {
        releaseSha: validSha,
        workerVersionId: 'wv-baseline-1',
        pagesDeploymentId: 'pg-baseline-1',
        schemaCompatibility: '0462',
      },
      newCommitSha: nextSha,
      simulateWorkerDeploySuccess: true,
      simulatePagesDeploySuccess: true,
      simulateSmokeSuccess: false, // Smoke fails
    });

    expect(result.status).toBe('FAILED');
    expect(result.logs.pagesRollbackCalled).toBe(true);
    expect(result.logs.pagesRolledBackTo).toBe('pg-baseline-1');
    expect(result.logs.workerRollbackCalled).toBe(true);
    expect(result.logs.workerRolledBackTo).toBe('wv-baseline-1');
  });

  it('6. Rollback failure: fails pipeline with ROLLBACK_FAILED if post-rollback health check fails', () => {
    const result = executeGovernedPipeline({
      workerName: 'airtrust-api-staging',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      r2Bucket: 'airtrust-storage-staging',
      pagesProjectName: 'airtrust-staging',
      pagesBranch: 'main',
      allowBootstrap: false,
      previousBaseline: {
        releaseSha: validSha,
        workerVersionId: 'wv-baseline-1',
        pagesDeploymentId: 'pg-baseline-1',
        schemaCompatibility: '0462',
      },
      newCommitSha: nextSha,
      simulateWorkerDeploySuccess: true,
      simulatePagesDeploySuccess: true,
      simulateSmokeSuccess: false,
      simulatePostRollbackHealthSuccess: false, // Post-rollback health fails
    });

    expect(result.status).toBe('ROLLBACK_FAILED');
    expect(result.error).toMatch(/Post-rollback health check failed/i);
  });

  it('7. Production Pages target guard: fails immediately if pagesProjectName is airtrust', () => {
    const result = executeGovernedPipeline({
      workerName: 'airtrust-api-staging',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      r2Bucket: 'airtrust-storage-staging',
      pagesProjectName: 'airtrust', // Production project
      pagesBranch: 'main',
      allowBootstrap: true,
      previousBaseline: null,
      newCommitSha: validSha,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/PAGES_PROJECT_NAME must never be 'airtrust'/i);
    expect(result.logs.workerDeployCalled).toBe(false);
  });

  it('8. Production Worker / D1 / R2 guards: strictly blocks any production identifier', () => {
    // Production DB ID
    expect(
      executeGovernedPipeline({
        workerName: 'airtrust-api-staging',
        dbId: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
        r2Bucket: 'airtrust-storage-staging',
        pagesProjectName: 'airtrust-staging',
        pagesBranch: 'main',
        allowBootstrap: true,
        previousBaseline: null,
        newCommitSha: validSha,
      }).error,
    ).toMatch(/production DB/i);

    // Production R2 Bucket
    expect(
      executeGovernedPipeline({
        workerName: 'airtrust-api-staging',
        dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
        r2Bucket: 'airtrust-storage',
        pagesProjectName: 'airtrust-staging',
        pagesBranch: 'main',
        allowBootstrap: true,
        previousBaseline: null,
        newCommitSha: validSha,
      }).error,
    ).toMatch(/production R2/i);

    // Production Worker Name
    expect(
      executeGovernedPipeline({
        workerName: 'airtrust-api-production',
        dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
        r2Bucket: 'airtrust-storage-staging',
        pagesProjectName: 'airtrust-staging',
        pagesBranch: 'main',
        allowBootstrap: true,
        previousBaseline: null,
        newCommitSha: validSha,
      }).error,
    ).toMatch(/worker name resolves to production/i);
  });
});
