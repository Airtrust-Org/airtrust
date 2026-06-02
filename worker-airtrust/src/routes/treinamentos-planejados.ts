import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { syncTreinamentoPlanejadoIntegration } from '../services/treinamentos-planejados-integration';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import {
  buildConvocacaoPreview,
  getEmailConvocacaoConfig,
  listConvocacaoHistory,
  listGestoresCopia,
  persistConvocacaoItem,
  sendConvocacaoInBatches,
} from '../services/treinamentos-convocacao-email';

const treinamentosPlanejadosRoutes = new Hono<{ Bindings: Env }>();

treinamentosPlanejadosRoutes.use('*', auth());

const STATUS_VALUES = [
  'PLANEJADO',
  'CONFIRMADO',
  'EM_ANDAMENTO',
  'CONCLUIDO',
  'CANCELADO',
] as const;

const eventoSchema = z.object({
  qualificacao_tipo_id: z.number().int().positive(),
  titulo: z.string().trim().min(3).max(200),
  descricao: z.string().trim().max(4000).optional().nullable(),
  observacoes: z.string().trim().max(4000).optional().nullable(),
  local: z.string().trim().max(200).optional().nullable(),
  data_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  hora_fim: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  instrutor_id: z.number().int().positive().optional().nullable(),
  carga_horaria_prevista: z.number().int().min(0).max(1000).optional().nullable(),
  status: z.enum(STATUS_VALUES).optional().default('PLANEJADO'),
  participante_ids: z.array(z.number().int().positive()).optional().default([]),
});

const eventoPatchSchema = eventoSchema.partial().extend({
  participante_ids: z.array(z.number().int().positive()).optional(),
});

const participantesSchema = z.object({
  participante_ids: z.array(z.number().int().positive()).default([]),
});

const presencaSchema = z.object({
  funcionario_id: z.number().int().positive(),
  confirmado: z.boolean().optional(),
  presente: z.boolean().nullable().optional(),
  aprovado: z.boolean().nullable().optional(),
  nota: z.number().min(0).max(100).nullable().optional(),
  observacoes: z.string().trim().max(4000).nullable().optional(),
});

type EventoRow = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_nome: string | null;
  qualificacao_codigo: string | null;
  data_prevista: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: (typeof STATUS_VALUES)[number];
  instrutor_id: number | null;
  instrutor_nome: string | null;
  instrutor_guerra: string | null;
  local: string | null;
  carga_horaria_prevista: number | null;
  titulo: string | null;
  descricao: string | null;
  observacoes: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  convocados_total: number | string | null;
  confirmados_total: number | string | null;
  presentes_total: number | string | null;
};

type ParticipanteRow = {
  id: number;
  treinamento_id: number;
  funcionario_id: number;
  funcionario_nome: string | null;
  funcionario_guerra: string | null;
  funcionario_matricula: string | null;
  funcionario_email: string | null;
  funcionario_setor: string | null;
  funcionario_funcao: string | null;
  confirmado: number | null;
  presente: number | null;
  aprovado: number | null;
  nota: number | null;
  observacoes: string | null;
  qualificacao_historico_id: number | null;
};

type AuditoriaRow = {
  id: number;
  acao: string;
  registro_id: string;
  usuario_nome: string | null;
  dados_antes: string | null;
  dados_depois: string | null;
  created_at: string;
};

