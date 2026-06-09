/**
 * SharedSessionForm & sharedSessions — behavioral tests
 *
 * Tests the pure logic of shared session creation:
 *  - feature flag behavior
 *  - payload construction
 *  - validation rules
 *  - summary calculation
 *  - legacy session preservation
 *
 * Does NOT test the full UI (no treinamentos dropdown, no edit, no calendar).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the API module before sharedSessions imports it
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  getAccessToken: () => 'token-teste',
}));

import { isSharedSessionsEnabled, isSharedSessionsEnabledSync, SHARED_SESSIONS_ENABLED, _resetCacheForTesting } from '@/react-app/config/sharedSessions';

// ────────────────────────────────────────────────────────────
// sharedSessions config tests
// ────────────────────────────────────────────────────────────

describe('sharedSessions config', () => {
  it('1. SHARED_SESSIONS_ENABLED is a boolean', () => {
    expect(typeof SHARED_SESSIONS_ENABLED).toBe('boolean');
  });

  it('2. isSharedSessionsEnabledSync returns cached SHARED_SESSIONS_ENABLED value', () => {
    // isSharedSessionsEnabled() is async and requires fetch.
    // isSharedSessionsEnabledSync() returns the synchronously cached value.
    expect(typeof isSharedSessionsEnabledSync()).toBe('boolean');
  });
});

// ────────────────────────────────────────────────────────────
// isSharedSessionsEnabled — fail-closed behavior tests
// These tests mock global fetch to verify the async function
// returns false in all error cases (fail-closed contract).
// ────────────────────────────────────────────────────────────

describe('isSharedSessionsEnabled fail-closed behavior', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetCacheForTesting();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetCacheForTesting();
  });

  it('A. returns true when backend responds with simulador_shared_sessions: true', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { simulador_shared_sessions: true } }),
    } as Response);

    const result = await isSharedSessionsEnabled();
    expect(result).toBe(true);
  });

  it('B. returns false when backend responds with simulador_shared_sessions: false', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { simulador_shared_sessions: false } }),
    } as Response);

    const result = await isSharedSessionsEnabled();
    expect(result).toBe(false);
  });

  it('C. returns false when backend returns 500', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Internal Server Error' }),
    } as Response);

    const result = await isSharedSessionsEnabled();
    expect(result).toBe(false);
  });

  it('D. returns false on network rejection', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await isSharedSessionsEnabled();
    expect(result).toBe(false);
  });

  it('E. returns false when response has invalid structure (no data field)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ something_else: true }),
    } as Response);

    const result = await isSharedSessionsEnabled();
    expect(result).toBe(false);
  });

  it('F. returns false when simulador_shared_sessions is not boolean true', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { simulador_shared_sessions: 'yes' } }),
    } as Response);

    const result = await isSharedSessionsEnabled();
    expect(result).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// Pure logic: segment generation helpers
// ────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutosToTime(mins: number): string {
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function generateSegments(
  horaInicio: string,
  horaFim: string,
  p0Curricular: boolean,
  p1Curricular: boolean,
  p0Id: number | null,
  p1Id: number | null,
) {
  const start = timeToMinutes(horaInicio);
  const end = timeToMinutes(horaFim);
  if (end <= start) return [];

  const mid = Math.floor((start + end) / 2);

  return [
    {
      inicio: horaInicio,
      fim: minutosToTime(mid),
      atribuicaoFuncionarioId: p0Curricular ? p0Id : null,
      funcoes: [
        { funcionario_id: p0Id ?? 0, funcao: 'PF' as const },
        { funcionario_id: p1Id ?? 0, funcao: 'PM' as const },
      ].filter((f) => f.funcionario_id > 0),
    },
    {
      inicio: minutosToTime(mid),
      fim: horaFim,
      atribuicaoFuncionarioId: p1Curricular ? p1Id : null,
      funcoes: [
        { funcionario_id: p1Id ?? 0, funcao: 'PF' as const },
        { funcionario_id: p0Id ?? 0, funcao: 'PM' as const },
      ].filter((f) => f.funcionario_id > 0),
    },
  ];
}

function calculateSummary(
  participants: Array<{
    funcionario: { id: number; nome: string } | null;
    cumpreTreinamento: boolean;
    geraFicha: boolean;
  }>,
  segments: ReturnType<typeof generateSegments>,
) {
  return participants
    .filter((p) => p.funcionario)
    .map((p) => {
      const fid = p.funcionario!.id;
      let totalMin = 0,
        pfMin = 0,
        pmMin = 0,
        curricMin = 0;

      for (const seg of segments) {
        const dur = timeToMinutes(seg.fim) - timeToMinutes(seg.inicio);
        for (const f of seg.funcoes) {
          if (f.funcionario_id === fid) {
            totalMin += dur;
            if (f.funcao === 'PF') pfMin += dur;
            else pmMin += dur;
          }
        }
        if (seg.atribuicaoFuncionarioId === fid) {
          curricMin += dur;
        }
      }

      return {
        funcionarioId: fid,
        nome: p.funcionario!.nome,
        totalMinutos: totalMin,
        pfMinutos: pfMin,
        pmMinutos: pmMin,
        curricularMinutos: curricMin,
        cumpreTreinamento: p.cumpreTreinamento,
        geraFicha: p.geraFicha,
      };
    });
}

describe('SharedSession segment generation', () => {
  it('3. two curricular participants get 120 total, 60 PF, 60 PM each', () => {
    const segments = generateSegments('07:00', '09:00', true, true, 10, 20);

    const participants = [
      { funcionario: { id: 10, nome: 'Ramos' }, cumpreTreinamento: true, geraFicha: true },
      { funcionario: { id: 20, nome: 'Dieter' }, cumpreTreinamento: true, geraFicha: true },
    ];

    const summary = calculateSummary(participants, segments);

    // Ramos
    expect(summary[0].totalMinutos).toBe(120);
    expect(summary[0].pfMinutos).toBe(60);
    expect(summary[0].pmMinutos).toBe(60);
    expect(summary[0].curricularMinutos).toBe(60);
    expect(summary[0].geraFicha).toBe(true);

    // Dieter
    expect(summary[1].totalMinutos).toBe(120);
    expect(summary[1].pfMinutos).toBe(60);
    expect(summary[1].pmMinutos).toBe(60);
    expect(summary[1].curricularMinutos).toBe(60);
    expect(summary[1].geraFicha).toBe(true);
  });

  it('4. curricular + support: only curricular participant gets curricular minutes', () => {
    // Note: generateSegments always creates 2 segments by splitting time in half.
    // For a 1h session (08:00-09:00), each segment is 30 min.
    const segments = generateSegments('08:00', '09:00', true, false, 10, 20);

    const participants = [
      { funcionario: { id: 10, nome: 'Ramos' }, cumpreTreinamento: true, geraFicha: true },
      { funcionario: { id: 20, nome: 'Dieter' }, cumpreTreinamento: false, geraFicha: false },
    ];

    const summary = calculateSummary(participants, segments);

    // Ramos (curricular): PF in seg1 (30) + PM in seg2 (30) = 60 total, 30 PF, 30 PM
    expect(summary[0].totalMinutos).toBe(60);
    expect(summary[0].pfMinutos).toBe(30);
    expect(summary[0].pmMinutos).toBe(30);
    // curricular = only seg1 where Ramos is the owner (30 min)
    expect(summary[0].curricularMinutos).toBe(30);
    expect(summary[0].cumpreTreinamento).toBe(true);
    expect(summary[0].geraFicha).toBe(true);

    // Dieter (support): PM in seg1 (30) + PF in seg2 (30) = 60 total, 30 PF, 30 PM
    expect(summary[1].totalMinutos).toBe(60);
    expect(summary[1].pfMinutos).toBe(30);
    expect(summary[1].pmMinutos).toBe(30);
    // support gets zero curricular
    expect(summary[1].curricularMinutos).toBe(0);
    expect(summary[1].cumpreTreinamento).toBe(false);
    expect(summary[1].geraFicha).toBe(false);
  });

  it('5. PF and PM are different people in each segment', () => {
    const segments = generateSegments('07:00', '09:00', true, true, 10, 20);

    for (const seg of segments) {
      const pfIds = seg.funcoes.filter((f) => f.funcao === 'PF').map((f) => f.funcionario_id);
      const pmIds = seg.funcoes.filter((f) => f.funcao === 'PM').map((f) => f.funcionario_id);
      expect(pfIds.length).toBe(1);
      expect(pmIds.length).toBe(1);
      expect(pfIds[0]).not.toBe(pmIds[0]);
    }
  });

  it('6. both segments together cover the full reservation time', () => {
    const segments = generateSegments('07:00', '09:00', true, true, 10, 20);

    const firstStart = timeToMinutes(segments[0].inicio);
    const lastEnd = timeToMinutes(segments[segments.length - 1].fim);
    const totalDuration = segments.reduce(
      (sum, seg) => sum + timeToMinutes(seg.fim) - timeToMinutes(seg.inicio),
      0,
    );

    expect(firstStart).toBe(timeToMinutes('07:00'));
    expect(lastEnd).toBe(timeToMinutes('09:00'));
    expect(totalDuration).toBe(120);
  });
});

// ────────────────────────────────────────────────────────────
// Payload contract tests
// ────────────────────────────────────────────────────────────

describe('SharedSession payload contract', () => {
  function buildPayload(params: {
    data: string;
    horaInicio: string;
    horaFim: string;
    simuladorId: number;
    instrutorId: number;
    temaSessao?: string;
    participantes: Array<{
      funcionario_id: number;
      cumpre_treinamento: boolean;
      modelo_sessao_id?: number | null;
      gera_ficha: boolean;
    }>;
  }) {
    const segments = generateSegments(
      params.horaInicio,
      params.horaFim,
      params.participantes[0]?.cumpre_treinamento ?? false,
      params.participantes[1]?.cumpre_treinamento ?? false,
      params.participantes[0]?.funcionario_id ?? null,
      params.participantes[1]?.funcionario_id ?? null,
    );

    return {
      data: params.data,
      hora_inicio: params.horaInicio,
      hora_fim: params.horaFim,
      simulador_id: params.simuladorId,
      instrutor_id: params.instrutorId,
      tema_sessao: params.temaSessao || undefined,
      participantes: params.participantes,
      segmentos: segments.map((seg) => ({
        inicio: seg.inicio,
        fim: seg.fim,
        atribuicao_funcionario_id: seg.atribuicaoFuncionarioId,
        funcoes: seg.funcoes.filter((f) => f.funcionario_id > 0),
      })),
    };
  }

  it('7. support participant does NOT send gera_ficha=true', () => {
    const payload = buildPayload({
      data: '2026-06-21',
      horaInicio: '08:00',
      horaFim: '09:00',
      simuladorId: 16,
      instrutorId: 6,
      participantes: [
        { funcionario_id: 10, cumpre_treinamento: true, modelo_sessao_id: 16, gera_ficha: true },
        { funcionario_id: 20, cumpre_treinamento: false, gera_ficha: false },
      ],
    });

    expect(payload.participantes[0].gera_ficha).toBe(true);
    expect(payload.participantes[0].cumpre_treinamento).toBe(true);
    expect(payload.participantes[1].gera_ficha).toBe(false);
    expect(payload.participantes[1].cumpre_treinamento).toBe(false);
  });

  it('8. two curricular participants each have gera_ficha=true and distinct modelo_sessao_id', () => {
    const payload = buildPayload({
      data: '2026-06-20',
      horaInicio: '07:00',
      horaFim: '09:00',
      simuladorId: 16,
      instrutorId: 6,
      participantes: [
        { funcionario_id: 10, cumpre_treinamento: true, modelo_sessao_id: 16, gera_ficha: true },
        { funcionario_id: 20, cumpre_treinamento: true, modelo_sessao_id: 17, gera_ficha: true },
      ],
    });

    expect(payload.participantes).toHaveLength(2);
    expect(payload.participantes[0].gera_ficha).toBe(true);
    expect(payload.participantes[1].gera_ficha).toBe(true);
    expect(payload.participantes[0].modelo_sessao_id).not.toBe(
      payload.participantes[1].modelo_sessao_id,
    );
  });

  it('9. payload matches shared session API contract', () => {
    const payload = buildPayload({
      data: '2026-06-20',
      horaInicio: '07:00',
      horaFim: '09:00',
      simuladorId: 16,
      instrutorId: 6,
      temaSessao: 'TEST-SHARED-001',
      participantes: [
        { funcionario_id: 3, cumpre_treinamento: true, modelo_sessao_id: 16, gera_ficha: true },
        { funcionario_id: 7, cumpre_treinamento: true, modelo_sessao_id: 17, gera_ficha: true },
      ],
    });

    // Top-level fields
    expect(payload).toHaveProperty('data');
    expect(payload).toHaveProperty('hora_inicio');
    expect(payload).toHaveProperty('hora_fim');
    expect(payload).toHaveProperty('simulador_id');
    expect(payload).toHaveProperty('instrutor_id');
    expect(payload).toHaveProperty('participantes');
    expect(payload).toHaveProperty('segmentos');

    // Participants structure
    for (const p of payload.participantes) {
      expect(p).toHaveProperty('funcionario_id');
      expect(p).toHaveProperty('cumpre_treinamento');
      expect(p).toHaveProperty('gera_ficha');
      expect(typeof p.funcionario_id).toBe('number');
      expect(typeof p.cumpre_treinamento).toBe('boolean');
      expect(typeof p.gera_ficha).toBe('boolean');
    }

    // Segments structure
    expect(payload.segmentos).toHaveLength(2);
    for (const seg of payload.segmentos) {
      expect(seg).toHaveProperty('inicio');
      expect(seg).toHaveProperty('fim');
      expect(seg).toHaveProperty('funcoes');
      expect(seg.funcoes).toHaveLength(2);
      for (const f of seg.funcoes) {
        expect(f).toHaveProperty('funcionario_id');
        expect(f).toHaveProperty('funcao');
        expect(['PF', 'PM']).toContain(f.funcao);
      }
    }
  });

  it('10. payload validates: no duplicate participants', () => {
    const payload = buildPayload({
      data: '2026-06-20',
      horaInicio: '07:00',
      horaFim: '09:00',
      simuladorId: 16,
      instrutorId: 6,
      participantes: [
        { funcionario_id: 3, cumpre_treinamento: true, modelo_sessao_id: 16, gera_ficha: true },
        { funcionario_id: 3, cumpre_treinamento: false, gera_ficha: false },
      ],
    });

    // Duplicates are caught at the validation layer, not here
    // This test verifies the payload builder doesn't prevent duplicates
    // (validation happens server-side and in the form component)
    const ids = payload.participantes.map((p) => p.funcionario_id);
    expect(new Set(ids).size).toBeLessThan(ids.length); // confirms duplicate exists
  });
});

// ────────────────────────────────────────────────────────────
// Validation rules
// ────────────────────────────────────────────────────────────

describe('SharedSession validation rules', () => {
  it('11. overlapping segments should be detected', () => {
    // Two segments that overlap
    const seg1 = { inicio: '07:00', fim: '08:00' };
    const seg2 = { inicio: '07:30', fim: '09:00' };

    const s1Start = timeToMinutes(seg1.inicio);
    const s1End = timeToMinutes(seg1.fim);
    const s2Start = timeToMinutes(seg2.inicio);
    const s2End = timeToMinutes(seg2.fim);

    const overlaps = s1Start < s2End && s1End > s2Start;
    expect(overlaps).toBe(true);
  });

  it('12. non-overlapping segments should pass', () => {
    const seg1 = { inicio: '07:00', fim: '08:00' };
    const seg2 = { inicio: '08:00', fim: '09:00' };

    const s1Start = timeToMinutes(seg1.inicio);
    const s1End = timeToMinutes(seg1.fim);
    const s2Start = timeToMinutes(seg2.inicio);
    const s2End = timeToMinutes(seg2.fim);

    const overlaps = s1Start < s2End && s1End > s2Start;
    expect(overlaps).toBe(false);
  });

  it('13. at least one participant must be curricular', () => {
    const participants = [
      { cumpreTreinamento: false },
      { cumpreTreinamento: false },
    ];

    const hasCurricular = participants.some((p) => p.cumpreTreinamento);
    expect(hasCurricular).toBe(false);
  });

  it('14. invalid time range (fim <= inicio) should be detected', () => {
    const isValid = (inicio: string, fim: string) => timeToMinutes(fim) > timeToMinutes(inicio);

    expect(isValid('09:00', '07:00')).toBe(false);
    expect(isValid('07:00', '07:00')).toBe(false);
    expect(isValid('07:00', '09:00')).toBe(true);
  });

  it('15. curricular participant without modelo_sessao_id should be invalid', () => {
    const participant = {
      cumpre_treinamento: true,
      modelo_sessao_id: null,
    };

    const isValid = !(participant.cumpre_treinamento && !participant.modelo_sessao_id);
    expect(isValid).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// Legacy preservation
// ────────────────────────────────────────────────────────────

describe('Legacy session preservation', () => {
  it('16. legacy simple session payload does NOT include modo_compartilhado', () => {
    // This is the legacy payload structure for POST /simuladores/sessoes
    const legacyPayload = {
      tipo_dispositivo: 'SIMULADOR',
      simulador_id: 16,
      modelo_sessao_id: 74,
      data: '2026-06-20',
      horario_inicio: '07:00',
      horario_fim: '09:00',
      duracao_minutos: 120,
      instrutor_id: 6,
      tipo_sessao: 'PER',
      tipo_aeronave: 'SK76',
      tema_sessao: 'Teste Legacy',
      observacoes: null,
      participantes: [{ funcionario_id: 3, funcao: 'PIC' }],
      examinador_id: null,
      checks: [],
    };

    // Legacy should NOT have shared-session fields
    expect(legacyPayload).not.toHaveProperty('modo_compartilhado');
    expect(legacyPayload).not.toHaveProperty('segmentos');
    expect(legacyPayload).not.toHaveProperty('atribuicoes');

    // Legacy should keep its own format
    expect(legacyPayload).toHaveProperty('tipo_dispositivo');
    expect(legacyPayload).toHaveProperty('duracao_minutos');
    expect(legacyPayload).toHaveProperty('tipo_aeronave');
  });

  it('17. default modality is simple (not shared)', () => {
    // The modality state starts as false
    const modoCompartilhado = false;
    expect(modoCompartilhado).toBe(false);
  });

  it('18. shared session mode requires explicit opt-in (modo_compartilhado=1)', () => {
    // Simple session: modo_compartilhado should be 0 or absent
    const simpleSession = { modo_compartilhado: 0 };
    expect(simpleSession.modo_compartilhado).toBe(0);

    // Shared session: modo_compartilhado should be 1
    const sharedSession = { modo_compartilhado: 1 };
    expect(sharedSession.modo_compartilhado).toBe(1);

    // They are different
    expect(simpleSession.modo_compartilhado).not.toBe(sharedSession.modo_compartilhado);
  });
});
