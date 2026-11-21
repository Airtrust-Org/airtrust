import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import BombeirosQaReadinessPanel from '../BombeirosQaReadinessPanel';

const useApiMock = vi.fn();
const refetch = vi.fn();
vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));
const snapshot = {
  success: true,
  data: {
    status: 'QA_PRECONDITIONS_INCOMPLETE',
    accounts: {
      member_accounts: 9, crew_links: 7,
      manager_roles: 1, admin_roles: 1,
    },
    intended_user_count: 130,
    cohort_130_structurally_present: false,
    firefighter_profile_configuration_resolves: false,
    documentary_review_binding_matches: false,
    synthetic_tenant_write_gate_matches: false,
    official_boa_source: 'NOT_VERIFIED',
    scientific_validation: 'NOT_ATTESTED',
    privacy_authorization: 'NOT_ATTESTED',
    interactive_qa_login: 'NOT_TESTED',
    real_d1_checkin: 'NOT_TESTED',
    production_release: 'NOT_AUTHORIZED',
    operational_poc_accepted: false,
  },
  meta: { write_performed: false, evidence: 'READ_ONLY_CURRENT_MEMBERSHIP_SNAPSHOT' },
};
describe('BOA operational QA readiness panel', () => {
  beforeEach(() => {
    refetch.mockReset();
    useApiMock.mockReset().mockReturnValue({
      data: snapshot, loading: false, error: null, refetch,
    });
  });
  it('reads the authenticated tenant scope and does not imply approval or import', () => {
    render(<BombeirosQaReadinessPanel />);
    expect(useApiMock).toHaveBeenCalledWith('/api/bombeiros/frms/qa/prontidao',
      expect.objectContaining({ requireAuth: true, bypassGetCache: true }));
    expect(screen.getByText(/Pré-requisitos técnicos incompletos/)).toBeInTheDocument();
    expect(screen.getByText(/Contas com vínculo à empresa: 9 \/ 130/)).toBeInTheDocument();
    expect(screen.getByText(/Validação científica e autorização LGPD: não atestadas/)).toBeInTheDocument();
    expect(screen.getByText(/Vínculo de revisão e documento revisado: ausente/)).toBeInTheDocument();
    expect(screen.getByText(/Esta consulta não concede permissão de voo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Conferir novamente'}));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('does not replace API failure with fabricated counts', () => {
    useApiMock.mockReturnValueOnce({
      data: null, error: 'Não autorizado', loading: false, refetch,
    });
    render(<BombeirosQaReadinessPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível consultar/);
    expect(screen.queryByText(/Contas com vínculo à empresa/)).not.toBeInTheDocument();
  });
  it('keeps even fully configured QA explicitly unapproved', () => {
    useApiMock.mockReturnValueOnce({
      data: { ...snapshot, data: {
        ...snapshot.data,
        status: 'CONFIGURATION_CHECKS_PASSED_NOT_AUTHORIZED',
        accounts: {member_accounts:130,crew_links:125,manager_roles:4,admin_roles:1},
        cohort_130_structurally_present: true,
        firefighter_profile_configuration_resolves: true,
        documentary_review_binding_matches: true,
        synthetic_tenant_write_gate_matches: true,
      } },
      error:null,loading:false,refetch,
    });
    render(<BombeirosQaReadinessPanel />);
    expect(screen.getByText(/Configuração aparente conferida; PoC não autorizada/)).toBeInTheDocument();
    expect(screen.getByText(/Fonte oficial de escalas BOA: não verificada/)).toBeInTheDocument();
  });
});
