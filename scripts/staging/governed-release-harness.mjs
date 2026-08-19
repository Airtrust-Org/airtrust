// Deterministic local-only model of the release DAG. It deliberately accepts
// injected adapters so tests can prove ordering and rollback without a remote.
export async function runGovernedReleaseHarness(adapters) {
  const calls = [];
  const call = async (name) => { calls.push(name); return adapters[name](); };
  try {
    await call('backup');
    await call('preflight0461'); await call('apply0461'); await call('ledger0461'); await call('postconditions0461');
    await call('authSmoke');
    await call('preflight0462'); await call('apply0462'); await call('ledger0462'); await call('postconditions0462');
    await call('qualificationSmoke'); await call('workerDeploy'); await call('pagesDeploy'); await call('postDeploySmoke');
    return { status: 'released', calls, remote_side_effects: calls.filter((name) => /apply|Deploy/.test(name)).length };
  } catch (error) {
    const deployedWorker = calls.includes('workerDeploy');
    const deployedPages = calls.includes('pagesDeploy');
    if (deployedWorker || deployedPages) await adapters.rollback({ worker: deployedWorker, pages: deployedPages, reason: error.message });
    return { status: 'failed', calls, rolled_back: deployedWorker || deployedPages, error: error.message };
  }
}
