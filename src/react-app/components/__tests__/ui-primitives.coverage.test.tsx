import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Badge from '../Badge';
import Button from '../Button';
import Card, { CardContent, CardHeader } from '../Card';
import ContentCard from '../ContentCard';
import EmptyState from '../EmptyState';

describe('UI primitives coverage', () => {
  it.each([
    ['success', 'sm'],
    ['warning', 'md'],
    ['danger', 'sm'],
    ['info', 'md'],
    ['neutral', 'sm'],
  ] as const)('renders Badge variant %s size %s', (variant, size) => {
    render(<Badge variant={variant} size={size}>status</Badge>);
    expect(screen.getByText('status')).toBeInTheDocument();
  });

  it('renders Badge defaults', () => {
    render(<Badge>default</Badge>);
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it.each([
    ['primary', 'sm'],
    ['secondary', 'md'],
    ['danger', 'lg'],
    ['ghost', 'md'],
  ] as const)('renders clickable Button variant %s size %s', (variant, size) => {
    const onClick = vi.fn();
    render(<Button variant={variant} size={size} onClick={onClick}>action</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'action' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables Button while loading', () => {
    render(<Button loading>saving</Button>);
    expect(screen.getByRole('button', { name: 'saving' })).toBeDisabled();
  });

  it('disables Button when disabled prop is set', () => {
    render(<Button disabled>blocked</Button>);
    expect(screen.getByRole('button', { name: 'blocked' })).toBeDisabled();
  });

  it('renders ContentCard children and custom class', () => {
    render(<ContentCard className="qa-card"><span>content</span></ContentCard>);
    const content = screen.getByText('content');
    expect(content).toBeInTheDocument();
    expect(content.parentElement).toHaveClass('qa-card');
  });

  it('renders ContentCard with default className', () => {
    render(<ContentCard>plain</ContentCard>);
    expect(screen.getByText('plain')).toBeInTheDocument();
  });

  it('covers Card default and gradient branches plus header/content helpers', () => {
    const { rerender } = render(
      <Card className="qa-card">
        <CardHeader className="qa-header">header</CardHeader>
        <CardContent className="qa-content">body</CardContent>
      </Card>,
    );

    const card = screen.getByText('header').parentElement?.parentElement;
    expect(card).toHaveClass('qa-card');
    expect(card).toHaveClass('bg-white/80');
    expect(screen.getByText('header').parentElement).toHaveClass('qa-header');
    expect(screen.getByText('body').parentElement).toHaveClass('qa-content');

    rerender(<Card gradient>gradient</Card>);
    expect(screen.getByText('gradient').parentElement).toHaveClass('bg-gradient-to-br');
  });

  it('renders EmptyState without optional action', () => {
    render(<EmptyState icon={<span>icon</span>} title="Nada aqui" description="Sem registros" />);
    expect(screen.getByText('icon')).toBeInTheDocument();
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
    expect(screen.getByText('Sem registros')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders and executes EmptyState action', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="Nada aqui"
        description="Sem registros"
        action={{ label: 'Criar', onClick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
