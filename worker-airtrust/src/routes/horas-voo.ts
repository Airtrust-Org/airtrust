import { Hono } from 'hono';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import type { Env } from '../types';
import { parseHorasToMinutes } from './horas-voo.types';

const app = new Hono<{ Bindings: Env }>();

async function loadExcelJS(): Promise<typeof import('exceljs')> {
  return (await import('exceljs/dist/es5/exceljs.browser.js')) as unknown as typeof import('exceljs');
}

const saldoSchema = z
  .object({
    horas_total_min: z.number().int().min(0).default(0),
    horas_pic_min: z.number().int().min(0).default(0),
    horas_sic_min: z.number().int().min(0).default(0),
    horas_noturna_min: z.number().int().min(0).default(0),
    horas_instrumento_min: z.number().int().min(0).default(0),
    horas_simulador_min: z.number().int().min(0).default(0),
    horas_instrucao_min: z.number().int().min(0).default(0),
    horas_aw139_min: z.number().int().min(0).default(0),
    horas_sk76_min: z.number().int().min(0).default(0),
    horas_outros_modelos_min: z.number().int().min(0).default(0),
    data_referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    observacoes: z.string().optional().nullable(),
  })
  .refine((v) => v.horas_pic_min + v.horas_sic_min <= v.horas_total_min, {
    message: 'horas_pic_min + horas_sic_min deve ser <= horas_total_min',
    path: ['horas_pic_min'],
  });

