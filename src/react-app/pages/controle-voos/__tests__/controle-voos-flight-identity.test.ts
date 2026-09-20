import { describe, expect, it } from 'vitest';
import {
  cleanAeronauticalPointName,
  flightOperationalDestinationLabel,
  flightOperationalRouteLabel,
} from '../data/controleVoosFlightIdentity';
import type { CvAeroporto, CvVoo } from '@/react-app/hooks/useControleVoos';

const aeroportos = [
  {
    id: 1,
    codigo: 'SBME',
    codigo_icao: 'SBME',
    codigo_iata: '',
    nome: 'MACAÉ / Macaé, RJ',
    cidade: 'Macaé',
    uf: 'RJ',
    tipo: 'aeroporto',
    descricao: null,
    ativo: 1,
    ordem: 1,
  },
  {
    id: 219,
    codigo: 'PGP1',
    codigo_icao: '9PGB',
    codigo_iata: '',
    nome: 'PLATAFORMA / Garoupa, BC',
    cidade: '',
    uf: '',
    tipo: 'plataforma',
    descricao: null,
    ativo: 1,
    ordem: 2,
  },
  {
    id: 300,
    codigo: 'PXX1',
    codigo_icao: '9PXX',
    codigo_iata: '',
    nome: 'PLATAFORMA / Unidade Dois',
    cidade: '',
    uf: '',
    tipo: 'plataforma',
    descricao: null,
    ativo: 1,
    ordem: 3,
  },
  {
    id: 2,
    codigo: 'SBRJ',
    codigo_icao: 'SBRJ',
    codigo_iata: 'SDU',
    nome: 'Santos Dumont',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    tipo: 'aeroporto',
    descricao: null,
    ativo: 1,
    ordem: 4,
  },
] satisfies CvAeroporto[];

function voo(overrides: Partial<CvVoo>): CvVoo {
  return {
    id: 1,
    empresa_id: 6,
    prefixo: 'PS-CDV',
    data_programacao: '2026-09-20',
    origem_id: 1,
    destino_id: 1,
    numero_voo: null,
    numero_db: null,
    contrato_id: null,
    tipo_voo_id: 1,
    natureza_voo_id: 1,
    aeronave_id: 1,
    horario_previsto_partida: '2026-09-20T10:00:00Z',
    horario_previsto_chegada: '2026-09-20T12:00:00Z',
    horario_real_partida: null,
    horario_real_chegada: null,
    status: 'planejado',
    observacoes: null,
    cancelado_motivo_id: null,
    alternado_destino_id: null,
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    ...overrides,
  };
}

describe('identidade operacional do voo', () => {
  it('remove prefixos genéricos do nome sem esconder o nome da unidade', () => {
    expect(cleanAeronauticalPointName('PLATAFORMA / Garoupa, BC')).toBe('Garoupa, BC');
    expect(cleanAeronauticalPointName('NAVIO / ODN 1')).toBe('ODN 1');
  });

  it('em ida e volta destaca a plataforma e omite o retorno repetido à base', () => {
    const flight = voo({
      rota_pontos: [aeroportos[0], aeroportos[1], aeroportos[0]],
      rota_codigos: ['SBME', '9PGB', 'SBME'],
    });
    expect(flightOperationalRouteLabel(flight, aeroportos)).toBe(
      'Macaé, RJ (SBME) → Garoupa, BC (PGP1 · 9PGB)',
    );
    expect(flightOperationalDestinationLabel(flight, aeroportos)).toBe(
      'Garoupa, BC (PGP1 · 9PGB)',
    );
  });

  it('mostra duas plataformas em ordem antes do retorno à base', () => {
    const flight = voo({
      rota_pontos: [aeroportos[0], aeroportos[1], aeroportos[2], aeroportos[0]],
      rota_codigos: ['SBME', '9PGB', '9PXX', 'SBME'],
    });
    expect(flightOperationalRouteLabel(flight, aeroportos)).toBe(
      'Macaé, RJ (SBME) → Garoupa, BC (PGP1 · 9PGB) → Unidade Dois (PXX1 · 9PXX)',
    );
  });

  it('em voo excepcional sem retorno mantém o destino final', () => {
    const flight = voo({
      destino_id: 2,
      rota_pontos: [aeroportos[0], aeroportos[1], aeroportos[3]],
      rota_codigos: ['SBME', '9PGB', 'SBRJ'],
    });
    expect(flightOperationalRouteLabel(flight, aeroportos)).toBe(
      'Macaé, RJ (SBME) → Garoupa, BC (PGP1 · 9PGB) → Santos Dumont (SBRJ)',
    );
  });
});
