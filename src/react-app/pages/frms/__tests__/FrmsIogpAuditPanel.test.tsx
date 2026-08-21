import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FrmsIogpAuditPanel from '../components/FrmsIogpAuditPanel';

describe('FrmsIogpAuditPanel (IOGP Report 690-2)', () => {
  it('renders all 4 mandatory cards even when operational data is empty', () => {
    render(
      <FrmsIogpAuditPanel
        hasOperationalData={false}
        totalTripulantes={0}
        totalJornadas={0}
      />
    );

    // Section header & badges
    expect(screen.getByText(/FRMS — Monitoramento de Fadiga Operacional/i)).toBeInTheDocument();
    expect(screen.getByText(/IMPLEMENTAÇÃO EM ANDAMENTO/i)).toBeInTheDocument();
    expect(screen.getAllByText(/IOGP Report 690-2/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Aguardando dados operacionais SIGVOOS/i)).toBeInTheDocument();

    // CARD 1: Compliance / Limites
    expect(screen.getByText(/1\. Compliance \/ Limites \(IOGP 690-2\)/i)).toBeInTheDocument();
    expect(screen.getByText('10 h')).toBeInTheDocument();
    expect(screen.getByText('45 h')).toBeInTheDocument();
    expect(screen.getByText('120 h')).toBeInTheDocument();
    expect(screen.getByText('1.200 h')).toBeInTheDocument();
    expect(screen.getByText(/Teto IOGP de 14 h/i)).toBeInTheDocument();
    expect(screen.getByText(/Mínimo 10 h ou FDP anterior/i)).toBeInTheDocument();

    // CARD 2: Alerta Biológico
    expect(screen.getByText(/2\. Alerta Biológico & Circadiano/i)).toBeInTheDocument();
    expect(screen.getByText(/Sem dados operacionais suficientes para avaliação biológica/i)).toBeInTheDocument();
    expect(screen.getByText(/WOCL \(Janela Circadiana\)/i)).toBeInTheDocument();

    // CARD 3: Demanda Operacional IOGP 17C.1
    expect(screen.getByText(/3\. Demanda Operacional — IOGP 17C\.1/i)).toBeInTheDocument();
    expect(screen.getByText(/AGUARDANDO DADOS SIGVOOS/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Shuttles/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Trechos Curtos/i)).toBeInTheDocument();
    expect(screen.getByText(/Benchmark operacional/i)).toBeInTheDocument();

    // CARD 4: Ambiente IOGP 17C.1 (DECEA / REDEMET)
    expect(screen.getByText(/4\. Ambiente — IOGP 17C\.1 \(DECEA \/ REDEMET\)/i)).toBeInTheDocument();
    expect(screen.getByText(/METEOROLOGIA NÃO AVALIADA/i)).toBeInTheDocument();
    expect(screen.getByText(/Heat Index:/i)).toBeInTheDocument();
    expect(screen.getByText(/Wind Chill:/i)).toBeInTheDocument();
    expect(screen.getByText(/WBGT:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/DECEA \/ REDEMET/i).length).toBeGreaterThan(0);
  });

  it('never marks absent data as "Conforme"', () => {
    render(
      <FrmsIogpAuditPanel
        hasOperationalData={false}
        totalTripulantes={0}
        totalJornadas={0}
      />
    );

    // Ensure "CONFORME" or "Conforme" is not rendered when there is zero data
    const conformeElements = screen.queryAllByText(/^CONFORME$/i);
    expect(conformeElements.length).toBe(0);

    // "Não avaliado" must be rendered instead
    const naoAvaliadoElements = screen.getAllByText(/Não avaliado/i);
    expect(naoAvaliadoElements.length).toBeGreaterThan(0);
  });
});
