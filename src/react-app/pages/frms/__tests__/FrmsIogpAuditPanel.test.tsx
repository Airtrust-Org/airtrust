import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FrmsIogpAuditPanel from '../components/FrmsIogpAuditPanel';

describe('FrmsIogpAuditPanel (IOGP Report 690-2)', () => {
  it('A & F. renders all 4 mandatory cards and dashes (—) when operational data is null / empty', () => {
    render(
      <FrmsIogpAuditPanel
        hasOperationalData={false}
        totalTripulantes={0}
        totalJornadas={0}
        maxHvDiaMin={null}
        maxHv7dMin={null}
        maxHv28dMin={null}
        maxHv365dMin={null}
        avgEffectivenessPct={null}
        totalSetores={null}
        temperatura={null}
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

    // Dashes present for missing data
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(5);
  });

  it('B & C. never turns null into 0 h and never marks absent data as "Conforme"', () => {
    render(
      <FrmsIogpAuditPanel
        hasOperationalData={false}
        totalTripulantes={0}
        totalJornadas={0}
        maxHvDiaMin={null}
        maxHv7dMin={null}
        maxHv28dMin={null}
        maxHv365dMin={null}
      />
    );

    // Ensure "CONFORME" or "Conforme" is not rendered when there is zero data
    const conformeElements = screen.queryAllByText(/^CONFORME$/i);
    expect(conformeElements.length).toBe(0);

    // Ensure "0.0 h" or "0 h" is not fabricated for null cumulative hours
    expect(screen.queryByText(/Real: 0/i)).not.toBeInTheDocument();

    // "Não avaliado" must be rendered instead
    const naoAvaliadoElements = screen.getAllByText(/Não avaliado/i);
    expect(naoAvaliadoElements.length).toBeGreaterThan(0);
  });

  it('D & E. correctly renders and evaluates real operational data while keeping IOGP limits visible', () => {
    render(
      <FrmsIogpAuditPanel
        hasOperationalData={true}
        totalTripulantes={5}
        totalJornadas={12}
        maxHvDiaMin={360} // 6.0 h (under 10h -> CONFORME)
        maxHv7dMin={2400} // 40.0 h (>= 38.25h -> ATENÇÃO)
        maxHv28dMin={6000} // 100.0 h (under 120h -> CONFORME)
        maxHv365dMin={54000} // 900.0 h (under 1200h -> CONFORME)
        avgEffectivenessPct={88.5}
        effectivenessNivel="ATENÇÃO"
        totalSetores={8}
        totalPousos={12}
        temperatura={26}
        pontoOrvalho={21}
        umidade={74}
      />
    );

    // Limits remain visible
    expect(screen.getByText('10 h')).toBeInTheDocument();
    expect(screen.getByText('45 h')).toBeInTheDocument();
    expect(screen.getByText('120 h')).toBeInTheDocument();
    expect(screen.getByText('1.200 h')).toBeInTheDocument();

    // Real values appear
    expect(screen.getByText('5 tripulantes · 12 jornadas')).toBeInTheDocument();
    expect(screen.getByText('Real: 6.0 h')).toBeInTheDocument();
    expect(screen.getByText('Real: 40.0 h')).toBeInTheDocument();
    expect(screen.getByText('Real: 100.0 h')).toBeInTheDocument();
    expect(screen.getByText('Real: 900.0 h')).toBeInTheDocument();
    expect(screen.getByText('88.5%')).toBeInTheDocument();
    expect(screen.getByText('26°C')).toBeInTheDocument();
    expect(screen.getByText('74%')).toBeInTheDocument();

    // Threshold evaluation matches
    const conformeElements = screen.getAllByText(/^CONFORME$/i);
    expect(conformeElements.length).toBeGreaterThan(0);
    const atencaoElements = screen.getAllByText(/^ATENÇÃO$/i);
    expect(atencaoElements.length).toBeGreaterThan(0);
  });
});
