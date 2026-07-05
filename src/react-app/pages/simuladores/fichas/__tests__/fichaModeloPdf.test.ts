import { describe, expect, it } from 'vitest';

import {
  getFichaPdfTableHeaders,
  getFichaPdfTableLayout,
} from '@/react-app/services/pdf-ficha-client';
import { NOTECHS_ORDEM_BASE } from '../notechs';
import {
  buildFichaModeloPdfData,
  buildFichaModeloPdfFileName,
  FICHA_MODELO_TECNICAS_PREVIEW_LIMIT as FICHA_MODELO_TECNICAS_PREVIEW_LIMIT_LOCAL,
} from '../fichaModeloPdf';

describe('fichaModeloPdf', () => {
  it('monta a ficha modelo em branco com preview de 18 técnicas + 15 NOTECHS', () => {
    const dados = buildFichaModeloPdfData(
      {
        id: 12,
        codigo: 'SK76-CHK',
        nome: 'Check Periódico SK76',
        tipo_sessao_nome: 'CHECK',
        modelo_aeronave: 'SK76',
      },
      Array.from({ length: 22 }, (_, index) => ({
        ordem: 22 - index,
        manobra_codigo: `M${String(22 - index).padStart(2, '0')}`,
        manobra_nome: `Manobra ${22 - index}`,
        manobra_descricao: `Descricao ${22 - index}`,
        tripulante: (22 - index) % 2 === 0 ? 'B' : 'A',
      })),
      '/logo.png',
    );

    expect(FICHA_MODELO_TECNICAS_PREVIEW_LIMIT_LOCAL).toBe(18);
    expect(dados.modoModelo).toBe(true);
    expect(dados.status).toBe('MODELO');
    expect(dados.tripulante_nome).toBe('');
    expect(dados.instrutor_nome).toBe('');
    expect(dados.simulador).toBe('SK76');
    expect(dados.logoUrl).toBe('/logo.png');
    expect(dados.manobras).toHaveLength(33);
    expect(dados.manobras[0].ordem).toBe(1);
    expect(dados.manobras[0].codigo).toBe('M01');
    expect(dados.manobras[0].resultado).toBeNull();
    expect(dados.manobras[0].tripulante).toBe('A');
    expect(dados.manobras[17].ordem).toBe(18);
    expect(dados.manobras[17].codigo).toBe('M18');
    expect(dados.manobras[17].tripulante).toBe('B');
    expect(dados.manobras[18].ordem).toBe(NOTECHS_ORDEM_BASE);
    expect(dados.manobras[18].codigo).toBe('NOTECHS-01');
    expect(dados.manobras.at(-1)?.ordem).toBe(1015);
    expect(dados.manobras.at(-1)?.codigo).toBe('NOTECHS-15');
  });

  it('usa observacoes do vínculo modelo↔manobra como override de nome/descrição quando presente', () => {
    const dados = buildFichaModeloPdfData(
      { id: 1, codigo: 'A139-S-02/02', nome: 'Semestral 02/02: LOFT e Check de IFR' },
      [
        {
          ordem: 1,
          manobra_codigo: 'A139-CKL-01',
          manobra_nome: 'Normal checklist — preparação noturna',
          manobra_descricao: 'Normal checklist — preparação noturna',
          observacoes: 'Normal checklist — preparação IFR semestral',
          tripulante: 'AB',
        },
        {
          ordem: 2,
          manobra_codigo: 'A139-EST-01',
          manobra_nome: 'Estacionamento e corte pós-voo noturno',
          manobra_descricao: 'Estacionamento e corte pós-voo noturno',
          observacoes: null,
          tripulante: 'AB',
        },
      ],
    );

    expect(dados.manobras[0].nome).toBe('Normal checklist — preparação IFR semestral');
    expect(dados.manobras[0].descricao).toBe('Normal checklist — preparação IFR semestral');
    expect(dados.manobras[0].observacoes).toBe('');
    expect(dados.manobras[1].nome).toBe('Estacionamento e corte pós-voo noturno');
  });

  it('gera nome de arquivo estável e sanitizado', () => {
    const fileName = buildFichaModeloPdfFileName({
      id: 99,
      codigo: 'AW139/REC',
      nome: 'Recorrente Avançado',
    });

    expect(fileName).toBe('FICHA-MODELO-AW139-REC-RECORRENTE-AVANCADO.pdf');
  });

  it('reserva coluna Trip. no layout impresso sem invadir a nota', () => {
    const layout = getFichaPdfTableLayout(15);
    const headers = getFichaPdfTableHeaders();

    expect(headers).toContain('TRIP.');
    expect(layout.positions.tripulante).toBeGreaterThan(layout.positions.codigo);
    expect(layout.tripulanteWidth).toBeGreaterThan(0);
    expect(layout.positions.nota).toBeGreaterThan(layout.positions.obs);
  });
});