const lancamentoSchema = z
  .object({
    data_voo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    aeronave_id: z.number().int().positive().optional().nullable(),
    modelo_aeronave: z.string().optional().nullable(),
    prefixo_aeronave: z.string().optional().nullable(),
    origem: z.string().optional().nullable(),
    destino: z.string().optional().nullable(),
    duracao_total_min: z.number().int().min(0),
    duracao_pic_min: z.number().int().min(0).default(0),
    duracao_sic_min: z.number().int().min(0).default(0),
    duracao_noturna_min: z.number().int().min(0).default(0),
    duracao_instrumento_min: z.number().int().min(0).default(0),
    duracao_instrucao_min: z.number().int().min(0).default(0),
    pousos_dia: z.number().int().min(0).default(0),
    pousos_noite: z.number().int().min(0).default(0),
    hoist_cycles: z.number().int().min(0).default(0),
    funcao: z.enum(['PIC', 'SIC', 'INSTRUTOR', 'ALUNO']),
    tipo_operacao: z.string().optional().nullable(),
    is_simulador: z.union([z.literal(0), z.literal(1)]).default(0),
    observacoes: z.string().optional().nullable(),
    numero_voo: z.string().optional().nullable(),
  })
  .refine((v) => v.duracao_pic_min + v.duracao_sic_min <= v.duracao_total_min, {
    message: 'duracao_pic_min + duracao_sic_min deve ser <= duracao_total_min',
    path: ['duracao_pic_min'],
  });

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function formatDateDisplay(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function toNumber(v: unknown): number {
  return Number(v || 0);
}

app.use('*', auth());

app.get('/:funcionario_id/saldo', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));

  if (!empresaId || !funcionarioId) {
    throw new ApiError('funcionario_id ou empresa_id inválido', 400);
  }

  const saldo = await db
    .prepare(
      `SELECT *
       FROM horas_voo_saldo_inicial
       WHERE funcionario_id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<Record<string, unknown>>();

  if (!saldo) {
    return c.json({
      success: true,
      data: {
        funcionario_id: funcionarioId,
        empresa_id: empresaId,
        horas_total_min: 0,
        horas_pic_min: 0,
        horas_sic_min: 0,
        horas_noturna_min: 0,
        horas_instrumento_min: 0,
        horas_simulador_min: 0,
        horas_instrucao_min: 0,
        horas_aw139_min: 0,
        horas_sk76_min: 0,
        horas_outros_modelos_min: 0,
        data_referencia: new Date().toISOString().slice(0, 10),
        data_referencia_display: formatDateDisplay(new Date().toISOString().slice(0, 10)),
        observacoes: null,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      ...saldo,
      data_referencia_display: formatDateDisplay(String(saldo.data_referencia || '')),
    },
  });
});

app.post('/:funcionario_id/saldo', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));
  const body = await c.req.json();

  if (!empresaId || !funcionarioId) {
    throw new ApiError('funcionario_id ou empresa_id inválido', 400);
  }

  const parsed = saldoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
      400,
    );
  }

  const existing = await db
    .prepare(
      `SELECT *
       FROM horas_voo_saldo_inicial
       WHERE funcionario_id = ? AND empresa_id = ?
       LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<Record<string, unknown>>();

  const ua = extrairUsuarioAuditoria(c);

  if (!existing) {
    const r = await db
      .prepare(
        `INSERT INTO horas_voo_saldo_inicial (
          funcionario_id, empresa_id,
          horas_total_min, horas_pic_min, horas_sic_min,
          horas_noturna_min, horas_instrumento_min, horas_simulador_min, horas_instrucao_min,
          horas_aw139_min, horas_sk76_min, horas_outros_modelos_min,
          data_referencia, observacoes, criado_por, atualizado_por,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        funcionarioId,
        empresaId,
        parsed.data.horas_total_min,
        parsed.data.horas_pic_min,
        parsed.data.horas_sic_min,
        parsed.data.horas_noturna_min,
        parsed.data.horas_instrumento_min,
        parsed.data.horas_simulador_min,
        parsed.data.horas_instrucao_min,
        parsed.data.horas_aw139_min,
        parsed.data.horas_sk76_min,
        parsed.data.horas_outros_modelos_min,
        parsed.data.data_referencia,
        parsed.data.observacoes || null,
        ua.usuario_id ? Number(ua.usuario_id) : null,
        ua.usuario_id ? Number(ua.usuario_id) : null,
      )
      .run();

    await registrarAuditoria({
      db,
      tabela: 'horas_voo_saldo_inicial',
      acao: 'INSERT',
      registro_id: r.meta.last_row_id || 0,
      dados_novos: parsed.data,
      ...ua,
    });
  } else {
    await db
      .prepare(
        `UPDATE horas_voo_saldo_inicial
         SET horas_total_min = ?,
             horas_pic_min = ?,
             horas_sic_min = ?,
             horas_noturna_min = ?,
             horas_instrumento_min = ?,
             horas_simulador_min = ?,
             horas_instrucao_min = ?,
             horas_aw139_min = ?,
             horas_sk76_min = ?,
             horas_outros_modelos_min = ?,
             data_referencia = ?,
             observacoes = ?,
             atualizado_por = ?,
             deleted_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        parsed.data.horas_total_min,
        parsed.data.horas_pic_min,
        parsed.data.horas_sic_min,
        parsed.data.horas_noturna_min,
        parsed.data.horas_instrumento_min,
        parsed.data.horas_simulador_min,
        parsed.data.horas_instrucao_min,
        parsed.data.horas_aw139_min,
        parsed.data.horas_sk76_min,
        parsed.data.horas_outros_modelos_min,
        parsed.data.data_referencia,
        parsed.data.observacoes || null,
        ua.usuario_id ? Number(ua.usuario_id) : null,
        Number(existing.id),
      )
      .run();

    await registrarAuditoria({
      db,
      tabela: 'horas_voo_saldo_inicial',
      acao: 'UPDATE',
      registro_id: Number(existing.id),
      dados_anteriores: existing,
      dados_novos: parsed.data,
      ...ua,
    });
  }

  const updated = await db
    .prepare(
      `SELECT *
       FROM horas_voo_saldo_inicial
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first();

  return c.json({ success: true, data: updated });
});

app.delete('/:funcionario_id/saldo', requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));

  if (!empresaId || !funcionarioId) {
    throw new ApiError('funcionario_id ou empresa_id inválido', 400);
  }

  const existing = await db
    .prepare(
      `SELECT * FROM horas_voo_saldo_inicial
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<Record<string, unknown>>();

  if (!existing) {
    return c.json({ success: true, data: { deleted: false } });
  }

  await db
    .prepare(
      `UPDATE horas_voo_saldo_inicial
       SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(Number(existing.id))
    .run();

  const ua = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'horas_voo_saldo_inicial',
    acao: 'DELETE',
    registro_id: Number(existing.id),
    dados_anteriores: existing,
    ...ua,
  });

  return c.json({ success: true, data: { deleted: true } });
});

app.get('/:funcionario_id/lancamentos', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));

  if (!empresaId || !funcionarioId) {
    throw new ApiError('funcionario_id ou empresa_id inválido', 400);
  }

  const page = parsePositiveInt(c.req.query('page'), 1);
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 20), 100);
  const offset = (page - 1) * limit;
  const dataInicio = c.req.query('data_inicio');
  const dataFim = c.req.query('data_fim');
  const origemRegistro = c.req.query('origem_registro');
  const tipoOperacao = c.req.query('tipo_operacao');

  const filters: string[] = ['funcionario_id = ?', 'empresa_id = ?', 'deleted_at IS NULL'];
  const args: unknown[] = [funcionarioId, empresaId];

  if (dataInicio) {
    filters.push('data_voo >= ?');
    args.push(dataInicio);
  }
  if (dataFim) {
    filters.push('data_voo <= ?');
    args.push(dataFim);
  }
  if (origemRegistro) {
    filters.push('origem_registro = ?');
    args.push(origemRegistro);
  }
  if (tipoOperacao) {
    filters.push('tipo_operacao = ?');
    args.push(tipoOperacao);
  }

  const whereSql = filters.join(' AND ');

  const list = await db
    .prepare(
      `SELECT *
       FROM horas_voo_lancamentos
       WHERE ${whereSql}
       ORDER BY data_voo DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, offset)
    .all<Record<string, unknown>>();

  const total = await db
    .prepare(`SELECT COUNT(*) as total FROM horas_voo_lancamentos WHERE ${whereSql}`)
    .bind(...args)
    .first<{ total: number }>();

  const resumo = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN is_simulador = 1 THEN 0 ELSE duracao_total_min END), 0) as total_min,
        COALESCE(SUM(duracao_pic_min), 0) as pic_min,
        COALESCE(SUM(duracao_sic_min), 0) as sic_min,
        COALESCE(SUM(duracao_noturna_min), 0) as noturna_min,
        COALESCE(SUM(duracao_instrumento_min), 0) as instrumento_min,
        COALESCE(SUM(CASE WHEN is_simulador = 1 THEN duracao_total_min ELSE 0 END), 0) as simulador_min,
        COALESCE(SUM(duracao_instrucao_min), 0) as instrucao_min,
        COALESCE(SUM(pousos_dia + pousos_noite), 0) as pousos,
        COALESCE(SUM(hoist_cycles), 0) as hoist_cycles
       FROM horas_voo_lancamentos
       WHERE ${whereSql}`,
    )
    .bind(...args)
    .first<Record<string, number>>();

  return c.json({
    success: true,
    data: list.results || [],
    meta: {
      page,
      limit,
      total: total?.total || 0,
      total_pages: Math.ceil((total?.total || 0) / limit),
    },
    totais_periodo: {
      total_min: toNumber(resumo?.total_min),
      pic_min: toNumber(resumo?.pic_min),
      sic_min: toNumber(resumo?.sic_min),
      noturna_min: toNumber(resumo?.noturna_min),
      instrumento_min: toNumber(resumo?.instrumento_min),
      simulador_min: toNumber(resumo?.simulador_min),
      instrucao_min: toNumber(resumo?.instrucao_min),
      pousos: toNumber(resumo?.pousos),
      hoist_cycles: toNumber(resumo?.hoist_cycles),
    },
  });
});

app.post('/:funcionario_id/lancamentos', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));
  const body = await c.req.json();

  if (!empresaId || !funcionarioId) {
    throw new ApiError('funcionario_id ou empresa_id inválido', 400);
  }

  const parsed = lancamentoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
      400,
    );
  }

  const data = parsed.data;

  const result = await db
    .prepare(
      `INSERT INTO horas_voo_lancamentos (
        funcionario_id, empresa_id, data_voo, aeronave_id, modelo_aeronave, prefixo_aeronave,
        origem, destino, duracao_total_min, duracao_pic_min, duracao_sic_min,
        duracao_noturna_min, duracao_instrumento_min, duracao_instrucao_min,
        pousos_dia, pousos_noite, hoist_cycles, funcao, tipo_operacao, is_simulador,
        origem_registro, observacoes, numero_voo, criado_por, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      funcionarioId,
      empresaId,
      data.data_voo,
      data.aeronave_id || null,
      data.modelo_aeronave || null,
      data.prefixo_aeronave || null,
      data.origem || null,
      data.destino || null,
      data.duracao_total_min,
      data.duracao_pic_min,
      data.duracao_sic_min,
      data.duracao_noturna_min,
      data.duracao_instrumento_min,
      data.duracao_instrucao_min,
      data.pousos_dia,
      data.pousos_noite,
      data.hoist_cycles,
      data.funcao,
      data.tipo_operacao || null,
      data.is_simulador,
      data.observacoes || null,
      data.numero_voo || null,
      c.get('userId' as never) || null,
    )
    .run();

  const id = Number(result.meta.last_row_id || 0);
  const created = await db
    .prepare('SELECT * FROM horas_voo_lancamentos WHERE id = ? AND empresa_id = ? LIMIT 1')
    .bind(id, empresaId)
    .first<Record<string, unknown>>();

  const ua = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'horas_voo_lancamentos',
    acao: 'INSERT',
    registro_id: id,
    dados_novos: created,
    ...ua,
  });

  return c.json({ success: true, data: created }, 201);
});

