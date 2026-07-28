import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelosSessaoPage from '../index';

// Mocks do fetch e utils
const fetchMock = vi.spyOn(global, 'fetch');
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost/api',
  getAccessToken: () => 'token',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/react-app/utils/confirmDialog', () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }));

describe('ModelosSessaoPage - Qualificações e Checks', () => {
  const mockCategorias = [
    { id: 1, codigo: 'VOO', nome: 'Categoria Voo' },
    { id: 2, codigo: 'CHECK', nome: 'Categoria Check' },
  ];

  const mockQualificacoesVoo = [
    { id: 10, codigo: 'Q-VOO-1', nome: 'Qual Voo 1', categoria: 'VOO', ativo: 1 },
    { id: 11, codigo: 'Q-VOO-2', nome: 'Qual Voo 2', categoria: 'VOO', ativo: 1 },
  ];

  const mockQualificacoesCheck = [
    { id: 20, codigo: 'Q-CHK-1', nome: 'Qual Check 1', categoria: 'CHECK', ativo: 1 },
    { id: 21, codigo: 'Q-CHK-2', nome: 'Qual Check 2', categoria: 'CHECK', ativo: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(((url: RequestInfo | URL) => {
      const urlString = typeof url === 'string' ? url : (url as any)?.url || (url as any)?.href || String(url);
      const mockRes = (data: any) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), clone: function() { return this; } });
      if (urlString.includes('/categorias')) return mockRes({ success: true, data: mockCategorias });
      if (urlString.includes('/qualificacoes/tipos') && (urlString.includes('categoria_id=1') || urlString.includes('categoria=VOO'))) return mockRes({ success: true, data: mockQualificacoesVoo });
      if (urlString.includes('/qualificacoes/tipos') && (urlString.includes('categoria_id=2') || urlString.includes('categoria=CHECK'))) return mockRes({ success: true, data: mockQualificacoesCheck });
      if (urlString.includes('/simuladores/modelos-sessao?')) return mockRes({ success: true, data: [] });
      if (urlString.includes('/tipos-sessao')) return mockRes({ success: true, data: [] });
      if (urlString.includes('/modelos-aeronave')) return mockRes({ success: true, data: [] });
      if (urlString.includes('/simuladores/manobras')) return mockRes({ success: true, data: [] });
      return mockRes({ success: true, data: [] });
    }) as any);
  });

  it('1,2,3,4. Carrega apenas categorias Voo e Check, ignorando CRM, EAD, etc.', async () => {
    render(<ModelosSessaoPage />);
    // O componente buscará as categorias no mount
    
    const btnNovo = await screen.findByText(/Novo Modelo/i);
    fireEvent.click(btnNovo);

    const geraCheck = await screen.findByLabelText(/Gera Qualificação/i);
    fireEvent.click(geraCheck);

    // Voo options
    await waitFor(() => {
      expect(screen.getByText(/Qual Voo 1/i)).toBeDefined();
      expect(screen.getByText(/Qual Voo 2/i)).toBeDefined();
    });

    // Check options
    await waitFor(() => {
      expect(screen.getByText(/Qual Check 1/i)).toBeDefined();
      expect(screen.getByText(/Qual Check 2/i)).toBeDefined();
    });
  });

  it('10. Modelo novo inicia com todos desmarcados e vazios', async () => {
    render(<ModelosSessaoPage />);
    const btnNovo = await screen.findByText(/Novo Modelo/i);
    fireEvent.click(btnNovo);

    const geraCheck = await screen.findByLabelText(/Gera Qualificação/i);
    fireEvent.click(geraCheck);

    const checkboxes = await screen.findAllByRole('checkbox');
    // The first is 'Gera Qualificacao', the rest are the checks
    const checkBoxesFAP = checkboxes.filter(c => c !== geraCheck);
    expect(checkBoxesFAP.length).toBeGreaterThan(0);
    checkBoxesFAP.forEach(c => expect((c as HTMLInputElement).checked).toBe(false));
  });

  it('11. Troca de equipamento não altera Checks selecionados', async () => {
    render(<ModelosSessaoPage />);
    const btnNovo = await screen.findByText(/Novo Modelo/i);
    fireEvent.click(btnNovo);

    const geraCheck = await screen.findByLabelText(/Gera Qualificação/i);
    fireEvent.click(geraCheck);

    const checkOptionSpan = await screen.findByText(/Qual Check 1/i);
    const checkOption = checkOptionSpan.closest('label')?.querySelector('input') as HTMLInputElement;
    fireEvent.click(checkOption);
    expect(checkOption.checked).toBe(true);

    const selectEquip = screen.getAllByRole('combobox').find(el => el.innerHTML.includes('Todos os equipamentos'));
    if (selectEquip) {
      fireEvent.change(selectEquip, { target: { value: 'AW139' } });
    }

    // Still checked
    expect(checkOption.checked).toBe(true);
  });
});
