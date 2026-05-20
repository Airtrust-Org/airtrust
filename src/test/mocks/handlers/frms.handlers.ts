/**
 * MSW handlers for FRMS API endpoints (used in tests)
 */
import { http, HttpResponse } from 'msw';

const API = 'https://airtrust-api-production.airtrust.workers.dev/api';

function mockHeatmapData() {
  const days: Record<
    string,
    { pct: number; hv7d: number; hv28d: number; hvDia: number; pctDia: number }
  > = {};
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days[key] = {
      pct: Math.round(Math.random() * 100),
      hv7d: 300 + Math.round(Math.random() * 200),
      hv28d: 1200 + Math.round(Math.random() * 400),
      hvDia: 60 + Math.round(Math.random() * 120),
      pctDia: Math.round(Math.random() * 100),
    };
  }

  return Array.from({ length: 5 }, (_, i) => ({
    tripulante_id: String(100 + i),
    nome: `Tripulante Teste ${i + 1}`,
    nome_guerra: `TT${i + 1}`,
    cargo: 'Piloto',
    dias: days,
    maxPct: 50 + i * 10,
  }));
}

function mockTimeline() {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return {
      data: d.toISOString().slice(0, 10),
      pct_fadiga: 40 + Math.round(Math.random() * 40),
      hv_7d: 300 + Math.round(Math.random() * 200),
      hv_28d: 1200 + Math.round(Math.random() * 400),
      hv_dia: 60 + Math.round(Math.random() * 120),
      pct_dia: Math.round(Math.random() * 100),
      teve_jornada: Math.random() > 0.3 ? 1 : 0,
      hora_apresentacao: '06:00',
      hora_termino: '18:00',
    };
  });
}

export const frmsHandlers = [
  // Heatmap
  http.get(`${API}/frms/heatmap`, () => {
    return HttpResponse.json({ success: true, data: mockHeatmapData() });
  }),

  // Timeline
  http.get(`${API}/frms/tripulante/:id/timeline`, () => {
    return HttpResponse.json({ success: true, data: mockTimeline() });
  }),

  // Frota
  http.get(`${API}/frms/frota`, () => {
    return HttpResponse.json({
      success: true,
      data: Array.from({ length: 5 }, (_, i) => ({
        tripulante_id: String(100 + i),
        nome: `Tripulante ${i + 1}`,
        nome_guerra: `T${i + 1}`,
        cargo: 'Piloto',
        funcao: 'PILOTO',
        hv_mes_min: 600 + i * 10,
        pct_mes: 50 + i,
        hv_7d_min: 200 + i * 5,
        pct_7d: 40 + i,
        hv_28d_min: 800 + i * 20,
        pct_28d: 60 + i,
        hv_365d_min: 5000 + i * 100,
        pct_365d: 30 + i,
        hv_dia_min: 100 + i,
        pct_dia: 20 + i,
        nivel_max: i < 3 ? 'OK' : i < 4 ? 'ATENCAO' : 'CRITICO',
      })),
    });
  }),

  // Alertas
  http.get(`${API}/frms/alertas`, () => {
    return HttpResponse.json({ success: true, data: [] });
  }),

  // Alertas count
  http.get(`${API}/frms/alertas/count`, () => {
    return HttpResponse.json({ success: true, data: { count: 2 } });
  }),

  // Limites
  http.get(`${API}/frms/configuracao/limites`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        ALERTA_AVISO_PCT: 80,
        ALERTA_CRITICO_PCT: 95,
        ALERTA_VIOLACAO_PCT: 100,
      },
    });
  }),

  // Aeronaves (used by sidebar filter)
  http.get(`${API}/aeronaves`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        { id: 1, prefixo: 'PT-AAA', modelo: 'AW139', status: 'ativo' },
        { id: 2, prefixo: 'PT-BBB', modelo: 'S-76D', status: 'ativo' },
      ],
    });
  }),

  // Funcionarios (used by TripulantePickerModal)
  http.get(`${API}/funcionarios`, () => {
    return HttpResponse.json({
      success: true,
      data: Array.from({ length: 5 }, (_, i) => ({
        id: 100 + i,
        nome: `Funcionário ${i + 1}`,
        cargo: 'Piloto',
        funcao: 'PILOTO',
      })),
    });
  }),
];
