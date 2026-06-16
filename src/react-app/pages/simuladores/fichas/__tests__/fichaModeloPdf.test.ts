import { describe, expect, it } from 'vitest';

import {
  getFichaPdfTableHeaders,
  getFichaPdfTableLayout,
} from '@/react-app/services/pdf-ficha-client';
import { buildFichaModeloPdfData, buildFichaModeloPdfFileName } from '../fichaModeloPdf';

describe('fichaModeloPdf', () => {
  it('monta a ficha modelo em branco com manobras ordenadas', () => {
    const dados = buildFichaModeloPdfData(
      {
        id: 12,
        codigo: 'SK76-CHK',
        nome: 'Check Periódico SK76',
        tipo_sessao_nome: 'CHECK',
        modelo_aeronave: 'SK76',
      },
      [
        {
          ordem: 2,
          manobra_codigo: 'M02',
          manobra_nome: 'Pouso monomotor',
          manobra_descricao: 'Pouso monomotor completo',
          tripulante: 'B',
        },
        {
          ordem: 1,
          manobra_codigo: 'M01',
          manobra_nome: 'Pane hidráulica',
          manobra_descricao: 'Procedimento pane hidráulica',
          tripulante: 'A',
        },
      ],
      '/logo.png',
    );

    expect(dados.modoModelo).toBe(true);
    expect(dados.status).toBe('MODELO');
    expect(dados.tripulante_nome).toBe('');
    expect(dados.instrutor_nome).toBe('');
    expect(dados.simulador).toBe('SK76');
    expect(dados.logoUrl).toBe('/logo.png');
    expect(dados.manobras).toHaveLength(2);
    expect(dados.manobras[0].ordem).toBe(1);
    expect(dados.manobras[0].codigo).toBe('M01');
    expect(dados.manobras[0].resultado).toBeNull();
    expect(dados.manobras[0].tripulante).toBe('A');
    expect(dados.manobras[1].ordem).toBe(2);
    expect(dados.manobras[1].tripulante).toBe('B');
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
