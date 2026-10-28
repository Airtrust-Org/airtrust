import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ScormEditionPanel from './ScormEditionPanel';

const SHA = 'da0a36e661a1b592c47867e162841e3fc91b56d09e1e2feb7ea4c39f3c50f0ae';
const OLD = 'e'.repeat(64);

const m = vi.hoisted(() => ({
  preflight: { data: undefined as unknown },
  approve: vi.fn(), activate: vi.fn(), rollback: vi.fn(), importEvidence: vi.fn(), conformance: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/react-app/components/Button', () => ({
  default: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@/react-app/hooks/useLms', () => ({
  useScormActivationPreflight: () => m.preflight,
  useApproveFormativePackage: () => ({ mutateAsync: m.approve, isPending: false }),
  useActivateScormPackageVersion: () => ({ mutateAsync: m.activate, isPending: false }),
  useRollbackScormPackage: () => ({ mutateAsync: m.rollback, isPending: false }),
  useImportFormativeAttestation: () => ({ mutateAsync: m.importEvidence, isPending: false }),
  useRunScormPackageConformance: () => ({ mutateAsync: m.conformance, isPending: false }),
}));

const candidate = { packageId: 'pkg-new', status: 'VALIDATED', packageSha256: SHA,
  certificationProfile: 'FORMATIVE_NO_EXAM_V1' as const, assessmentPolicy: 'FORMATIVE' as const,
  structural: { status: 'PASS' } };

function preflight(over: Record<string, unknown> = {}, failing: string[] = []) {
  const ids = ['COURSE_IDENTITY', 'CANDIDATE_VALIDATED', 'NOT_ALREADY_ACTIVE', 'PROFILE_ELIGIBLE', 'JOURNEY_EVIDENCE', 'ADMIN_APPROVAL'];
  return { data: {
    packageId: 'pkg-new', packageSha256: SHA, status: 'VALIDATED',
    course: { id: 26, titulo: 'MGM', currentPolicy: 'SCORED', masteryScore: 70 },
    active: { packageId: 'pkg-old', packageSha256: OLD, policy: 'SCORED' },
    checks: ids.map((id) => ({ id, ok: !failing.includes(id), detail: 'x' })),
    impact: { terminalToFreeze: 18, inProgress: 3, notStarted: 3 },
    incomingPolicy: 'FORMATIVE', canActivate: failing.length === 0, ...over,
  } };
}

describe('ScormEditionPanel — formative edition workflow', () => {
  beforeEach(() => { Object.values(m).forEach((fn) => typeof fn === 'function' && 'mockReset' in fn && fn.mockReset()); });

  it('without evidence it offers only the signed-evidence import and cannot activate', () => {
    m.preflight = preflight({}, ['JOURNEY_EVIDENCE', 'ADMIN_APPROVAL']);
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin />);
    expect(screen.getByText(/Importar evidência assinada/)).toBeTruthy();
    expect(screen.queryByText('Aprovar este pacote')).toBeNull();
    expect((screen.getByText('Ativar edição') as HTMLButtonElement).disabled).toBe(true);
  });

  it('approval needs the typed SHA prefix and a real justification, and sends the exact SHA', async () => {
    m.preflight = preflight({}, ['ADMIN_APPROVAL']);
    m.approve.mockResolvedValue({});
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin />);
    const approve = screen.getByText('Aprovar este pacote') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    await userEvent.type(screen.getByPlaceholderText(/Justificativa/), 'Revisão editorial conferida');
    expect(approve.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Confirmação do SHA-256'), SHA.slice(0, 12));
    expect(approve.disabled).toBe(false);
    await userEvent.click(approve);
    expect(m.approve).toHaveBeenCalledWith({ packageId: 'pkg-new', packageSha256: SHA, note: 'Revisão editorial conferida', editorialReviewRef: null });
  });

  it('non-admins cannot approve', () => {
    m.preflight = preflight({}, ['ADMIN_APPROVAL']);
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin={false} />);
    expect((screen.getByText('Aprovar este pacote') as HTMLButtonElement).disabled).toBe(true);
  });

  it('activation requires SHA confirmation and acknowledging in-progress learners, then sends both', async () => {
    m.preflight = preflight();
    m.activate.mockResolvedValue({});
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin />);
    expect(screen.getByText(/ativação muda a política do curso/i)).toBeTruthy();
    expect(screen.getByText(/ciclos já encerrados \(18\)/)).toBeTruthy();
    const button = screen.getByText('Ativar edição') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Confirmação do SHA-256'), SHA.slice(0, 12));
    expect(button.disabled).toBe(true); // still needs the in-progress acknowledgement
    await userEvent.click(screen.getByRole('checkbox'));
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    expect(m.activate).toHaveBeenCalledWith({
      packageId: 'pkg-new', confirm: { cursoId: 26, packageSha256: SHA, acknowledgeInProgress: 3 },
    });
  });

  it('a wrong SHA prefix keeps activation locked', async () => {
    m.preflight = preflight({ impact: { terminalToFreeze: 1, inProgress: 0, notStarted: 0 } });
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin />);
    await userEvent.type(screen.getByLabelText('Confirmação do SHA-256'), 'ffffffffffff');
    expect((screen.getByText('Ativar edição') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the active edition offers rollback to the previous one only after typing its SHA prefix', async () => {
    m.preflight = { data: undefined };
    m.rollback.mockResolvedValue({});
    const active = { packageId: 'pkg-new', status: 'ACTIVE', packageSha256: SHA, assessmentPolicy: 'FORMATIVE' as const, previousActivePackageId: 'pkg-old' };
    const previous = { packageId: 'pkg-old', status: 'SUPERSEDED', packageSha256: OLD };
    render(<ScormEditionPanel cursoId={26} versions={[active, previous]} isAdmin />);
    const button = screen.getByText('Restaurar edição anterior') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Confirmação do SHA-256'), OLD.slice(0, 12));
    await userEvent.click(button);
    expect(m.rollback).toHaveBeenCalledWith('pkg-old');
  });
});
