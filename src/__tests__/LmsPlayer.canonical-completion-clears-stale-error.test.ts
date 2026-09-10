import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseSource = readFileSync('src/react-app/pages/lms/LmsPlayerBase.tsx', 'utf8');
const wrapperSource = readFileSync('src/react-app/pages/lms/LmsPlayer.tsx', 'utf8');

describe('LmsPlayer canonical completion precedence', () => {
  it('clears stale client rejection UI after canonical completion is accepted', () => {
    const start = baseSource.indexOf('const canonicalCompletionAccepted =');
    const end = baseSource.indexOf('// Estado terminal já alcançado', start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const canonicalBlock = baseSource.slice(start, end);
    expect(canonicalBlock).toContain("matricula?.status === 'CONCLUIDO'");
    expect(canonicalBlock).toContain("completionDiagnostic?.status === 'accepted'");
    expect(canonicalBlock).toContain('toast.dismiss(completionToastIdRef.current)');
    expect(canonicalBlock).toContain("setCompletionState('idle')");
    expect(canonicalBlock).toContain('setCompletionMessage(null)');
    expect(canonicalBlock).toContain('setCompletionErrorInfo(null)');
    expect(canonicalBlock).toContain('setPendingPanelOpen(false)');
  });

  it('acknowledges only a live transition to CONCLUIDO and stays quiet for review/reopen', () => {
    expect(wrapperSource).toContain('observedNonCompletedRef.current');
    expect(wrapperSource).toContain("status !== 'CONCLUIDO'");
    expect(wrapperSource).toContain("previousStatusRef.current !== 'CONCLUIDO'");
    expect(wrapperSource).toContain('if (reviewParam || !transitionedToConcluded || canonicalSuccessShownRef.current)');
    expect(wrapperSource).toContain('canonicalSuccessShownRef.current = true');
    expect(wrapperSource).toContain("toast.success('Curso concluído e registrado com sucesso.'");
    expect(wrapperSource).toContain('id: `lms-scorm-completion-${id}`');
    expect(wrapperSource).toContain('window.setTimeout');
  });
});
