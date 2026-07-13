import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelosSessaoPage from '@/react-app/pages/simuladores/cadastros/modelos-sessao/index';

// Mock localStorage for jsdom
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Helper: wait until loading is done and table rows are visible
async function waitForTable() {
  // Wait for the filter row count display to appear, indicating loading finished
  await waitFor(() => {
    expect(screen.getByText(/Exibindo/)).toBeTruthy();
  }, { timeout: 5000 });
}

function getCellText(row: HTMLElement, cellIndex: number): string {
  const cells = row.querySelectorAll('td');
  return cells[cellIndex]?.textContent?.trim() || '';
}

function getAllCodigos(): string[] {
  const rows = screen.getAllByRole('row');
  return rows.slice(1).map((row) => getCellText(row, 0));
}

// Mock fetch globally
const mockModelos = [
  { id: 3, codigo: 'B-02', nome: 'Modelo Bravo', tipo_sessao_id: 1, tipo: 'SIMULADOR', modelo_aeronave: 'AW139', duracao_estimada: 60, total_manobras: 5, tipo_sessao_nome: 'PER' },
  { id: 1, codigo: 'A-10', nome: 'Modelo Alpha', tipo_sessao_id: 2, tipo: 'AERONAVE', modelo_aeronave: 'SK76', duracao_estimada: 120, total_manobras: 10, tipo_sessao_nome: 'REC' },
  { id: 2, codigo: 'A-02', nome: 'Modelo Charlie', tipo_sessao_id: 1, tipo: 'SIMULADOR', modelo_aeronave: 'AW139', duracao_estimada: 90, total_manobras: null, tipo_sessao_nome: 'PER' },
  { id: 4, codigo: 'C-01', nome: 'modelo delta', tipo_sessao_id: 3, tipo: 'SIMULADOR', modelo_aeronave: 'BELL-429', duracao_estimada: 120, total_manobras: 3, tipo_sessao_nome: 'EXA' },
  { id: 5, codigo: 'D-99', nome: 'Modelo Echo', tipo_sessao_id: 2, tipo: 'SIMULADOR', modelo_aeronave: null, duracao_estimada: 180, total_manobras: 8, tipo_sessao_nome: 'REC' },
];

const mockTiposSessao = [
  { id: 1, codigo: 'PER', nome: 'Periódico', cor: '#3b82f6' },
  { id: 2, codigo: 'REC', nome: 'Recorrente', cor: '#10b981' },
  { id: 3, codigo: 'EXA', nome: 'Exame', cor: '#f59e0b' },
];

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();

  // Default fetch mock
  globalThis.fetch = vi.fn((url: string) => {
    if (url.includes('/simuladores/modelos-sessao')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockModelos }) });
    }
    if (url.includes('/simuladores/tipos-sessao')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockTiposSessao }) });
    }
    if (url.includes('/modelos-aeronave')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
    }
    if (url.includes('/simuladores/cadastro/manobras')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
    }
    if (url.includes('/qualificacoes/tipos')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
    }
    return Promise.reject(new Error('Unknown URL'));
  }) as unknown as typeof fetch;
});

