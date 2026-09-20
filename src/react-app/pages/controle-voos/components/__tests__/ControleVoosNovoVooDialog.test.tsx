import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosNovoVooDialog from '../ControleVoosNovoVooDialog';

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));
vi.mock('@/react-app/services/apiClient', () => ({ apiClient: { get: getMock, post: postMock } }));

const aeroportos = [
  { id: 1, codigo: 'SBME', codigo_icao: 'SBME', nome: 'Macaé', tipo: 'aeroporto' },
  { id: 2, codigo: 'SBRJ', codigo_icao: 'SBRJ', nome: 'Santos Dumont', tipo: 'aeroporto' },
  { id: 3, codigo: 'FPAG', codigo_icao: '9PLG', nome: 'ANITA GARIBALDI', tipo: 'plataforma' },
];
const tipos = [{ id: 10, codigo: 'CONTRATO', nome: 'Contrato' }];
const contratos = [{ id: 40, codigo: 'CTR-001', nome: 'Contrato 001' }];
const funcoes = [
  { id: 51, codigo: 'EXAMINADOR', nome: 'Examinador' },
  { id: 52, codigo: 'INSTRUTOR', nome: 'Instrutor' },
  { id: 53, codigo: 'COMANDANTE', nome: 'Comandante' },
  { id: 54, codigo: 'COPILOTO', nome: 'Copiloto' },
];
const aeronaves = [{ id: 30, codigo: 'PR-ABC', prefixo: 'PR-ABC', modelo: 'AW139', status: 'ATIVA' }];
const crew = [
  { id: 101, nome: 'Comandante AW', matricula: 'CMD-101', funcao_codigo: 'PIC', funcao_nome: 'Comandante' },
  { id: 102, nome: 'Copiloto AW', matricula: 'COP-102', funcao_codigo: 'SIC', funcao_nome: 'Copiloto' },
];

