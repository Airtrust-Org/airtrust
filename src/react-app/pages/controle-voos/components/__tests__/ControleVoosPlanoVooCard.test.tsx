import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosPlanoVooCard from '../ControleVoosPlanoVooCard';

const { getMock, postMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: { get: getMock, post: postMock, put: putMock },
}));

const draft = {
  schema_version: 1 as const,
  comuns: {
    identificacao_aeronave: 'PSCDV',
    regra_voo: '' as const,
    tipo_voo: '' as const,
    numero_aeronaves: 1,
    tipo_aeronave: '',
    categoria_esteira: '' as const,
    equipamento: '',
    vigilancia: '',
  },
  pernas: [
    {
      ordem: 1,
      origem: 'SBME',
      data_partida_utc: '2026-09-22',
      eobt_utc: '1400',
      velocidade_cruzeiro: '',
      nivel_cruzeiro: '',
      rota: 'DCT',
      destino: '9PGB',
      eet: '',
      alternado_1: '',
      alternado_2: '',
      outros_dados: '',
      autonomia: '',
      pessoas_bordo: '10',
    },
    {
      ordem: 2,
      origem: '9PGB',
      data_partida_utc: '2026-09-22',
      eobt_utc: '',
      velocidade_cruzeiro: '',
      nivel_cruzeiro: '',
      rota: 'DCT',
      destino: 'SBME',
      eet: '',
      alternado_1: '',
      alternado_2: '',
      outros_dados: '',
      autonomia: '',
      pessoas_bordo: '',
    },
  ],
  contato: { responsavel: '', telefone: '' },
};

function baseResponse(available = true) {
  return {
    available,
    schema_change_id: 'controle-voos-flight-plan-0509',
    transmission: {
      provider: 'MANUAL',
      enabled: false,
      reason: 'Transmissão automática ao DECEA/SIGMA não habilitada.',
    },
    reference: {
      modelo_aeronave: 'AW139',
      rota: [
        { codigo: 'SBME', codigo_icao: 'SBME', nome: 'Macaé' },
        { codigo: 'GB', codigo_icao: '9PGB', nome: 'Plataforma' },
        { codigo: 'SBME', codigo_icao: 'SBME', nome: 'Macaé' },
      ],
    },
    plan: null,
    draft,
    readiness: {
      ready: false,
      missing_common: ['Regra de voo (campo 8)'],
      warnings: [],
      pernas: [
        { ordem: 1, ready: false, missing: ['Velocidade de cruzeiro (campo 15)'], warnings: [], preview: null },
        { ordem: 2, ready: false, missing: ['EOBT UTC válido (campo 13)'], warnings: [], preview: null },
      ],
    },
  };
}

describe('ControleVoosPlanoVooCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({ success: true, data: baseResponse(true) });
  });

  it('mantém o plano dentro do detalhe do voo, por pernas, sem expor envio automático ao DECEA', async () => {
    render(<ControleVoosPlanoVooCard vooId={77} canEdit />);

    await waitFor(() => expect(screen.getByTestId('structured-flight-plan-card')).toBeInTheDocument());
    expect(screen.getByText('SBME → 9PGB → SBME')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/Transmissão automática ao DECEA\/SIGMA não habilitada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar.*DECEA/i })).toBeNull();
    expect(screen.getByText('Perna 1: SBME → 9PGB')).toBeInTheDocument();
    expect(screen.getByText('Perna 2: 9PGB → SBME')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo ICAO da aeronave')).toBeInTheDocument();
  });

  it('gera prévia e salva rascunho usando o mesmo agregado versionado', async () => {
    postMock.mockResolvedValue({
      success: true,
      data: {
        payload: {
          ...draft,
          comuns: {
            ...draft.comuns,
            regra_voo: 'V',
            tipo_voo: 'G',
            tipo_aeronave: 'A139',
            categoria_esteira: 'L',
            equipamento: 'SDFGRY',
            vigilancia: 'S',
          },
        },
        readiness: {
          ready: false,
          missing_common: [],
          warnings: [],
          pernas: [
            { ordem: 1, ready: true, missing: [], warnings: [], preview: '(FPL-PSCDV-VG\n-A139/L)' },
            { ordem: 2, ready: false, missing: ['EOBT UTC válido (campo 13)'], warnings: [], preview: null },
          ],
        },
      },
    });
    putMock.mockResolvedValue({
      success: true,
      data: {
        ...baseResponse(true),
        plan: { id: 1, status: 'rascunho', versao: 1, provider: 'MANUAL', protocolo_decea: null, external_id: null, payload: draft, updated_at: '2026-09-22T16:00:00Z' },
      },
    });

    render(<ControleVoosPlanoVooCard vooId={77} canEdit />);
    await waitFor(() => expect(screen.getByLabelText('Regra de voo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Regra de voo'), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText('Tipo de voo FPL'), { target: { value: 'G' } });
    fireEvent.change(screen.getByLabelText('Tipo ICAO da aeronave'), { target: { value: 'A139' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar prévia' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/controle-voos/voos/77/plano-voo/preview', expect.any(Object)));
    expect(await screen.findByText('Prévia da mensagem FPL')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(putMock).toHaveBeenCalledWith('/controle-voos/voos/77/plano-voo', expect.objectContaining({ status: 'rascunho' })));
  });

  it('mantém edição persistente desabilitada quando o schema 0509 ainda não foi aplicado', async () => {
    getMock.mockResolvedValue({ success: true, data: baseResponse(false) });
    render(<ControleVoosPlanoVooCard vooId={77} canEdit />);
    await waitFor(() => expect(screen.getByText(/schema governado/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled();
  });
});
