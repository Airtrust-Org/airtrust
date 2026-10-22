import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BombeirosDutySourcePreflight from '../BombeirosDutySourcePreflight';

const mutate = vi.fn();
vi.mock('@/react-app/hooks/useApi', () => ({
  useApiMutation: () => ({ mutate, loading: false, error: null }),
}));

describe('BOA QA source-only preflight admin widget', () => {
  beforeEach(() => mutate.mockReset());

  it('displays QA-only caveats and does not upload before an explicit action', () => {
    render(<BombeirosDutySourcePreflight />);
    expect(screen.getByText(/não grava no banco/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verificar exportação sem importar/ })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('submits an explicitly chosen fictitious file to the authenticated preflight only', async () => {
    mutate.mockResolvedValueOnce({
      success: true, data: {
        schema: 'BOA_OPERATIONAL_SOURCE_BATCH_V1',
        status: 'SCHEMA_VALID_SOURCE_UNVERIFIED',
        input_sha256: 'a'.repeat(64),
        record_count: 1,
        candidate_totals_ms: { planned: 28800000, actual: 28800000,
          standby: null, activations: null },
        missing_sources_count: { STANDBY_STATUS_UNKNOWN: 1 },
        tenant_identity_link: 'NOT_RESOLVED',
        source_approval: 'NOT_EVALUATED',
        scientific_risk_score: null,
        operational_exposure_denominator_ms: null,
        stored: false,
        dispatch_permission: 'NOT_GRANTED',
      },
      meta: { synthetic_only: true, write_performed: false },
    });
    render(<BombeirosDutySourcePreflight />);
    const content = '{"schema":"BOA_OPERATIONAL_SOURCE_BATCH_V1"}';
    const file = new File([content], 'qa.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => content });
    fireEvent.change(screen.getByLabelText(/Arquivo de origem fictícia/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar exportação sem importar/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
    const [url, options] = mutate.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/bombeiros/frms/fontes-operacionais/validar-qa');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(content);
    expect(String(options.body)).not.toMatch(/token|empresa_id|password/);
    expect(await screen.findByText(/Estrutura sintética verificada/)).toBeInTheDocument();
    expect(screen.getByText(/Origem BOA NÃO aprovada/)).toBeInTheDocument();
    expect(screen.getByText(/não realizada/)).toBeInTheDocument();
  });

  it('never submits an oversized JSON file', async () => {
    render(<BombeirosDutySourcePreflight />);
    const file = new File([' '.repeat(262145)], 'too-large.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByLabelText(/Arquivo de origem fictícia/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar exportação sem importar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/máximo 256 KiB/);
    expect(mutate).not.toHaveBeenCalled();
  });
});
