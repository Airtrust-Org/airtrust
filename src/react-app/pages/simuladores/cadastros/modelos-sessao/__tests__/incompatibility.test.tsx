import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ModelosSessaoPage from '../index';
import { toast } from 'sonner';

const fetchMock = vi.spyOn(global, 'fetch');
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost/api',
  getAccessToken: () => 'token',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/react-app/utils/confirmDialog', () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }));

describe('ModelosSessaoPage - Checks Incompatíveis', () => {
  const mockCategorias = [
    { id: 1, codigo: 'VOO', nome: 'Categoria Voo' },
    { id: 2, codigo: 'CHECK', nome: 'Categoria Check' },
  ];

  const mockQualificacoesVoo = [
    { id: 10, codigo: 'Q-VOO-1', nome: 'Qual Voo 1', categoria: 'VOO', ativo: 1 },
  ];

  const mockQualificacoesCheck = [
    { id: 20, codigo: 'AW139-CHK', nome: 'AW139 Check', categoria: 'CHECK', ativo: 1 },
    { id: 21, codigo: 'S76-CHK', nome: 'S76 Check', categoria: 'CHECK', ativo: 1 },
    { id: 22, codigo: 'GENERIC-CHK', nome: 'Check Genérico', categoria: 'CHECK', ativo: 1 },
    { id: 23, codigo: 'OPC', nome: 'OPC', categoria: 'CHECK', ativo: 1 }, // OPC preservado
  ];

  const mockModelos = [
    {
      id: 99,
      codigo: 'MOD-01',
      nome: 'Modelo Teste',
      tipo_sessao_id: 1,
      tipo: 'SIMULADOR',
      modelo_aeronave: 'AW139',
      duracao_estimada: 120,
      gera_qualificacao: 1,
      qualificacao_tipo_id: 10,
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(((url: RequestInfo | URL) => {
      const urlString = typeof url === 'string' ? url : (url as any)?.url || (url as any)?.href || String(url);
      const mockRes = (data: any) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), clone: function() { return this; } });
      
      if (urlString.includes('/categorias')) return mockRes({ success: true, data: mockCategorias });
      if (urlString.includes('/qualificacoes/tipos') && (urlString.includes('categoria_id=1') || urlString.includes('categoria=VOO'))) return mockRes({ success: true, data: mockQualificacoesVoo });
      if (urlString.includes('/qualificacoes/tipos') && (urlString.includes('categoria_id=2') || urlString.includes('categoria=CHECK'))) return mockRes({ success: true, data: mockQualificacoesCheck });
      if (urlString.includes('/simuladores/modelos-sessao/99/checks')) return mockRes({ success: true, data: [{ id: 21 }, { id: 22 }, { id: 23 }] }); // Tem S76 vinculado num modelo de AW139
      if (urlString.includes('/simuladores/modelos-sessao/99/manobras')) return mockRes({ success: true, data: [] });
      if (urlString.includes('/simuladores/modelos-sessao?')) return mockRes({ success: true, data: mockModelos });
      if (urlString.includes('/tipos-sessao')) return mockRes({ success: true, data: [{ id: 1, codigo: 'TP1', nome: 'Tipo 1' }] });
      if (urlString.includes('/modelos-aeronave')) return mockRes({ success: true, data: [{ id: 1, modelo: 'AW139' }, { id: 2, modelo: 'S76' }] });
      if (urlString.includes('/simuladores/manobras')) return mockRes({ success: true, data: [] });
      
      return mockRes({ success: true, data: [] });
    }) as any);
  });

  it('Exibe aviso de incompatibilidade e bloqueia save quando há drift de equipamento', async () => {
    render(<ModelosSessaoPage />);
    
    // Abre modal de edição do MOD-01 que é AW139 mas vem do backend com check do S76
    const btnEditar = await screen.findByText('Editar');
    fireEvent.click(btnEditar);

    // Espera os dados carregarem no modal
    await waitFor(() => {
      expect(screen.getByText('Editar Modelo')).toBeDefined();
    });

    // Como o modelo é AW139 e ele trouxe { id: 21 } (S76-CHK), deve exibir o aviso!
    await waitFor(() => {
      expect(screen.getByText(/Atenção: Checks Incompatíveis Detectados/i)).toBeDefined();
    });
    
    // O aviso deve listar S76-CHK
    expect(screen.getByText('S76-CHK')).toBeDefined();
    // E NÃO deve listar os compativeis (GENERIC e OPC) como incompativeis! O GENERIC-CHK e OPC devem estar marcados na lista padrao
    
    // Tenta salvar, deve ser bloqueado
    const btnAtualizar = screen.getByText('Atualizar');
    fireEvent.click(btnAtualizar);
    
    expect(toast.warning).toHaveBeenCalledWith('Remova os checks incompatíveis antes de salvar.');
    
    // Agora remove explicitly
    const btnRemover = screen.getByText('Remover checks incompatíveis');
    fireEvent.click(btnRemover);
    
    // O aviso deve sumir
    await waitFor(() => {
      expect(screen.queryByText(/Atenção: Checks Incompatíveis Detectados/i)).toBeNull();
    });
  });
  
  it('Verifica recalculagem imediata ao alterar modelo de aeronave', async () => {
    render(<ModelosSessaoPage />);
    
    const btnEditar = await screen.findByText('Editar');
    fireEvent.click(btnEditar);
    
    // Inicialmente é AW139, então S76 (21) é incompativel
    await waitFor(() => {
      expect(screen.getByText(/Atenção: Checks Incompatíveis Detectados/i)).toBeDefined();
    });
    
    // Alteramos o equipamento para S76!
    const selectEquip = screen.getAllByRole('combobox').find(el => {
      const options = Array.from(el.querySelectorAll('option'));
      return options.some(o => o.value === 'S76');
    });
    
    expect(selectEquip).toBeDefined();
    fireEvent.change(selectEquip!, { target: { value: 'S76' } });
    
    // Imediatamente:
    // S76-CHK passa a ser compatível, logo o aviso deve sumir.
    await waitFor(() => {
      expect(screen.queryByText(/Atenção: Checks Incompatíveis Detectados/i)).toBeNull();
    });
    
    // Porem, se eu trocar pra AW139 denovo, S76-CHK volta a ser incompatível
    fireEvent.change(selectEquip!, { target: { value: 'AW139' } });
    
    await waitFor(() => {
      expect(screen.getByText(/Atenção: Checks Incompatíveis Detectados/i)).toBeDefined();
    });
  });
});
