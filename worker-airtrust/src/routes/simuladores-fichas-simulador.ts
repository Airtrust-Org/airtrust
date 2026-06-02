/**
 * SIMULADORES — Fichas (fichas-simulador routes)
 * Routes for manobras and qualificacao generation (must be mounted BEFORE /fichas/:id).
 *   GET  /fichas-simulador/:id/manobras
 *   PUT  /fichas-simulador/:fichaId/manobras/:ordem
 *   POST /fichas-simulador/:id/popular-manobras
 *   POST /fichas-simulador/:id/gerar-qualificacao
 *   GET  /fichas-simulador/:id/gerar-pdf
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import {
  gerarQualificacaoDaFicha,
  getQualificacaoGeracaoErrorStatus,
} from './simuladores-fichas-helpers';

const app = new Hono<{ Bindings: Env }>();

app.get('/fichas-simulador/:id/manobras', async (c) => {
  try {
    const id = c.req.param('id');
    const m = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND deleted_at IS NULL ORDER BY ordem',
    )
      .bind(id)
      .all();
    return c.json({ success: true, data: m.results });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /fichas-simulador/:fichaId/manobras/:ordem - Atualizar manobra individual
// ✅ Uses ordem (1-22) instead of individual ID
app.put('/fichas-simulador/:fichaId/manobras/:ordem', async (c) => {
  try {
    const { fichaId, ordem } = c.req.param();
    const b = await c.req.json();

    // 1) Try to find existing manobra by ficha_id + ordem
    let manobra = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=? AND deleted_at IS NULL',
    )
      .bind(fichaId, ordem)
      .first<any>();

    // 2) If not found, try to create from model
    if (!manobra) {
      const ficha = await c.env.DB.prepare(
        `SELECT
           fs.*,
           COALESCE(sa.tipo_sessao, fs.tipo_sessao) as tipo_sessao_real,
           COALESCE(aer.modelo, s.modelo, fs.tipo_aeronave) as tipo_aeronave_real
         FROM fichas_sessao fs
         LEFT JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id
         LEFT JOIN simuladores s ON sa.simulador_id = s.id
         LEFT JOIN aeronaves aer ON fs.tipo_aeronave = aer.id
         WHERE fs.id = ? AND fs.deleted_at IS NULL`,
      )
        .bind(fichaId)
        .first();

      if (!ficha) {
        return c.json({ success: false, error: 'Ficha não encontrada' }, 404);
      }

      const tipoSessao = (ficha as any).tipo_sessao_real || ficha.tipo_sessao;
      const tipoAeronave = (ficha as any).tipo_aeronave_real || ficha.tipo_aeronave;
      const modelo = await c.env.DB.prepare(
        `SELECT ms.id
         FROM modelos_sessao ms
         INNER JOIN tipos_sessao ts ON ms.tipo_sessao_id = ts.id
         WHERE ts.codigo = ?
           AND ms.modelo_aeronave = ?
           AND ms.deleted_at IS NULL
         LIMIT 1`,
      )
        .bind(tipoSessao, tipoAeronave)
        .first();

      if (modelo) {
        const m = await c.env.DB.prepare(
          `SELECT m.codigo, COALESCE(m.nome, m.descricao) AS descricao, m.categoria
           FROM modelos_sessao_manobras msm
           INNER JOIN manobras m ON m.id = msm.manobra_id
           WHERE msm.modelo_id = ?
             AND msm.ordem = ?
             AND msm.deleted_at IS NULL
             AND m.deleted_at IS NULL
           LIMIT 1`,
        )
          .bind(modelo.id, ordem)
          .first();

        const codigo = m?.codigo || `ORD-${ordem}`;
        const descricao = m?.descricao || `Manobra ordem ${ordem}`;
        const categoria = m?.categoria || 'GERAL';

        await c.env.DB.prepare(
          `INSERT INTO fichas_sessao_manobras(
             ficha_id, codigo, descricao, categoria, ordem, resultado, observacoes
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            fichaId,
            codigo,
            descricao,
            categoria,
            Number(ordem),
            b.resultado ?? null,
            b.observacoes ?? '',
          )
          .run();

        manobra = await c.env.DB.prepare(
          'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=?',
        )
          .bind(fichaId, ordem)
          .first<any>();
      } else {
        await c.env.DB.prepare(
          `INSERT INTO fichas_sessao_manobras(
             ficha_id, codigo, descricao, categoria, ordem, resultado, observacoes
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            fichaId,
            `ORD-${ordem}`,
            `Manobra ordem ${ordem}`,
            'GERAL',
            Number(ordem),
            b.resultado ?? null,
            b.observacoes ?? '',
          )
          .run();

        manobra = await c.env.DB.prepare(
          'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=?',
        )
          .bind(fichaId, ordem)
          .first<any>();
      }
    }

    // 3) Update (idempotent)
    await c.env.DB.prepare(
      'UPDATE fichas_sessao_manobras SET resultado=?, observacoes=?, updated_at=datetime("now") WHERE ficha_id=? AND ordem=?',
    )
      .bind(
        b.resultado !== undefined ? b.resultado : manobra.resultado,
        b.observacoes !== undefined ? b.observacoes : manobra.observacoes,
        fichaId,
        ordem,
      )
      .run();

    const atual = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=? AND deleted_at IS NULL',
    )
      .bind(fichaId, ordem)
      .first();

    return c.json({ success: true, data: atual });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /fichas-simulador/:id/popular-manobras
// MODEL: 22 manobras per ficha (11 left + 11 right)
// Order 1-11 = left column | 12-22 = right column
app.post('/fichas-simulador/:id/popular-manobras', async (c) => {
  try {
    const fid = c.req.param('id');
    const f = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao WHERE id=? AND deleted_at IS NULL',
    )
      .bind(fid)
      .first();
    if (!f) return c.json({ success: false, error: 'Não encontrada' }, 404);

    const m = await c.env.DB.prepare(
      'SELECT codigo, COALESCE(nome, descricao) AS descricao, categoria, ordem FROM manobras WHERE tipo_sessao=? AND tipo_aeronave=? AND deleted_at IS NULL ORDER BY ordem LIMIT 22',
    )
      .bind(f.tipo_sessao, f.tipo_aeronave || '')
      .all();

    if (m.results.length < 22) {
      return c.json(
        {
          success: false,
          error: `Apenas ${m.results.length} manobras disponíveis no catálogo. Necessário 22 (11+11).`,
        },
        400,
      );
    }

    const insertStmts = m.results.slice(0, 22).map((ma: any, i: number) =>
      c.env.DB.prepare(
        'INSERT INTO fichas_sessao_manobras(ficha_id,codigo,descricao,categoria,ordem)VALUES(?,?,?,?,?)',
      ).bind(fid, ma.codigo, ma.descricao, ma.categoria, i + 1),
    );
    await c.env.DB.batch(insertStmts);
    return c.json({
      success: true,
      message: `22 manobras populadas (11 esquerda + 11 direita)`,
      total: 22,
      layout: '11 manobras por coluna',
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/fichas-simulador/:id/gerar-qualificacao', async (c) => {
  try {
    const data = await gerarQualificacaoDaFicha(c.env.DB, c.req.param('id'));

    return c.json(
      {
        success: true,
        message: `${data.qualificacoes_geradas.length} qualificação(ões) gerada(s)`,
        data,
      },
      201,
    );
  } catch (e: any) {
    const status = getQualificacaoGeracaoErrorStatus(String(e?.message || ''));
    const publicError =
      status === 400 || status === 404
        ? String(e?.message || 'Erro ao gerar qualificação')
        : 'Erro ao gerar qualificação';
    return c.json({ success: false, error: publicError }, (status || 500) as 400 | 404 | 500);
  }
});

app.get('/fichas-simulador/:id/gerar-pdf', async (c) => {
  return c.json(
    { success: false, error: 'PDF não implementado', nota: 'Use Puppeteer/jsPDF futuramente' },
    501,
  );
});

export default app;
