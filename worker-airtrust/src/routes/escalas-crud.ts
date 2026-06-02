/**
 * ESCALAS — CRUD (listar, detalhar, criar, gerar-ano, atualizar, deletar)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { registrarAuditoria } from '../utils/auditoria';
import { gerarAlertasCMA } from '../utils/escala-engine';
import { syncFuncionarioFeriasForMonth } from '../shared/syncEscalaEventosExternos';
import {
  getEmpresaIdSafe,
  getEscalaVerificada,
  parseBody,
  EscalaMensalSchema,
} from './escalas-shared';

const crud = new Hono<{ Bindings: Env }>();

// GET / — listar escalas com filtros
crud.get('/', auth(), async (c) => {
  const { mes, ano, status } = c.req.query();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  let query = `
    SELECT
      em.*,
      f_criador.nome as criado_por_nome,
      f_aprovador.nome as aprovado_por_nome,
      COALESCE(
        NULLIF((
          SELECT COUNT(*)
          FROM escala_alocacoes ea
          WHERE ea.escala_id = em.id
            AND ea.deleted_at IS NULL
            AND ea.status != 'cancelado'
            AND ea.situacao_tipo IS NULL
        ), 0),
        (
          SELECT COUNT(*)
          FROM escala_tripulacoes et_count
          WHERE et_count.escala_id = em.id
            AND et_count.deleted_at IS NULL
        )
      ) as total_tripulacoes,
      (
        SELECT COUNT(*)
        FROM escala_alocacoes ea_situacao
        WHERE ea_situacao.escala_id = em.id
          AND ea_situacao.deleted_at IS NULL
          AND ea_situacao.status != 'cancelado'
          AND ea_situacao.situacao_tipo IS NOT NULL
      ) as situacoes_count,
      (
        SELECT COUNT(DISTINCT ea_sem.funcionario_id)
        FROM escala_alocacoes ea_sem
        WHERE ea_sem.escala_id = em.id
          AND ea_sem.deleted_at IS NULL
          AND ea_sem.status != 'cancelado'
          AND ea_sem.situacao_tipo IS NULL
          AND ea_sem.aeronave_id IS NULL
      ) as tripulantes_sem_aeronave_count,
      (
        SELECT COUNT(*)
        FROM escala_alocacoes ea_med
        WHERE ea_med.escala_id = em.id
          AND ea_med.deleted_at IS NULL
          AND ea_med.status != 'cancelado'
          AND UPPER(COALESCE(ea_med.situacao_tipo, '')) = 'MED'
      ) as afastamentos_medicos_count,
      (
        SELECT COUNT(*)
        FROM escala_alocacoes ea_aft
        WHERE ea_aft.escala_id = em.id
          AND ea_aft.deleted_at IS NULL
          AND ea_aft.status != 'cancelado'
          AND UPPER(COALESCE(ea_aft.situacao_tipo, '')) = 'AFT'
      ) as afastamentos_count,
      (
        COALESCE((
          SELECT COUNT(*)
          FROM escala_eventos ee1
          JOIN escala_eventos ee2 ON (
            ee1.funcionario_id = ee2.funcionario_id
            AND ee1.id < ee2.id
            AND ee1.data_inicio <= ee2.data_fim
            AND ee1.data_fim >= ee2.data_inicio
          )
          WHERE ee1.escala_id = em.id
            AND ee2.escala_id = em.id
            AND ee1.deleted_at IS NULL
            AND ee2.deleted_at IS NULL
            AND ee1.status != 'cancelado'
            AND ee2.status != 'cancelado'
        ), 0)
        + COALESCE((
          SELECT COUNT(*)
          FROM escala_tripulacoes et1
          JOIN escala_tripulacoes et2 ON (
            et1.id < et2.id
            AND et1.data_inicio <= et2.data_fim
            AND et1.data_fim >= et2.data_inicio
          )
          WHERE et1.escala_id = em.id
            AND et2.escala_id = em.id
            AND et1.deleted_at IS NULL
            AND et2.deleted_at IS NULL
            AND (
              et1.pic_id = et2.pic_id
              OR et1.pic_id = et2.sic_id
              OR et1.sic_id = et2.pic_id
              OR (et1.sic_id IS NOT NULL AND et1.sic_id = et2.sic_id)
            )
        ), 0)
        + COALESCE((
          SELECT COUNT(*)
          FROM escala_tripulacoes et
          JOIN restricoes_tripulacao rt ON (
            (rt.funcionario_a_id = et.pic_id AND rt.funcionario_b_id = et.sic_id) OR
            (rt.funcionario_a_id = et.sic_id AND rt.funcionario_b_id = et.pic_id)
          )
          WHERE et.escala_id = em.id
            AND et.deleted_at IS NULL
            AND rt.tipo_restricao = 'nao_pode_voar_junto'
            AND rt.ativo = 1
            AND rt.deleted_at IS NULL
        ), 0)
        + COALESCE((
          SELECT COUNT(*)
          FROM escala_tripulacoes et
          LEFT JOIN funcionarios fp ON et.pic_id = fp.id AND fp.deleted_at IS NULL
          LEFT JOIN funcionarios fs ON et.sic_id = fs.id AND fs.deleted_at IS NULL
          WHERE et.escala_id = em.id
            AND et.deleted_at IS NULL
            AND et.sic_id IS NOT NULL
            AND fp.nascimento IS NOT NULL
            AND fs.nascimento IS NOT NULL
            AND UPPER(COALESCE(fp.funcao, '')) NOT LIKE '%INSTRUTOR%'
            AND UPPER(COALESCE(fs.funcao, '')) NOT LIKE '%INSTRUTOR%'
            AND UPPER(COALESCE(fp.funcao, '')) NOT LIKE '%EXAMINADOR%'
            AND UPPER(COALESCE(fs.funcao, '')) NOT LIKE '%EXAMINADOR%'
            AND (
              CAST(strftime('%Y', 'now') AS INTEGER)
                - CAST(strftime('%Y', fp.nascimento) AS INTEGER)
                - (strftime('%m-%d', 'now') < strftime('%m-%d', fp.nascimento))
                + CAST(strftime('%Y', 'now') AS INTEGER)
                - CAST(strftime('%Y', fs.nascimento) AS INTEGER)
                - (strftime('%m-%d', 'now') < strftime('%m-%d', fs.nascimento))
            ) > 129
        ), 0)
      ) as conflitos_count,
      (
        SELECT COUNT(*)
        FROM escala_eventos ee_count
        WHERE ee_count.escala_id = em.id
          AND ee_count.deleted_at IS NULL
      ) as total_eventos
    FROM escalas_mensais em
    LEFT JOIN funcionarios f_criador ON em.created_by = f_criador.id AND (f_criador.empresa_id IS NULL OR f_criador.empresa_id = em.empresa_id)
    LEFT JOIN funcionarios f_aprovador ON em.aprovado_por = f_aprovador.id AND (f_aprovador.empresa_id IS NULL OR f_aprovador.empresa_id = em.empresa_id)
    WHERE em.deleted_at IS NULL AND em.empresa_id = ?
  `;
  const params: unknown[] = [empresaId];

  if (mes) {
    query += ` AND em.mes = ?`;
    params.push(Number(mes));
  }
  if (ano) {
    query += ` AND em.ano = ?`;
    params.push(Number(ano));
  }
  if (status) {
    query += ` AND em.status = ?`;
    params.push(status);
  }
  query += ` ORDER BY em.ano DESC, em.mes DESC`;

  try {
    const result = await db
      .prepare(query)
      .bind(...params)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /:id — detalhes completos
crud.get('/:id', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = await db
      .prepare(
        `SELECT em.*, f.nome as criado_por_nome
         FROM escalas_mensais em
         LEFT JOIN funcionarios f ON em.created_by = f.id AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
         WHERE em.id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first();

    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const [tripulacoes, eventos, alertasCMA] = await Promise.all([
      db
        .prepare(
          `SELECT et.*,
                  pic.nome as pic_nome, pic.matricula as pic_matricula, pic.guerra as pic_nome_guerra,
                  sic.nome as sic_nome, sic.matricula as sic_matricula, sic.guerra as sic_nome_guerra,
                  pe.nome as padrao_nome
           FROM escala_tripulacoes et
           JOIN escalas_mensais em ON em.id = et.escala_id
           LEFT JOIN funcionarios pic ON et.pic_id = pic.id AND (pic.empresa_id IS NULL OR pic.empresa_id = em.empresa_id)
           LEFT JOIN funcionarios sic ON et.sic_id = sic.id AND (sic.empresa_id IS NULL OR sic.empresa_id = em.empresa_id)
           LEFT JOIN padroes_escala pe ON et.padrao_escala_id = pe.id
           WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
           ORDER BY et.data_inicio`,
        )
        .bind(id, empresaId)
        .all(),
      db
        .prepare(
          `SELECT ee.*,
                  f.nome as funcionario_nome, f.matricula as funcionario_matricula,
                  f.cargo as funcionario_cargo
           FROM escala_eventos ee
           JOIN escalas_mensais em ON em.id = ee.escala_id
           LEFT JOIN funcionarios f ON ee.funcionario_id = f.id AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
           WHERE ee.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND ee.deleted_at IS NULL
           ORDER BY ee.data_inicio, f.nome`,
        )
        .bind(id, empresaId)
        .all(),
      gerarAlertasCMA(db, id),
    ]);

    return c.json({
      success: true,
      data: {
        escala,
        tripulacoes: tripulacoes.results,
        eventos: eventos.results,
        alertas_cma: alertasCMA,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST / — criar nova escala mensal
crud.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  const body = await c.req.json();
  const parsed = parseBody(EscalaMensalSchema, body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  try {
    const existente = await db
      .prepare(
        `SELECT id FROM escalas_mensais WHERE mes = ? AND ano = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(parsed.data.mes, parsed.data.ano, empresaId)
      .first();

    if (existente) {
      return c.json(
        {
          success: false,
          error: `Já existe uma escala para ${parsed.data.mes}/${parsed.data.ano}`,
        },
        409,
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO escalas_mensais (id, mes, ano, titulo, status, observacoes, periodo, empresa_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'rascunho', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        parsed.data.mes,
        parsed.data.ano,
        parsed.data.titulo || `Escala ${parsed.data.mes}/${parsed.data.ano}`,
        parsed.data.observacoes || null,
        parsed.data.periodo || 'personalizada',
        empresaId,
        userId,
        now,
        now,
      )
      .run();

    await syncFuncionarioFeriasForMonth({
      db,
      empresaId,
      ano: parsed.data.ano,
      mes: parsed.data.mes,
    });

    await registrarAuditoria({
      db,
      tabela: 'escalas_mensais',
      registro_id: id,
      acao: 'INSERT',
      usuario_id: userId,
    });

    return c.json({ success: true, data: { id } }, 201);
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /gerar-ano — auto-cria as 12 escalas mensais
crud.post('/gerar-ano', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  const body = (await c.req.json().catch(() => ({}))) as { ano?: number };
  const ano = body.ano ?? new Date().getFullYear();

  const MESES_NOMES = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  try {
    let criados = 0;
    const now = new Date().toISOString();
    for (let mes = 1; mes <= 12; mes++) {
      const existente = await db
        .prepare(
          `SELECT id FROM escalas_mensais WHERE mes = ? AND ano = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(mes, ano, empresaId)
        .first();
      if (!existente) {
        const id = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO escalas_mensais (id, mes, ano, titulo, status, empresa_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'rascunho', ?, ?, ?, ?)`,
          )
          .bind(id, mes, ano, `${MESES_NOMES[mes - 1]} ${ano}`, empresaId, userId, now, now)
          .run();
        await syncFuncionarioFeriasForMonth({
          db,
          empresaId,
          ano,
          mes,
        });
        criados++;
      }
    }
    return c.json({ success: true, data: { criados, ano } });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /:id — atualizar escala
crud.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const body = await c.req.json();
  const parsed = parseBody(EscalaMensalSchema.partial(), body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (parsed.data.titulo !== undefined) {
      fields.push('titulo = ?');
      values.push(parsed.data.titulo);
    }
    if (parsed.data.observacoes !== undefined) {
      fields.push('observacoes = ?');
      values.push(parsed.data.observacoes);
    }
    if (parsed.data.periodo !== undefined) {
      fields.push('periodo = ?');
      values.push(parsed.data.periodo);
    }

    if (fields.length === 0) return c.json({ success: true });

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await db
      .prepare(`UPDATE escalas_mensais SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
    await registrarAuditoria({
      db,
      tabela: 'escalas_mensais',
      registro_id: id,
      acao: 'UPDATE',
      usuario_id: userId,
    });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /:id — soft delete (com cascade em tripulacoes e eventos)
crud.delete('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const now = new Date().toISOString();
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    await db
      .prepare(
        `UPDATE escala_tripulacoes SET deleted_at = ?, updated_at = ? WHERE escala_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, now, id)
      .run();
    await db
      .prepare(
        `UPDATE escala_eventos SET deleted_at = ?, updated_at = ? WHERE escala_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, now, id)
      .run();
    await db
      .prepare(`UPDATE escalas_mensais SET deleted_at = ?, updated_at = ? WHERE id = ?`)
      .bind(now, now, id)
      .run();
    await registrarAuditoria({
      db,
      tabela: 'escalas_mensais',
      registro_id: id,
      acao: 'DELETE',
      usuario_id: userId,
    });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default crud;