async function resolveGestoresCcByParticipantes(
  db: D1Database,
  empresaId: number,
  participantes: Array<{ funcionario_id: number }> | null | undefined,
  gestoresCcIdsInput: number[] | null,
) {
  const gestoresCcAtivos = (await listGestoresCopia(db, empresaId, true)).filter(
    (gestor) => gestor.ativo,
  );

  const funcionarioIds = Array.from(
    new Set(
      (participantes || [])
        .map((participante) => Number(participante?.funcionario_id || 0))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );

  let gestoresBase = gestoresCcAtivos;

  if (funcionarioIds.length > 0) {
    const placeholders = funcionarioIds.map(() => '?').join(',');
    const rows = await db
      .prepare(
        `
        SELECT DISTINCT g.id
          FROM funcionarios f
          INNER JOIN setores_gestores sg
            ON sg.setor_id = f.setor_id
           AND sg.empresa_id = f.empresa_id
           AND sg.deleted_at IS NULL
           AND sg.ativo = 1
          INNER JOIN notificacoes_convocacao_cc_gestores g
            ON g.id = sg.gestor_id
           AND g.empresa_id = f.empresa_id
           AND g.deleted_at IS NULL
           AND g.ativo = 1
         WHERE f.empresa_id = ?
           AND f.deleted_at IS NULL
           AND f.id IN (${placeholders})
        `,
      )
      .bind(empresaId, ...funcionarioIds)
      .all<{ id: number }>();

    const idsFromSetores = Array.from(
      new Set((rows.results || []).map((row) => Number(row.id || 0)).filter((id) => id > 0)),
    );

    // Se houver mapeamento setor->gestor, restringe estritamente a ele.
    if (idsFromSetores.length > 0) {
      gestoresBase = gestoresCcAtivos.filter((gestor) => idsFromSetores.includes(gestor.id));
    }
  }

  return gestoresCcIdsInput === null
    ? gestoresBase
    : gestoresBase.filter((gestor) => gestoresCcIdsInput.includes(gestor.id));
}

function toNullableText(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toSqlBoolean(value: boolean | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value ? 1 : 0;
}

function normalizePositiveIds(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function buildMonthRange(mes?: string | null): { inicio: string; fim: string } | null {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const [year, month] = mes.split('-').map(Number);
  const inicio = new Date(year, month - 1, 1);
  const fim = new Date(year, month, 0);

  const format = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return {
    inicio: format(inicio),
    fim: format(fim),
  };
}

async function replaceParticipantes(
  db: D1Database,
  treinamentoId: number,
  participanteIds: number[],
): Promise<void> {
  const ids = normalizePositiveIds(participanteIds);
  const existing = await db
    .prepare('SELECT funcionario_id FROM treinamentos_participantes WHERE treinamento_id = ?')
    .bind(treinamentoId)
    .all<{ funcionario_id: number }>();

  const existingIds = new Set(
    (existing.results || []).map((row) => Number(row.funcionario_id)).filter((value) => value > 0),
  );

  const idsToDelete = [...existingIds].filter((id) => !ids.includes(id));
  if (idsToDelete.length > 0) {
    const placeholders = idsToDelete.map(() => '?').join(', ');
    await db
      .prepare(
        `DELETE FROM treinamentos_participantes WHERE treinamento_id = ? AND funcionario_id IN (${placeholders})`,
      )
      .bind(treinamentoId, ...idsToDelete)
      .run();
  }

  const idsToInsert = ids.filter((id) => !existingIds.has(id));
  for (const funcionarioId of idsToInsert) {
    await db
      .prepare(
        `INSERT INTO treinamentos_participantes (
          treinamento_id, funcionario_id, confirmado, presente, aprovado, nota, observacoes, created_at, updated_at
        ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))`,
      )
      .bind(treinamentoId, funcionarioId)
      .run();
  }
}

async function loadParticipanteLinks(
  db: D1Database,
  treinamentoId: number,
): Promise<Array<{ funcionario_id: number; qualificacao_historico_id: number | null }>> {
  const rows = await db
    .prepare(
      `SELECT funcionario_id, qualificacao_historico_id
         FROM treinamentos_participantes
        WHERE treinamento_id = ?`,
    )
    .bind(treinamentoId)
    .all<{ funcionario_id: number; qualificacao_historico_id: number | null }>();

  return rows.results || [];
}

async function loadParticipantesByTreinamento(
  db: D1Database,
  empresaId: number,
  treinamentoIds: number[],
): Promise<Map<number, ParticipanteRow[]>> {
  const map = new Map<number, ParticipanteRow[]>();
  if (treinamentoIds.length === 0) return map;

  const placeholders = treinamentoIds.map(() => '?').join(', ');
  const query = `SELECT tp.id,
                        tp.treinamento_id,
                        tp.funcionario_id,
                        f.nome AS funcionario_nome,
                        f.guerra AS funcionario_guerra,
                        f.matricula AS funcionario_matricula,
                        f.email AS funcionario_email,
                        f.setor AS funcionario_setor,
                        f.funcao AS funcionario_funcao,
                        tp.confirmado,
                        tp.presente,
                        tp.aprovado,
                        tp.nota,
                        tp.observacoes,
                        tp.qualificacao_historico_id
                   FROM treinamentos_participantes tp
                   INNER JOIN treinamentos_planejados t ON t.id = tp.treinamento_id AND t.deleted_at IS NULL
                   LEFT JOIN funcionarios f ON f.id = tp.funcionario_id AND f.deleted_at IS NULL
                  WHERE t.empresa_id = ?
                    AND tp.treinamento_id IN (${placeholders})
                  ORDER BY COALESCE(f.nome, ''), tp.funcionario_id`;

  const rows = await db
    .prepare(query)
    .bind(empresaId, ...treinamentoIds)
    .all<ParticipanteRow>();

  for (const row of rows.results || []) {
    const treinamentoId = Number(row.treinamento_id);
    const current = map.get(treinamentoId) || [];
    current.push(row);
    map.set(treinamentoId, current);
  }

  return map;
}

function serializeParticipante(row: ParticipanteRow) {
  return {
    id: Number(row.id),
    treinamento_id: Number(row.treinamento_id),
    funcionario_id: Number(row.funcionario_id),
    funcionario_nome: row.funcionario_nome,
    funcionario_guerra: row.funcionario_guerra,
    funcionario_matricula: row.funcionario_matricula,
    funcionario_email: row.funcionario_email,
    funcionario_setor: row.funcionario_setor,
    funcionario_funcao: row.funcionario_funcao,
    confirmado: Number(row.confirmado || 0) === 1,
    presente:
      row.presente === null || row.presente === undefined ? null : Number(row.presente) === 1,
    aprovado:
      row.aprovado === null || row.aprovado === undefined ? null : Number(row.aprovado) === 1,
    nota: row.nota === null || row.nota === undefined ? null : Number(row.nota),
    observacoes: row.observacoes,
    qualificacao_historico_id: row.qualificacao_historico_id,
  };
}

function serializeEvento(row: EventoRow, participantes: ParticipanteRow[]) {
  return {
    id: Number(row.id),
    empresa_id: Number(row.empresa_id),
    qualificacao_tipo_id: Number(row.qualificacao_tipo_id),
    qualificacao_nome: row.qualificacao_nome,
    qualificacao_codigo: row.qualificacao_codigo,
    data_prevista: row.data_prevista,
    hora_inicio: row.hora_inicio,
    hora_fim: row.hora_fim,
    status: row.status,
    instrutor_id: row.instrutor_id,
    instrutor_nome: row.instrutor_nome,
    instrutor_guerra: row.instrutor_guerra,
    local: row.local,
    carga_horaria_prevista:
      row.carga_horaria_prevista === null || row.carga_horaria_prevista === undefined
        ? null
        : Number(row.carga_horaria_prevista),
    titulo: row.titulo,
    descricao: row.descricao,
    observacoes: row.observacoes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    convocados_total: Number(row.convocados_total || 0),
    confirmados_total: Number(row.confirmados_total || 0),
    presentes_total: Number(row.presentes_total || 0),
    participantes: participantes.map(serializeParticipante),
  };
}

async function listEventos(
  db: D1Database,
  empresaId: number,
  filters: {
    status?: string | null;
    inicio?: string | null;
    fim?: string | null;
    instrutorId?: string | null;
    funcionarioId?: string | null;
    busca?: string | null;
    treinamentoId?: number | null;
  },
) {
  let sql = `SELECT t.id,
                    t.empresa_id,
                    t.qualificacao_tipo_id,
                    qt.nome AS qualificacao_nome,
                    qt.codigo AS qualificacao_codigo,
                    t.data_prevista,
                    t.hora_inicio,
                    t.hora_fim,
                    t.status,
                    t.instrutor_id,
                    instr.nome AS instrutor_nome,
                    instr.guerra AS instrutor_guerra,
                    t.local,
                    t.carga_horaria_prevista,
                    t.titulo,
                    t.descricao,
                    t.observacoes,
                    t.created_by,
                    t.created_at,
                    t.updated_at,
                    COUNT(tp.id) AS convocados_total,
                    SUM(CASE WHEN COALESCE(tp.confirmado, 0) = 1 THEN 1 ELSE 0 END) AS confirmados_total,
                    SUM(CASE WHEN COALESCE(tp.presente, 0) = 1 THEN 1 ELSE 0 END) AS presentes_total
               FROM treinamentos_planejados t
               LEFT JOIN qualificacoes_tipos qt ON qt.id = t.qualificacao_tipo_id AND qt.deleted_at IS NULL
               LEFT JOIN funcionarios instr ON instr.id = t.instrutor_id AND instr.deleted_at IS NULL
               LEFT JOIN treinamentos_participantes tp ON tp.treinamento_id = t.id
              WHERE t.empresa_id = ?
                AND t.deleted_at IS NULL`;

  const params: unknown[] = [empresaId];

  if (filters.treinamentoId) {
    sql += ' AND t.id = ?';
    params.push(filters.treinamentoId);
  }
  if (filters.status) {
    sql += ' AND t.status = ?';
    params.push(filters.status);
  }
  if (filters.inicio) {
    sql += ' AND date(t.data_prevista) >= date(?)';
    params.push(filters.inicio);
  }
  if (filters.fim) {
    sql += ' AND date(t.data_prevista) <= date(?)';
    params.push(filters.fim);
  }
  if (filters.instrutorId) {
    sql += ' AND t.instrutor_id = ?';
    params.push(Number(filters.instrutorId));
  }
  if (filters.funcionarioId) {
    sql +=
      ' AND EXISTS (SELECT 1 FROM treinamentos_participantes tp2 WHERE tp2.treinamento_id = t.id AND tp2.funcionario_id = ?)';
    params.push(Number(filters.funcionarioId));
  }
  if (filters.busca) {
    const busca = `%${filters.busca.trim().toUpperCase()}%`;
    sql += ` AND (
      UPPER(COALESCE(t.titulo, '')) LIKE ? OR
      UPPER(COALESCE(t.local, '')) LIKE ? OR
      UPPER(COALESCE(qt.nome, '')) LIKE ? OR
      UPPER(COALESCE(instr.nome, '')) LIKE ?
    )`;
    params.push(busca, busca, busca, busca);
  }

  sql += ` GROUP BY t.id
           ORDER BY date(t.data_prevista) ASC, COALESCE(t.hora_inicio, '00:00') ASC, t.id DESC
           LIMIT 400`;

  const rows = await db
    .prepare(sql)
    .bind(...params)
    .all<EventoRow>();

  const ids = (rows.results || []).map((row) => Number(row.id));
  const participantes = await loadParticipantesByTreinamento(db, empresaId, ids);

  return (rows.results || []).map((row) =>
    serializeEvento(row, participantes.get(Number(row.id)) || []),
  );
}

async function loadAuditoriaByTreinamento(
  db: D1Database,
  treinamentoIds: number[],
): Promise<Map<number, AuditoriaRow[]>> {
  const map = new Map<number, AuditoriaRow[]>();
  if (treinamentoIds.length === 0) return map;

  const placeholders = treinamentoIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id, acao, registro_id, usuario_nome, dados_antes, dados_depois, created_at
         FROM auditoria
        WHERE tabela_afetada = 'treinamentos_planejados'
          AND registro_id IN (${placeholders})
        ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .bind(...treinamentoIds.map(String))
    .all<AuditoriaRow>();

  for (const row of rows.results || []) {
    const treinamentoId = Number(row.registro_id);
    const current = map.get(treinamentoId) || [];
    current.push(row);
    map.set(treinamentoId, current);
  }

  return map;
}

treinamentosPlanejadosRoutes.get('/planejados', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const items = await listEventos(db, empresaId, {
    status: c.req.query('status'),
    inicio: c.req.query('inicio'),
    fim: c.req.query('fim'),
    instrutorId: c.req.query('instrutor_id'),
    funcionarioId: c.req.query('funcionario_id'),
    busca: c.req.query('busca'),
  });

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
    },
  });
});

