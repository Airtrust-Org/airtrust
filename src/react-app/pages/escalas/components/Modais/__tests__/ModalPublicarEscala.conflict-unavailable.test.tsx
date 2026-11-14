/* @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => (
    <div>{children}<footer>{footer}</footer></div>
  ),
}));
vi.mock('@/react-app/components/UI', () => ({
  Button: ({ children, onClick, disabled }: {
    children: React.ReactNode; onClick?: () => void; disabled?: boolean
  }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
}));

import ModalPublicarEscala from '../ModalPublicarEscala';

describe('F14-08 — publicação não trata erro de compliance como ausência de conflitos', () => {
  it('erro COMPLIANCE_CHECK_UNAVAILABLE bloqueia publicação mesmo que o cache tenha um conflito', () => {
    const onConfirmar = vi.fn();
    render(
      <ModalPublicarEscala
        modo="publicar"
        escalaLabel="Escala 11/2026"
        cobertura={{ total: 2, completos: 2, parciais: 0, livres: 0 }}
        totalConflitos={1}
        conflitosVerificados={false}
        totalAlocacoes={2}
        onConfirmar={onConfirmar}
        onClose={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: 'Confirmar Publicação' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Verificação de conflitos indisponível')).toBeTruthy();
    fireEvent.click(button);
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
