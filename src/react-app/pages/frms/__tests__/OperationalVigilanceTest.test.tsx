import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OperationalVigilanceTest from '../OperationalVigilanceTest';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OperationalVigilanceTest', () => {
  it('shows the PVT scientific context without implying NASA certification of the AirTrust implementation', () => {
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /vigilância psicomotora \(PVT\)/i })).toBeInTheDocument();
    expect(screen.getByText(/NASA usa PVT\/PVT\+ em pesquisas de fadiga e desempenho/i)).toBeInTheDocument();
    expect(screen.getByText(/implementação independente/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NASA Fatigue Countermeasures Laboratory/i })).toHaveAttribute(
      'href',
      'https://www.nasa.gov/human-systems-integration-division/human-performance/fatigue-countermeasures-laboratory/',
    );
    expect(screen.getByText(/tempo aparece em milissegundos/i)).toBeInTheDocument();
  });

  it('shows the measured reaction time in milliseconds after a valid response without changing the trial schedule', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onComplete = vi.fn();
    render(<OperationalVigilanceTest durationMs={30_000} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar teste/i }));
    act(() => {
      vi.advanceTimersByTime(2_020);
    });

    const responseArea = screen.getByRole('button', { name: /responder ao estímulo agora/i });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.pointerDown(responseArea);

    expect(screen.getByText(/ms$/i)).toBeInTheDocument();
    expect(screen.getByText(/tempo da última resposta/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
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