treinamentosPlanejadosRoutes.get('/planejados/calendario', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const monthRange = buildMonthRange(c.req.query('mes'));
  const inicio = c.req.query('inicio') || monthRange?.inicio || null;
  const fim = c.req.query('fim') || monthRange?.fim || null;

  const items = await listEventos(db, empresaId, {
    status: c.req.query('status'),
    inicio,
    fim,
    instrutorId: c.req.query('instrutor_id'),
    funcionarioId: c.req.query('funcionario_id'),
    busca: c.req.query('busca'),
  });

  return c.json({
    success: true,
    data: {
      periodo: {
        inicio,
        fim,
      },
      items,
    },
  });
});

treinamentosPlanejadosRoutes.get('/planejados/auditoria', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const items = await listEventos(db, empresaId, {
    status: c.req.query('status'),
    inicio: c.req.query('inicio'),
    fim: c.req.query('fim'),
    instrutorId: c.req.query('instrutor_id'),
    funcionarioId: c.req.query('funcionario_id'),
    busca: c.req.query('busca'),
  });

  const auditMap = await loadAuditoriaByTreinamento(
    db,
    items.map((item) => Number(item.id)),
  );

  const enriched = items.map((item) => ({
    ...item,
    auditoria: (auditMap.get(Number(item.id)) || []).slice(0, 10).map((entry) => ({
      id: entry.id,
      acao: entry.acao,
      usuario_nome: entry.usuario_nome,
      created_at: entry.created_at,
      dados_antes: entry.dados_antes,
      dados_depois: entry.dados_depois,
    })),
  }));

  const resumo = {
    total_eventos: enriched.length,
    total_convocados: enriched.reduce((total, item) => total + item.convocados_total, 0),
    total_confirmados: enriched.reduce((total, item) => total + item.confirmados_total, 0),
    total_presentes: enriched.reduce((total, item) => total + item.presentes_total, 0),
    prontos_para_auditoria: enriched.filter(
      (item) => item.convocados_total > 0 && item.status !== 'CANCELADO',
    ).length,
  };

  return c.json({
    success: true,
    data: {
      items: enriched,
      resumo,
    },
  });
});

