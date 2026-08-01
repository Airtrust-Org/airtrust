import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function TabsFixture({ onValueChange = vi.fn() }: { onValueChange?: (value: string) => void }) {
  return (
    <Tabs defaultValue="resumo" onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="resumo">Resumo</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
        <TabsTrigger value="documentos">Documentos</TabsTrigger>
      </TabsList>

      <TabsContent value="resumo">Conteúdo do resumo</TabsContent>
      <TabsContent value="historico">Conteúdo do histórico</TabsContent>
      <TabsContent value="documentos">Conteúdo dos documentos</TabsContent>
    </Tabs>
  );
}

describe('Tabs accessibility', () => {
  it('expõe semântica WAI-ARIA e relaciona a aba ativa ao painel', () => {
    render(<TabsFixture />);

    const tablist = screen.getByRole('tablist');
    const resumoTab = screen.getByRole('tab', { name: 'Resumo' });
    const historicoTab = screen.getByRole('tab', { name: 'Histórico' });
    const panel = screen.getByRole('tabpanel', { name: 'Resumo' });

    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');
    expect(resumoTab).toHaveAttribute('aria-selected', 'true');
    expect(resumoTab).toHaveAttribute('tabindex', '0');
    expect(historicoTab).toHaveAttribute('aria-selected', 'false');
    expect(historicoTab).toHaveAttribute('tabindex', '-1');
    expect(resumoTab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', resumoTab.id);
  });

  it('move o foco por setas, Home e End sem ativar até Enter', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<TabsFixture onValueChange={onValueChange} />);

    const resumoTab = screen.getByRole('tab', { name: 'Resumo' });
    const historicoTab = screen.getByRole('tab', { name: 'Histórico' });
    const documentosTab = screen.getByRole('tab', { name: 'Documentos' });

    resumoTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(historicoTab).toHaveFocus();
    expect(resumoTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Resumo' })).toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('historico');
    expect(historicoTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Histórico' })).toBeInTheDocument();

    await user.keyboard('{End}');
    expect(documentosTab).toHaveFocus();

    await user.keyboard('{Home}');
    expect(resumoTab).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(documentosTab).toHaveFocus();
  });
});
