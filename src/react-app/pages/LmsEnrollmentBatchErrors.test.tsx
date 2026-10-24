import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalMatricular } from './lms/LmsMatriculas';

const { mutate, warning, success } = vi.hoisted(() => ({
  mutate: vi.fn(), warning: vi.fn(), success: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { warning, success, error: vi.fn() } }));
vi.mock('@/react-app/hooks/useLms', () => ({
  useMatricularLote: () => ({ mutateAsync: mutate, isPending: false }),
}));
vi.mock('@/react-app/hooks/useFuncionarios', () => ({
  useFuncionariosRQ: () => ({ data: [{ id: 77, nome: 'Aluno QA' }], isLoading: false }),
}));
vi.mock('@/react-app/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }));

describe('matrículas em lote com falhas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mantém os detalhes visíveis, atualiza o resultado parcial e exige nova seleção', async () => {
    mutate.mockResolvedValue({
      criadas: 1, ignoradas: 0, erros: 1, matriculas: [{ id: 10 }],
      detalhes_erros: [{ funcionario_id: 77, funcionario_nome: 'Aluno QA', codigo: 'NEW_EDITION_REQUIRED' }],
    });
    const onClose = vi.fn();
    const onMatriculasChanged = vi.fn().mockResolvedValue(undefined);
    render(<ModalMatricular cursoId={9} activeFuncionarioIds={new Set()} onClose={onClose} onMatriculasChanged={onMatriculasChanged} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aluno QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Matricular' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Aluno QA');
    expect(alert).toHaveTextContent('O curso mudou de edição');
    expect(alert).toHaveTextContent('1 matrícula(s) confirmada(s)');
    expect(onMatriculasChanged).toHaveBeenCalledWith([{ id: 10 }]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Matricular' })).toBeDisabled();
  });

  it('erro de rede nao provoca reenvio nem revela detalhes internos', async () => {
    mutate.mockRejectedValue(new Error('sensitive internal backend detail'));
    const onMatriculasChanged = vi.fn().mockResolvedValue(undefined);
    render(<ModalMatricular cursoId={9} activeFuncionarioIds={new Set()} onClose={vi.fn()} onMatriculasChanged={onMatriculasChanged} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aluno QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Matricular' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível confirmar o resultado da operação');
    expect(alert).not.toHaveTextContent('sensitive internal backend detail');
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(onMatriculasChanged).toHaveBeenCalledWith([]);
    expect(screen.getByRole('button', { name: 'Matricular' })).toBeDisabled();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('não confirmado'));
  });

  it('mantem alerta quando atualizar a lista tambem falha', async () => {
    mutate.mockRejectedValue(new Error('request failed'));
    const onMatriculasChanged = vi.fn().mockRejectedValue(new Error('refresh failed'));
    render(<ModalMatricular cursoId={9} activeFuncionarioIds={new Set()} onClose={vi.fn()} onMatriculasChanged={onMatriculasChanged} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aluno QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Matricular' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('confira as matrículas');
    await waitFor(() => expect(onMatriculasChanged).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Matricular' })).toBeDisabled();
  });

  it('adverte que o estado é incerto para falhas inesperadas e respostas antigas', async () => {
    mutate.mockResolvedValueOnce({ criadas: 0, ignoradas: 0, erros: 1, detalhes_erros: [
      { funcionario_id: 77, funcionario_nome: 'Aluno QA', codigo: 'ESTADO_NAO_CONFIRMADO' },
    ] }).mockResolvedValueOnce({ criadas: 0, ignoradas: 0, erros: 1 });
    render(<ModalMatricular cursoId={9} activeFuncionarioIds={new Set()} onClose={vi.fn()} onMatriculasChanged={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aluno QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Matricular' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Verifique o estado da matrícula antes de tentar novamente');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Aluno QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Matricular' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível identificar o motivo'));
  });
});