treinamentosPlanejadosRoutes.get('/planejados/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const treinamentoId = Number(c.req.param('id'));
  if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const items = await listEventos(db, empresaId, { treinamentoId });
  const item = items[0];
  if (!item) {
    return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
  }

  const auditMap = await loadAuditoriaByTreinamento(db, [treinamentoId]);

  return c.json({
    success: true,
    data: {
      ...item,
      convocacoes_email: await listConvocacaoHistory(db, treinamentoId),
      auditoria: (auditMap.get(treinamentoId) || []).slice(0, 20).map((entry) => ({
        id: entry.id,
        acao: entry.acao,
        usuario_nome: entry.usuario_nome,
        created_at: entry.created_at,
        dados_antes: entry.dados_antes,
        dados_depois: entry.dados_depois,
      })),
    },
  });
});

treinamentosPlanejadosRoutes.post('/planejados', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const parsed = eventoSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const input = parsed.data;
  const participanteIds = normalizePositiveIds(input.participante_ids || []);
  const ua = extrairUsuarioAuditoria(c);

  const result = await db
    .prepare(
      `INSERT INTO treinamentos_planejados (
        empresa_id, qualificacao_tipo_id, data_prevista, hora_inicio, hora_fim, status,
        instrutor_id, local, carga_horaria_prevista, titulo, descricao, observacoes,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      empresaId,
      input.qualificacao_tipo_id,
      input.data_prevista,
      toNullableText(input.hora_inicio),
      toNullableText(input.hora_fim),
      input.status,
      input.instrutor_id ?? null,
      toNullableText(input.local),
      input.carga_horaria_prevista ?? null,
      input.titulo,
      toNullableText(input.descricao),
      toNullableText(input.observacoes),
      ua.usuario_id ?? null,
    )
    .run();

  const treinamentoId = Number(result.meta.last_row_id || 0);
  await replaceParticipantes(db, treinamentoId, participanteIds);
  await syncTreinamentoPlanejadoIntegration({
    db,
    empresaId,
    treinamentoId,
  });

  await registrarAuditoria({
    db,
    tabela: 'treinamentos_planejados',
    acao: 'INSERT',
    registro_id: treinamentoId,
    dados_novos: {
      titulo: input.titulo,
      data_prevista: input.data_prevista,
      status: input.status,
      participante_ids: participanteIds,
    },
    ...ua,
  });

  return c.json(
    {
      success: true,
      data: {
        id: treinamentoId,
      },
    },
    201,
  );
});

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/convocacoes/preview',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const items = await listEventos(db, empresaId, { treinamentoId });
    const item = items[0];
    if (!item) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }
    if (!item.data_prevista) {
      return c.json({ success: false, error: 'A turma não possui data definida' }, 400);
    }
    if (item.status === 'CONCLUIDO' || item.status === 'CANCELADO') {
      return c.json({ success: false, error: 'A turma já foi encerrada/concluída' }, 400);
    }
    if (item.participantes.length === 0) {
      return c.json({ success: false, error: 'A turma não possui tripulantes matriculados' }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as { gestores_cc_ids?: number[] };
    const gestoresCcIdsInput = Array.isArray(body.gestores_cc_ids)
      ? Array.from(
          new Set(
            body.gestores_cc_ids
              .map((value) => Number(value || 0))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        )
      : null;

    const config = await getEmailConvocacaoConfig(db, empresaId);
    const gestoresCc = await resolveGestoresCcByParticipantes(
      db,
      empresaId,
      item.participantes,
      gestoresCcIdsInput,
    );
    const ultimaConvocacao = (await listConvocacaoHistory(db, treinamentoId))[0] || null;
    const empresa = await db
      .prepare('SELECT nome FROM empresas WHERE id = ?')
      .bind(empresaId)
      .first<{ nome: string | null }>();

    const preview = buildConvocacaoPreview({
      treinamento: item,
      empresaNome: empresa?.nome || 'AirTrust',
      config,
      gestoresCc,
      ultimaConvocacaoEm: ultimaConvocacao?.created_at || null,
    });

    return c.json({
      success: true,
      data: {
        ...preview,
        config: {
          assunto_padrao: config.assunto_padrao,
          reply_to: config.reply_to,
        },
      },
    });
  },
);

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/convocacoes',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      force_resend?: boolean;
      skip_missing_email?: boolean;
      gestores_cc_ids?: number[];
    };
    const items = await listEventos(db, empresaId, { treinamentoId });
    const item = items[0];
    if (!item) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }
    if (!item.data_prevista) {
      return c.json({ success: false, error: 'A turma não possui data definida' }, 400);
    }
    if (item.status === 'CONCLUIDO' || item.status === 'CANCELADO') {
      return c.json({ success: false, error: 'A turma já foi encerrada/concluída' }, 400);
    }
    if (item.participantes.length === 0) {
      return c.json({ success: false, error: 'A turma não possui tripulantes matriculados' }, 400);
    }

    const gestoresCcIdsInput = Array.isArray(body.gestores_cc_ids)
      ? Array.from(
          new Set(
            body.gestores_cc_ids
              .map((value) => Number(value || 0))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        )
      : null;

    const config = await getEmailConvocacaoConfig(db, empresaId);
    const gestoresCc = await resolveGestoresCcByParticipantes(
      db,
      empresaId,
      item.participantes,
      gestoresCcIdsInput,
    );
    const historico = await listConvocacaoHistory(db, treinamentoId);
    if (historico.length > 0 && !body.force_resend) {
      return c.json(
        {
          success: false,
          error: `Esta turma já recebeu convocação em ${historico[0].created_at}. Deseja reenviar?`,
          code: 'CONVOCACAO_REENVIO_CONFIRMATION_REQUIRED',
        },
        409,
      );
    }

    const empresa = await db
      .prepare('SELECT nome FROM empresas WHERE id = ?')
      .bind(empresaId)
      .first<{ nome: string | null }>();
    const preview = buildConvocacaoPreview({
      treinamento: item,
      empresaNome: empresa?.nome || 'AirTrust',
      config,
      gestoresCc,
      ultimaConvocacaoEm: historico[0]?.created_at || null,
    });

    if (!body.skip_missing_email && preview.ausentes_email.length > 0) {
      return c.json(
        {
          success: false,
          error:
            'Existem tripulantes sem e-mail cadastrado. Revise antes de enviar ou confirme o envio ignorando esses registros.',
          code: 'CONVOCACAO_MISSING_EMAIL_CONFIRMATION_REQUIRED',
          data: preview,
        },
        409,
      );
    }

    const ua = extrairUsuarioAuditoria(c);
    const sendResult = await sendConvocacaoInBatches({
      env: c.env,
      db,
      empresaId,
      treinamentoId,
      disparadoPor: ua.usuario_id ? Number(ua.usuario_id) : null,
      disparadoPorNome: ua.usuario_nome || null,
      subjectTemplate: config.assunto_padrao,
      templateHtml: config.template_html,
      assinaturaHtml: config.assinatura_html,
      replyTo: config.reply_to,
      senderName: config.sender_name,
      senderEmail: config.smtp_user,
      cc: gestoresCc.map((gestor) => gestor.email),
      preview,
      participantes: preview.participantes,
      batchSize: config.batch_size,
      batchIntervalMs: config.batch_interval_ms,
      empresaNome: empresa?.nome || 'AirTrust',
    });

    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'CONVOCACAO_EMAIL',
      registro_id: treinamentoId,
      dados_novos: {
        convocacao_id: sendResult.convocacaoId,
        enviados_sucesso: sendResult.enviados_sucesso,
        enviados_falha: sendResult.enviados_falha,
      },
      ...ua,
    });

    return c.json({
      success: true,
      data: {
        convocacao_id: sendResult.convocacaoId,
        enviados_sucesso: sendResult.enviados_sucesso,
        enviados_falha: sendResult.enviados_falha,
        itens: sendResult.itens,
      },
    });
  },
);

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/convocacoes/reenvio',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    const body = (await c.req.json().catch(() => ({}))) as {
      funcionario_id?: number;
      gestores_cc_ids?: number[];
    };
    if (
      !Number.isInteger(treinamentoId) ||
      treinamentoId <= 0 ||
      !Number.isInteger(body.funcionario_id) ||
      (body.funcionario_id || 0) <= 0
    ) {
      return c.json({ success: false, error: 'Dados inválidos' }, 400);
    }

    const items = await listEventos(db, empresaId, { treinamentoId });
    const item = items[0];
    if (!item) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const gestoresCcIdsInput = Array.isArray(body.gestores_cc_ids)
      ? Array.from(
          new Set(
            body.gestores_cc_ids
              .map((value) => Number(value || 0))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        )
      : null;

    const config = await getEmailConvocacaoConfig(db, empresaId);
    const gestoresCc = await resolveGestoresCcByParticipantes(
      db,
      empresaId,
      item.participantes,
      gestoresCcIdsInput,
    );
    const empresa = await db
      .prepare('SELECT nome FROM empresas WHERE id = ?')
      .bind(empresaId)
      .first<{ nome: string | null }>();
    const preview = buildConvocacaoPreview({
      treinamento: item,
      empresaNome: empresa?.nome || 'AirTrust',
      config,
      gestoresCc,
      ultimaConvocacaoEm: null,
    });
    const participante = preview.participantes.find(
      (entry) => entry.funcionario_id === body.funcionario_id,
    );
    if (!participante) {
      return c.json({ success: false, error: 'Tripulante não encontrado nesta turma' }, 404);
    }

    const ua = extrairUsuarioAuditoria(c);
    const sendResult = await sendConvocacaoInBatches({
      env: c.env,
      db,
      empresaId,
      treinamentoId,
      disparadoPor: ua.usuario_id ? Number(ua.usuario_id) : null,
      disparadoPorNome: ua.usuario_nome || null,
      subjectTemplate: config.assunto_padrao,
      templateHtml: config.template_html,
      assinaturaHtml: config.assinatura_html,
      replyTo: config.reply_to,
      senderName: config.sender_name,
      senderEmail: config.smtp_user,
      cc: gestoresCc.map((gestor) => gestor.email),
      preview,
      participantes: [participante],
      batchSize: 1,
      batchIntervalMs: 0,
      empresaNome: empresa?.nome || 'AirTrust',
    });

    if (sendResult.itens[0]?.status !== 'sucesso') {
      const erroMensagem = sendResult.itens[0]?.erro_mensagem || 'Falha ao reenviar convocação';
      return c.json({ success: false, error: erroMensagem }, 500);
    }

    return c.json({ success: true, data: sendResult.itens[0] });
  },
);

treinamentosPlanejadosRoutes.patch(
  '/planejados/:id',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = eventoPatchSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const existing = await db
      .prepare(
        'SELECT id, qualificacao_tipo_id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number; qualificacao_tipo_id: number }>();

    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const input = parsed.data;
    const previousParticipants =
      input.participante_ids !== undefined ||
      (input.qualificacao_tipo_id !== undefined &&
        input.qualificacao_tipo_id !== existing.qualificacao_tipo_id)
        ? await loadParticipanteLinks(db, treinamentoId)
        : [];
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.qualificacao_tipo_id !== undefined) {
      updates.push('qualificacao_tipo_id = ?');
      params.push(input.qualificacao_tipo_id);
    }
    if (input.titulo !== undefined) {
      updates.push('titulo = ?');
      params.push(input.titulo);
    }
    if (input.descricao !== undefined) {
      updates.push('descricao = ?');
      params.push(toNullableText(input.descricao));
    }
    if (input.observacoes !== undefined) {
      updates.push('observacoes = ?');
      params.push(toNullableText(input.observacoes));
    }
    if (input.local !== undefined) {
      updates.push('local = ?');
      params.push(toNullableText(input.local));
    }
    if (input.data_prevista !== undefined) {
      updates.push('data_prevista = ?');
      params.push(input.data_prevista);
    }
    if (input.hora_inicio !== undefined) {
      updates.push('hora_inicio = ?');
      params.push(toNullableText(input.hora_inicio));
    }
    if (input.hora_fim !== undefined) {
      updates.push('hora_fim = ?');
      params.push(toNullableText(input.hora_fim));
    }
    if (input.instrutor_id !== undefined) {
      updates.push('instrutor_id = ?');
      params.push(input.instrutor_id ?? null);
    }
    if (input.carga_horaria_prevista !== undefined) {
      updates.push('carga_horaria_prevista = ?');
      params.push(input.carga_horaria_prevista ?? null);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    if (updates.length > 0) {
      params.push(treinamentoId, empresaId);
      await db
        .prepare(
          `UPDATE treinamentos_planejados
            SET ${updates.join(', ')},
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(...params)
        .run();
    }

    if (input.participante_ids !== undefined) {
      await replaceParticipantes(db, treinamentoId, input.participante_ids);
    }

    const incomingParticipantes =
      input.participante_ids !== undefined ? normalizePositiveIds(input.participante_ids) : null;
    const removedParticipants = previousParticipants.filter((participant) => {
      if (
        input.qualificacao_tipo_id !== undefined &&
        input.qualificacao_tipo_id !== existing.qualificacao_tipo_id
      ) {
        return true;
      }
      return incomingParticipantes
        ? !incomingParticipantes.includes(participant.funcionario_id)
        : false;
    });

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
      removedParticipants,
    });

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'UPDATE',
      registro_id: treinamentoId,
      dados_novos: {
        ...input,
        participante_ids:
          input.participante_ids !== undefined
            ? normalizePositiveIds(input.participante_ids)
            : undefined,
      },
      ...ua,
    });

    return c.json({ success: true, data: { id: treinamentoId } });
  },
);

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/participantes',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = participantesSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const existing = await db
      .prepare(
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number }>();
    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const participanteIds = normalizePositiveIds(parsed.data.participante_ids);
    const previousParticipants = await loadParticipanteLinks(db, treinamentoId);
    await replaceParticipantes(db, treinamentoId, participanteIds);
    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
      removedParticipants: previousParticipants.filter(
        (participant) => !participanteIds.includes(participant.funcionario_id),
      ),
    });

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'UPDATE',
      registro_id: treinamentoId,
      dados_novos: {
        participante_ids: participanteIds,
      },
      ...ua,
    });

    return c.json({
      success: true,
      data: { id: treinamentoId, participante_ids: participanteIds },
    });
  },
);

