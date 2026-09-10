import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosNovoVooDialog from '../ControleVoosNovoVooDialog';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

const aeroportos = [
  { id: 1, codigo: 'SBSP', codigo_icao: 'SBSP', nome: 'Congonhas' },
  { id: 2, codigo: 'SBRJ', codigo_icao: 'SBRJ', nome: 'Santos Dumont' },
];
const tipos = [{ id: 10, nome: 'Táxi aéreo' }];
const naturezas = [{ id: 20, nome: 'Transporte' }];

function mockCatalogos() {
  getMock
    .mockResolvedValueOnce({ success: true, data: aeroportos })
    .mockResolvedValueOnce({ success: true, data: { data: tipos } })
    .mockResolvedValueOnce({ success: true, data: naturezas });
}

function renderDialog(mode: 'coordenacao' | 'pilot' = 'pilot', open = true) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <ControleVoosNovoVooDialog
      open={open}
      mode={mode}
      onClose={onClose}
      onCreated={onCreated}
    />,
  );
  return { onClose, onCreated };
}

async function waitForAirportCatalog() {
  const origem = screen.getByLabelText('Origem');
  await waitFor(() => expect(within(origem).getByRole('option', { name: /SBSP/ })).toBeInTheDocument());
}

async function fillRequiredFields() {
  await waitForAirportCatalog();
  fireEvent.change(screen.getByLabelText('Prefixo'), { target: { value: 'pr-abc' } });
  fireEvent.change(screen.getByLabelText('Origem'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Destino'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Tipo de voo'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Natureza'), { target: { value: '20' } });
}

describe('ControleVoosNovoVooDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não renderiza nem carrega catálogos quando fechado', () => {
    renderDialog('pilot', false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('carrega catálogos e fecha pelo botão de fechar', async () => {
    mockCatalogos();
    const { onClose } = renderDialog('pilot');

    expect(screen.getByText('Carregando catálogos…')).toBeInTheDocument();
    await waitForAirportCatalog();
    expect(getMock).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exibe erro quando o carregamento dos catálogos falha', async () => {
    getMock.mockRejectedValueOnce(new Error('catálogo indisponível'));
    getMock.mockResolvedValue({ success: true, data: [] });
    renderDialog('coordenacao');

    expect(await screen.findByText('catálogo indisponível')).toBeInTheDocument();
  });

  it('valida campos obrigatórios antes de chamar a API', async () => {
    mockCatalogos();
    renderDialog('pilot');
    await waitForAirportCatalog();

    const prefixo = screen.getByLabelText('Prefixo');
    fireEvent.change(prefixo, { target: { value: 'PR-ABC' } });
    fireEvent.submit(prefixo.closest('form')!);

    expect(await screen.findByText('Preencha prefixo, origem, destino, tipo e natureza do voo.')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('impede origem e destino iguais', async () => {
    mockCatalogos();
    renderDialog('pilot');
    await waitForAirportCatalog();

    fireEvent.change(screen.getByLabelText('Prefixo'), { target: { value: 'PR-ABC' } });
    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Tipo de voo'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Natureza'), { target: { value: '20' } });
    fireEvent.submit(screen.getByLabelText('Prefixo').closest('form')!);

    expect(await screen.findByText('Origem e destino devem ser diferentes.')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('cria voo self-service com função do piloto, normaliza prefixo e fecha', async () => {
    mockCatalogos();
    const created = { id: 77, prefixo: 'PR-ABC', data_programacao: '2026-09-10' };
    postMock.mockResolvedValue({ success: true, data: created });
    const { onClose, onCreated } = renderDialog('pilot');

    await fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Minha função'), { target: { value: 'SIC' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: '  teste pilot  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar meu voo' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe('/controle-voos/voos/meus/criar');
    expect(body).toMatchObject({
      prefixo: 'PR-ABC',
      origem_id: 1,
      destino_id: 2,
      tipo_voo_id: 10,
      natureza_voo_id: 20,
      observacoes: 'teste pilot',
      funcao: 'SIC',
    });
    expect(typeof body.horario_previsto_partida).toBe('string');
    expect(typeof body.horario_previsto_chegada).toBe('string');
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cria voo da Coordenação sem enviar função de tripulante', async () => {
    mockCatalogos();
    const created = { id: 88, prefixo: 'PR-XYZ', data_programacao: '2026-09-10' };
    postMock.mockResolvedValue({ success: true, data: { data: created } });
    const { onCreated } = renderDialog('coordenacao');

    await fillRequiredFields();
    expect(screen.queryByLabelText('Minha função')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Criar voo' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe('/controle-voos/voos');
    expect(body).not.toHaveProperty('funcao');
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('mostra erro retornado pela API e não fecha o diálogo', async () => {
    mockCatalogos();
    postMock.mockResolvedValue({ success: false, error: 'voo rejeitado' });
    const { onClose, onCreated } = renderDialog('pilot');

    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Criar meu voo' }));

    expect(await screen.findByText('voo rejeitado')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