app.put(
  '/:funcionario_id/lancamentos/:lancamento_id',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = Number(c.req.param('funcionario_id'));
    const lancamentoId = Number(c.req.param('lancamento_id'));
    const body = await c.req.json();

    if (!empresaId || !funcionarioId || !lancamentoId) {
      throw new ApiError('Parâmetros inválidos', 400);
    }

    const existing = await db
      .prepare(
        `SELECT *
       FROM horas_voo_lancamentos
       WHERE id = ? AND funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      )
      .bind(lancamentoId, funcionarioId, empresaId)
      .first<Record<string, unknown>>();

    if (!existing) {
      throw new ApiError('Lançamento não encontrado', 404);
    }

    if (String(existing.origem_registro || '') !== 'MANUAL') {
      throw new ApiError('Apenas lançamentos MANUAL podem ser editados', 403);
    }

    const parsed = lancamentoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
        400,
      );
    }

    const data = parsed.data;

    await db
      .prepare(
        `UPDATE horas_voo_lancamentos
       SET data_voo = ?, aeronave_id = ?, modelo_aeronave = ?, prefixo_aeronave = ?,
           origem = ?, destino = ?, duracao_total_min = ?, duracao_pic_min = ?, duracao_sic_min = ?,
           duracao_noturna_min = ?, duracao_instrumento_min = ?, duracao_instrucao_min = ?,
           pousos_dia = ?, pousos_noite = ?, hoist_cycles = ?, funcao = ?, tipo_operacao = ?,
           is_simulador = ?, observacoes = ?, numero_voo = ?, updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ?`,
      )
      .bind(
        data.data_voo,
        data.aeronave_id || null,
        data.modelo_aeronave || null,
        data.prefixo_aeronave || null,
        data.origem || null,
        data.destino || null,
        data.duracao_total_min,
        data.duracao_pic_min,
        data.duracao_sic_min,
        data.duracao_noturna_min,
        data.duracao_instrumento_min,
        data.duracao_instrucao_min,
        data.pousos_dia,
        data.pousos_noite,
        data.hoist_cycles,
        data.funcao,
        data.tipo_operacao || null,
        data.is_simulador,
        data.observacoes || null,
        data.numero_voo || null,
        lancamentoId,
        empresaId,
      )
      .run();

    const updated = await db
      .prepare('SELECT * FROM horas_voo_lancamentos WHERE id = ? AND empresa_id = ? LIMIT 1')
      .bind(lancamentoId, empresaId)
      .first();

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'horas_voo_lancamentos',
      acao: 'UPDATE',
      registro_id: lancamentoId,
      dados_anteriores: existing,
      dados_novos: updated,
      ...ua,
    });

    return c.json({ success: true, data: updated });
  },
);

app.delete(
  '/:funcionario_id/lancamentos/:lancamento_id',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = Number(c.req.param('funcionario_id'));
    const lancamentoId = Number(c.req.param('lancamento_id'));

    if (!empresaId || !funcionarioId || !lancamentoId) {
      throw new ApiError('Parâmetros inválidos', 400);
    }

    const existing = await db
      .prepare(
        `SELECT *
       FROM horas_voo_lancamentos
       WHERE id = ? AND funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      )
      .bind(lancamentoId, funcionarioId, empresaId)
      .first<Record<string, unknown>>();

    if (!existing) {
      throw new ApiError('Lançamento não encontrado', 404);
    }

    await db
      .prepare(
        `UPDATE horas_voo_lancamentos
       SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ?`,
      )
      .bind(lancamentoId, empresaId)
      .run();

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'horas_voo_lancamentos',
      acao: 'DELETE',
      registro_id: lancamentoId,
      dados_anteriores: existing,
      ...ua,
    });

    return c.json({ success: true, data: { deleted: true } });
  },
);

