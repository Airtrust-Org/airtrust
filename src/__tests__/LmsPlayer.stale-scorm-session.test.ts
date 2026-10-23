import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/react-app/pages/lms/LmsPlayer.tsx', 'utf8');

describe('LmsPlayer SCORM handoff session invalidation', () => {
  it('unmounts a running SCO on a definite 409 stale-session conflict', () => {
    const begin = source.indexOf('if (response.status === 409) {');
    const end = source.indexOf('// For transient connectivity failures', begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const conflict = source.slice(begin, end);
    expect(conflict).toContain('assetSessionKeyRef.current = null');
    expect(conflict).toContain('sessionKeyRef.current = null');
    expect(conflict).toContain('stableLaunchUrlRef.current = null');
    expect(conflict).toContain('setAssetSessionReady(false)');
    expect(conflict).toContain('setIframeLoaded(false)');
    expect(conflict).toContain('void refetchMatricula()');
    expect(conflict).toMatch(/return;\s*}/);
  });

  it('preserves a running SCO for transient refresh failures, not a 409', () => {
    const begin = source.indexOf('// For transient connectivity failures');
    const end = source.indexOf('} catch {', begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const transient = source.slice(begin, end);
    expect(transient).toContain('assetSessionKeyRef.current !== sessionKey');
    expect(transient).toContain('setAssetSessionReady(false)');
    expect(transient).not.toContain('setIframeLoaded(false)');
  });
});
