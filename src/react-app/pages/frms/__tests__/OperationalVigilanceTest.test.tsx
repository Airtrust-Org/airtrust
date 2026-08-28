import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OperationalVigilanceTest from '../OperationalVigilanceTest';

describe('OperationalVigilanceTest', () => {
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