app.get('/:funcionario_id/totais', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));

  if (!empresaId || !funcionarioId) {
    throw new ApiError('funcionario_id ou empresa_id inválido', 400);
  }

  const saldo = await db
    .prepare(
      `SELECT
         horas_total_min, horas_pic_min, horas_sic_min,
         horas_noturna_min, horas_instrumento_min, horas_simulador_min,
         horas_instrucao_min, horas_aw139_min, horas_sk76_min, horas_outros_modelos_min,
         data_referencia, observacoes
       FROM horas_voo_saldo_inicial
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<Record<string, unknown>>();

  const acumulado = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN is_simulador = 1 THEN 0 ELSE duracao_total_min END), 0) as total_min,
         COALESCE(SUM(duracao_pic_min), 0) as pic_min,
         COALESCE(SUM(duracao_sic_min), 0) as sic_min,
         COALESCE(SUM(duracao_noturna_min), 0) as noturna_min,
         COALESCE(SUM(duracao_instrumento_min), 0) as instrumento_min,
         COALESCE(SUM(CASE WHEN is_simulador = 1 THEN duracao_total_min ELSE 0 END), 0) as simulador_min,
         COALESCE(SUM(duracao_instrucao_min), 0) as instrucao_min,
         MAX(data_voo) as ultimo_lancamento,
         COALESCE(SUM(pousos_dia + pousos_noite), 0) as total_pousos,
         COALESCE(SUM(hoist_cycles), 0) as total_hoist_cycles
       FROM horas_voo_lancamentos
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(funcionarioId, empresaId)
    .first<Record<string, unknown>>();

  const porModeloRes = await db
    .prepare(
      `SELECT
         COALESCE(NULLIF(TRIM(modelo_aeronave), ''), 'SEM_MODELO') as modelo,
         COALESCE(SUM(CASE WHEN is_simulador = 1 THEN 0 ELSE duracao_total_min END), 0) as total_min,
         COALESCE(SUM(duracao_pic_min), 0) as pic_min,
         COALESCE(SUM(duracao_sic_min), 0) as sic_min
       FROM horas_voo_lancamentos
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       GROUP BY COALESCE(NULLIF(TRIM(modelo_aeronave), ''), 'SEM_MODELO')`,
    )
    .bind(funcionarioId, empresaId)
    .all<{ modelo: string; total_min: number; pic_min: number; sic_min: number }>();

  const porAnoRes = await db
    .prepare(
      `SELECT
         CAST(strftime('%Y', data_voo) AS INTEGER) as ano,
         COALESCE(SUM(CASE WHEN is_simulador = 1 THEN 0 ELSE duracao_total_min END), 0) as total_min,
         COALESCE(SUM(duracao_pic_min), 0) as pic_min
       FROM horas_voo_lancamentos
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       GROUP BY strftime('%Y', data_voo)
       ORDER BY ano ASC`,
    )
    .bind(funcionarioId, empresaId)
    .all<{ ano: number; total_min: number; pic_min: number }>();

  const saldoInicial = {
    horas_total_min: toNumber(saldo?.horas_total_min),
    horas_pic_min: toNumber(saldo?.horas_pic_min),
    horas_sic_min: toNumber(saldo?.horas_sic_min),
    horas_noturna_min: toNumber(saldo?.horas_noturna_min),
    horas_instrumento_min: toNumber(saldo?.horas_instrumento_min),
    horas_simulador_min: toNumber(saldo?.horas_simulador_min),
    horas_instrucao_min: toNumber(saldo?.horas_instrucao_min),
    horas_aw139_min: toNumber(saldo?.horas_aw139_min),
    horas_sk76_min: toNumber(saldo?.horas_sk76_min),
    horas_outros_modelos_min: toNumber(saldo?.horas_outros_modelos_min),
    data_referencia: (saldo?.data_referencia as string) || null,
    observacoes: (saldo?.observacoes as string) || null,
  };

  const acumuladoSistema = {
    total_min: toNumber(acumulado?.total_min),
    pic_min: toNumber(acumulado?.pic_min),
    sic_min: toNumber(acumulado?.sic_min),
    noturna_min: toNumber(acumulado?.noturna_min),
    instrumento_min: toNumber(acumulado?.instrumento_min),
    simulador_min: toNumber(acumulado?.simulador_min),
    instrucao_min: toNumber(acumulado?.instrucao_min),
  };

  const totalGeral = {
    total_min: saldoInicial.horas_total_min + acumuladoSistema.total_min,
    pic_min: saldoInicial.horas_pic_min + acumuladoSistema.pic_min,
    sic_min: saldoInicial.horas_sic_min + acumuladoSistema.sic_min,
    noturna_min: saldoInicial.horas_noturna_min + acumuladoSistema.noturna_min,
    instrumento_min: saldoInicial.horas_instrumento_min + acumuladoSistema.instrumento_min,
    simulador_min: saldoInicial.horas_simulador_min + acumuladoSistema.simulador_min,
    instrucao_min: saldoInicial.horas_instrucao_min + acumuladoSistema.instrucao_min,
  };

  const porModelo: Record<string, { total_min: number; pic_min: number; sic_min: number }> = {};
  for (const row of porModeloRes.results || []) {
    porModelo[row.modelo] = {
      total_min: toNumber(row.total_min),
      pic_min: toNumber(row.pic_min),
      sic_min: toNumber(row.sic_min),
    };
  }

  return c.json({
    success: true,
    data: {
      saldo_inicial: saldo ? saldoInicial : null,
      acumulado_sistema: acumuladoSistema,
      total_geral: totalGeral,
      por_modelo: porModelo,
      por_ano: (porAnoRes.results || []).map((row) => ({
        ano: Number(row.ano),
        total_min: toNumber(row.total_min),
        pic_min: toNumber(row.pic_min),
      })),
      ultimo_lancamento: (acumulado?.ultimo_lancamento as string) || null,
      total_pousos: toNumber(acumulado?.total_pousos),
      total_hoist_cycles: toNumber(acumulado?.total_hoist_cycles),
    },
  });
});

app.post('/:funcionario_id/importar-xlsx', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));
  if (!empresaId || !funcionarioId) throw new ApiError('Parâmetros inválidos', 400);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) throw new ApiError('Arquivo é obrigatório', 400);

  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const ws = workbook.worksheets[0];
  if (!ws) throw new ApiError('Planilha vazia', 400);

  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) =>
        headers.push(
          String(cell.value || '')
            .trim()
            .toLowerCase(),
        ),
      );
      return;
    }
    const rowObj: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      const h = headers[colNumber - 1];
      if (h)
        rowObj[h] =
          typeof cell.value === 'object' && cell.value && 'result' in cell.value
            ? (cell.value as { result: unknown }).result
            : cell.value;
    });
    rows.push(rowObj);
  });

  const maxRows = 500;
  const selected = rows.slice(0, maxRows);
  const errors: Array<{ linha: number; erro: string }> = [];
  let inseridos = 0;

  for (let i = 0; i < selected.length; i += 1) {
    const row = selected[i];
    try {
      const dataVoo = String(row.data_voo || row.data || '').trim();
      const totalRaw = String(row.duracao_total_min || row.duracao_total || row.duracao || '0');
      const totalMin = /^\d+$/.test(totalRaw) ? Number(totalRaw) : parseHorasToMinutes(totalRaw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVoo)) {
        throw new Error('data_voo inválida (esperado YYYY-MM-DD)');
      }

      const funcao = String(row.funcao || 'SIC').toUpperCase();
      if (!['PIC', 'SIC', 'INSTRUTOR', 'ALUNO'].includes(funcao)) {
        throw new Error('funcao inválida');
      }

      const pic = Number(row.duracao_pic_min || 0);
      const sic = Number(row.duracao_sic_min || 0);
      if (pic + sic > totalMin) {
        throw new Error('duracao_pic_min + duracao_sic_min > duracao_total_min');
      }

      await db
        .prepare(
          `INSERT INTO horas_voo_lancamentos (
            funcionario_id, empresa_id, data_voo, modelo_aeronave, prefixo_aeronave,
            origem, destino, duracao_total_min, duracao_pic_min, duracao_sic_min,
            duracao_noturna_min, duracao_instrumento_min, duracao_instrucao_min,
            pousos_dia, pousos_noite, hoist_cycles, funcao, tipo_operacao, is_simulador,
            origem_registro, observacoes, numero_voo, criado_por, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          funcionarioId,
          empresaId,
          dataVoo,
          row.modelo_aeronave ? String(row.modelo_aeronave) : null,
          row.prefixo_aeronave ? String(row.prefixo_aeronave) : null,
          row.origem ? String(row.origem) : null,
          row.destino ? String(row.destino) : null,
          totalMin,
          pic,
          sic,
          Number(row.duracao_noturna_min || 0),
          Number(row.duracao_instrumento_min || 0),
          Number(row.duracao_instrucao_min || 0),
          Number(row.pousos_dia || 0),
          Number(row.pousos_noite || 0),
          Number(row.hoist_cycles || 0),
          funcao,
          row.tipo_operacao ? String(row.tipo_operacao) : null,
          Number(row.is_simulador || 0) === 1 ? 1 : 0,
          row.observacoes ? String(row.observacoes) : null,
          row.numero_voo ? String(row.numero_voo) : null,
          c.get('userId' as never) || null,
        )
        .run();
      inseridos += 1;
    } catch (error) {
      errors.push({ linha: i + 2, erro: error instanceof Error ? error.message : String(error) });
    }
  }

  return c.json({ success: true, data: { inseridos, erros: errors } });
});