function mockBase() {
  getMock.mockImplementation((url: string) => {
    if (url === '/controle-voos/catalogos/aeroportos') return Promise.resolve({ success: true, data: aeroportos });
    if (url === '/controle-voos/catalogos/tipos') return Promise.resolve({ success: true, data: tipos });
    if (url === '/controle-voos/catalogos/contratos') return Promise.resolve({ success: true, data: contratos });
    if (url === '/controle-voos/catalogos/funcoes-bordo') return Promise.resolve({ success: true, data: funcoes });
    if (url === '/aeronaves?somente_ativas=1') return Promise.resolve({ success: true, data: aeronaves });
    if (url.startsWith('/controle-voos/voos/tripulantes-elegiveis')) return Promise.resolve({ success: true, data: crew });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
}

function renderDialog(mode: 'coordenacao' | 'pilot') {
  const onClose = vi.fn(); const onCreated = vi.fn();
  render(<MemoryRouter><ControleVoosNovoVooDialog open mode={mode} onClose={onClose} onCreated={onCreated} /></MemoryRouter>);
  return { onClose, onCreated };
}

async function waitReady() {
  await waitFor(() => expect(within(screen.getByLabelText(/Aeronave \/ Prefixo/)).getByRole('option', { name: /PR-ABC/ })).toBeInTheDocument());
}
async function chooseCommon() {
  fireEvent.change(screen.getByLabelText(/Aeronave \/ Prefixo/), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Contrato'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Tipo de voo'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Aeródromo de origem'), { target: { value: 'SBME — Macaé' } });
  fireEvent.change(screen.getByLabelText('Parada 1'), { target: { value: 'FPAG · ICAO 9PLG — ANITA GARIBALDI' } });
  await waitFor(() => expect(screen.getByLabelText('Destino final')).toHaveValue('SBME — Macaé'));
  await waitFor(() => expect(screen.getByText(/Etapa 1: SBME → 9PLG/)).toBeInTheDocument());
}

describe('ControleVoosNovoVooDialog operational model', () => {
  beforeEach(() => { vi.clearAllMocks(); mockBase(); });

  it('piloto carrega pontos aeronáuticos e resolve busca por ICAO', async () => {
    renderDialog('pilot'); await waitReady(); await chooseCommon();
    expect(getMock).toHaveBeenCalledWith('/controle-voos/catalogos/aeroportos');
    expect(screen.getByLabelText('Destino final')).toHaveValue('SBME — Macaé');
    expect(screen.getByLabelText('Parada 1')).toHaveValue('FPAG · ICAO 9PLG — ANITA GARIBALDI');
  });

  it('não expõe Natureza nem Petrobras e usa catálogos de contrato, tipo e função', async () => {
    renderDialog('pilot'); await waitReady();
    expect(screen.queryByLabelText(/^Natureza/)).toBeNull();
    expect(screen.queryByText(/Petrobras/i)).toBeNull();
    expect(within(screen.getByLabelText('Contrato')).getByRole('option', { name: 'Contrato 001' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Minha função a bordo')).getByRole('option', { name: 'Examinador' })).toBeInTheDocument();
  });

  it('cria voo do piloto com IDs operacionais e função a bordo cadastrável', async () => {
    postMock.mockResolvedValue({ success: true, data: { id: 77 } });
    renderDialog('pilot'); await waitReady(); await chooseCommon();
    fireEvent.change(screen.getByLabelText('Número do voo'), { target: { value: 'V123' } });
    fireEvent.change(screen.getByLabelText('Relatório de voo'), { target: { value: 'DB456' } });
    fireEvent.change(screen.getByLabelText('Minha função a bordo'), { target: { value: '52' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Criar meu voo' }).closest('form')!);
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0][0]).toBe('/controle-voos/voos/meus/criar');
    expect(postMock.mock.calls[0][1]).toMatchObject({ numero_voo: 'V123', numero_db: 'DB456', contrato_id: 40, tipo_voo_id: 10, rota_ids: [1, 3, 1], funcao_bordo_id: 52 });
    expect(postMock.mock.calls[0][1]).not.toHaveProperty('natureza_voo_codigo');
  });

  it('parte com primeira parada visível e retorno ao mesmo aeródromo marcado', async () => {
    renderDialog('coordenacao'); await waitReady();
    expect(screen.getByLabelText('Retorna ao mesmo aeródromo')).toBeChecked();
    expect(screen.getByLabelText('Parada 1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Aeródromo de origem'), { target: { value: 'SBME — Macaé' } });
    expect(screen.getByLabelText('Destino final')).toHaveValue('SBME — Macaé');
    expect(screen.getByLabelText('Destino final')).toBeDisabled();
  });

  it('permite desmarcar o retorno padrão para um destino final excepcional', async () => {
    renderDialog('coordenacao'); await waitReady();
    fireEvent.change(screen.getByLabelText('Aeródromo de origem'), { target: { value: 'SBME — Macaé' } });
    fireEvent.click(screen.getByLabelText('Retorna ao mesmo aeródromo'));
    expect(screen.getByLabelText('Destino final')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Destino final'), { target: { value: 'SBRJ — Santos Dumont' } });
    expect(screen.getByLabelText('Destino final')).toHaveValue('SBRJ — Santos Dumont');
  });

  it('Coordenação mantém chegada prevista e tempo total de voo sincronizados', async () => {
    renderDialog('coordenacao');
    await waitReady();
    const departure = screen.getByLabelText('Decolagem estimada') as HTMLInputElement;
    const arrival = screen.getByLabelText('Retorno estimado') as HTMLInputElement;
    const duration = screen.getByLabelText(/^Tempo total de voo/) as HTMLInputElement;

    fireEvent.change(departure, { target: { value: '2026-09-20T10:00' } });
    fireEvent.change(duration, { target: { value: '01:30' } });
    expect(arrival.value).toBe('2026-09-20T11:30');

    fireEvent.change(arrival, { target: { value: '2026-09-20T12:15' } });
    expect(duration.value).toBe('2:15');
  });

  it('Coordenação cria etapas e atribui função a bordo independente do posto PIC/SIC', async () => {
    postMock.mockResolvedValue({ success: true, data: { id: 88 } });
    renderDialog('coordenacao'); await waitReady(); await chooseCommon();
    expect(screen.getByLabelText('Número do voo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Relatório de voo')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Tripulante — posto PIC')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Tripulante — posto PIC'), { target: { value: '101' } });
    fireEvent.change(screen.getByLabelText('Tripulante — posto SIC'), { target: { value: '102' } });
    fireEvent.change(screen.getByLabelText('Função a bordo — posto PIC'), { target: { value: '52' } });
    fireEvent.change(screen.getByLabelText('Função a bordo — posto SIC'), { target: { value: '51' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar parada' }));
    fireEvent.change(screen.getByLabelText('Parada 2'), { target: { value: 'SBRJ — Santos Dumont' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar voo' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0][1]).toMatchObject({ rota_ids: [1, 3, 2, 1], pic_funcionario_id: 101, sic_funcionario_id: 102, pic_funcao_bordo_id: 52, sic_funcao_bordo_id: 51 });
    expect(postMock.mock.calls[0][1]).not.toHaveProperty('numero_db');
  });
});
