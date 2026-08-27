import { render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

/**
 * Guarda o contrato de rotas FRMS após a simplificação operacional:
 * - `/frms` continua sendo a entrada operacional principal;
 * - rotas contextuais específicas seguem resolvendo para as suas telas;
 * - o atalho `/frms/sigvoos` redireciona para a integração canônica;
 * - qualquer rota FRMS legada/obsoleta cai de forma segura em `/frms`,
 *   sem link direto quebrado.
 *
 * O bloco de rotas abaixo espelha o que App.tsx registra para o namespace
 * `/frms`; a ordenação por especificidade do React Router garante que o
 * catch-all nunca "engula" uma rota específica.
 */
function FrmsRoutesHarness() {
  return (
    <Routes>
      <Route path="/frms" element={<div>tela operacional</div>} />
      <Route path="/frms/tripulante/:id" element={<div>ficha tripulante</div>} />
      <Route path="/frms/alertas" element={<div>casos</div>} />
      <Route path="/frms/configuracoes" element={<div>administracao</div>} />
      <Route
        path="/frms/sigvoos"
        element={<Navigate to="/configuracoes/integracoes/sigvoos" replace />}
      />
      <Route path="/frms/*" element={<Navigate to="/frms" replace />} />
      <Route path="/configuracoes/integracoes/sigvoos" element={<div>integracao sigvoos</div>} />
    </Routes>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FrmsRoutesHarness />
    </MemoryRouter>,
  );
}

describe('rotas legadas do FRMS', () => {
  it('mantém /frms como entrada operacional principal', () => {
    renderAt('/frms');
    expect(screen.getByText('tela operacional')).toBeInTheDocument();
  });

  it('preserva rotas contextuais específicas apesar do catch-all', () => {
    renderAt('/frms/tripulante/30?origem=operacao');
    expect(screen.getByText('ficha tripulante')).toBeInTheDocument();
  });

  it('redireciona o atalho /frms/sigvoos para a integração canônica', () => {
    renderAt('/frms/sigvoos');
    expect(screen.getByText('integracao sigvoos')).toBeInTheDocument();
  });

  it('redireciona rotas FRMS obsoletas para a tela operacional', () => {
    for (const legacy of [
      '/frms/controle-operacional',
      '/frms/monitoramento',
      '/frms/analise',
      '/frms/qualquer-coisa-antiga',
    ]) {
      const { unmount } = renderAt(legacy);
      expect(screen.getByText('tela operacional')).toBeInTheDocument();
      unmount();
    }
  });
});
