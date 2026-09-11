import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosNovoVooDialog from '../ControleVoosNovoVooDialog';

const { getMock, postMock, permissionsMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  permissionsMock: vi.fn(),
}));

vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => permissionsMock(),
}));

const aeroportos = [
  { id: 1, codigo: 'SBSP', codigo_icao: 'SBSP', nome: 'Congonhas' },
  { id: 2, codigo: 'SBRJ', codigo_icao: 'SBRJ', nome: 'Santos Dumont' },
];
const tipos = [{ id: 10, nome: 'Táxi aéreo' }];
const naturezas = [{ id: 20, nome: 'Transporte' }];
const aeronaves = [{ id: 30, codigo: 'PR-ABC', prefixo: 'PR-ABC', modelo: 'AW139', status: 'ATIVA' }];

function mockCatalogos() {
  getMock
    .mockResolvedValueOnce({ success: true, data: aeroportos })
    .mockResolvedValueOnce({ success: true, data: { data: tipos } })
    .mockResolvedValueOnce({ success: true, data: naturezas })
    .mockResolvedValueOnce({ success: true, data: aeronaves });
}

function renderDialog(mode: 'coordenacao' | 'pilot' = 'pilot', open = true) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <MemoryRouter>
      <ControleVoosNovoVooDialog
        open={open}
        mode={mode}
        onClose={onClose}
        onCreated={onCreated}
      />
    </MemoryRouter>,
  );
  return { onClose, onCreated };
}

const aeronaveSelect = () => screen.getByLabelText(/Aeronave \/ Prefixo/);
const origemSelect = () => screen.getByLabelText(/^Origem/);
const destinoSelect = () => screen.getByLabelText(/^Destino/);
const tipoSelect = () => screen.getByLabelText(/^Tipo de voo/);
const naturezaSelect = () => screen.getByLabelText(/^Natureza/);

async function waitForAirportCatalog() {
  const origem = origemSelect();
  await waitFor(() => expect(within(origem).getByRole('option', { name: /SBSP/ })).toBeInTheDocument());
  await waitFor(() =>
    expect(within(aeronaveSelect()).getByRole('option', { name: /PR-ABC/ })).toBeInTheDocument(),
  );
}

async function fillRequiredFields() {
  await waitForAirportCatalog();
  fireEvent.change(aeronaveSelect(), { target: { value: '30' } });
  fireEvent.change(origemSelect(), { target: { value: '1' } });
  fireEvent.change(destinoSelect(), { target: { value: '2' } });
  fireEvent.change(tipoSelect(), { target: { value: '10' } });
  fireEvent.change(naturezaSelect(), { target: { value: '20' } });
}

describe('ControleVoosNovoVooDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockReset();
    postMock.mockReset();
    permissionsMock.mockReturnValue({ isAdmin: true, isGestor: false });
  });

  it('não renderiza nem carrega catálogos quando fechado', () => {
    renderDialog('pilot', false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('carrega catálogos e frota canônica e fecha pelo botão de fechar', async () => {
    mockCatalogos();
    const { onClose } = renderDialog('pilot');

    expect(screen.getByText('Carregando cadastros operacionais…')).toBeInTheDocument();
    await waitForAirportCatalog();
    expect(getMock).toHaveBeenCalledTimes(4);
    expect(getMock).toHaveBeenNthCalledWith(4, '/aeronaves?somente_ativas=1');

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

    fireEvent.submit(aeronaveSelect().closest('form')!);

    expect(await screen.findByText('Selecione aeronave, origem, destino, tipo e natureza do voo.')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('impede origem e destino iguais', async () => {
    mockCatalogos();
    renderDialog('pilot');
    await waitForAirportCatalog();

    fireEvent.change(aeronaveSelect(), { target: { value: '30' } });
    fireEvent.change(origemSelect(), { target: { value: '1' } });
    fireEvent.change(destinoSelect(), { target: { value: '1' } });
    fireEvent.change(tipoSelect(), { target: { value: '10' } });
    fireEvent.change(naturezaSelect(), { target: { value: '20' } });
    fireEvent.submit(aeronaveSelect().closest('form')!);

    expect(await screen.findByText('Origem e destino devem ser diferentes.')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('cria voo self-service com aeronave canônica, função do piloto e fecha', async () => {
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
      aeronave_id: 30,
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
    const created = { id: 88, prefixo: 'PR-ABC', data_programacao: '2026-09-10' };
    postMock.mockResolvedValue({ success: true, data: { data: created } });
    const { onCreated } = renderDialog('coordenacao');

    await fillRequiredFields();
    expect(screen.queryByLabelText('Minha função')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Criar voo' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [endpoint, body] = postMock.mock.calls[0];
    expect(endpoint).toBe('/controle-voos/voos');
    expect(body).toMatchObject({ aeronave_id: 30, prefixo: 'PR-ABC' });
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
