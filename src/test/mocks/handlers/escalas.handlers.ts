import { http, HttpResponse } from 'msw';
import {
  makeEscalaMensal,
  makeCalendarioData,
  makeAlocacao,
  makeEvento,
  makeTipoEvento,
  makeConflitosData,
} from '../factories/escala.factory';
import { API_BASE_URL } from '@/react-app/config/api';

const BASE = API_BASE_URL;

export const escalasHandlers = [
  // List escalas (exact path — must come before :id handler)
  http.get(`${BASE}/escalas`, () => {
    return HttpResponse.json({
      success: true,
      data: [makeEscalaMensal(), makeEscalaMensal({ id: 'escala-2', mes: 6 })],
    });
  }),

  // Get tipos de evento (exact path — must come before /:id handler)
  http.get(`${BASE}/escalas/tipos-evento-config`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        makeTipoEvento({ id: 'te-1', codigo: 'TRN', nome: 'Treinamento', ativo: 1 }),
        makeTipoEvento({ id: 'te-2', codigo: 'FER', nome: 'Férias', ativo: 1 }),
        makeTipoEvento({ id: 'te-3', codigo: 'OLD', nome: 'Inativo', ativo: 0 }),
      ],
    });
  }),

  // Get single escala
  http.get(`${BASE}/escalas/:id`, ({ params }) => {
    if (params.id === 'not-found') {
      return HttpResponse.json({ success: false, error: 'Não encontrado' }, { status: 404 });
    }
    return HttpResponse.json({ success: true, data: makeEscalaMensal({ id: String(params.id) }) });
  }),

  // Get calendario
  http.get(`${BASE}/escalas/:id/calendario`, ({ params }) => {
    if (params.id === 'error-id') {
      return HttpResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
    }
    return HttpResponse.json({ success: true, data: makeCalendarioData() });
  }),

  // Get conflitos
  http.get(`${BASE}/escalas/:id/conflitos`, () => {
    return HttpResponse.json({ success: true, data: makeConflitosData() });
  }),

  // POST alocações
  http.post(`${BASE}/escalas/:id/alocacoes`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body?.funcao === 'SOBREPOSICAO') {
      return HttpResponse.json(
        { success: false, error: 'Sobreposição de alocação detectada', code: 'SOBREPOSICAO' },
        { status: 409 },
      );
    }
    if (body?.funcao === 'CMA_BLOQUEADA') {
      return HttpResponse.json(
        { success: false, error: 'CMA do tripulante está bloqueada', code: 'CMA_BLOQUEADA' },
        { status: 409 },
      );
    }
    if (body?.funcao === 'CMA_EXPIRADO' && !body?.cma_override) {
      return HttpResponse.json(
        { success: false, error: 'CMA expirado', code: 'CMA_EXPIRADO' },
        { status: 409 },
      );
    }
    return HttpResponse.json({ success: true, data: makeAlocacao() });
  }),

  // POST tripulações
  http.post(`${BASE}/escalas/:id/tripulacoes`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body?.pic_id) {
      return HttpResponse.json({ success: false, error: 'pic_id obrigatório' }, { status: 422 });
    }
    return HttpResponse.json({ success: true, data: { id: 'trip-1' } });
  }),

  // POST eventos
  http.post(`${BASE}/escalas/:id/eventos`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body?.funcionario_id) {
      return HttpResponse.json(
        { success: false, error: 'funcionario_id obrigatório' },
        { status: 422 },
      );
    }
    return HttpResponse.json({ success: true, data: makeEvento() });
  }),

  // DELETE evento
  http.delete(`${BASE}/escalas/:id/eventos/:eventoId`, () => {
    return HttpResponse.json({ success: true, data: { deleted: true } });
  }),

  // DELETE alocação
  http.delete(`${BASE}/escalas/:id/alocacoes/:alocId`, () => {
    return HttpResponse.json({ success: true, data: { deleted: true } });
  }),

  // GET quinzenas
  http.get(`${BASE}/escalas/quinzenas`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 'q1',
          numero: 1,
          mes: 5,
          ano: 2026,
          data_inicio: '2026-05-01',
          data_fim: '2026-05-16',
          empresa_id: 6,
        },
        {
          id: 'q2',
          numero: 2,
          mes: 5,
          ano: 2026,
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
          empresa_id: 6,
        },
      ],
    });
  }),
];
