import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OperationalVigilanceTest, {
  type OperationalVigilanceResult,
} from '../OperationalVigilanceTest';
import { PVTB_V2_PROTOCOL } from '../operationalReadiness';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Drives the component from `instructions` to the first visible stimulus. */
function startAndReachStimulus() {
  fireEvent.click(screen.getByRole('button', { name: /iniciar teste/i }));
  // Math.random mocked to 0 -> ISI = feedbackHoldMs (1000). +1 animation frame.
  act(() => {
    vi.advanceTimersByTime(PVTB_V2_PROTOCOL.feedbackHoldMs + 20);
  });
}

describe('OperationalVigilanceTest — PVT-B V2 paradigm', () => {
  it('pins the PVT-B response window at 30 seconds', () => {
    expect(PVTB_V2_PROTOCOL.responseWindowMs).toBe(30_000);
  });

  it('keeps the student-facing reference concise and points to NASA Ames', () => {
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: /vigilância psicomotora \(PVT-B\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/retângulo com borda vermelha fica visível sobre fundo preto/i)).toBeInTheDocument();
    expect(screen.getByText(/contador amarelo/i)).toBeInTheDocument();
    expect(screen.getByText(/referência científica: psychomotor vigilance task/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NASA Ames Fatigue Countermeasures Laboratory/i })).toHaveAttribute(
      'href',
      'https://www.nasa.gov/human-systems-integration-division/human-performance/fatigue-countermeasures-laboratory/',
    );
    expect(screen.queryByText(/PsyToolkit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NASA PVT\+/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/círculo azul/i)).not.toBeInTheDocument();
  });

  it('keeps a black response surface with an empty red rectangular frame while waiting', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar teste/i }));

    const box = screen.getByTestId('pvtb-box');
    const frame = screen.getByTestId('pvtb-stimulus-frame');
    expect(box).toHaveAttribute('data-phase', 'waiting');
    expect(box.className).toMatch(/bg-black/);
    expect(frame.className).toMatch(/border-red-600/);
    expect(frame.className).toMatch(/bg-black/);
    expect(frame).toBeEmptyDOMElement();
    expect(screen.queryByTestId('pvtb-counter')).not.toBeInTheDocument();
    expect(frame.className).not.toMatch(/rounded-full/);
    expect(box.className).not.toMatch(/bg-red-600/);
    expect(box.className).not.toMatch(/bg-blue-600/);
  });

  it('shows a yellow millisecond counter inside the red frame and no rounded-full stimulus', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={vi.fn()} />);
    startAndReachStimulus();

    const box = screen.getByTestId('pvtb-box');
    const frame = screen.getByTestId('pvtb-stimulus-frame');
    expect(box).toHaveAttribute('data-phase', 'stimulus');
    expect(frame.className).toMatch(/border-red-600/);
    const counter = screen.getByTestId('pvtb-counter');
    expect(counter.className).toMatch(/text-yellow-300/);
    expect(counter.className).not.toMatch(/rounded-full/);
    expect(frame.querySelector('.rounded-full')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(Number(screen.getByTestId('pvtb-counter').textContent)).toBeGreaterThanOrEqual(150);
  });

  it('does not time out an unanswered stimulus after only 3 seconds', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onComplete = vi.fn();
    render(<OperationalVigilanceTest durationMs={60_000} onComplete={onComplete} />);
    startAndReachStimulus();

    act(() => {
      vi.advanceTimersByTime(3_100);
    });

    expect(screen.getByTestId('pvtb-box')).toHaveAttribute('data-phase', 'stimulus');
    expect(Number(screen.getByTestId('pvtb-counter').textContent)).toBeGreaterThanOrEqual(3_000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('keeps an in-window final stimulus alive past the nominal session boundary and records no-response as a 30 s lapse', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let completed: OperationalVigilanceResult | null = null;
    render(
      <OperationalVigilanceTest
        durationMs={2_000}
        onComplete={(result) => {
          completed = result;
        }}
      />,
    );

    startAndReachStimulus();
    act(() => {
      vi.advanceTimersByTime(1_100);
    });

    expect(screen.getByTestId('pvtb-box')).toHaveAttribute('data-phase', 'stimulus');
    expect(completed).toBeNull();

    act(() => {
      vi.advanceTimersByTime(PVTB_V2_PROTOCOL.responseWindowMs);
    });

    expect(completed).not.toBeNull();
    expect(completed!.summary.durationMs).toBe(2_000);
    expect(completed!.summary.protocolVersion).toBe('airtrust-pvtb-v2');
    expect(completed!.trials).toHaveLength(1);
    expect(completed!.trials[0]).toMatchObject({
      responseAtMs: null,
      reactionTimeMs: 30_000,
      outcome: 'lapse',
    });
    expect(completed!.summary.lapses).toBe(1);
    expect(completed!.summary.missed).toBe(0);
  });

  it('measures reaction time from the monotonic clock, not the wall clock (Date.now)', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const perfNowSpy = vi.spyOn(performance, 'now');
    vi.spyOn(Date, 'now').mockReturnValue(5_000_000_000_000);
    let completed: OperationalVigilanceResult | null = null;
    render(
      <OperationalVigilanceTest
        durationMs={30_000}
        onComplete={(result) => {
          completed = result;
        }}
      />,
    );

    startAndReachStimulus();
    expect(screen.getByTestId('pvtb-box')).toHaveAttribute('data-phase', 'stimulus');
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.pointerDown(screen.getByTestId('pvtb-box'));

    expect(screen.getByText(/^2\d\d ms$/)).toBeInTheDocument();
    expect(screen.getByText(/tempo da última resposta/i)).toBeInTheDocument();
    expect(perfNowSpy).toHaveBeenCalled();
    expect(completed).toBeNull();
  });

  it('flags a tap before the counter as an anticipation (false start)', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar teste/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.pointerDown(screen.getByTestId('pvtb-box'));

    expect(screen.getByText('Antecipado')).toBeInTheDocument();
  });

  it('classifies a slow response (>= 500 ms) as a lapse without altering the raw time', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={vi.fn()} />);
    startAndReachStimulus();

    act(() => {
      vi.advanceTimersByTime(620);
    });
    fireEvent.pointerDown(screen.getByTestId('pvtb-box'));

    expect(screen.getByText(/6\d\d ms/)).toBeInTheDocument();
    expect(screen.getByText(/resposta lenta/i)).toBeInTheDocument();
  });

  it('emits protocol_version airtrust-pvtb-v2 on completion', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let completed: OperationalVigilanceResult | null = null;
    render(
      <OperationalVigilanceTest
        durationMs={2_500}
        onComplete={(result) => {
          completed = result;
        }}
      />,
    );

    startAndReachStimulus();
    act(() => {
      vi.advanceTimersByTime(240);
    });
    fireEvent.pointerDown(screen.getByTestId('pvtb-box'));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(completed).not.toBeNull();
    expect(completed!.summary.protocolVersion).toBe('airtrust-pvtb-v2');
  });

  it('invalidates an active test when the window loses focus and never emits partial data', () => {
    const onComplete = vi.fn();
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar teste/i }));
    fireEvent(window, new Event('blur'));

    expect(screen.getByText('Teste interrompido')).toBeInTheDocument();
    expect(screen.getByText(/janela perdeu o foco/i)).toBeInTheDocument();
    expect(screen.getByText(/nenhum resultado parcial será usado/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('invalidates when the page is hidden mid-test', () => {
    const onComplete = vi.fn();
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar teste/i }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    fireEvent(document, new Event('visibilitychange'));

    expect(screen.getByText('Teste interrompido')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('allows a clean restart after invalidation', () => {
    const onComplete = vi.fn();
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar teste/i }));
    fireEvent(window, new Event('blur'));
    fireEvent.click(screen.getByRole('button', { name: /reiniciar teste/i }));

    expect(screen.queryByText('Teste interrompido')).not.toBeInTheDocument();
    expect(screen.getByText('Teste em andamento')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
