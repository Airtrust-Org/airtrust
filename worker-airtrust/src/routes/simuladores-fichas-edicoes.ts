/**
 * SIMULADORES — Edicao pos-finalizacao de fichas
 *
 * Fluxo regulatorio seguro:
 * - Instrutor da ficha solicita alteracao de observacoes em ficha finalizada.
 * - Gestor/admin aprova ou rejeita.
 * - Aprovacao aplica somente observacoes gerais e observacoes de manobras.
 * - Nao altera notas, status, resultado, assinaturas ou qualificacoes geradas.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { audit, getFuncId } from './simuladores-shared';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

const FINAL_STATUSES = new Set(['APROVADO', 'NAO_APROVADO', 'CONCLUIDA']);

type FichaRow = {
  id: number;
  status: string | null;
  observacoes: string | null;
  instrutor_id: number | null;
  colaborador_id_aluno: number;
  empresa_id: number | null;
  aluno_nome: string | null;
  instrutor_nome: string | null;
  sessao_nome: string | null;
  data_sessao: string | null;
};

type ManobraRow = {
  id: number;
  ordem: number | null;
  codigo: string | null;
  nome: string | null;
  descricao: string | null;
  observacoes: string | null;
};

type AlteracaoManobra = {
  manobra_id: number;
  ordem: number | null;
  codigo: string | null;
  nome: string | null;
  observacoes_antes: string;
  observacoes_depois: string;
};

type AlteracoesFicha = {
  observacoes_gerais?: { antes: string; depois: string };
  manobras: AlteracaoManobra[];
};

type EdicaoRow = {
  id: number;
  ficha_id: number;
  empresa_id: number | null;
  status: string;
  solicitante_usuario_id: string | null;
  solicitante_funcionario_id: number;
  motivo: string;
  snapshot_antes_json: string;
  alteracoes_json: string;
  aprovador_usuario_id: string | null;
  decisao_observacoes: string | null;
  aprovado_em: string | null;
  rejeitado_em: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  solicitante_nome?: string | null;
  aprovador_email?: string | null;
  participante_nome?: string | null;
  instrutor_nome?: string | null;
  ficha_status?: string | null;
  sessao_nome?: string | null;
  data_sessao?: string | null;
};

function normalizeRole(role: unknown): string {
  return String(role || '').trim().toUpperCase();
}

function canManageEdits(role: unknown): boolean {
  return ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER'].includes(normalizeRole(role));
}

function isFinalizada(status: unknown): boolean {
  return FINAL_STATUSES.has(normalizeRole(status));
}

function cleanText(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function getRequestIp(c: any): string | null {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Real-IP') ||
    c.req.header('X-Forwarded-For') ||
    null
  );
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value !== 'string' || !value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function resolveFuncionarioId(c: any): Promise<string | null> {
  const fromContext = c.get('funcionarioId');
  if (fromContext !== null && fromContext !== undefined && String(fromContext)) {
    return String(fromContext);
  }

  const userId = String((c as any).get('userId') || '');
  const empresaId = String(getEmpresaId(c) || (c as any).get('empresaId') || '');
  if (!userId || !empresaId) return null;

  return getFuncId(c.env.DB, userId, empresaId);
}

async function getFicha(db: D1Database, fichaId: string | number, empresaId: string | number) {
  return db
    .prepare(
      `SELECT
         fs.id,
         fs.status,
         fs.observacoes,
         fs.instrutor_id,
         fs.colaborador_id_aluno,
         COALESCE(fs.empresa_id, aluno.empresa_id) AS empresa_id,
         aluno.nome AS aluno_nome,
         instrutor.nome AS instrutor_nome,
         COALESCE(sa.nome, fs.tipo_sessao, 'Ficha de treinamento de voo') AS sessao_nome,
         COALESCE(sa.data, fs.data_sessao) AS data_sessao
       FROM fichas_sessao fs
       INNER JOIN funcionarios aluno ON aluno.id = fs.colaborador_id_aluno AND aluno.deleted_at IS NULL
       LEFT JOIN funcionarios instrutor ON instrutor.id = fs.instrutor_id AND instrutor.deleted_at IS NULL
       LEFT JOIN simulador_agendamentos sa ON sa.id = fs.agendamento_slot_id AND sa.deleted_at IS NULL
       WHERE fs.id = ?
         AND fs.deleted_at IS NULL
         AND COALESCE(fs.empresa_id, aluno.empresa_id) = ?
       LIMIT 1`,
    )
    .bind(String(fichaId), String(empresaId))
    .first<FichaRow>();
}

async function getManobras(db: D1Database, fichaId: string | number): Promise<ManobraRow[]> {
  const result = await db
    .prepare(
      `SELECT id, ordem, codigo, nome, descricao, observacoes
       FROM fichas_sessao_manobras
       WHERE ficha_id = ? AND deleted_at IS NULL
       ORDER BY ordem ASC`,
    )
    .bind(String(fichaId))
    .all<ManobraRow>();

  return result.results || [];
}

function serializeEdicao(row: EdicaoRow) {
  return {
    ...row,
    snapshot_antes: safeJsonParse(row.snapshot_antes_json, null),
    alteracoes: safeJsonParse<AlteracoesFicha | null>(row.alteracoes_json, null),
  };
}

async function notifyUsers(
  db: D1Database,
  empresaId: string | number,
  userIds: string[],
  payload: {
    tipo: string;
    titulo: string;
    mensagem: string;
    link: string;
    prioridade?: string;
    acaoPrimaria?: string;
    dados?: Record<string, unknown>;
  },
): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const stmts = uniqueIds.map((userId) =>
    db
      .prepare(
        `INSERT INTO notificacoes_sistema (
           tipo, titulo, mensagem, dados, link, empresa_id, user_id, prioridade, acao_primaria, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        payload.tipo,
        payload.titulo,
        payload.mensagem,
        payload.dados ? JSON.stringify(payload.dados) : null,
        payload.link,
        String(empresaId),
        userId,
        payload.prioridade || 'MEDIA',
        payload.acaoPrimaria || null,
      ),
  );

  try {
    await db.batch(stmts);
  } catch (error) {
    console.error('[FICHAS_EDICOES] Falha ao criar notificacoes:', error);
  }
}

async function listGestoresUsuarios(db: D1Database, empresaId: string | number): Promise<string[]> {
  try {
    const result = await db
      .prepare(
        `SELECT DISTINCT CAST(u.id AS TEXT) AS user_id
         FROM usuarios u
         LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
         LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
         WHERE u.deleted_at IS NULL
           AND UPPER(COALESCE(u.perfil, '')) IN ('ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER')
           AND (f.empresa_id = ? OR ue.empresa_id = ?)`,
      )
      .bind(String(empresaId), String(empresaId))
      .all<{ user_id: string }>();

    return (result.results || []).map((row) => row.user_id).filter(Boolean);
  } catch (error) {
    console.error('[FICHAS_EDICOES] Falha ao localizar gestores:', error);
    return [];
  }
}

async function getUsuarioDoFuncionario(
  db: D1Database,
  funcionarioId: string | number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT CAST(id AS TEXT) AS user_id
       FROM usuarios
       WHERE funcionario_id = ? AND deleted_at IS NULL
       ORDER BY id ASC
       LIMIT 1`,
    )
    .bind(String(funcionarioId))
    .first<{ user_id: string }>();
  return row?.user_id || null;
}

app.post('/fichas/:id/edicoes', async (c) => {
  try {
    const fichaId = c.req.param('id');
    const userId = String((c as any).get('userId') || '');
    const empresaId = String(getEmpresaId(c) || (c as any).get('empresaId') || '');
    const funcionarioId = await resolveFuncionarioId(c);

    if (!empresaId) return c.json({ success: false, error: 'Empresa não identificada' }, 403);
    if (!funcionarioId) return c.json({ success: false, error: 'Usuário sem vínculo funcional' }, 403);

    const ficha = await getFicha(c.env.DB, fichaId, empresaId);
    if (!ficha) return c.json({ success: false, error: 'Ficha não encontrada' }, 404);

    if (!isFinalizada(ficha.status)) {
      return c.json(
        { success: false, error: 'Este fluxo é exclusivo para fichas finalizadas' },
        400,
      );
    }

    if (String(ficha.instrutor_id) !== String(funcionarioId)) {
      return c.json(
        { success: false, error: 'Apenas o instrutor vinculado à ficha pode solicitar edição' },
        403,
      );
    }

    const pendente = await c.env.DB
      .prepare(
        `SELECT id FROM fichas_sessao_edicoes
         WHERE ficha_id = ? AND status = 'PENDENTE' AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(String(fichaId))
      .first<{ id: number }>();

    if (pendente) {
      return c.json(
        {
          success: false,
          error: 'Já existe uma solicitação pendente para esta ficha',
          code: 'PENDING_EDIT_EXISTS',
          data: { id: pendente.id },
        },
        409,
      );
    }

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const motivo = cleanText(body.motivo, 1000);
    if (motivo.length < 5) {
      return c.json({ success: false, error: 'Informe um motivo com pelo menos 5 caracteres' }, 400);
    }

    const manobrasAtuais = await getManobras(c.env.DB, fichaId);
    const manobrasById = new Map(manobrasAtuais.map((m) => [String(m.id), m]));
    const manobrasByOrdem = new Map(manobrasAtuais.map((m) => [String(m.ordem ?? ''), m]));

    const alteracoes: AlteracoesFicha = { manobras: [] };
    const hasObsGeral =
      Object.prototype.hasOwnProperty.call(body, 'observacoes_gerais') ||
      Object.prototype.hasOwnProperty.call(body, 'observacoes');

    if (hasObsGeral) {
      const depois = cleanText(body.observacoes_gerais ?? body.observacoes, 8000);
      const antes = ficha.observacoes || '';
      if (depois !== antes) {
        alteracoes.observacoes_gerais = { antes, depois };
      }
    }

    if (Array.isArray(body.manobras)) {
      for (const raw of body.manobras as Array<Record<string, unknown>>) {
        const manobra = raw?.id
          ? manobrasById.get(String(raw.id))
          : raw?.ordem
            ? manobrasByOrdem.get(String(raw.ordem))
            : null;
        if (!manobra) continue;

        const depois = cleanText(raw.observacoes, 4000);
        const antes = manobra.observacoes || '';
        if (depois !== antes) {
          alteracoes.manobras.push({
            manobra_id: manobra.id,
            ordem: manobra.ordem,
            codigo: manobra.codigo,
            nome: manobra.nome || manobra.descricao,
            observacoes_antes: antes,
            observacoes_depois: depois,
          });
        }
      }
    }

    if (!alteracoes.observacoes_gerais && alteracoes.manobras.length === 0) {
      return c.json({ success: false, error: 'Nenhuma alteração de observação foi informada' }, 400);
    }

    const snapshotAntes = {
      ficha: {
        id: ficha.id,
        status: ficha.status,
        observacoes_gerais: ficha.observacoes || '',
        instrutor_id: ficha.instrutor_id,
        colaborador_id_aluno: ficha.colaborador_id_aluno,
      },
      manobras: manobrasAtuais.map((m) => ({
        id: m.id,
        ordem: m.ordem,
        codigo: m.codigo,
        nome: m.nome || m.descricao,
        observacoes: m.observacoes || '',
      })),
    };

    const result = await c.env.DB
      .prepare(
        `INSERT INTO fichas_sessao_edicoes (
           ficha_id, empresa_id, status, solicitante_usuario_id, solicitante_funcionario_id,
           motivo, snapshot_antes_json, alteracoes_json, ip_address, user_agent, created_at, updated_at
         ) VALUES (?, ?, 'PENDENTE', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        String(fichaId),
        ficha.empresa_id || Number(empresaId),
        userId || null,
        Number(funcionarioId),
        motivo,
        JSON.stringify(snapshotAntes),
        JSON.stringify(alteracoes),
        getRequestIp(c),
        c.req.header('User-Agent') || null,
      )
      .run();

    const edicaoId = result.meta.last_row_id;
    await audit(c.env.DB, {
      tabela: 'fichas_sessao_edicoes',
      acao: 'FICHA_EDICAO_SOLICITADA',
      registro_id: edicaoId,
      dados_novos: {
        ficha_id: fichaId,
        solicitante_usuario_id: userId,
        solicitante_funcionario_id: funcionarioId,
        motivo,
        alteracoes,
      },
    });

    const gestores = await listGestoresUsuarios(c.env.DB, ficha.empresa_id || empresaId);
    await notifyUsers(c.env.DB, ficha.empresa_id || empresaId, gestores, {
      tipo: 'FICHA_EDICAO_PENDENTE',
      titulo: 'Edição de ficha aguardando aprovação',
      mensagem: `${ficha.instrutor_nome || 'Instrutor'} solicitou alteração de observações na ficha #${fichaId}.`,
      link: `/simuladores/fichas/${fichaId}?edicao=${edicaoId}`,
      prioridade: 'ALTA',
      acaoPrimaria: 'Analisar edição',
      dados: {
        ficha_id: Number(fichaId),
        edicao_id: Number(edicaoId),
        solicitante_funcionario_id: Number(funcionarioId),
      },
    });

    const row = await c.env.DB
      .prepare(`SELECT * FROM fichas_sessao_edicoes WHERE id = ?`)
      .bind(edicaoId)
      .first<EdicaoRow>();

    return c.json({ success: true, data: row ? serializeEdicao(row) : { id: edicaoId } }, 201);
  } catch (error: any) {
    console.error('[FICHAS_EDICOES] Erro ao solicitar edicao:', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.get('/fichas/:id/edicoes', async (c) => {
  try {
    const fichaId = c.req.param('id');
    const role = (c as any).get('userRole');
    const empresaId = String(getEmpresaId(c) || (c as any).get('empresaId') || '');
    const funcionarioId = await resolveFuncionarioId(c);

    if (!empresaId) return c.json({ success: false, error: 'Empresa não identificada' }, 403);

    const ficha = await getFicha(c.env.DB, fichaId, empresaId);
    if (!ficha) return c.json({ success: false, error: 'Ficha não encontrada' }, 404);

    const autorizado =
      canManageEdits(role) ||
      (funcionarioId && String(ficha.instrutor_id) === String(funcionarioId));

    if (!autorizado) return c.json({ success: false, error: 'Acesso negado' }, 403);

    const result = await c.env.DB
      .prepare(
        `SELECT fe.*, solicitante.nome AS solicitante_nome, aprovador.email AS aprovador_email
         FROM fichas_sessao_edicoes fe
         LEFT JOIN funcionarios solicitante ON solicitante.id = fe.solicitante_funcionario_id
         LEFT JOIN usuarios aprovador ON CAST(aprovador.id AS TEXT) = CAST(fe.aprovador_usuario_id AS TEXT)
         WHERE fe.ficha_id = ? AND fe.deleted_at IS NULL
         ORDER BY fe.created_at DESC`,
      )
      .bind(String(fichaId))
      .all<EdicaoRow>();

    return c.json({ success: true, data: (result.results || []).map(serializeEdicao) });
  } catch (error: any) {
    console.error('[FICHAS_EDICOES] Erro ao listar edicoes da ficha:', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.get('/fichas-edicoes', async (c) => {
  try {
    const role = (c as any).get('userRole');
    if (!canManageEdits(role)) return c.json({ success: false, error: 'Acesso negado' }, 403);

    const empresaId = String(getEmpresaId(c) || (c as any).get('empresaId') || '');
    const status = cleanText(c.req.query('status') || 'PENDENTE', 30).toUpperCase();
    const statusValidos = new Set(['PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA', 'TODAS']);
    if (!statusValidos.has(status)) {
      return c.json({ success: false, error: 'Status inválido' }, 400);
    }

    let where = `fe.deleted_at IS NULL AND COALESCE(fe.empresa_id, aluno.empresa_id) = ?`;
    const params: Array<string | number> = [empresaId];
    if (status !== 'TODAS') {
      where += ' AND fe.status = ?';
      params.push(status);
    }

    const result = await c.env.DB
      .prepare(
        `SELECT
           fe.*,
           fs.status AS ficha_status,
           aluno.nome AS participante_nome,
           instrutor.nome AS instrutor_nome,
           solicitante.nome AS solicitante_nome,
           aprovador.email AS aprovador_email,
           COALESCE(sa.nome, fs.tipo_sessao, 'Ficha de treinamento de voo') AS sessao_nome,
           COALESCE(sa.data, fs.data_sessao) AS data_sessao
         FROM fichas_sessao_edicoes fe
         INNER JOIN fichas_sessao fs ON fs.id = fe.ficha_id AND fs.deleted_at IS NULL
         INNER JOIN funcionarios aluno ON aluno.id = fs.colaborador_id_aluno AND aluno.deleted_at IS NULL
         LEFT JOIN funcionarios instrutor ON instrutor.id = fs.instrutor_id AND instrutor.deleted_at IS NULL
         LEFT JOIN funcionarios solicitante ON solicitante.id = fe.solicitante_funcionario_id
         LEFT JOIN usuarios aprovador ON CAST(aprovador.id AS TEXT) = CAST(fe.aprovador_usuario_id AS TEXT)
         LEFT JOIN simulador_agendamentos sa ON sa.id = fs.agendamento_slot_id AND sa.deleted_at IS NULL
         WHERE ${where}
         ORDER BY fe.created_at DESC
         LIMIT 200`,
      )
      .bind(...params)
      .all<EdicaoRow>();

    return c.json({ success: true, data: (result.results || []).map(serializeEdicao) });
  } catch (error: any) {
    console.error('[FICHAS_EDICOES] Erro ao listar fila:', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/fichas-edicoes/:edicaoId/aprovar', async (c) => {
  try {
    const role = (c as any).get('userRole');
    if (!canManageEdits(role)) return c.json({ success: false, error: 'Acesso negado' }, 403);

    const edicaoId = c.req.param('edicaoId');
    const empresaId = String(getEmpresaId(c) || (c as any).get('empresaId') || '');
    const userId = String((c as any).get('userId') || '');
    const funcionarioId = await resolveFuncionarioId(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const decisao = cleanText(body.observacoes ?? body.decisao_observacoes, 2000);

    const edicao = await c.env.DB
      .prepare(
        `SELECT fe.*, fs.status AS ficha_status, aluno.empresa_id AS aluno_empresa_id
         FROM fichas_sessao_edicoes fe
         INNER JOIN fichas_sessao fs ON fs.id = fe.ficha_id AND fs.deleted_at IS NULL
         INNER JOIN funcionarios aluno ON aluno.id = fs.colaborador_id_aluno AND aluno.deleted_at IS NULL
         WHERE fe.id = ? AND fe.deleted_at IS NULL
           AND COALESCE(fe.empresa_id, aluno.empresa_id) = ?
         LIMIT 1`,
      )
      .bind(String(edicaoId), empresaId)
      .first<EdicaoRow & { ficha_status: string; aluno_empresa_id: number }>();

    if (!edicao) return c.json({ success: false, error: 'Solicitação não encontrada' }, 404);
    if (edicao.status !== 'PENDENTE') {
      return c.json({ success: false, error: 'Solicitação já decidida' }, 409);
    }
    if (!isFinalizada(edicao.ficha_status)) {
      return c.json({ success: false, error: 'Ficha não está mais finalizada' }, 409);
    }
    if (
      (userId && String(edicao.solicitante_usuario_id || '') === userId) ||
      (funcionarioId && String(edicao.solicitante_funcionario_id) === String(funcionarioId))
    ) {
      return c.json(
        { success: false, error: 'O solicitante não pode aprovar a própria edição' },
        403,
      );
    }

    const alteracoes = safeJsonParse<AlteracoesFicha>(edicao.alteracoes_json, { manobras: [] });
    const stmts: D1PreparedStatement[] = [];

    if (alteracoes.observacoes_gerais) {
      stmts.push(
        c.env.DB
          .prepare("UPDATE fichas_sessao SET observacoes = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(alteracoes.observacoes_gerais.depois, String(edicao.ficha_id)),
      );
    }

    for (const manobra of alteracoes.manobras || []) {
      stmts.push(
        c.env.DB
          .prepare(
            `UPDATE fichas_sessao_manobras
             SET observacoes = ?, updated_at = datetime('now')
             WHERE id = ? AND ficha_id = ? AND deleted_at IS NULL`,
          )
          .bind(manobra.observacoes_depois, manobra.manobra_id, String(edicao.ficha_id)),
      );
    }

    stmts.push(
      c.env.DB
        .prepare(
          `UPDATE fichas_sessao_edicoes
           SET status = 'APROVADA', aprovador_usuario_id = ?, decisao_observacoes = ?,
               aprovado_em = datetime('now'), updated_at = datetime('now')
           WHERE id = ? AND status = 'PENDENTE'`,
        )
        .bind(userId || null, decisao || null, String(edicaoId)),
    );

    await c.env.DB.batch(stmts);

    await audit(c.env.DB, {
      tabela: 'fichas_sessao_edicoes',
      acao: 'FICHA_EDICAO_APROVADA',
      registro_id: edicaoId,
      dados_anteriores: edicao,
      dados_novos: { aprovador_usuario_id: userId, decisao_observacoes: decisao, alteracoes },
    });
    await audit(c.env.DB, {
      tabela: 'fichas_sessao',
      acao: 'FICHA_EDICAO_POS_FINALIZACAO_APLICADA',
      registro_id: edicao.ficha_id,
      dados_novos: { edicao_id: edicaoId, alteracoes },
    });

    const solicitanteUserId = await getUsuarioDoFuncionario(
      c.env.DB,
      edicao.solicitante_funcionario_id,
    );
    if (solicitanteUserId) {
      await notifyUsers(c.env.DB, empresaId, [solicitanteUserId], {
        tipo: 'FICHA_EDICAO_APROVADA',
        titulo: 'Edição de ficha aprovada',
        mensagem: `Sua solicitação de edição da ficha #${edicao.ficha_id} foi aprovada e aplicada.`,
        link: `/simuladores/fichas/${edicao.ficha_id}`,
        prioridade: 'MEDIA',
        acaoPrimaria: 'Ver ficha',
        dados: { ficha_id: edicao.ficha_id, edicao_id: Number(edicaoId) },
      });
    }

    const row = await c.env.DB
      .prepare(`SELECT * FROM fichas_sessao_edicoes WHERE id = ?`)
      .bind(String(edicaoId))
      .first<EdicaoRow>();

    return c.json({ success: true, data: row ? serializeEdicao(row) : { id: Number(edicaoId) } });
  } catch (error: any) {
    console.error('[FICHAS_EDICOES] Erro ao aprovar:', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/fichas-edicoes/:edicaoId/rejeitar', async (c) => {
  try {
    const role = (c as any).get('userRole');
    if (!canManageEdits(role)) return c.json({ success: false, error: 'Acesso negado' }, 403);

    const edicaoId = c.req.param('edicaoId');
    const empresaId = String(getEmpresaId(c) || (c as any).get('empresaId') || '');
    const userId = String((c as any).get('userId') || '');
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const decisao = cleanText(body.observacoes ?? body.decisao_observacoes, 2000);

    const edicao = await c.env.DB
      .prepare(
        `SELECT fe.*
         FROM fichas_sessao_edicoes fe
         INNER JOIN fichas_sessao fs ON fs.id = fe.ficha_id AND fs.deleted_at IS NULL
         INNER JOIN funcionarios aluno ON aluno.id = fs.colaborador_id_aluno AND aluno.deleted_at IS NULL
         WHERE fe.id = ? AND fe.deleted_at IS NULL
           AND COALESCE(fe.empresa_id, aluno.empresa_id) = ?
         LIMIT 1`,
      )
      .bind(String(edicaoId), empresaId)
      .first<EdicaoRow>();

    if (!edicao) return c.json({ success: false, error: 'Solicitação não encontrada' }, 404);
    if (edicao.status !== 'PENDENTE') {
      return c.json({ success: false, error: 'Solicitação já decidida' }, 409);
    }

    await c.env.DB
      .prepare(
        `UPDATE fichas_sessao_edicoes
         SET status = 'REJEITADA', aprovador_usuario_id = ?, decisao_observacoes = ?,
             rejeitado_em = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND status = 'PENDENTE'`,
      )
      .bind(userId || null, decisao || null, String(edicaoId))
      .run();

    await audit(c.env.DB, {
      tabela: 'fichas_sessao_edicoes',
      acao: 'FICHA_EDICAO_REJEITADA',
      registro_id: edicaoId,
      dados_anteriores: edicao,
      dados_novos: { aprovador_usuario_id: userId, decisao_observacoes: decisao },
    });

    const solicitanteUserId = await getUsuarioDoFuncionario(
      c.env.DB,
      edicao.solicitante_funcionario_id,
    );
    if (solicitanteUserId) {
      await notifyUsers(c.env.DB, empresaId, [solicitanteUserId], {
        tipo: 'FICHA_EDICAO_REJEITADA',
        titulo: 'Edição de ficha rejeitada',
        mensagem: `Sua solicitação de edição da ficha #${edicao.ficha_id} foi rejeitada.`,
        link: `/simuladores/fichas/${edicao.ficha_id}`,
        prioridade: 'MEDIA',
        acaoPrimaria: 'Ver ficha',
        dados: { ficha_id: edicao.ficha_id, edicao_id: Number(edicaoId) },
      });
    }

    const row = await c.env.DB
      .prepare(`SELECT * FROM fichas_sessao_edicoes WHERE id = ?`)
      .bind(String(edicaoId))
      .first<EdicaoRow>();

    return c.json({ success: true, data: row ? serializeEdicao(row) : { id: Number(edicaoId) } });
  } catch (error: any) {
    console.error('[FICHAS_EDICOES] Erro ao rejeitar:', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
