import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BombeirosMethodologyDemo from '../BombeirosMethodologyDemo';

const mutateMock = vi.fn();
vi.mock('@/react-app/hooks/useApi', () => ({
  useApiMutation: () => ({ mutate: mutateMock, loading: false, error: null }),
}));

const safeResult = {
  method_version: 'BOA_SYNTHETIC_EVIDENCE_TRIAGE_V1',
  status: 'HUMAN_REVIEW_REQUIRED',
  dispatch_permission: 'NOT_GRANTED',
  persisted: false,
  evidence: [{ factor: 'KSS_SUBJECTIVE_SLEEPINESS', state: 'PRESENT',
    description: 'KSS é subjetivo e exige interpretação.' }],
  actions: ['Revisão do responsável BOA.'],
  references: ['Protocolo local não validado.'],
  limitations: ['Não autoriza voo.'],
};
describe('BOA tender synthetic methodology panel', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    mutateMock.mockResolvedValue(safeResult);
  });

  it('always posts fixed synthetic cases only to isolated BOA namespace', async () => {
    render(<BombeirosMethodologyDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Executar análise sintética' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [endpoint, options] = mutateMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('/api/bombeiros/frms/simulacao/metodologia');
    const data = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(data.mode).toBe('SYNTHETIC');
    expect(data.mission_type).toBe('RESGATE');
    expect(data).not.toHaveProperty('empresa_id');
    expect(data).not.toHaveProperty('funcionario_id');
    expect(data).not.toHaveProperty('nome');
    expect(await screen.findByText(/Gravação:/)).toBeInTheDocument();
    expect(screen.getByText(/Revisão do responsável BOA/)).toBeInTheDocument();
  });

  it('switches to documented synthetic night activation without collecting personal values', async () => {
    render(<BombeirosMethodologyDemo />);
    fireEvent.click(screen.getByRole('button', { name: /Cenário B: acionamento noturno/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Executar análise sintética' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const raw = JSON.parse(String((mutateMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(raw).toMatchObject({
      duty_period: 'NOTURNO', standby_activation: true,
      pvt_60s_completed: false, self_declared_unfit: true,
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
