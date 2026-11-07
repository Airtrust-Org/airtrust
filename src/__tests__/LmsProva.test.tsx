// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LmsProva from '../react-app/pages/lms/exams/LmsProva';
import { fetchWithAuth } from '../react-app/config/api';

vi.mock('../react-app/config/api', () => ({ API_BASE_URL: '/api', fetchWithAuth: vi.fn() }));
const mocked = vi.mocked(fetchWithAuth);
const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (code: string, status: number) =>
  new Response(JSON.stringify({ success: false, code }), { status, headers: { 'Content-Type': 'application/json' } });
const state = (s: string, extra = {}) => ({ state: s, missing: [], attemptsUsed: 0, finalizeRequired: s === 'PASSED', ...extra });
const attempt = (over = {}) => ({
  attemptId: 'att-0123456789abcdef', attemptNo: 1, state: 'IN_PROGRESS', answers: {}, result: null,
  sections: [{ moduleId: 'm1', questions: [
    { questionId: 'q1', prompt: 'Primeira?', choices: [{ id: 'o1', text: 'Sim' }, { id: 'o2', text: 'Não' }] },
    { questionId: 'q2', prompt: 'Segunda?', choices: [{ id: 'o1', text: 'Sim' }, { id: 'o2', text: 'Não' }] },
  ] }], ...over,
});
function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
const renderPage = () => render(
  <MemoryRouter initialEntries={['/lms/provas/10']}>
    <Routes>
      <Route path="/lms/provas/:matriculaId" element={<LmsProva />} />
      <Route path="/lms" element={<Where />} />
    </Routes>
  </MemoryRouter>);
