import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LmsAdminCursos from './LmsAdminCursos';
import LmsMatriculas from './LmsMatriculas';

const { deleteCursoMock, cancelarMatriculaMock } = vi.hoisted(() => ({
  deleteCursoMock: vi.fn(),
  cancelarMatriculaMock: vi.fn(),
}));

vi.mock('@/react-app/hooks/useApi', () => ({ useApi: () => ({ data: [] }) }));
vi.mock('@/react-app/hooks/useLms', () => ({
  useDeleteCurso: () => ({ mutateAsync: deleteCursoMock, isPending: false }),
  useUpdateCurso: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSyncEadCursos: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLmsEdappLegacySummary: () => ({ data: null }),
  useLmsCursos: () => ({ data: { data: [course] }, isLoading: false }),
  useLmsCurso: () => ({ data: course }),
  useMatriculasCurso: () => ({ data: { data: [enrollment] }, isLoading: false }),
  useMatricularLote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelarMatricula: () => ({ mutateAsync: cancelarMatriculaMock, isPending: false }),
}));
vi.mock('@/react-app/hooks/useFuncionarios', () => ({
  useFuncionariosRQ: () => ({ data: [], isLoading: false }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ cursoId: '7' }),
}));
vi.mock('@/react-app/components/AppLayout', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/react-app/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/react-app/components/Button', () => ({
  default: ({ children, onClick, ...props }: { children: ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick} {...props}>{children}</button>,
}));
vi.mock('@/react-app/components/modals/BaseModal', () => ({
  BaseModal: ({ isOpen, children, footer }: { isOpen: boolean; children: ReactNode; footer: ReactNode }) => isOpen ? <div role="dialog">{children}{footer}</div> : null,
}));
vi.mock('@/react-app/components/funcionarios/FuncionarioLink', () => ({ default: ({ nome }: { nome: string }) => <span>{nome}</span> }));
vi.mock('./lmsUi', () => ({
  formatMinutes: () => '0 min',
  getMatriculaStatusMeta: () => ({ className: '', label: 'Publicado' }),
  LmsEmptyState: () => null,
  LmsModuleTabs: () => null,
  LmsPageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
  LmsSummaryTag: () => null,
  LmsSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
  LmsMetricCard: () => null,
  LmsCourseMiniMeta: () => null,
}));

const course = {
  id: 7,
  titulo: 'CRM Inicial',
  atualizado_em: '2026-09-04T00:00:00.000Z',
  updated_at: '2026-09-04T00:00:00.000Z',
  publicado: 1,
  tipo_conteudo: 'scorm',
  total_matriculas: 1,
  total_concluidos: 0,
  gerar_qualificacao_ao_concluir: 0,
};
const enrollment = {
  id: 9,
  curso_id: 7,
  funcionario_id: 3,
  funcionario_nome: 'Ada Lovelace',
  status: 'PENDENTE',
  progresso_pct: 0,
};

describe('LMS administrative destructive actions', () => {
  beforeEach(() => {
    deleteCursoMock.mockReset();
    cancelarMatriculaMock.mockReset();
  });

  it('keeps course deletion secondary and only invokes the existing mutation after confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LmsAdminCursos />);

    const trigger = await screen.findByRole('button', { name: 'Mais ações para o curso CRM Inicial' });
    expect(screen.queryByRole('menuitem', { name: 'Excluir curso' })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Excluir curso' }));
    expect(deleteCursoMock).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Excluir curso' }));
    await waitFor(() => expect(deleteCursoMock).toHaveBeenCalledTimes(1));
    expect(deleteCursoMock).toHaveBeenCalledWith(7);
  });

  it('keeps enrollment cancellation secondary and preserves the confirmation modal boundary', async () => {
    const user = userEvent.setup();
    render(<LmsMatriculas />);

    const trigger = await screen.findByRole('button', { name: 'Mais ações para a matrícula de Ada Lovelace' });
    expect(screen.queryByRole('menuitem', { name: 'Cancelar matrícula' })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Cancelar matrícula' }));
    expect(cancelarMatriculaMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Manter matrícula' }));
    expect(cancelarMatriculaMock).not.toHaveBeenCalled();

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Cancelar matrícula' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar matrícula' }));
    await waitFor(() => expect(cancelarMatriculaMock).toHaveBeenCalledTimes(1));
    expect(cancelarMatriculaMock).toHaveBeenCalledWith({ matriculaId: 9, cursoId: 7 });
  });
});
