import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { FrmsRegulatoryCompliancePanel } from '../components/FrmsRegulatoryCompliancePanel';
import { describeRegulatoryCompliance } from '../frmsRegulatoryCompliance';

const item = (overrides: Partial<FrmsOperationalSnapshotItem>): FrmsOperationalSnapshotItem => ({
  data_operacional: '2026-11-03', funcionario_id: 7, alertas: [], motivos_principais: [],
  estado_operacional: 'NORMAL', acao_recomendada_texto: '',
  ...overrides,
} as unknown as FrmsOperationalSnapshotItem);

describe('Dimensão A — conformidade legal separada do risco de fadiga', () => {
  it('não renderiza nada quando a API ainda não envia o resultado regulatório', () => {
    const { container } = render(<FrmsRegulatoryCompliancePanel item={item({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('conformidade explicita que cumprir limites não prova ausência de fadiga', () => {
    render(<FrmsRegulatoryCompliancePanel item={item({ compliance_status: 'COMPLIANT' })} />);
    expect(screen.getByText('Dentro dos limites verificados')).toBeInTheDocument();
    expect(screen.getByText(/não comprova ausência de fadiga/)).toBeInTheDocument();
  });

  it('violação lista a mensagem e o dispositivo legal', () => {
    render(<FrmsRegulatoryCompliancePanel item={item({
      compliance_status: 'VIOLATION',
      violacoes_normativas: [{
        code: 'LAW_HELI_FLIGHT_MONTH_90H', source: 'LAW', reference: 'Lei 13.475/2017 art. 33 IV',
        actualMin: 5460, limitMin: 5400, message: 'Horas de voo no mês calendário: 5460 min > 5400 min',
      }],
    })} />);
    expect(screen.getByText('Limite legal ou contratual ultrapassado')).toBeInTheDocument();
    expect(screen.getByText('(Lei 13.475/2017 art. 33 IV)')).toBeInTheDocument();
  });

  it('dado ausente aparece como não verificável, nunca como conforme', () => {
    const view = describeRegulatoryCompliance(item({
      compliance_status: 'UNKNOWN',
      compliance_unknown_reasons: ['ROLLING_REGULATORY_EVIDENCE_MISSING', 'CODIGO_NOVO_DESCONHECIDO'],
    }));
    expect(view?.tone).toBe('NAO_AVALIAVEL');
    expect(view?.summary).toMatch(/não equivale a conformidade/);
    expect(view?.unknown).toEqual([
      'Acumulados de horas de voo (dia, mês, 28/365 dias) não calculados para a data',
      'Dado de origem incompleto para verificar limite legal',
    ]);
  });

  it('achado do art. 42 pendente de validação aparece mesmo com status conforme', () => {
    render(<FrmsRegulatoryCompliancePanel item={item({
      compliance_status: 'COMPLIANT',
      compliance_pending_validation: [{
        code: 'LAW_ART42_CONSECUTIVE', source: 'LAW', reference: 'Lei 13.475/2017 art. 42 caput e §4º',
        actual: 3, limit: 2, message: '3 madrugadas consecutivas de trabalho > limite de 2',
      }],
    })} />);
    expect(screen.getByText(/aguardando validação jurídica/)).toBeInTheDocument();
    expect(screen.getByText(/3 madrugadas consecutivas/)).toBeInTheDocument();
  });
});
