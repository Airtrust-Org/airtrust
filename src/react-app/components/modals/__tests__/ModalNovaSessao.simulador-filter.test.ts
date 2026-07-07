/**
 * Testa a lógica de filtro de simuladores por modelo de aeronave.
 *
 * Cobre:
 * 1. normalizarModelo (trim + uppercase)
 * 2. Filtro com modelo_aeronave (canônico)
 * 3. Filtro com aeronave_codigo (FK)
 * 4. Fallback legado modelo/tipo
 * 5. AW139 com vínculo SOFT_DELETED (aeronave_codigo="AW139", modelo_aeronave=null)
 * 6. SK76 legado (aeronave_codigo=NULL, funciona por modelo/tipo)
 * 7. Simulador novo com tipo genérico (tipo="FFS", modelo_aeronave="AW139")
 */

import { describe, expect, it } from 'vitest';
import { normalizarModelo } from '../ModalNovaSessao';

// --- Dados de teste que replicam cenários de produção ---

interface SimuladorTeste {
  id: number;
  nome: string;
  modelo: string;
  modelo_aeronave?: string | null;
  tipo?: string;
  aeronave_codigo?: string | null;
}

/** Simuladores que replicam os dados reais de produção (empresa 6) */
const SIMULADORES_PRODUCAO: SimuladorTeste[] = [
  {
    id: 11,
    nome: 'FFS-A139-006',
    modelo: 'AW139',
    tipo: 'AW139',
    aeronave_codigo: 'AW139',
    modelo_aeronave: 'AW139', // após correção do backend via JOIN
  },
  {
    id: 16,
    nome: 'FFS-SK76-007',
    modelo: 'SK76',
    tipo: 'SK76',
    aeronave_codigo: null, // SEM vínculo no banco
    modelo_aeronave: null, // JOIN não encontra correspondência
  },
];

/** Simulador novo: tipo genérico, mas modelo_aeronave preenchido */
const SIMULADOR_NOVO: SimuladorTeste = {
  id: 99,
  nome: 'FFS-NOVO-001',
  modelo: 'FFS-Nível-D',
  tipo: 'FFS',
  aeronave_codigo: 'AW139',
  modelo_aeronave: 'AW139',
};

// --- Filtro (mesma lógica do componente) ---

function filtrarSimuladores(
  simuladores: SimuladorTeste[],
  modeloSelecionado: string,
): SimuladorTeste[] {
  const modeloNorm = normalizarModelo(modeloSelecionado);
  return simuladores.filter(
    (s) =>
      normalizarModelo(s.modelo_aeronave) === modeloNorm ||
      normalizarModelo(s.aeronave_codigo) === modeloNorm ||
      // Fallback legado — REMOVER após DML de saneamento de vínculos
      normalizarModelo(s.modelo) === modeloNorm ||
      normalizarModelo(s.tipo) === modeloNorm,
  );
}

// --- Testes ---

describe('normalizarModelo', () => {
  it('trim + uppercase', () => {
    expect(normalizarModelo(' aw139 ')).toBe('AW139');
  });

  it('null → string vazia', () => {
    expect(normalizarModelo(null)).toBe('');
  });

  it('undefined → string vazia', () => {
    expect(normalizarModelo(undefined)).toBe('');
  });

  it('já normalizado é idempotente', () => {
    expect(normalizarModelo('AW139')).toBe('AW139');
  });

  it('minúsculo → maiúsculo', () => {
    expect(normalizarModelo('sk76')).toBe('SK76');
  });
});

describe('filtrarSimuladores — cenários de produção', () => {
  it('AW139 aparece por modelo_aeronave (canônico)', () => {
    const result = filtrarSimuladores(SIMULADORES_PRODUCAO, 'AW139');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(11);
    expect(result[0].nome).toBe('FFS-A139-006');
  });

  it('AW139 aparece por aeronave_codigo (FK)', () => {
    // Simula cenário onde modelo_aeronave é null mas aeronave_codigo existe
    const sims = [
      {
        ...SIMULADORES_PRODUCAO[0],
        modelo_aeronave: null, // JOIN falhou (ex: modelo soft-deleted)
        aeronave_codigo: 'AW139', // mas FK ainda existe
      },
      SIMULADORES_PRODUCAO[1],
    ];
    const result = filtrarSimuladores(sims, 'AW139');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(11);
  });

  it('AW139 aparece por fallback legado (modelo/tipo) quando vínculo quebrado', () => {
    // Cenário atual de produção: aeronave_codigo="AW139" mas não retornado pelo backend antigo
    const sims = [
      {
        ...SIMULADORES_PRODUCAO[0],
        modelo_aeronave: undefined,
        aeronave_codigo: undefined, // backend antigo não retornava
      },
      SIMULADORES_PRODUCAO[1],
    ];
    const result = filtrarSimuladores(sims, 'AW139');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(11);
  });

  it('SK76 aparece por fallback legado (aeronave_codigo=NULL, mas modelo="SK76")', () => {
    // Cenário real de produção: SK76 não tem vínculo, funciona por modelo/tipo
    const result = filtrarSimuladores(SIMULADORES_PRODUCAO, 'SK76');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(16);
    expect(result[0].nome).toBe('FFS-SK76-007');
  });

  it('SK76 NÃO aparece se modelo e tipo não baterem (sem fallback)', () => {
    // Se um simulador SK76 tiver modelo e tipo diferentes, não deve aparecer
    const sims = [
      {
        id: 16,
        nome: 'FFS-SK76-007',
        modelo: 'XYZ',
        tipo: 'ABC',
        aeronave_codigo: null,
        modelo_aeronave: null,
      },
    ];
    const result = filtrarSimuladores(sims, 'SK76');
    expect(result).toHaveLength(0);
  });

  it('simulador novo com tipo="FFS" aparece por modelo_aeronave="AW139"', () => {
    const sims = [SIMULADOR_NOVO, SIMULADORES_PRODUCAO[1]];
    const result = filtrarSimuladores(sims, 'AW139');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(99);
    // O tipo é "FFS" (não "AW139"), mas modelo_aeronave preenche a lacuna
    expect(result[0].tipo).toBe('FFS');
  });

  it('case insensitive: "aw139" minúsculo encontra AW139', () => {
    const result = filtrarSimuladores(SIMULADORES_PRODUCAO, 'aw139');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(11);
  });

  it('case insensitive: " Aw139 " com espaços encontra AW139', () => {
    const result = filtrarSimuladores(SIMULADORES_PRODUCAO, ' Aw139 ');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(11);
  });

  it('modelo não existente retorna array vazio', () => {
    const result = filtrarSimuladores(SIMULADORES_PRODUCAO, 'H145');
    expect(result).toHaveLength(0);
  });

  it('simuladores vazios retorna array vazio sem erro', () => {
    const result = filtrarSimuladores([], 'AW139');
    expect(result).toHaveLength(0);
  });
});
