/**
 * Escalas Module — Router Index
 * FIX-08: Modular entry point. Re-exports the main router and registers
 * additional sub-routers that were missing.
 *
 * Files in this module:
 *   helpers.ts        — Zod schemas, getEmpresaIdSafe, getEscalaVerificada
 *   escalas-core.ts   — Original monolith (renamed, unchanged behavior)
 *   index.ts          — This file (assembler + new endpoints)
 */

// Import the original monolith (renamed to escalas-core.ts)
import escalas from '../escalas-core';
import { auth } from '../../middleware/auth';
import { getEmpresaIdSafe, getEscalaVerificada } from '../escalas-shared';

// ================================================================
// MKT-04: GET /api/escalas/minha-escala
// Returns current user's events for a given month (personal view)
// ================================================================
escalas.get('/minha-escala', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const contextWithGet = c as unknown as { get: (key: string) => unknown };
  const userId = String(contextWithGet.get('userId') || '');
  const mes = Number(c.req.query('mes') || new Date().getMonth() + 1);
  const ano = Number(c.req.query('ano') || new Date().getFullYear());

  try {
    // Find the active escala for this month
    const escala = await db
      .prepare(
        `SELECT id, nome, mes, ano, status
         FROM escala_mensal
         WHERE empresa_id = ? AND mes = ? AND ano = ? AND deleted_at IS NULL
         ORDER BY CASE status WHEN 'publicada' THEN 1 WHEN 'aprovada' THEN 2 ELSE 3 END
         LIMIT 1`,
      )
      .bind(empresaId, mes, ano)
      .first<{ id: string; nome: string; mes: number; ano: number; status: string }>();

    if (!escala) {
      return c.json({ success: true, data: { eventos: [], escala: null } });
    }

    // Find this user's funcionario_id based on userId context
    let funcId: string | undefined;
    if (userId) {
      const funcRow = await db
        .prepare(
          `SELECT f.id
             FROM usuarios u
             JOIN funcionarios f ON f.id = u.funcionario_id
            WHERE u.id = ?
              AND f.empresa_id = ?
              AND (u.deleted_at IS NULL OR u.deleted_at = 0)
              AND f.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(userId, empresaId)
        .first<{ id: string }>();
      funcId = funcRow?.id;
    }

    if (!funcId) {
      return c.json({ success: true, data: { eventos: [], escala } });
    }

    // Get all events for this employee in this escala
    const evtRows = await db
      .prepare(
        `SELECT id, tipo_evento, data_inicio, data_fim, turno, local, aeronave,
                observacoes, status, gerado_automaticamente
         FROM escala_eventos
         WHERE escala_id = ? AND funcionario_id = ? AND deleted_at IS NULL
         ORDER BY data_inicio, turno`,
      )
      .bind(escala.id, funcId)
      .all();

    return c.json({
      success: true,
      data: {
        eventos: evtRows.results || [],
        escala: {
          id: escala.id,
          nome: escala.nome,
          mes: escala.mes,
          ano: escala.ano,
          status: escala.status,
          total_eventos: (evtRows.results || []).length,
        },
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ================================================================
// MKT-01: POST /api/escalas/:id/verificar-fdp
// Validates FDP (Flight Duty Period) for a specific pilot
// ================================================================
escalas.post('/:id/verificar-fdp', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const body = (await c.req.json().catch(() => ({}))) as {
      funcionario_id?: string;
      data_inicio?: string;
      data_fim?: string;
    };
    const funcId = body.funcionario_id;
    if (!funcId) {
      return c.json({ success: false, error: 'funcionario_id obrigatório' }, 400);
    }

    // Fetch all voo events for this employee in this schedule
    const evtRows = await db
      .prepare(
        `SELECT ee.data_inicio, ee.data_fim, ee.turno
         FROM escala_eventos ee
         WHERE ee.escala_id = ? AND ee.funcionario_id = ?
           AND ee.tipo_evento = 'voo' AND ee.deleted_at IS NULL
         ORDER BY ee.data_inicio`,
      )
      .bind(id, funcId)
      .all<{ data_inicio: string; data_fim: string; turno: string | null }>();

    const voos = evtRows.results || [];
    const diasVoo = [...new Set(voos.map((v) => v.data_inicio.slice(0, 10)))].sort();
    const totalDiasVoo = diasVoo.length;

    // Max consecutive days
    let maxConsec = 0;
    let consec = 1;
    for (let i = 1; i < diasVoo.length; i++) {
      const prev = new Date(diasVoo[i - 1]).getTime();
      const curr = new Date(diasVoo[i]).getTime();
      if (curr - prev === 86400000) {
        consec++;
        maxConsec = Math.max(maxConsec, consec);
      } else {
        consec = 1;
      }
    }
    if (diasVoo.length === 1) maxConsec = 1;

    // Night window violations (voos between 00:00-05:00)
    const voosNoturnos = voos.filter((v) => v.turno === 'noite');

    // Check if proposed new event would violate (if dates provided)
    const violacoes: Array<{
      tipo: string;
      descricao: string;
      gravidade: 'alto' | 'medio' | 'baixo';
    }> = [];

    if (totalDiasVoo > 20) {
      violacoes.push({
        tipo: 'max_dias_mes',
        descricao: `${totalDiasVoo} dias de voo no mês (limite recomendado: 20)`,
        gravidade: totalDiasVoo > 24 ? 'alto' : 'medio',
      });
    }
    if (maxConsec >= 6) {
      violacoes.push({
        tipo: 'dias_consecutivos',
        descricao: `${maxConsec} dias consecutivos de voo (limite recomendado: 6)`,
        gravidade: maxConsec >= 8 ? 'alto' : 'medio',
      });
    }
    if (voosNoturnos.length >= 4) {
      violacoes.push({
        tipo: 'janela_noturna',
        descricao: `${voosNoturnos.length} voos noturnos no mês — multiplicador de fadiga pode ser aplicado`,
        gravidade: 'medio',
      });
    }

    // Check new event (if passed in body) would create consecutive day violation
    if (body.data_inicio && body.data_fim) {
      const newStart = new Date(body.data_inicio);
      const newEnd = new Date(body.data_fim);
      const newDias: string[] = [];
      for (let d = new Date(newStart); d <= newEnd; d.setDate(d.getDate() + 1)) {
        newDias.push(d.toISOString().slice(0, 10));
      }
      const allDias = [...new Set([...diasVoo, ...newDias])].sort();
      let newConsec = 1;
      let newMaxConsec = 1;
      for (let i = 1; i < allDias.length; i++) {
        const p = new Date(allDias[i - 1]).getTime();
        const cur = new Date(allDias[i]).getTime();
        if (cur - p === 86400000) {
          newConsec++;
          newMaxConsec = Math.max(newMaxConsec, newConsec);
        } else {
          newConsec = 1;
        }
      }
      if (newMaxConsec >= 6 && newMaxConsec > maxConsec) {
        violacoes.push({
          tipo: 'dias_consecutivos_projecao',
          descricao: `Com este evento, serão ${newMaxConsec} dias consecutivos de voo`,
          gravidade: 'alto',
        });
      }
    }

    return c.json({
      success: true,
      data: {
        valido: violacoes.length === 0,
        total_dias_voo: totalDiasVoo,
        max_consecutivo: maxConsec,
        voos_noturnos: voosNoturnos.length,
        violacoes,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ================================================================
// INT-03: GET /api/escalas/frms-score/:funcionarioId
// Returns FRMS fatigue score for pilot (bidirectional integration)
// ================================================================
escalas.get('/frms-score/:funcionarioId', auth(), async (c) => {
  const funcId = c.req.param('funcionarioId');
  const db = c.env.DB;
  getEmpresaIdSafe(c);

  try {
    // Get accumulated flight hours in last 30 days from frms_jornada
    const rows = await db
      .prepare(
        `SELECT
           COUNT(*) AS total_jornadas,
           COALESCE(SUM(horas_voo_minutos), 0) AS total_minutos
         FROM frms_jornada
         WHERE tripulante_id = ?
           AND data >= date('now', '-30 days')
           AND deleted_at IS NULL`,
      )
      .bind(funcId)
      .first<{ total_jornadas: number; total_minutos: number }>();

    const totalMinutos = rows?.total_minutos ?? 0;
    const totalHoras = Math.round(totalMinutos / 60);
    const limiteHorasMensal = 80; // Regulatory limit (configurable)
    const percentual =
      limiteHorasMensal > 0 ? Math.round((totalHoras / limiteHorasMensal) * 100) : 0;

    // Check for consecutive days (fatigue risk)
    const diasRows = await db
      .prepare(
        `SELECT DISTINCT data FROM frms_jornada
         WHERE tripulante_id = ?
           AND data >= date('now', '-14 days')
           AND deleted_at IS NULL
         ORDER BY data`,
      )
      .bind(funcId)
      .all<{ data: string }>();

    const dias = (diasRows.results || []).map((r) => r.data);
    let maxConsec = 0;
    let consec = 1;
    for (let i = 1; i < dias.length; i++) {
      const prev = new Date(dias[i - 1]).getTime();
      const curr = new Date(dias[i]).getTime();
      if (curr - prev === 86400000) {
        consec++;
        maxConsec = Math.max(maxConsec, consec);
      } else {
        consec = 1;
      }
    }
    if (dias.length === 1) maxConsec = 1;

    // Composite score (0-100): weight hours 60%, consecutive days 40%
    const horasScore = Math.min(percentual, 100);
    const consecScore = Math.min(Math.round((maxConsec / 7) * 100), 100);
    const score = Math.round(horasScore * 0.6 + consecScore * 0.4);

    return c.json({
      success: true,
      data: {
        funcionario_id: funcId,
        score,
        total_horas_30d: totalHoras,
        limite_mensal: limiteHorasMensal,
        percentual_limite: percentual,
        dias_consecutivos_14d: maxConsec,
        nivel: score >= 95 ? 'critico' : score >= 80 ? 'alto' : score >= 50 ? 'medio' : 'baixo',
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default escalas;
