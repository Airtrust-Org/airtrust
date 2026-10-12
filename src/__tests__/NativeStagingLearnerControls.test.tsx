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
    const session = (visit: boolean, attempted: boolean) => respond({
      success: true, data: {
        ...scope, next_sequence: visit ? 2 : 1,
        seen_lesson_ids: visit ? ['intro'] : [],
        last_visited_unit_id: visit ? 'intro' : null,
        latest_attempt: attempted ? {
          attempt_number: 1, score_pct: null, assessment_satisfied: true,
        } : null,
      },
    });
    // Ordered mock receipts make unintended extra reads/writes visible
    // instead of allowing any URL to accidentally consume the right receipt.
    api.fetchWithAuth
      .mockResolvedValueOnce(respond({
        success: true, data: { ciclo_id: 9, edition_sha256: editionHash,
          completion_supported: false, state: 'STARTED' },
      }))
      .mockResolvedValueOnce(session(false, false))
      .mockResolvedValueOnce(respond({
        success: true, data: { committed_sequence: 1, edition_sha256: editionHash,
          completion_supported: false, state: 'APPLIED' },
      }))
      .mockResolvedValueOnce(session(true, false))
      .mockResolvedValueOnce(respond({
        success: true, data: { attempt_number: 1, edition_sha256: editionHash,
          completion_supported: false, state: 'APPLIED',
          score_pct: null, assessment_satisfied: true },
      }))
      .mockResolvedValueOnce(session(true, true));
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
    expect(api.fetchWithAuth.mock.calls.filter(([url]) => typeof url === 'string' && url.endsWith('/sessao'))).toHaveLength(3);
    expect(api.fetchWithAuth).toHaveBeenCalledTimes(6);
  });

  it('finishes only after a second verified server session and confirms the receipt', async () => {
    const readySession=()=>respond({success:true,data:{
      ...scope,completion_supported:true,
      next_sequence:2,seen_lesson_ids:['intro'],last_visited_unit_id:'intro',
      latest_attempt:{attempt_number:1,score_pct:null,assessment_satisfied:true},
    }});
    api.fetchWithAuth
      .mockResolvedValueOnce(respond({success:true,data:{
        ciclo_id:9,edition_sha256:editionHash,completion_supported:false,state:'ALREADY_STARTED',
      }}))
      .mockResolvedValueOnce(readySession())
      .mockResolvedValueOnce(readySession())
      .mockResolvedValueOnce(respond({success:true,data:{
        matricula_id:101,status:'CONCLUIDO',
        qualification_outcome:'qualification_created',
        certificate_state:'REQUIRES_VERIFICATION',
      }}));
    render(<NativeStagingLearnerControls
      matriculaId={101} cycleId={9} editionHash={editionHash}
      course={course} initialSession={initialSession}
      completionSupported
      fetchAuthorizedAsset={vi.fn()}
    />);
    expect(screen.queryByRole('button', {name:'Finalizar treinamento'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/Iniciar ou retomar/}));
    expect(await screen.findByRole('button',{name:'Finalizar treinamento'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Finalizar treinamento'}));
    expect(await screen.findByText(/Treinamento concluído pelo servidor/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Finalizar treinamento'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Registrar visita a esta aula'})).toBeNull();
    const urls=api.fetchWithAuth.mock.calls.map(([url])=>url);
    expect(urls).toEqual([
      '/api/lms/native/matriculas/101/iniciar',
      '/api/lms/native/matriculas/101/sessao',
      '/api/lms/native/matriculas/101/sessao',
      '/api/lms/native/matriculas/101/concluir',
    ]);
    expect(api.fetchWithAuth.mock.calls[3][1]).toMatchObject({method:'POST',cache:'no-store'});
    expect(api.fetchWithAuth.mock.calls[3][1]).not.toHaveProperty('body');
  });

  it('never attempts completion when stale evidence fails the second server recheck', async () => {
    api.fetchWithAuth
      .mockResolvedValueOnce(respond({success:true,data:{
        ciclo_id:9,edition_sha256:editionHash,completion_supported:false,state:'ALREADY_STARTED',
      }}))
      .mockResolvedValueOnce(respond({success:true,data:{
        ...scope,completion_supported:true,next_sequence:2,
        seen_lesson_ids:['intro'],last_visited_unit_id:'intro',
        latest_attempt:{attempt_number:1,score_pct:null,assessment_satisfied:true},
      }}))
      .mockResolvedValueOnce(respond({success:true,data:{
        ...scope,completion_supported:true,next_sequence:2,
        seen_lesson_ids:['intro'],last_visited_unit_id:'intro',
        latest_attempt:{attempt_number:2,score_pct:null,assessment_satisfied:false},
      }}));
    render(<NativeStagingLearnerControls
      matriculaId={101} cycleId={9} editionHash={editionHash}
      course={course} initialSession={initialSession}
      completionSupported fetchAuthorizedAsset={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button',{name:/Iniciar ou retomar/}));
    fireEvent.click(await screen.findByRole('button',{name:'Finalizar treinamento'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Atualize a página');
    expect(api.fetchWithAuth.mock.calls.map(([url])=>url)).not.toContain(
      '/api/lms/native/matriculas/101/concluir',
    );
  });

  it.each([{attempt_number:501,score_pct:null,assessment_satisfied:true},{attempt_number:1,score_pct:-1,assessment_satisfied:true},{attempt_number:1,score_pct:101,assessment_satisfied:true}])('rejects malformed resumed attempt %j', async (attempt) => {
    api.fetchWithAuth.mockResolvedValueOnce(respond({success:true,data:{ciclo_id:9,edition_sha256:editionHash,completion_supported:false,state:'STARTED'}})).mockResolvedValueOnce(respond({success:true,data:{...scope,next_sequence:2,seen_lesson_ids:['intro'],last_visited_unit_id:'intro',latest_attempt:attempt}}));
    render(<NativeStagingLearnerControls matriculaId={101} cycleId={9} editionHash={editionHash} course={course} initialSession={initialSession} fetchAuthorizedAsset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button',{name:/Iniciar ou retomar/}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Atualize a página');
    expect(api.fetchWithAuth).toHaveBeenCalledTimes(2);
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