app.get('/:funcionario_id/exportar-xlsx', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = Number(c.req.param('funcionario_id'));
  if (!empresaId || !funcionarioId) throw new ApiError('Parâmetros inválidos', 400);

  const lancamentos = await db
    .prepare(
      `SELECT *
       FROM horas_voo_lancamentos
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       ORDER BY data_voo DESC, id DESC`,
    )
    .bind(funcionarioId, empresaId)
    .all<Record<string, unknown>>();

  const saldo = await db
    .prepare(
      `SELECT *
       FROM horas_voo_saldo_inicial
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<Record<string, unknown>>();

  const totaisRes = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN is_simulador = 1 THEN 0 ELSE duracao_total_min END), 0) as total_min,
         COALESCE(SUM(duracao_pic_min), 0) as pic_min,
         COALESCE(SUM(duracao_sic_min), 0) as sic_min,
         COALESCE(SUM(duracao_noturna_min), 0) as noturna_min,
         COALESCE(SUM(duracao_instrumento_min), 0) as instrumento_min,
         COALESCE(SUM(CASE WHEN is_simulador = 1 THEN duracao_total_min ELSE 0 END), 0) as simulador_min,
         COALESCE(SUM(duracao_instrucao_min), 0) as instrucao_min,
         COALESCE(SUM(pousos_dia + pousos_noite), 0) as pousos,
         COALESCE(SUM(hoist_cycles), 0) as hoist_cycles
       FROM horas_voo_lancamentos
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(funcionarioId, empresaId)
    .first<Record<string, unknown>>();

  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();

  const wsLanc = workbook.addWorksheet('Lancamentos');
  wsLanc.columns = [
    { header: 'data_voo', key: 'data_voo', width: 14 },
    { header: 'modelo_aeronave', key: 'modelo_aeronave', width: 16 },
    { header: 'origem', key: 'origem', width: 14 },
    { header: 'destino', key: 'destino', width: 14 },
    { header: 'duracao_total_min', key: 'duracao_total_min', width: 18 },
    { header: 'duracao_pic_min', key: 'duracao_pic_min', width: 16 },
    { header: 'duracao_sic_min', key: 'duracao_sic_min', width: 16 },
    { header: 'duracao_noturna_min', key: 'duracao_noturna_min', width: 18 },
    { header: 'duracao_instrumento_min', key: 'duracao_instrumento_min', width: 22 },
    { header: 'funcao', key: 'funcao', width: 12 },
    { header: 'tipo_operacao', key: 'tipo_operacao', width: 16 },
    { header: 'origem_registro', key: 'origem_registro', width: 16 },
  ];
  for (const row of lancamentos.results || []) {
    wsLanc.addRow(row as Record<string, unknown>);
  }

  const wsTotais = workbook.addWorksheet('Totais');
  wsTotais.addRow(['Campo', 'Valor']);
  wsTotais.addRow(['total_min', toNumber(totaisRes?.total_min)]);
  wsTotais.addRow(['pic_min', toNumber(totaisRes?.pic_min)]);
  wsTotais.addRow(['sic_min', toNumber(totaisRes?.sic_min)]);
  wsTotais.addRow(['noturna_min', toNumber(totaisRes?.noturna_min)]);
  wsTotais.addRow(['instrumento_min', toNumber(totaisRes?.instrumento_min)]);
  wsTotais.addRow(['simulador_min', toNumber(totaisRes?.simulador_min)]);
  wsTotais.addRow(['instrucao_min', toNumber(totaisRes?.instrucao_min)]);
  wsTotais.addRow(['pousos', toNumber(totaisRes?.pousos)]);
  wsTotais.addRow(['hoist_cycles', toNumber(totaisRes?.hoist_cycles)]);

  const wsSaldo = workbook.addWorksheet('Saldo Inicial');
  wsSaldo.addRow(['Campo', 'Valor']);
  if (saldo) {
    Object.entries(saldo).forEach(([key, value]) =>
      wsSaldo.addRow([key, value as string | number | null]),
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="horas-voo-${funcionarioId}.xlsx"`);
  return c.body(buffer as ArrayBuffer);
});

export default app;
