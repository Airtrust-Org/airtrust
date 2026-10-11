import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeLearnerCourse } from '../../worker-airtrust/src/lib/lms/lms-native-course-contract';

const api = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: api.fetchWithAuth,
}));
import NativeStagingLearnerControls from '@/react-app/pages/lms/native/NativeStagingLearnerControls';

const editionHash = 'a'.repeat(64);
const course: NativeLearnerCourse = {
  schema: 'AIRTRUST_NATIVE_COURSE_V1',
  courseId: 'curso01', packageVersion: 'n-abcd0123456789abcdef0123456789ab',
  title: 'Piloto de Segurança', locale: 'pt-BR',
  policy: { mode: 'FORMATIVE' }, assets: [],
  units: [
    { id: 'intro', title: 'Introdução', kind: 'lesson',
      blocks: [{ type: 'paragraph', text: 'Conteúdo da aula' }], questionIds: [] },
    { id: 'quiz', title: 'Avaliação', kind: 'assessment',
      blocks: [], questionIds: ['q1'] },
  ],
  questions: [{ id: 'q1', prompt: 'Questão do piloto',
    options: [{ id: 'a', text: 'Primeira alternativa' }, { id: 'b', text: 'Segunda alternativa' }] }],
};
const respond = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200, headers: { 'content-type': 'application/json' },
});
const initialSession = {
  nextSequence: 1, seenLessonIds: [], lastVisitedUnitId: null, latestAttempt: null,
};
const scope = { matricula_id: 101, ciclo_id: 9, edition_sha256: editionHash,
  mode: 'LEARN', completion_supported: false };

describe('Native staging learner — evidence-only interaction', () => {
  beforeEach(() => api.fetchWithAuth.mockReset());

  it('starts, commits a lesson visit and submits only selections to server grading', async () => {
    let sessionReads = 0;
    api.fetchWithAuth.mockImplementation(async (url: string) => {
      if (url.endsWith('/iniciar')) return respond({
        success: true, data: { ciclo_id: 9, edition_sha256: editionHash,
          completion_supported: false, state: 'STARTED' },
      });
      if (url.endsWith('/checkpoints')) return respond({
        success: true, data: { committed_sequence: 1, edition_sha256: editionHash,
          completion_supported: false, state: 'APPLIED' },
      });
      if (url.endsWith('/tentativas')) return respond({
        success: true, data: { attempt_number: 1, edition_sha256: editionHash,
          completion_supported: false, state: 'APPLIED',
          score_pct: null, assessment_satisfied: true },
      });
      if (url.endsWith('/sessao')) {
        sessionReads += 1;
        return respond({ success: true, data: {
          ...scope, next_sequence: sessionReads >= 2 ? 2 : 1,
          seen_lesson_ids: sessionReads >= 2 ? ['intro'] : [],
          last_visited_unit_id: sessionReads >= 2 ? 'intro' : null,
          latest_attempt: sessionReads >= 3 ? {
            attempt_number: 1, score_pct: null, assessment_satisfied: true,
          } : null,
        } });
      }
      throw new Error('Unexpected request: ' + url);
    });
    render(<NativeStagingLearnerControls
      matriculaId={101} cycleId={9} editionHash={editionHash}
      course={course} initialSession={initialSession}
      fetchAuthorizedAsset={vi.fn()}
    />);
    expect(screen.queryByRole('button', { name: /Registrar visita/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Iniciar ou retomar/ }));
    expect(await screen.findByText(/Registro de aprendizagem habilitado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar visita a esta aula' }));
    expect(await screen.findByText(/Visita registrada pelo servidor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visita registrada no servidor' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    const submit = screen.getByRole('button', { name: 'Enviar respostas para avaliação' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Primeira alternativa'));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByText(/critérios de avaliação atendidos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /concluir|certificado/i })).toBeNull();

    const requests = api.fetchWithAuth.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(requests.map(([url]) => url)).toEqual([
      '/api/lms/native/matriculas/101/iniciar',
      '/api/lms/native/matriculas/101/checkpoints',
      '/api/lms/native/matriculas/101/tentativas',
    ]);
    const [start, visit, attempt] = requests.map(([, opts]) => JSON.parse(opts.body as string));
    expect(start).toEqual({});
    expect(visit).toEqual({ eventId: expect.stringMatching(/^v-[0-9a-f]{32}$/),
      sequence: 1, unitId: 'intro' });
    expect(attempt).toEqual({ attemptNumber: 1,
      answers: [{ questionId: 'q1', optionId: 'a' }] });
    expect(JSON.stringify(attempt)).not.toMatch(/correctOptionId|score_pct|assessment_satisfied/);
    expect(sessionReads).toBe(3);
  });

  it('locks subsequent writes if start receipt conflicts with pinned edition', async () => {
    api.fetchWithAuth.mockResolvedValue(respond({
      success: true, data: { ciclo_id: 9, edition_sha256: 'f'.repeat(64),
        completion_supported: false, state: 'STARTED' },
    }));
    render(<NativeStagingLearnerControls
      matriculaId={101} cycleId={9} editionHash={editionHash}
      course={course} initialSession={initialSession}
      fetchAuthorizedAsset={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: /Iniciar ou retomar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Atualize a página');
    expect(screen.queryByRole('button', { name: 'Registrar visita a esta aula' })).toBeNull();
    expect(api.fetchWithAuth).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Iniciar ou retomar/ })).toBeNull());
  });
});