treinamentosPlanejadosRoutes.patch(
  '/planejados/:id/presenca',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = presencaSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const existing = await db
      .prepare(
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number }>();
    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const participant = await db
      .prepare(
        `SELECT id
           FROM treinamentos_participantes
          WHERE treinamento_id = ? AND funcionario_id = ?`,
      )
      .bind(treinamentoId, parsed.data.funcionario_id)
      .first<{ id: number }>();
    if (!participant) {
      return c.json({ success: false, error: 'Convocado não encontrado neste treinamento' }, 404);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const confirmado = toSqlBoolean(parsed.data.confirmado);
    const presente = toSqlBoolean(parsed.data.presente);
    const aprovado = toSqlBoolean(parsed.data.aprovado);

    if (confirmado !== undefined) {
      updates.push('confirmado = ?');
      params.push(confirmado);
    }
    if (presente !== undefined) {
      updates.push('presente = ?');
      params.push(presente);
    }
    if (aprovado !== undefined) {
      updates.push('aprovado = ?');
      params.push(aprovado);
    }
    if (parsed.data.nota !== undefined) {
      updates.push('nota = ?');
      params.push(parsed.data.nota ?? null);
    }
    if (parsed.data.observacoes !== undefined) {
      updates.push('observacoes = ?');
      params.push(toNullableText(parsed.data.observacoes));
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);
    }

    params.push(treinamentoId, parsed.data.funcionario_id);

    await db
      .prepare(
        `UPDATE treinamentos_participantes
            SET ${updates.join(', ')},
                updated_at = datetime('now')
          WHERE treinamento_id = ? AND funcionario_id = ?`,
      )
      .bind(...params)
      .run();

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
    });

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'UPDATE',
      registro_id: treinamentoId,
      dados_novos: {
        funcionario_id: parsed.data.funcionario_id,
        confirmado: parsed.data.confirmado,
        presente: parsed.data.presente,
        aprovado: parsed.data.aprovado,
        nota: parsed.data.nota,
        observacoes: parsed.data.observacoes,
      },
      ...ua,
    });

    return c.json({
      success: true,
      data: { id: treinamentoId, funcionario_id: parsed.data.funcionario_id },
    });
  },
);

treinamentosPlanejadosRoutes.delete(
  '/planejados/:id',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const existing = await db
      .prepare(
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number }>();
    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET status = 'CANCELADO',
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(treinamentoId, empresaId)
      .run();

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
    });

    await db
      .prepare(
        `UPDATE treinamentos_planejados
          SET deleted_at = datetime('now'),
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(treinamentoId, empresaId)
      .run();

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'DELETE',
      registro_id: treinamentoId,
      ...ua,
    });

    return c.json({ success: true, data: { id: treinamentoId } });
  },
);

export default treinamentosPlanejadosRoutes;
