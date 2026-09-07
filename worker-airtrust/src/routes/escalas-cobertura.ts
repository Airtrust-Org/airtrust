/**
 * ESCALAS — Cobertura diária por aeronave (v2)
 *
 * Lê / recalcula escala_cobertura_diaria para exibir no calendário
 * quais dias têm GAP de PIC, SIC, ou excesso.
 *
 * Rotas:
 *   GET  /:id/cobertura                → leitura (recalcula lazy se vazio)
 *   POST /:id/cobertura/recalcular     → recálculo forçado completo
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe, getEscalaVerificada } from './escalas-shared';
import { recalcularCoberturaAeronave } from './escalas-alocacoes';
import { getHabilitacoesBatch } from '../shared/getTripulanteOperacional';
import { collectByBindChunks } from '../utils/d1-bind-chunks';

const cobertura = new Hono<{ Bindings: Env }>();

type CoberturaRow = {
  escala_id: string;
  aeronave_id: number;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  data: string;
  qtd_pic: number;
  qtd_sic: number;
  status_cobertura: string;
  updated_at: string;
};

type QuinzenaRow = {
  id: number;
  numero: number;
  data_inicio: string;
  data_fim: string;
};

type TripulanteBaseRow = {
  id: string;
  nome: string;
  nome_guerra: string | null;
  matricula: string | null;
  cargo: string;
  quinzena: string | null;
};

type AlocacaoCoberturaTripulanteRow = {
  id: string;
  funcionario_id: string;
  tipo: string | null;
  aeronave: string | null;
  aeronave_id: number | null;
  data_inicio: string;
  data_fim: string;
  situacao: string | null;
  situacao_nome: string | null;
  situacao_cor: string | null;
  situacao_icone: string | null;
  auto_gerado: number | null;
};

type TripulanteCoberturaPayload = {
  id: string;
  nome: string;
  nome_guerra: string | null;
  matricula: string | null;
  cargo: 'comandante' | 'copiloto';
  quinzena_numero: 1 | 2 | null;
  alocacao_q1: z.infer<typeof AlocacaoCoberturaSchema> | null;
  alocacao_q2: z.infer<typeof AlocacaoCoberturaSchema> | null;
  status_q1: 'alocado_aeronave' | 'alocado_situacao' | 'livre';
  status_q2: 'alocado_aeronave' | 'alocado_situacao' | 'livre';
  status_geral: 'completo' | 'parcial' | 'livre';
  modelos_habilitados: string[];
};

const AlocacaoCoberturaSchema = z.object({
  id: z.string(),
  tipo: z.string().nullable(),
  aeronave: z.string().nullable(),
  aeronave_id: z.number().nullable(),
  data_inicio: z.string(),
  data_fim: z.string(),
  situacao: z.string().nullable(),
  situacao_nome: z.string().nullable().optional(),
  situacao_cor: z.string().nullable().optional(),
  situacao_icone: z.string().nullable().optional(),
  situacao_tipo: z.string().nullable().optional(),
  auto_gerado: z.boolean().optional(),
});

const TripulanteCoberturaSchema = z.object({
  id: z.string(),
  nome: z.string(),
  nome_guerra: z.string().nullable(),
  matricula: z.string().nullable(),
  cargo: z.enum(['comandante', 'copiloto']),
  quinzena_numero: z.union([z.literal(1), z.literal(2)]).nullable(),
  alocacao_q1: AlocacaoCoberturaSchema.nullable(),
  alocacao_q2: AlocacaoCoberturaSchema.nullable(),
  status_q1: z.enum(['alocado_aeronave', 'alocado_situacao', 'livre']),
  status_q2: z.enum(['alocado_aeronave', 'alocado_situacao', 'livre']),
  status_geral: z.enum(['completo', 'parcial', 'livre']),
  modelos_habilitados: z.array(z.string()).optional().default([]),
});

const CoberturaTripulantesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    tripulantes: z.array(TripulanteCoberturaSchema),
    resumo: z.object({
      total: z.number(),
      completos: z.number(),
      parciais: z.number(),
      livres: z.number(),
    }),
  }),
});

function overlapsRange(
  dataInicio: string,
  dataFim: string,
  range: { data_inicio: string; data_fim: string },
) {
  return !(dataFim < range.data_inicio || dataInicio > range.data_fim);
}

function getStatusFromAlocacao(alocacao: AlocacaoCoberturaTripulanteRow | null) {
  if (!alocacao) return 'livre' as const;
  return alocacao.aeronave_id != null
    ? ('alocado_aeronave' as const)
    : ('alocado_situacao' as const);
}

function getStatusGeral(
  statusQ1: 'alocado_aeronave' | 'alocado_situacao' | 'livre',
  statusQ2: 'alocado_aeronave' | 'alocado_situacao' | 'livre',
) {
  if (statusQ1 !== 'livre' && statusQ2 !== 'livre') return 'completo' as const;
  if (statusQ1 === 'livre' && statusQ2 === 'livre') return 'livre' as const;
  return 'parcial' as const;
}

function getQuinzenaNumero(value: unknown): 1 | 2 | null {
  if (value == null) return null;
  if (typeof value === 'number') return value === 2 ? 2 : value === 1 ? 1 : null;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['2', '2q', '2ª', '2a', 'segunda', 'segunda quinzena'].includes(normalized)) return 2;
  if (['1', '1q', '1ª', '1a', 'primeira', 'primeira quinzena'].includes(normalized)) return 1;
  return null;
}

function getStatusGeralQuinzenaFixa(
  quinzenaNumero: 1 | 2 | null,
  statusQ1: 'alocado_aeronave' | 'alocado_situacao' | 'livre',
  statusQ2: 'alocado_aeronave' | 'alocado_situacao' | 'livre',
) {
  if (quinzenaNumero === 1) {
    if (statusQ1 !== 'livre') return 'completo' as const;
    return statusQ2 !== 'livre' ? ('parcial' as const) : ('livre' as const);
  }

  if (quinzenaNumero === 2) {
    if (statusQ2 !== 'livre') return 'completo' as const;
    return statusQ1 !== 'livre' ? ('parcial' as const) : ('livre' as const);
  }

  return getStatusGeral(statusQ1, statusQ2);
}

function toNullableString(value: unknown) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function toAlocacaoCoberturaPayload(
  alocacao: AlocacaoCoberturaTripulanteRow | null,
): TripulanteCoberturaPayload['alocacao_q1'] {
  if (!alocacao) return null;

  return {
    id: String(alocacao.id),
    tipo: toNullableString(alocacao.tipo),
    aeronave: toNullableString(alocacao.aeronave),
    aeronave_id:
      alocacao.aeronave_id == null || Number.isNaN(Number(alocacao.aeronave_id))
        ? null
        : Number(alocacao.aeronave_id),
    data_inicio: String(alocacao.data_inicio).slice(0, 10),
    data_fim: String(alocacao.data_fim).slice(0, 10),
    situacao: toNullableString(alocacao.situacao),
    situacao_nome: toNullableString(alocacao.situacao_nome),
    situacao_cor: toNullableString(alocacao.situacao_cor),
    situacao_icone: toNullableString(alocacao.situacao_icone),
    situacao_tipo: toNullableString(alocacao.situacao),
    auto_gerado: alocacao.auto_gerado === 1,
  };
}

function agruparCobertura(rows: CoberturaRow[]) {
  const mapa = new Map<
    number,
    {
      aeronave_id: number;
      prefixo: string | null;
      modelo: string | null;
      dias: Array<{
        data: string;
        qtd_pic: number;
        qtd_sic: number;
        status_cobertura: string;
        updated_at: string;
      }>;
      resumo: { total_dias: number; gaps: number; excessos: number; dias_cobertos: number };
    }
  >();

  for (const row of rows) {
    if (!mapa.has(row.aeronave_id)) {
      mapa.set(row.aeronave_id, {
        aeronave_id: row.aeronave_id,
        prefixo: row.aeronave_prefixo,
        modelo: row.aeronave_modelo,
        dias: [],
        resumo: { total_dias: 0, gaps: 0, excessos: 0, dias_cobertos: 0 },
      });
    }

    const grupo = mapa.get(row.aeronave_id)!;
    grupo.dias.push({
      data: row.data,
      qtd_pic: row.qtd_pic,
      qtd_sic: row.qtd_sic,
      status_cobertura: row.status_cobertura,
      updated_at: row.updated_at,
    });
    grupo.resumo.total_dias += 1;
    if (row.status_cobertura === 'ok') grupo.resumo.dias_cobertos += 1;
    else if (row.status_cobertura === 'excesso') grupo.resumo.excessos += 1;
    else grupo.resumo.gaps += 1;
  }

  return Array.from(mapa.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id/cobertura
// ─────────────────────────────────────────────────────────────────────────────

cobertura.get('/:id/cobertura', auth(), async (c) => {
  const escalaId = c.req.param('id');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const escala = await getEscalaVerificada(db, escalaId, empresaId);
  if (!escala) {
    return c.json({ success: false, error: 'Escala não encontrada' }, 404);
  }

  const aeronaveId = c.req.query('aeronave_id');

  // Filtros
  const conditions: string[] = ['ecd.escala_id = ?'];
  const bindings: (string | number)[] = [escalaId];

  if (aeronaveId) {
    conditions.push('ecd.aeronave_id = ?');
    bindings.push(Number(aeronaveId));
  }

  const rows = await db
    .prepare(
      `SELECT ecd.escala_id, ecd.aeronave_id, a.prefixo AS aeronave_prefixo, a.modelo AS aeronave_modelo,
              ecd.data, ecd.qtd_pic, ecd.qtd_sic, ecd.status_cobertura, ecd.updated_at
         FROM escala_cobertura_diaria ecd
         LEFT JOIN aeronaves a ON a.id = ecd.aeronave_id
        WHERE ${conditions.join(' AND ')}
          AND a.deleted_at IS NULL
          AND UPPER(COALESCE(NULLIF(TRIM(a.status), ''), 'ATIVO')) = 'ATIVO'
        ORDER BY ecd.aeronave_id, ecd.data`,
    )
    .bind(...bindings)
    .all<CoberturaRow>();

  // Lazy recalculate: se não há dados de cobertura para esta escala, recalcula tudo
  const resultado = rows.results || [];
  if (resultado.length === 0) {
    await recalcularEscalaCompleta(db, escalaId, Number(escala.mes), Number(escala.ano), empresaId);

    const rowsAposCalculo = await db
      .prepare(
        `SELECT ecd.escala_id, ecd.aeronave_id, a.prefixo AS aeronave_prefixo, a.modelo AS aeronave_modelo,
                ecd.data, ecd.qtd_pic, ecd.qtd_sic, ecd.status_cobertura, ecd.updated_at
           FROM escala_cobertura_diaria ecd
           LEFT JOIN aeronaves a ON a.id = ecd.aeronave_id
          WHERE ${conditions.join(' AND ')}
            AND a.deleted_at IS NULL
            AND UPPER(COALESCE(NULLIF(TRIM(a.status), ''), 'ATIVO')) = 'ATIVO'
          ORDER BY ecd.aeronave_id, ecd.data`,
      )
      .bind(...bindings)
      .all<CoberturaRow>();

    const grouped = agruparCobertura(rowsAposCalculo.results || []);

    return c.json({
      success: true,
      data: {
        cobertura: rowsAposCalculo.results || [],
        aeronaves: grouped,
        recalculado: true,
        total: rowsAposCalculo.results?.length ?? 0,
      },
    });
  }

  // Resumo por aeronave
  const grouped = agruparCobertura(resultado as CoberturaRow[]);

  return c.json({
    success: true,
    data: {
      cobertura: resultado,
      aeronaves: grouped,
      resumo: grouped.map((item) => ({
        aeronave_id: item.aeronave_id,
        aeronave_prefixo: item.prefixo,
        gaps: item.resumo.gaps,
        excessos: item.resumo.excessos,
      })),
      total: resultado.length,
      recalculado: false,
    },
  });
});

cobertura.get('/:id/cobertura/tripulantes', auth(), async (c) => {
  const escalaId = c.req.param('id');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const funcionariosCols = await db
    .prepare(`PRAGMA table_info(funcionarios)`)
    .all<{ name: string }>();
  const cols = (funcionariosCols.results || []).map((row) => String(row.name || '').toLowerCase());
  const hasCargo = cols.includes('cargo');
  const hasFuncao = cols.includes('funcao');
  const hasStatus = cols.includes('status');
  const hasAtivo = cols.includes('ativo');
  const hasEmpresaId = cols.includes('empresa_id');

  const roleExpr = hasFuncao
    ? `LOWER(TRIM(COALESCE(NULLIF(f.funcao, ''), NULLIF(f.cargo, ''))))`
    : hasCargo
      ? `LOWER(TRIM(COALESCE(NULLIF(f.cargo, ''), '')))`
      : `''`;

  const tripulantesWhere = ['f.deleted_at IS NULL'];
  const tripulantesBinds: Array<string | number> = [];

  if (hasAtivo) {
    tripulantesWhere.push('COALESCE(f.ativo, 1) = 1');
  } else if (hasStatus) {
    tripulantesWhere.push("UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'");
  }

  if (hasEmpresaId && empresaId !== undefined) {
    tripulantesWhere.push('f.empresa_id = ?');
    tripulantesBinds.push(empresaId);
  }

  tripulantesWhere.push(`(${roleExpr} LIKE '%comandante%' OR ${roleExpr} LIKE '%copiloto%')`);

  const escala = await getEscalaVerificada(db, escalaId, empresaId);
  if (!escala) {
    return c.json({ success: false, error: 'Escala não encontrada' }, 404);
  }

  const quinzenas = await db
    .prepare(
      `SELECT id, numero, data_inicio, data_fim
         FROM escalas_quinzenas
        WHERE empresa_id = ?
          AND ano = ?
          AND mes = ?
          AND deleted_at IS NULL
        ORDER BY numero ASC`,
    )
    .bind(empresaId, Number(escala.ano), Number(escala.mes))
    .all<QuinzenaRow>();

  const q1 = (quinzenas.results || []).find((item) => item.numero === 1) || null;
  const q2 = (quinzenas.results || []).find((item) => item.numero === 2) || null;

  const tripulantes = await db
    .prepare(
      `SELECT
         CAST(f.id AS TEXT) AS id,
         f.nome,
         f.guerra AS nome_guerra,
         f.matricula,
        f.quinzena,
         ${roleExpr} AS cargo
       FROM funcionarios f
       WHERE ${tripulantesWhere.join(' AND ')}
       ORDER BY
         CASE
           WHEN ${roleExpr} LIKE '%comandante%' THEN 0
           WHEN ${roleExpr} LIKE '%copiloto%' THEN 1
           ELSE 1
         END,
         COALESCE(NULLIF(TRIM(f.guerra), ''), TRIM(f.nome)),
         TRIM(f.nome)`,
    )
    .bind(...tripulantesBinds)
    .all<TripulanteBaseRow>();

  const tripulanteIds = (tripulantes.results || []).map((item) => item.id);
  const habilitacoesBatch = await getHabilitacoesBatch(db, tripulanteIds);
  const alocacoesPorFuncionario = new Map<string, AlocacaoCoberturaTripulanteRow[]>();

  if (tripulanteIds.length > 0) {
    const alocacoes = await collectByBindChunks(
      tripulanteIds,
      1,
      async (tripulanteIdChunk) => {
        const placeholders = tripulanteIdChunk.map(() => '?').join(', ');
        const rows = await db
          .prepare(
            `SELECT
               CAST(ea.id AS TEXT) AS id,
               CAST(ea.funcionario_id AS TEXT) AS funcionario_id,
               COALESCE(ea.situacao_tipo, ea.funcao) AS tipo,
               ae.prefixo AS aeronave,
               ea.aeronave_id,
               ea.data_inicio,
               ea.data_fim,
               ea.situacao_tipo AS situacao,
               est.nome AS situacao_nome,
               est.cor AS situacao_cor,
               est.icone AS situacao_icone,
               ea.auto_gerado
             FROM escala_alocacoes ea
             LEFT JOIN aeronaves ae ON ae.id = ea.aeronave_id
             LEFT JOIN escala_situacao_tipos est
               ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
              AND est.deleted_at IS NULL
             WHERE ea.escala_id = ?
               AND ea.deleted_at IS NULL
               AND ea.status != 'cancelado'
               AND (
                 ea.aeronave_id IS NULL
                 OR (ae.deleted_at IS NULL AND UPPER(COALESCE(NULLIF(TRIM(ae.status), ''), 'ATIVO')) = 'ATIVO')
               )
               AND CAST(ea.funcionario_id AS TEXT) IN (${placeholders})
             ORDER BY ea.data_inicio ASC, ea.created_at ASC`,
          )
          .bind(escalaId, ...tripulanteIdChunk)
          .all<AlocacaoCoberturaTripulanteRow>();
        return rows.results || [];
      },
    );

    for (const alocacao of alocacoes) {
      const lista = alocacoesPorFuncionario.get(alocacao.funcionario_id) || [];
      lista.push(alocacao);
      alocacoesPorFuncionario.set(alocacao.funcionario_id, lista);
    }
  }

  const tripulantesPayload: TripulanteCoberturaPayload[] = (tripulantes.results || []).map(
    (tripulante) => {
      const alocacoes = alocacoesPorFuncionario.get(tripulante.id) || [];
      const alocacaoQ1 = q1
        ? alocacoes.find((item) => overlapsRange(item.data_inicio, item.data_fim, q1)) || null
        : null;
      const alocacaoQ2 = q2
        ? alocacoes.find((item) => overlapsRange(item.data_inicio, item.data_fim, q2)) || null
        : null;
      const quinzenaNumero = getQuinzenaNumero(tripulante.quinzena);
      const statusQ1 = getStatusFromAlocacao(alocacaoQ1);
      const statusQ2 = getStatusFromAlocacao(alocacaoQ2);
      const statusGeral = getStatusGeralQuinzenaFixa(quinzenaNumero, statusQ1, statusQ2);

      return {
        id: String(tripulante.id),
        nome: String(tripulante.nome || 'Tripulante'),
        nome_guerra: toNullableString(tripulante.nome_guerra),
        matricula: toNullableString(tripulante.matricula),
        cargo: tripulante.cargo === 'comandante' ? 'comandante' : 'copiloto',
        quinzena_numero: quinzenaNumero,
        alocacao_q1: toAlocacaoCoberturaPayload(alocacaoQ1),
        alocacao_q2: toAlocacaoCoberturaPayload(alocacaoQ2),
        status_q1: statusQ1,
        status_q2: statusQ2,
        status_geral: statusGeral,
        modelos_habilitados: (habilitacoesBatch[tripulante.id] || []).map((h) => h.modelo_codigo),
      };
    },
  );

  const payload = {
    success: true as const,
    data: {
      tripulantes: tripulantesPayload,
      resumo: {
        total: 0,
        completos: 0,
        parciais: 0,
        livres: 0,
      },
    },
  };

  payload.data.resumo.total = payload.data.tripulantes.length;
  payload.data.resumo.completos = payload.data.tripulantes.filter(
    (item) => item.status_geral === 'completo',
  ).length;
  payload.data.resumo.parciais = payload.data.tripulantes.filter(
    (item) => item.status_geral === 'parcial',
  ).length;
  payload.data.resumo.livres = payload.data.tripulantes.filter(
    (item) => item.status_geral === 'livre',
  ).length;

  const validated = CoberturaTripulantesResponseSchema.parse(payload);
  return c.json(validated);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/cobertura/recalcular — recálculo forçado
// ─────────────────────────────────────────────────────────────────────────────

cobertura.post('/:id/cobertura/recalcular', auth(), async (c) => {
  const escalaId = c.req.param('id');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const escala = await getEscalaVerificada(db, escalaId, empresaId);
  if (!escala) {
    return c.json({ success: false, error: 'Escala não encontrada' }, 404);
  }

  const aeronaveIdParam = c.req.query('aeronave_id');

  if (aeronaveIdParam) {
    // Recalcular apenas uma aeronave
    await recalcularCoberturaAeronave(
      db,
      escalaId,
      Number(aeronaveIdParam),
      Number(escala.mes),
      Number(escala.ano),
      empresaId,
    );
    return c.json({
      success: true,
      data: { message: `Cobertura recalculada para aeronave ${aeronaveIdParam}` },
    });
  }

  // Recalcular todas as aeronaves da escala
  const aeronaves = await db
    .prepare(
      `SELECT DISTINCT aeronave_id FROM escala_alocacoes
        WHERE escala_id = ? AND deleted_at IS NULL`,
    )
    .bind(escalaId)
    .all<{ aeronave_id: number }>();

  const aeronaveIds = (aeronaves.results || []).map((r) => r.aeronave_id);

  if (aeronaveIds.length === 0) {
    // Nada a recalcular — limpar cache obsoleto se houver
    await db
      .prepare(`DELETE FROM escala_cobertura_diaria WHERE escala_id = ?`)
      .bind(escalaId)
      .run();

    return c.json({
      success: true,
      data: { message: 'Nenhuma aeronave com alocações para recalcular', aeronaves_processadas: 0 },
    });
  }

  const mes = Number(escala.mes);
  const ano = Number(escala.ano);
  let gapsDetectados = 0;

  for (const aId of aeronaveIds) {
    await recalcularCoberturaAeronave(db, escalaId, aId, mes, ano, empresaId);

    const resumoAeronave = await db
      .prepare(
        `SELECT COUNT(*) AS total
           FROM escala_cobertura_diaria
          WHERE escala_id = ?
            AND aeronave_id = ?
            AND status_cobertura != 'ok'`,
      )
      .bind(escalaId, aId)
      .first<{ total: number }>();
    gapsDetectados += Number(resumoAeronave?.total || 0);
  }

  return c.json({
    success: true,
    data: {
      message: `Cobertura recalculada para ${aeronaveIds.length} aeronave${aeronaveIds.length === 1 ? '' : 's'}`,
      aeronaves_processadas: aeronaveIds.length,
      total_dias_calculados:
        aeronaveIds.length * new Date(Number(escala.ano), Number(escala.mes), 0).getDate(),
      gaps_detectados: gapsDetectados,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER INTERNO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recalcula a cobertura diária para TODAS as aeronaves de uma escala.
 */
async function recalcularEscalaCompleta(
  db: D1Database,
  escalaId: string,
  mes: number,
  ano: number,
  empresaId: number,
): Promise<void> {
  const aeronaves = await db
    .prepare(
      `SELECT DISTINCT aeronave_id FROM escala_alocacoes
        WHERE escala_id = ? AND deleted_at IS NULL`,
    )
    .bind(escalaId)
    .all<{ aeronave_id: number }>();

  for (const row of aeronaves.results || []) {
    await recalcularCoberturaAeronave(db, escalaId, row.aeronave_id, mes, ano, empresaId);
  }
}

export default cobertura;
