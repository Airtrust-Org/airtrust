import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ScormEditionPanel from './ScormEditionPanel';

const SHA = 'da0a36e661a1b592c47867e162841e3fc91b56d09e1e2feb7ea4c39f3c50f0ae';
const OLD = 'e'.repeat(64);

const m = vi.hoisted(() => ({
  preflight: { data: undefined as unknown }, uploadZip: vi.fn(),
  approve: vi.fn(), activate: vi.fn(), directReplace: vi.fn(), rollback: vi.fn(), importEvidence: vi.fn(), conformance: vi.fn(), refetch: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('./lmsScormDirectUploadPolicy', () => ({ allowDirectScormUpload: (isAdmin: boolean) => isAdmin }));
vi.mock('./lmsContentUpload', () => ({ uploadScormInactiveProductionCandidate: m.uploadZip }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/react-app/components/Button', () => ({
  default: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@/react-app/hooks/useLms', () => ({
  lmsKeys: { curso: (id: number) => ['lms', 'curso', id] },
  useScormActivationPreflight: () => m.preflight,
  useApproveFormativePackage: () => ({ mutateAsync: m.approve, isPending: false }),
  useActivateScormPackageVersion: () => ({ mutateAsync: m.activate, isPending: false }),
  useReplaceValidatedScormDirect: () => ({ mutateAsync: m.directReplace, isPending: false }),
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

  it('formative editions do not expose signed homologation or a second activation ceremony', () => {
    m.preflight = preflight({}, ['JOURNEY_EVIDENCE', 'ADMIN_APPROVAL']);
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin />);
    expect(screen.queryByText(/Importar evidência assinada/)).toBeNull();
    expect(screen.queryByText('Aprovar este pacote')).toBeNull();
    expect(screen.queryByText('Substituir conteúdo do curso')).toBeNull();
    expect(screen.getByRole('button', { name: 'Substituir esta edição já enviada' })).toBeTruthy();
  });

  it('preserves conformance when a scored candidate replaces an active formative edition', async () => {
    m.preflight = preflight({
      incomingPolicy: 'SCORED',
      course: { id: 26, titulo: 'MGM', currentPolicy: 'FORMATIVE', masteryScore: 70 },
      active: { packageId: 'pkg-old', packageSha256: OLD, policy: 'FORMATIVE' },
      impact: { terminalToFreeze: 18, inProgress: 0, notStarted: 3 },
      canActivate: true,
    });
    m.conformance.mockResolvedValue({});
    const scoredCandidate = {
      ...candidate, certificationProfile: null, assessmentPolicy: 'SCORED' as const,
      publishable: false, runtime: { status: 'PENDING' },
    };
    render(<ScormEditionPanel cursoId={26} versions={[scoredCandidate]} isAdmin />);
    const run = screen.getByRole('button', { name: 'Executar conformance' });
    await userEvent.click(run);
    expect(m.conformance).toHaveBeenCalledWith('pkg-new');
    expect((screen.getByRole('button', { name: 'Substituir conteúdo do curso' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.queryByText('Pronto para substituir o conteúdo do curso.')).toBeNull();
  });

  it('non-admins cannot substitute an already validated formative edition', () => {
    m.preflight = preflight({}, ['ADMIN_APPROVAL']);
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin={false} />);
    expect((screen.getByRole('button', { name: 'Substituir esta edição já enviada' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a recoverable preflight error instead of suggesting another ZIP upload', async () => {
    m.preflight = { data: undefined, isError: true, refetch: m.refetch };
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin />);
    expect(screen.getByRole('alert').textContent).toContain('A edição atual não foi alterada');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(m.refetch).toHaveBeenCalledTimes(1);
  });

  it('one click replaces a previously uploaded formative edition without another confirmation', async () => {
    m.preflight = preflight({}, ['JOURNEY_EVIDENCE', 'ADMIN_APPROVAL']);
    m.directReplace.mockResolvedValue({ status: 'ACTIVE' });
    const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('unexpected extra prompt'); });
    try {
      render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin />);
      await userEvent.click(screen.getByRole('button', { name: 'Substituir esta edição já enviada' }));
      await waitFor(() => expect(m.directReplace).toHaveBeenCalledWith({
        packageId: 'pkg-new',
        confirm: { cursoId: 26, packageSha256: SHA, acknowledgeInProgress: 3 },
      }));
      expect(confirm).not.toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });

  it('disables the replacement for non-admin users', () => {
    m.preflight = preflight({}, ['JOURNEY_EVIDENCE', 'ADMIN_APPROVAL']);
    render(<ScormEditionPanel cursoId={26} versions={[candidate]} isAdmin={false} />);
    expect((screen.getByRole('button', { name: 'Substituir esta edição já enviada' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('selecting a formative ZIP in course details uploads and replaces in one operation', async () => {
    m.preflight = { data: undefined };
    m.uploadZip.mockResolvedValue({ status: 'ACTIVE', packageId: 'p1', packageSha256: SHA });
    render(<ScormEditionPanel cursoId={55} versions={[]} isAdmin />);
    await userEvent.upload(
      screen.getByLabelText('Selecionar ZIP formativo e substituir'),
      new File(['zip'], 'aw139.zip', { type: 'application/zip' }),
    );
    await waitFor(() => expect(m.uploadZip).toHaveBeenCalledWith(expect.objectContaining({
      cursoId: 55, replaceImmediately: true,
    })));
    expect(m.uploadZip.mock.calls[0][0].file.name).toBe('aw139.zip');
  });

  it('a non-administrator has no direct-upload field', () => {
    m.preflight = { data: undefined };
    render(<ScormEditionPanel cursoId={55} versions={[]} isAdmin={false} />);
    expect(screen.queryByLabelText('Selecionar ZIP formativo e substituir')).toBeNull();
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
