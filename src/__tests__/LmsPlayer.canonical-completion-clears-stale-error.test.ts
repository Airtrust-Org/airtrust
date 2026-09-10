import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/react-app/pages/lms/LmsPlayer.tsx', 'utf8');

describe('LmsPlayer canonical completion precedence', () => {
  it('clears stale client rejection UI after canonical completion is accepted', () => {
    const start = source.indexOf('const canonicalCompletionAccepted =');
    const end = source.indexOf('// Estado terminal já alcançado', start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const canonicalBlock = source.slice(start, end);
    expect(canonicalBlock).toContain("matricula?.status === 'CONCLUIDO'");
    expect(canonicalBlock).toContain("completionDiagnostic?.status === 'accepted'");
    expect(canonicalBlock).toContain('toast.dismiss(completionToastIdRef.current)');
    expect(canonicalBlock).toContain("setCompletionState('idle')");
    expect(canonicalBlock).toContain('setCompletionMessage(null)');
    expect(canonicalBlock).toContain('setCompletionErrorInfo(null)');
    expect(canonicalBlock).toContain('setPendingPanelOpen(false)');
  });
});
