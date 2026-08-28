from pathlib import Path

p = Path('src/react-app/pages/frms/__tests__/FrmsCheckinFadiga.test.tsx')
text = p.read_text()

def rep(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected one anchor, got {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)

rep(
    "import type { ReactNode } from 'react';",
    "import { useEffect, type ReactNode } from 'react';",
)
rep(
    "const mutateAsyncMock = vi.fn();\nconst refetchMock = vi.fn();",
    "const mutateAsyncMock = vi.fn();\nconst readinessMutateAsyncMock = vi.fn();\nconst refetchMock = vi.fn();",
)
insert_after = """vi.mock('@/react-app/hooks/useFadigaCheckin', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useFadigaCheckin')>(
    '@/react-app/hooks/useFadigaCheckin',
  );
  return {
    ...actual,
    useCheckinHoje: () => ({ data: null, refetch: refetchMock }),
    useSubmitCheckin: () => ({ mutateAsync: mutateAsyncMock, isPending: submitPending }),
    useFadigaHistorico: (...args: unknown[]) => useFadigaHistoricoMock(...args),
    useFadigaPainel: (...args: unknown[]) => useFadigaPainelMock(...args),
  };
});
"""
addition = insert_after + """
vi.mock('@/react-app/hooks/useOperationalReadiness', () => ({
  useReadinessBaseline: () => ({ data: { sessions: 0, minimum_sessions: 5, ready: false } }),
  useReadinessToday: () => ({ data: null }),
  useSubmitReadiness: () => ({ mutateAsync: readinessMutateAsyncMock, isPending: false }),
}));

vi.mock('../OperationalVigilanceTest', () => ({
  default: ({ onComplete }: { onComplete: (result: unknown) => void }) => {
    useEffect(() => {
      onComplete({
        summary: {
          protocolVersion: 'airtrust-vigilance-v1',
          durationMs: 180000,
          completedTrials: 1,
          validResponses: 1,
          medianReactionTimeMs: 280,
          meanReactionTimeMs: 280,
          p90ReactionTimeMs: 280,
          reactionTimeStdDevMs: 0,
          lapses: 0,
          falseStarts: 0,
          missed: 0,
          responseSpeedPerSecond: 3.571,
          trials: [],
        },
        trials: [
          {
            sequence: 1,
            scheduledAtMs: 1000,
            stimulusAtMs: 1100,
            responseAtMs: 1380,
            reactionTimeMs: 280,
            outcome: 'response',
          },
        ],
      });
    }, [onComplete]);
    return <div data-testid="mock-vigilance-test">Teste cognitivo simulado</div>;
  },
}));
"""
rep(insert_after, addition)
rep(
    "    mutateAsyncMock.mockReset();\n    refetchMock.mockReset();",
    "    mutateAsyncMock.mockReset();\n    readinessMutateAsyncMock.mockReset();\n    refetchMock.mockReset();",
)
rep(
    "    mutateAsyncMock.mockResolvedValue({ data: { requires_frat_review: 0 } });\n    refetchMock.mockResolvedValue(undefined);",
    "    mutateAsyncMock.mockResolvedValue({ data: { requires_frat_review: 0 } });\n    readinessMutateAsyncMock.mockResolvedValue({\n      assessmentId: 'readiness-1',\n      classification: 'baseline_building',\n      baselineSessions: 0,\n      baselineReady: false,\n      warningSignals: [],\n      criticalSignals: [],\n    });\n    refetchMock.mockResolvedValue(undefined);",
)
# Strengthen the minimal-payload integration test with the objective persistence assertion.
needle = """    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));

    const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
"""
replacement = """    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readinessMutateAsyncMock).toHaveBeenCalledTimes(1));

    const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
    const readinessPayload = readinessMutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
    expect(readinessPayload.duration_ms).toBe(180000);
    expect(readinessPayload.trials).toHaveLength(1);
"""
rep(needle, replacement)
p.write_text(text)