describe('ModelosSessaoPage — ordenação por colunas', () => {
  it('1. "Ordenar por" não aparece', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();
    expect(screen.queryByText('Ordenar por')).toBeNull();
  });

  it('2. Código é a ordenação padrão crescente', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();
    const codigos = getAllCodigos();
    expect(codigos).toEqual(['A-02', 'A-10', 'B-02', 'C-01', 'D-99']);
  });

  it('3. Clique em Código alterna crescente/decrescente', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    const codigoHeader = screen.getByRole('button', { name: /Código/i });
    await userEvent.click(codigoHeader);
    expect(getAllCodigos()).toEqual(['D-99', 'C-01', 'B-02', 'A-10', 'A-02']);

    await userEvent.click(codigoHeader);
    expect(getAllCodigos()).toEqual(['A-02', 'A-10', 'B-02', 'C-01', 'D-99']);
  });

  it('4. Clique em Nome muda a coluna ativa', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    const nomeHeader = screen.getByRole('button', { name: /Nome/i });
    await userEvent.click(nomeHeader);

    const rows = screen.getAllByRole('row');
    const nomes = rows.slice(1).map((row) => getCellText(row, 1));
    expect(nomes).toEqual(['Modelo Alpha', 'Modelo Bravo', 'Modelo Charlie', 'modelo delta', 'Modelo Echo']);
  });

  it('5. Duração ordena numericamente', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    const duracaoHeader = screen.getByRole('button', { name: /Duração/i });
    await userEvent.click(duracaoHeader);

    const rows = screen.getAllByRole('row');
    const duracoes = rows.slice(1).map((row) => getCellText(row, 5));
    expect(duracoes).toEqual(['60 min', '90 min', '120 min', '120 min', '180 min']);
  });

  it('6. Manobras ordena numericamente (null = 0)', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    const manobrasHeader = screen.getByRole('button', { name: /Manobras/i });
    await userEvent.click(manobrasHeader);

    const rows = screen.getAllByRole('row');
    const manobras = rows.slice(1).map((row) => getCellText(row, 6));
    expect(manobras).toEqual(['0', '3', '5', '8', '10']);
  });

  it('7. Código usa ordenação natural', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    const codigos = getAllCodigos();
    expect(codigos[0]).toBe('A-02');
    expect(codigos[1]).toBe('A-10');
  });

  it('8. Ações não é clicável', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    const acoesHeader = screen.getByText('Ações');
    expect(acoesHeader.tagName).toBe('TH');
    expect(acoesHeader.querySelector('button')).toBeNull();
  });

  it('9. Filtros continuam funcionando junto com a ordenação', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    // Use combobox role to find the equipment filter (3rd select)
    const comboboxes = screen.getAllByRole('combobox');
    const equipamentoSelect = comboboxes[2]; // 3rd select = equipment filter
    await userEvent.selectOptions(equipamentoSelect, 'AW139');

    expect(getAllCodigos()).toEqual(['A-02', 'B-02']);
  });

  it('10. Limpar Filtros restaura Código crescente', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    await userEvent.click(screen.getByRole('button', { name: /Nome/i }));

    const comboboxes = screen.getAllByRole('combobox');
    const tipoSelect = comboboxes[1]; // 2nd select = type filter
    await userEvent.selectOptions(tipoSelect, '1');

    await userEvent.click(screen.getByText('Limpar Filtros'));

    const rows = screen.getAllByRole('row');
    expect(rows.length - 1).toBe(mockModelos.length);
    expect(getAllCodigos()).toEqual(['A-02', 'A-10', 'B-02', 'C-01', 'D-99']);
  });

  it('11. Preferência é restaurada ao remontar a tela', async () => {
    localStorage.setItem(
      'airtrust:modelos-sessao:full:sort',
      JSON.stringify({ field: 'duracao', direction: 'desc' }),
    );

    const { unmount } = render(<ModelosSessaoPage />);
    await waitForTable();

    let rows = screen.getAllByRole('row');
    let duracoes = rows.slice(1).map((row) => getCellText(row, 5));
    expect(duracoes).toEqual(['180 min', '120 min', '120 min', '90 min', '60 min']);

    unmount();
    render(<ModelosSessaoPage />);
    await waitForTable();

    rows = screen.getAllByRole('row');
    duracoes = rows.slice(1).map((row) => getCellText(row, 5));
    expect(duracoes).toEqual(['180 min', '120 min', '120 min', '90 min', '60 min']);
  });

  it('12. Nenhum código ou nome é modificado', async () => {
    render(<ModelosSessaoPage />);
    await waitForTable();

    const codigos = getAllCodigos();
    for (const codigo of codigos) {
      const original = mockModelos.find((m) => m.codigo === codigo);
      expect(original).toBeDefined();
      expect(original?.codigo).toBe(codigo);
    }
  });
});
