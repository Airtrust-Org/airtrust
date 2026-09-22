import { describe, expect, it, vi } from 'vitest';
import { listEtapas } from '../../services/controle-voos/rdv-etapas';

describe('controle de voos — fallback de peso basico em etapas existentes', () => {
  it('usa o peso basico cadastrado da aeronave quando a etapa antiga ainda esta nula', async () => {
    const stage = {
      id: 10,
      empresa_id: 6,
      voo_id: 42,
      numero_etapa: 1,
      sigvoos_leg_number: null,
      origem_icao: 'SBME',
      destino_icao: '9PGB',
      horario_motor_ligado: null,
      horario_decolagem: null,
      horario_pouso: null,
      horario_motor_desligado: null,
      tempo_decolagem_pouso: null,
      tempo_total: null,
      tempo_navegacao: null,
      tempo_ifr: null,
      tempo_noturno: null,
      pousos_diurnos: null,
      pousos_noturnos: null,
      starts: null,
      pax: null,
      payload: null,
      combustivel_inicio: null,
      combustivel_fim: null,
      unidade_combustivel: null,
      peso_passageiros: null,
      peso_bagagem: null,
      peso_tripulacao: null,
      peso_vazio: null,
      peso_total: null,
      unidade_peso: 'LB',
      observacoes: null,
      origem_dados: 'MANUAL',
      created_by: null,
      updated_by: null,
      created_at: null,
      updated_at: null,
      deleted_at: null,
    };

    const all = vi.fn().mockResolvedValue({ results: [stage] });
    const first = vi.fn().mockResolvedValue({ peso_vazio: 4220, unidade_peso: 'KG' });
    const prepare = vi.fn((sql: string) => {
      if (sql.includes('FROM cv_voo_etapas')) {
        return { bind: vi.fn(() => ({ all })) };
      }
      if (sql.includes('JOIN aeronaves')) {
        return { bind: vi.fn(() => ({ first })) };
      }
      throw new Error(`SQL inesperado: ${sql}`);
    });
    const db = { prepare } as unknown as D1Database;

    const rows = await listEtapas(db, 6, 42);

    expect(rows).toHaveLength(1);
    expect(rows[0].peso_vazio).toBe(9303.507);
    expect(rows[0].unidade_peso).toBe('LB');
    expect(first).toHaveBeenCalledOnce();
  });

  it('preserva o peso ja registrado na etapa e nao consulta a aeronave', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        {
          id: 10,
          empresa_id: 6,
          voo_id: 42,
          numero_etapa: 1,
          peso_vazio: 9300,
          unidade_peso: 'LB',
        },
      ],
    });
    const prepare = vi.fn((_sql: string) => ({ bind: vi.fn(() => ({ all })) }));
    const db = { prepare } as unknown as D1Database;

    const rows = await listEtapas(db, 6, 42);

    expect(rows[0].peso_vazio).toBe(9300);
    expect(rows[0].unidade_peso).toBe('LB');
    expect(prepare).toHaveBeenCalledOnce();
  });
});