const calls = () => mocked.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`);

describe('Prova final do aluno', () => {
  beforeEach(() => { mocked.mockReset(); });
  afterEach(() => cleanup());

  it.each([
    ['NOT_AVAILABLE', /não tem prova final disponível/],
    ['STUDY_PENDING', /Conclua todo o conteúdo/],
    ['COMPLETED', /já concluído/],
  ])('mostra a situação %s sem oferecer prova', async (s, text) => {
    mocked.mockResolvedValueOnce(ok(state(s)));
    renderPage();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Iniciar prova/ })).toBeNull();
  });

  it('matrícula concluída permite solicitar recuperação do certificado sem reabrir a prova', async () => {
    mocked.mockResolvedValueOnce(ok(state('COMPLETED')));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Solicitar nova tentativa de emissão do certificado' });
    expect(screen.queryByRole('button', { name: /Iniciar prova|Concluir treinamento/ })).toBeNull();
    expect(screen.getByText(/Solicite uma nova tentativa apenas se este treinamento gera certificado EAD/)).toBeTruthy();
    mocked.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/A emissão só é tentada para matrículas com qualificação EAD elegível/));
    expect(screen.getByRole('status').textContent).toMatch(/não confirma emissão/);
    expect(calls()).toContain('POST /api/lms/matriculas/10/finalizar');
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('falha no reenvio do certificado não afirma que o treinamento deixou de estar concluído', async () => {
    mocked.mockResolvedValueOnce(ok(state('COMPLETED')));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Solicitar nova tentativa de emissão do certificado' });
    mocked.mockResolvedValueOnce(fail('ERROR', 500));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/nova tentativa de emissão do certificado/));
    expect(screen.getByText('Treinamento já concluído.')).toBeTruthy();
    expect(calls()).toContain('POST /api/lms/matriculas/10/finalizar');
  });

  it('ambiente sem a prova ativada mostra mensagem clara', async () => {
    mocked.mockResolvedValueOnce(fail('EXAM_RUNTIME_NOT_ACTIVATED', 503));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toMatch(/ainda não está disponível/);
  });

  it('inicia com chave de idempotência, salva respostas, confirma envio com em branco, aprova e conclui', async () => {
    mocked.mockResolvedValueOnce(ok(state('READY')));
    renderPage();
    mocked.mockResolvedValueOnce(ok(attempt(), 201));
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar prova' }));
    expect(await screen.findByText(/Questão 1\. Primeira\?/)).toBeTruthy();
    const startInit = mocked.mock.calls[1][1] as RequestInit;
    expect((startInit.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^exam-/);

    mocked.mockResolvedValueOnce(ok({ saved: true }));
    fireEvent.click(screen.getAllByRole('radio', { name: 'Sim' })[0]);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Resposta salva/));
    expect(JSON.parse((mocked.mock.calls[2][1] as RequestInit).body as string)).toEqual({ questionId: 'q1', choiceId: 'o1' });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar prova' }));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 questão\(ões\) sem resposta/);

    mocked.mockResolvedValueOnce(ok(attempt({ state: 'SUBMITTED', answers: { q1: 'o1' }, result: {
      passed: true, answered: 1, unanswered: 1, sections: [{ moduleId: 'm1', scorePct: 50, passed: true }] } })));
    mocked.mockResolvedValueOnce(ok(state('PASSED')));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }));
    expect(await screen.findByText('Aprovado')).toBeTruthy();

    mocked.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    fireEvent.click(screen.getByRole('button', { name: 'Concluir treinamento' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/lms'));
    expect(calls()).toContain('POST /api/lms/matriculas/10/finalizar');
  });

  it('reprovação oferece nova tentativa e falha ao salvar desfaz a marcação', async () => {
    mocked.mockResolvedValueOnce(ok(state('READY')));
    renderPage();
    mocked.mockResolvedValueOnce(ok(attempt(), 201));
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar prova' }));
    await screen.findByText(/Questão 1/);

    mocked.mockResolvedValueOnce(fail('EXAM_ANSWER_INVALID', 422));
    const radio = screen.getAllByRole('radio', { name: 'Sim' })[0] as HTMLInputElement;
    fireEvent.click(radio);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Não foi possível salvar/));
    expect((screen.getAllByRole('radio', { name: 'Sim' })[0] as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar prova' }));
    mocked.mockResolvedValueOnce(ok(attempt({ state: 'SUBMITTED', result: {
      passed: false, answered: 0, unanswered: 2, sections: [{ moduleId: 'm1', scorePct: 0, passed: false }] } })));
    mocked.mockResolvedValueOnce(ok(state('READY', { attemptsUsed: 1 })));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }));
    expect(await screen.findByText('Não aprovado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Concluir treinamento' })).toBeNull();
  });

  it('explica alteração de edição sem orientar o aluno a reiniciar a matrícula', async () => {
    mocked.mockResolvedValueOnce(ok(state('READY')));
    renderPage();
    mocked.mockResolvedValueOnce(fail('EXAM_ATTEMPT_EDITION_CHANGED', 409));
    fireEvent.click(await screen.findByRole('button', {name:'Iniciar prova'}));
    const msg = await screen.findByRole('alert');
    expect(msg.textContent).toMatch(/conteúdo foi substituído/);
    expect(msg.textContent).toMatch(/respostas anteriores não foram apagadas/);
  });
  it('indica e retoma a tentativa aberta sem criar uma segunda prova', async () => {
    mocked.mockResolvedValueOnce(ok(state('READY', {hasOpenAttempt:true})));
    renderPage();
    const button = await screen.findByRole('button', {name:'Retomar prova'});
    mocked.mockResolvedValueOnce(ok(attempt({answers:{q1:'o2'}}),201));
    fireEvent.click(button);
    await screen.findByRole('form', {name:'Tentativa 1'});
    const selected = screen.getAllByRole('radio', {name:'Não'})[0] as HTMLInputElement;
    expect(selected.checked).toBe(true);
    expect(calls().filter(x => x.includes('/tentativas'))).toHaveLength(1);
  });
  it('impede envio ou nova seleção enquanto a última resposta ainda não foi persistida', async () => {
    mocked.mockResolvedValueOnce(ok(state('READY')));
    renderPage();
    mocked.mockResolvedValueOnce(ok(attempt(), 201));
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar prova' }));
    await screen.findByText(/Questão 1/);

    let releaseSave: ((response: Response) => void) | undefined;
    mocked.mockImplementationOnce(() => new Promise<Response>(resolve => { releaseSave = resolve; }));
    fireEvent.click(screen.getAllByRole('radio', { name: 'Sim' })[0]);
    const send = screen.getByRole('button', { name: 'Enviar prova' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect((screen.getAllByRole('radio', { name: 'Não' })[1] as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(send);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls().filter(value => value.includes('/enviar'))).toHaveLength(0);

    if (!releaseSave) throw new Error('O PUT de salvamento não foi iniciado');
    releaseSave(ok({ saved: true }));
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});
