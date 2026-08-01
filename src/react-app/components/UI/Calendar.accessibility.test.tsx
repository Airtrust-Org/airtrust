import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Calendar } from './Calendar';

describe('Calendar navigation accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes named button controls with visible keyboard focus', () => {
    render(<Calendar events={[]} />);

    const previousButton = screen.getByRole('button', { name: 'Mês anterior' });
    const nextButton = screen.getByRole('button', { name: 'Próximo mês' });

    for (const button of [previousButton, nextButton]) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-primary/50',
        'focus-visible:ring-offset-2',
      );
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }

    expect(previousButton).toHaveAttribute('title', 'Mês anterior');
    expect(nextButton).toHaveAttribute('title', 'Próximo mês');
  });

  it('preserves previous and next month navigation', () => {
    render(<Calendar events={[]} />);

    expect(screen.getByRole('heading', { name: 'agosto 2026' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByRole('heading', { name: 'setembro 2026' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByRole('heading', { name: 'agosto 2026' })).toBeInTheDocument();
  });
});
