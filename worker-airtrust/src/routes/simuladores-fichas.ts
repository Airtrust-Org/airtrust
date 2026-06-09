/**
 * SIMULADORES — Fichas de Sessão
 * Routes:
 *   GET/POST /fichas
 *   GET/PUT/DELETE /fichas/:id
 *   POST /fichas/:id/assinar
 *   POST /fichas/:id/pdf
 *   POST /fichas/:id/arquivar
 *   GET /fichas-simulador/:id/manobras
 *   PUT /fichas-simulador/:fichaId/manobras/:ordem
 *   POST /fichas-simulador/:id/popular-manobras
 *   POST /fichas-simulador/:id/gerar-qualificacao
 *   GET /fichas-simulador/:id/gerar-pdf
 *   POST /historico-notas
 *   GET /historico-notas/ultima/:funcionarioId/:codigoManobra
 *   GET /historico-notas/:funcionarioId
 *   GET /dashboard/:funcionarioId
 *   GET /sessoes/:id/checks  (included here for proximity with below)
 *   POST /sessoes/:id/checks/resultados
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';
import { resolveFichaScope } from '../utils/ficha-role-scope';
import { audit, requireAdminForDelete } from './simuladores-shared';
import { syncHorasVooFromSimulador } from '../shared/handlers/horasVooFromSimulador.handler';
import { enviarEmailFichaSessao } from '../lib/fichaEmails';
import {
  gerarQualificacaoDaFicha,
  getQualificacaoGeracaoErrorStatus,
  marcarNotificacoesFichaComoResolvidas,
  listarManobrasPendentes,
  type ResultadoGeracaoQualificacao,
} from './simuladores-fichas-helpers';
import fichasSimuladorRoutes from './simuladores-fichas-simulador';
import fichasAcoesRoutes from './simuladores-fichas-acoes';

const app = new Hono<{ Bindings: Env }>();
// Todos os endpoints de fichas requerem autenticação
app.use('*', auth());

// ─── Helper: busca funcionario_id do usuário autenticado ───────────────────
async function getFuncionarioId(
  db: D1Database,
  userId: string | number,
  empresaId: string | number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT f.id FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
       WHERE u.id = ? AND f.empresa_id = ?
         AND (u.deleted_at IS NULL OR u.deleted_at = 0)
         AND f.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(String(userId), String(empresaId))
    .first<{ id: string }>();
  return row?.id ?? null;
}

// ─── Helper: perfis com acesso total ───────────────────────────────────────
function isFullAccess(role: string): boolean {
  return resolveFichaScope(role) === 'FULL_ACCESS';
}

function extractIsoDateOnly(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatIsoDateOnlyPtBr(value?: string | null): string {
  const isoDateOnly = extractIsoDateOnly(value);
  if (!isoDateOnly) return '';

  const [year, month, day] = isoDateOnly.split('-');
  return `${day}/${month}/${year}`;
}

// ─── Helper: busca user_id + nome de um funcionário ───────────────────────
async function getFuncionarioUserInfo(
  db: D1Database,
  funcionarioId: string | number,
): Promise<{ userId: string; nome: string } | null> {
  const row = await db
    .prepare(
      `SELECT u.id as user_id, f.nome
       FROM funcionarios f
       LEFT JOIN usuarios u ON u.funcionario_id = f.id AND u.deleted_at IS NULL
       WHERE f.id = ? AND f.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(String(funcionarioId))
    .first<{ user_id: number | null; nome: string }>();
  if (!row) return null;
  return { userId: row.user_id ? String(row.user_id) : '', nome: row.nome || '' };
}

// ─── Helper: cria notificação no sistema ──────────────────────────────────
async function criarNotificacaoFicha(
  db: D1Database,
  {
    empresaId,
    userId,
    tipo,
    titulo,
    mensagem,
    link,
    prioridade = 'ALTA',
    acaoPrimaria,
    dados,
  }: {
    empresaId: string | number;
    userId: string;
    tipo: string;
    titulo: string;
    mensagem: string;
    link: string;
    prioridade?: string;
    acaoPrimaria?: string;
    dados?: Record<string, unknown>;
  },
): Promise<void> {
  if (!userId) return;
  try {
    await db
      .prepare(
        `INSERT INTO notificacoes_sistema (
          tipo,
          titulo,
          mensagem,
          dados,
          link,
          empresa_id,
          user_id,
          prioridade,
          acao_primaria,
          created_at,
          updated_at
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        tipo,
        titulo,
        mensagem,
        dados ? JSON.stringify(dados) : null,
        link,
        String(empresaId),
        userId,
        prioridade,
        acaoPrimaria || null,
      )
      .run();
  } catch (e) {
    console.error('[NOTIF] Erro ao criar notificação de ficha:', e);
  }
}

// ==========================================================================
// FICHAS — Listagem e criação
// ==========================================================================

app.get('/fichas', async (c) => {
  try {
    const ctx = c as unknown as { get: (k: string) => unknown };
    const userId = String(ctx.get('userId') || '');
    const role = String(ctx.get('userRole') || '');
    const empresaId = String(ctx.get('empresaId') || '');

    const statusFilter = c.req.query('status') || '';
    const tipoFilter = c.req.query('tipo_sessao') || '';

    let q = `
      SELECT
        f.*,
        CASE
          WHEN f.assinatura_instrutor_timestamp IS NOT NULL THEN
            CASE
              WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
              WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
              WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
              WHEN f.aprovado = 1 THEN 'APROVADO'
              ELSE 'APROVADO'
            END
          WHEN f.assinatura_aluno_timestamp IS NOT NULL THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
          WHEN f.status IN ('AGUARDANDO_ASSINATURA_ALUNO', 'AGUARDANDO_ASSINATURA_INSTRUTOR', 'AVALIACAO_PENDENTE', 'APROVADO', 'NAO_APROVADO') THEN f.status
          WHEN f.status IN ('AGUARDANDO_ASSINATURAS', 'AVALIADA') THEN 'AGUARDANDO_ASSINATURA_ALUNO'
          WHEN f.status IN ('ASSINADA_ALUNO') THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
          WHEN f.status IN ('ASSINADA_TOTAL', 'APROVADA', 'CONCLUIDA') THEN
            CASE
              WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
              WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
              WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
              WHEN f.aprovado = 1 THEN 'APROVADO'
              ELSE 'APROVADO'
            END
          ELSE 'AVALIACAO_PENDENTE'
        END as status,
        COALESCE(sa.data, f.data_sessao) || ' ' || COALESCE(sa.hora_inicio, '') as data_hora,
        sa.data as data_sessao,
        sa.hora_inicio,
        sa.hora_fim,
        COALESCE(mf.nome, sa.nome, m.nome, t.tema, f.tipo_sessao, 'Sessão') as sessao_titulo,
        COALESCE(mf.nome, sa.nome, m.nome, t.tema) as sessao_modelo,
        COALESCE(sa.tipo_sessao, f.tipo_sessao, 'N/A') as simulador_codigo,
        COALESCE(sim.nome, sim.tipo, 'N/A') as simulador_nome,
        COALESCE(aluno.nome, 'N/A') as participante_nome,
        COALESCE(aluno.codigo_anac, '') as aluno_codigo_anac,
        COALESCE(instrutor.nome, 'N/A') as instrutor_nome
      FROM fichas_sessao f
      LEFT JOIN simulador_agendamentos sa ON f.agendamento_slot_id = sa.id
      LEFT JOIN modelos_sessao m ON sa.tipo_sessao = m.codigo
      LEFT JOIN modelos_sessao mf ON f.tipo_sessao = mf.codigo AND mf.deleted_at IS NULL
      LEFT JOIN sessoes_template t ON f.template_id = t.id
      LEFT JOIN simuladores sim ON sa.simulador_id = sim.id
      LEFT JOIN funcionarios aluno ON f.colaborador_id_aluno = aluno.id
      LEFT JOIN funcionarios instrutor ON f.instrutor_id = instrutor.id
      WHERE f.deleted_at IS NULL
        AND aluno.empresa_id = ?
    `;
    const tenantEmpresaId = getEmpresaId(c);
    const params: (string | number)[] = [tenantEmpresaId];

    // ── Controle de acesso por perfil ────────────────────────────────────────
    if (!isFullAccess(role)) {
      const funcId = await getFuncionarioId(c.env.DB, userId, empresaId);
      if (!funcId) return c.json({ success: true, data: [] }); // sem vínculo → sem fichas

      const scope = resolveFichaScope(role);
      if (scope === 'ALUNO_PENDING_SIGNATURE') {
        // Aluno: apenas fichas onde ele é o participante E aguardando assinatura dele
        q += ` AND f.colaborador_id_aluno = ?
          AND f.assinatura_aluno_timestamp IS NULL
          AND f.assinatura_instrutor_timestamp IS NULL
          AND f.status IN ('AGUARDANDO_ASSINATURA_ALUNO','AGUARDANDO_ASSINATURAS','AVALIADA')`;
        params.push(funcId);
      } else if (scope === 'INSTRUTOR_OR_ALUNO') {
        // Instrutor pode ser também aluno em outra sessão — vê ambos os casos
        q += ' AND (f.instrutor_id = ? OR f.colaborador_id_aluno = ?)';
        params.push(funcId, funcId);
      } else {
        // Perfil desconhecido → nega acesso a tudo
        return c.json({ success: true, data: [] });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (statusFilter) {
      q += ' AND f.status=?';
      params.push(statusFilter);
    }
    if (tipoFilter) {
      q += ' AND f.tipo_sessao=?';
      params.push(tipoFilter);
    }
    q += ' ORDER BY f.created_at DESC';

    const r = await c.env.DB.prepare(q)
      .bind(...params)
      .all();
    return c.json({ success: true, data: r.results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return c.json({ success: false, error: msg }, 500);
  }
});

app.post('/fichas', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const b = await c.req.json();
    if (!b.colaborador_id_aluno || !b.tipo_sessao)
      return c.json(
        { success: false, error: 'colaborador_id_aluno,tipo_sessao obrigatórios' },
        400,
      );
    const colaboradorId = Number(b.colaborador_id_aluno);
    const instrutorId = b.instrutor_id != null ? Number(b.instrutor_id) : null;

    if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) {
      return c.json({ success: false, error: 'colaborador_id_aluno inválido' }, 400);
    }
    if (instrutorId !== null && (!Number.isInteger(instrutorId) || instrutorId <= 0)) {
      return c.json({ success: false, error: 'instrutor_id inválido' }, 400);
    }

    const funcionarioIds = [colaboradorId, ...(instrutorId ? [instrutorId] : [])];
    const ownership = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT id) AS total
         FROM funcionarios
        WHERE id IN (${funcionarioIds.map(() => '?').join(',')})
          AND empresa_id = ?
          AND deleted_at IS NULL`,
    )
      .bind(...funcionarioIds, empresaId)
      .first<{ total: number }>();

    if (Number(ownership?.total || 0) !== funcionarioIds.length) {
      return c.json({ success: false, error: 'Aluno ou instrutor fora do tenant' }, 400);
    }

    const uuid = crypto.randomUUID();
    const r = await c.env.DB.prepare(
      'INSERT INTO fichas_sessao(uuid,agendamento_slot_id,colaborador_id_aluno,instrutor_id,tipo_sessao,tipo_aeronave,status,data_sessao,aprovado,empresa_id)VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        uuid,
        b.agendamento_slot_id || null,
        colaboradorId,
        instrutorId,
        b.tipo_sessao,
        b.tipo_aeronave || null,
        b.status || 'AVALIACAO_PENDENTE',
        b.data_sessao || new Date().toISOString(),
        b.aprovado !== undefined ? b.aprovado : 0,
        empresaId,
      )
      .run();
    const f = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(r.meta.last_row_id, empresaId)
      .first();
    return c.json({ success: true, data: f }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ==========================================================================
// FICHAS — fichas-simulador (manobras) — moved to simuladores-fichas-simulador.ts
// Routes mounted here via sub-router (before /fichas/:id to avoid shadowing)
// ==========================================================================
app.route('/', fichasAcoesRoutes);
app.route('/', fichasSimuladorRoutes);

// ==========================================================================
// FICHAS — parametrizadas (:id) — must come AFTER /fichas-simulador/...
// ==========================================================================

/**
 * GET /fichas/:id
 * Buscar ficha completa com todos os dados para exibição
 */
app.get('/fichas/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const ctx = c as unknown as { get: (k: string) => unknown };
    const userId = String(ctx.get('userId') || '');
    const role = String(ctx.get('userRole') || '');
    const empresaId = String(ctx.get('empresaId') || '');
    const tenantEmpresaId = getEmpresaId(c);

    const f = await c.env.DB.prepare(
      `SELECT 
        fs.id,
        fs.uuid,
        fs.agendamento_slot_id,
        fs.status,
        fs.aprovado,
        fs.nota_final,
        fs.resultado_final,
        fs.observacoes,
        fs.data_sessao,
        fs.assinatura_aluno_timestamp,
        fs.assinatura_instrutor_timestamp,
        fs.assinatura_aluno_ip,
        fs.assinatura_instrutor_ip,
        fs.assinatura_aluno_imagem,
        fs.assinatura_instrutor_imagem,
        fs.colaborador_id_aluno,
        fs.tipo_sessao as ficha_tipo_sessao,
        sa.tipo_sessao,
        sa.nome as sessao_nome,
        sa.data,
        sa.hora_inicio as horario_inicio,
        sa.hora_fim as horario_fim,
        sa.duracao_minutos,
        sa.is_check,
        sa.examinador_id,
        ft.id as tripulante_id,
        ft.nome as tripulante_nome,
        ft.matricula as tripulante_matricula,
        ft.codigo_anac as tripulante_codigo_anac,
        sp.funcao as tripulante_funcao,
        fi.id as instrutor_id,
        fi.nome as instrutor_nome,
        fi.matricula as instrutor_matricula,
        fi.codigo_anac as instrutor_codigo_anac,
        COALESCE(s.nome, ae.prefixo, ae.modelo, 'N/A') as simulador_nome,
        COALESCE(s.modelo, ae.modelo, 'N/A') as simulador_modelo,
        COALESCE(s.tipo, sa.tipo_dispositivo, 'N/A') as simulador_tipo,
        tpl.codigo as template_codigo,
        tpl.nome as template_tema,
        fex.nome as examinador_nome,
        mf.nome as ficha_modelo_nome,
        COALESCE(fs.template_id, sa.template_id, mf.id) as modelo_sessao_id,
        (
          SELECT COUNT(1)
          FROM fichas_sessao_edicoes fe
          WHERE fe.ficha_id = fs.id
            AND fe.status = 'PENDENTE'
            AND fe.deleted_at IS NULL
        ) as edicoes_pendentes_count
      FROM fichas_sessao fs
      INNER JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id AND sa.deleted_at IS NULL
      INNER JOIN funcionarios ft ON fs.colaborador_id_aluno = ft.id AND ft.deleted_at IS NULL
      INNER JOIN funcionarios fi ON fs.instrutor_id = fi.id AND fi.deleted_at IS NULL
      LEFT JOIN simuladores s ON sa.simulador_id = s.id AND s.deleted_at IS NULL
      LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id AND ae.deleted_at IS NULL
      LEFT JOIN sessoes_participantes sp ON sp.sessao_id = sa.id
        AND sp.funcionario_id = ft.id
        AND sp.deleted_at IS NULL
      LEFT JOIN modelos_sessao tpl ON COALESCE(fs.template_id, sa.template_id) = tpl.id AND tpl.deleted_at IS NULL
      LEFT JOIN funcionarios fex ON sa.examinador_id = fex.id AND fex.deleted_at IS NULL
      LEFT JOIN modelos_sessao mf ON fs.tipo_sessao = mf.codigo AND mf.deleted_at IS NULL
      WHERE fs.id = ? AND fs.deleted_at IS NULL AND fs.empresa_id = ?
      `,
    )
      .bind(id, tenantEmpresaId)
      .first<any>();

    if (!f) return c.json({ success: false, error: 'Ficha não encontrada' }, 404);

    // ── Verificar acesso por perfil ───────────────────────────────────────────
    if (!isFullAccess(role)) {
      const funcId = await getFuncionarioId(c.env.DB, userId, empresaId);
      const scope = resolveFichaScope(role);
      const authorized =
        scope === 'ALUNO_PENDING_SIGNATURE'
          ? String(f.colaborador_id_aluno) === String(funcId)
          : scope === 'INSTRUTOR_OR_ALUNO'
            ? // Instrutor pode ser o instrutor OU o aluno da ficha
              String(f.instrutor_id) === String(funcId) ||
              String(f.colaborador_id_aluno) === String(funcId)
            : false;
      if (!authorized) return c.json({ success: false, error: 'Acesso negado' }, 403);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch manobras — JOIN com tabela manobras para obter nome curto correto
    // (fichas antigas gravaram COALESCE(nome, descricao) na coluna descricao, sem nome separado)
    let m = await c.env.DB.prepare(
      `SELECT
        fsm.id,
        fsm.ordem,
        fsm.codigo,
        COALESCE(man.nome, fsm.nome, fsm.descricao) as nome,
        COALESCE(man.descricao, fsm.descricao) as descricao,
        fsm.categoria,
        fsm.resultado,
        fsm.observacoes,
        COALESCE(fsm.tripulante, 'AB') as tripulante
      FROM fichas_sessao_manobras fsm
      LEFT JOIN (
        SELECT codigo, MIN(nome) as nome, MIN(descricao) as descricao
        FROM manobras
        WHERE deleted_at IS NULL AND empresa_id = ?
        GROUP BY codigo
      ) man
        ON man.codigo = fsm.codigo
      WHERE fsm.ficha_id = ? AND fsm.deleted_at IS NULL
      ORDER BY fsm.ordem ASC`,
    )
      .bind(tenantEmpresaId, id)
      .all();

    // ============================================================
    // AUTO-POPULATE / SELF-HEAL
    // Garante que as manobras da ficha correspondem ao modelo correto.
    // Executa em dois cenários:
    //  1. Ficha sem manobras (população inicial)
    //  2. Ficha com manobras que não correspondem ao modelo correto
    //     E todas com resultado IS NULL (nunca avaliadas)
    // ============================================================
    let modeloSessaoResolvidoId =
      f.modelo_sessao_id && Number.isFinite(Number(f.modelo_sessao_id))
        ? Number(f.modelo_sessao_id)
        : null;

    {
      // Helper para recarregar manobras (com JOIN para nome correto)
      const reloadManobras = async () =>
        c.env.DB.prepare(
          `SELECT fsm.id, fsm.ordem, fsm.codigo,
            COALESCE(man.nome, fsm.nome, fsm.descricao) as nome,
            COALESCE(man.descricao, fsm.descricao) as descricao,
            fsm.categoria, fsm.resultado, fsm.observacoes, COALESCE(fsm.tripulante, 'AB') as tripulante
           FROM fichas_sessao_manobras fsm
           LEFT JOIN (
             SELECT codigo, MIN(nome) as nome, MIN(descricao) as descricao
             FROM manobras
             WHERE deleted_at IS NULL AND empresa_id = ?
             GROUP BY codigo
           ) man
             ON man.codigo = fsm.codigo
           WHERE fsm.ficha_id = ? AND fsm.deleted_at IS NULL ORDER BY fsm.ordem ASC`,
        )
          .bind(tenantEmpresaId, id)
          .all();

      // Helper para inserir manobras a partir do modelo
      const insertFromModelo = async (modeloIdFinal: number) => {
        const manobrasModelo = await c.env.DB.prepare(
          `SELECT man.codigo, man.nome, man.descricao, man.categoria,
                  msm.ordem, COALESCE(msm.tripulante, 'AB') as tripulante
           FROM modelos_sessao_manobras msm
           INNER JOIN manobras man ON msm.manobra_id = man.id
           WHERE msm.modelo_id = ? AND msm.deleted_at IS NULL AND man.deleted_at IS NULL AND man.empresa_id = ?
           ORDER BY msm.ordem ASC LIMIT 22`,
        )
          .bind(modeloIdFinal, tenantEmpresaId)
          .all();

        if (manobrasModelo.results && manobrasModelo.results.length > 0) {
          const stmts = manobrasModelo.results.map((manobra) => {
            const man = manobra as {
              codigo: string;
              nome: string;
              descricao: string;
              categoria: string;
              ordem: number;
              tripulante: string;
            };
            return c.env.DB.prepare(
              `INSERT INTO fichas_sessao_manobras
                 (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, resultado, observacoes)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '')`,
            ).bind(
              id,
              man.codigo,
              man.nome || man.descricao,
              man.descricao || '',
              man.categoria,
              man.ordem,
              man.tripulante || 'AB',
            );
          });
          await c.env.DB.batch(stmts);
          return manobrasModelo.results.length;
        }
        return 0;
      };

      // ── Passo A: Encontrar o modelo correto para esta ficha (3 estratégias)
      const fichaCtx = await c.env.DB.prepare(
        `SELECT fs.tipo_sessao as ficha_tipo_sessao,
                sa.template_id as sessao_template_id,
                COALESCE(sa.tipo_sessao, fs.tipo_sessao) as tipo_sessao,
                COALESCE(aer.modelo, s.modelo, fs.tipo_aeronave) as tipo_aeronave,
                sa.nome as sessao_nome
         FROM fichas_sessao fs
         LEFT JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id
         LEFT JOIN simuladores s ON sa.simulador_id = s.id
         LEFT JOIN aeronaves aer ON fs.tipo_aeronave = aer.id
         WHERE fs.id = ?`,
      )
        .bind(id)
        .first<any>();

      let modeloCorreto: { id: number } | null = null;

      if (fichaCtx) {
        // Estratégia 0: vínculo explícito do modelo salvo na sessão
        if (fichaCtx.sessao_template_id) {
          modeloCorreto = (await c.env.DB.prepare(
            `SELECT id FROM modelos_sessao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
          )
            .bind(fichaCtx.sessao_template_id, tenantEmpresaId)
            .first()) as any;
        }

        // Estratégia 1: código direto do modelo (fichas especiais: CHECK-CRED-EXAMINADOR, etc.)
        modeloCorreto =
          ((await c.env.DB.prepare(
            `SELECT id FROM modelos_sessao WHERE codigo = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
          )
            .bind(fichaCtx.ficha_tipo_sessao, tenantEmpresaId)
            .first()) as any) || modeloCorreto;

        // Estratégia 2: nome exato da sessão (mais precisa para fichas regulares com múltiplos modelos)
        if (!modeloCorreto && fichaCtx.sessao_nome) {
          modeloCorreto = (await c.env.DB.prepare(
            `SELECT id FROM modelos_sessao WHERE nome = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
          )
            .bind(fichaCtx.sessao_nome, tenantEmpresaId)
            .first()) as any;
        }

        // Estratégia 3: tipo genérico + aeronave (fallback — pode ser impreciso com múltiplos modelos)
        if (!modeloCorreto) {
          modeloCorreto = (await c.env.DB.prepare(
            `SELECT ms.id FROM modelos_sessao ms
             INNER JOIN tipos_sessao ts
               ON ms.tipo_sessao_id = ts.id
              AND ts.empresa_id = ?
              AND ts.deleted_at IS NULL
             WHERE ts.codigo = ? AND ms.modelo_aeronave = ? AND ms.empresa_id = ? AND ms.deleted_at IS NULL LIMIT 1`,
          )
            .bind(tenantEmpresaId, fichaCtx.tipo_sessao, fichaCtx.tipo_aeronave, tenantEmpresaId)
            .first()) as any;
        }
      }

      console.log(
        `[AUTO-POPULATE] ficha=${id} modeloCorreto=${modeloCorreto?.id ?? 'N/A'} manobrasAtuais=${m.results?.length ?? 0}`,
      );

      if (modeloCorreto?.id) {
        modeloSessaoResolvidoId = modeloCorreto.id;
      }

      // ── Passo B: Decidir se precisa popular/corrigir
      let needsPopulate = !m.results || m.results.length === 0;

      if (!needsPopulate && modeloCorreto && m.results && m.results.length > 0) {
        // Verificar se as manobras existentes correspondem ao modelo correto:
        // Condição: nenhuma foi avaliada (resultado IS NULL) E o código da primeira não bate com o modelo
        const todasSemResultado = m.results.every(
          (r: any) => r.resultado === null || r.resultado === undefined,
        );
        if (todasSemResultado) {
          const primeiraModoelo = await c.env.DB.prepare(
            `SELECT man.codigo FROM modelos_sessao_manobras msm
             INNER JOIN manobras man ON msm.manobra_id = man.id
             WHERE msm.modelo_id = ? AND msm.deleted_at IS NULL AND man.deleted_at IS NULL AND man.empresa_id = ?
             ORDER BY msm.ordem ASC LIMIT 1`,
          )
            .bind(modeloCorreto.id, tenantEmpresaId)
            .first<any>();

          if (primeiraModoelo && primeiraModoelo.codigo !== (m.results[0] as any).codigo) {
            console.log(
              `[AUTO-POPULATE] ⚠️ Ficha ${id}: manobras incorretas (${(m.results[0] as any).codigo} ≠ ${primeiraModoelo.codigo}). Corrigindo...`,
            );
            // Soft-delete manobras erradas
            await c.env.DB.prepare(
              `UPDATE fichas_sessao_manobras SET deleted_at = datetime('now') WHERE ficha_id = ? AND deleted_at IS NULL`,
            )
              .bind(id)
              .run();
            needsPopulate = true;
          }
        }
      }

      // ── Passo C: Popular se necessário
      if (needsPopulate) {
        if (modeloCorreto) {
          const inserted = await insertFromModelo(modeloCorreto.id);
          console.log(
            `[AUTO-POPULATE] ✅ Inseridas ${inserted} manobras do modelo ${modeloCorreto.id}`,
          );
        } else {
          // Fallback de último recurso: manobras genéricas numeradas
          const genericStmts = Array.from({ length: 22 }, (_, i) =>
            c.env.DB.prepare(
              `INSERT INTO fichas_sessao_manobras
                 (ficha_id, codigo, nome, descricao, categoria, ordem, tripulante, resultado, observacoes)
               VALUES (?, ?, ?, ?, 'GERAL', ?, 'AB', NULL, '')`,
            ).bind(id, `ORD-${i + 1}`, `Manobra ${i + 1}`, `Manobra ${i + 1}`, i + 1),
          );
          await c.env.DB.batch(genericStmts);
        }
        m = await reloadManobras();
        console.log(`[AUTO-POPULATE] Recarregou: ${m.results?.length ?? 0} manobras`);
      }
    }

    let duracaoTotalMinutos = Number(f.duracao_minutos || 0);
    let cargaPfMinutos = duracaoTotalMinutos > 0 ? duracaoTotalMinutos / 2 : 0;
    let cargaPmMinutos = duracaoTotalMinutos > 0 ? duracaoTotalMinutos / 2 : 0;

    if (f.atribuicao_curricular_id) {
      const horasCompartilhadas = await c.env.DB.prepare(
        `SELECT
           COALESCE(SUM(ssp.duracao_minutos), 0) AS total_minutos,
           COALESCE(SUM(CASE WHEN ssp.funcao = 'PF' THEN ssp.duracao_minutos ELSE 0 END), 0) AS pf_minutos,
           COALESCE(SUM(CASE WHEN ssp.funcao = 'PM' THEN ssp.duracao_minutos ELSE 0 END), 0) AS pm_minutos
         FROM simulador_segmento_participantes ssp
         INNER JOIN simulador_agendamento_segmentos sas
           ON sas.id = ssp.segmento_id
          AND sas.deleted_at IS NULL
         WHERE sas.agendamento_id = ?
           AND ssp.deleted_at IS NULL
           AND ssp.participante_id IN (
             SELECT id
             FROM sessoes_participantes
             WHERE sessao_id = ?
               AND funcionario_id = ?
               AND deleted_at IS NULL
           )`,
      )
        .bind(f.agendamento_slot_id, f.agendamento_slot_id, f.colaborador_id_aluno)
        .first<{ total_minutos: number; pf_minutos: number; pm_minutos: number }>()
        .catch(() => null);

      if (horasCompartilhadas) {
        duracaoTotalMinutos = Number(horasCompartilhadas.total_minutos || 0);
        cargaPfMinutos = Number(horasCompartilhadas.pf_minutos || 0);
        cargaPmMinutos = Number(horasCompartilhadas.pm_minutos || 0);
      }
    }

    const carga_horaria_total = duracaoTotalMinutos ? `${(duracaoTotalMinutos / 60).toFixed(1)}h` : 'N/A';
    const carga_horaria_pf = (cargaPfMinutos / 60).toFixed(1);
    const carga_horaria_pm = (cargaPmMinutos / 60).toFixed(1);

    const fichaTipoCodigo = String(f.ficha_tipo_sessao || f.tipo_sessao || '').toUpperCase();
    const isFichaEspecial = fichaTipoCodigo === 'CRED-EXA' || fichaTipoCodigo === 'TRE-INST';
    const nomeModeloResolvido = f.template_tema || f.ficha_modelo_nome || null;

    // Para fichas especiais, o nome do modelo salvo no banco é a fonte de verdade.
    let sessao_titulo = isFichaEspecial
      ? nomeModeloResolvido || f.sessao_nome || 'Sessão de Treinamento'
      : f.sessao_nome || nomeModeloResolvido || 'Sessão de Treinamento';
    if (!sessao_titulo || sessao_titulo === 'Sessão de Treinamento') {
      const partes = [f.tipo_sessao];
      if (f.template_codigo) partes.push(f.template_codigo);
      if (f.template_tema) partes.push(f.template_tema);
      sessao_titulo = partes.join(' - ') || 'Sessão de Treinamento';
    }

    const ficha = {
      id: f.id,
      uuid: f.uuid,
      sessao_titulo,
      tipo_sessao: f.tipo_sessao || f.ficha_tipo_sessao || '',
      tripulante_nome: f.tripulante_nome,
      tripulante_matricula: f.tripulante_matricula,
      tripulante_codigo_anac: f.tripulante_codigo_anac || 'N/A',
      tripulante_funcao: f.tripulante_funcao || 'ALUNO',
      instrutor_id: f.instrutor_id,
      instrutor_nome: f.instrutor_nome,
      instrutor_matricula: f.instrutor_matricula,
      instrutor_codigo_anac: f.instrutor_codigo_anac || 'N/A',
      data: f.data || f.data_sessao,
      horario_inicio: f.horario_inicio || 'N/A',
      horario_fim: f.horario_fim || 'N/A',
      simulador: `${f.simulador_nome} (${f.simulador_modelo})`,
      simulador_nome: f.simulador_nome,
      simulador_modelo: f.simulador_modelo,
      simulador_tipo: f.simulador_tipo,
      carga_horaria_total,
      carga_horaria_pf,
      carga_horaria_pm,
      duracao_minutos: duracaoTotalMinutos,
      status: f.status,
      aprovado: f.aprovado,
      nota_final: f.nota_final,
      resultado_final: f.resultado_final,
      observacoes_gerais: f.observacoes || '',
      assinatura_aluno_timestamp: f.assinatura_aluno_timestamp,
      assinatura_instrutor_timestamp: f.assinatura_instrutor_timestamp,
      assinatura_aluno_ip: f.assinatura_aluno_ip,
      assinatura_instrutor_ip: f.assinatura_instrutor_ip,
      assinatura_aluno_imagem: f.assinatura_aluno_imagem || null,
      assinatura_instrutor_imagem: f.assinatura_instrutor_imagem || null,
      colaborador_id_aluno: f.colaborador_id_aluno,
      manobras: m.results,
      total_manobras: m.results.length,
      is_check: f.is_check || 0,
      examinador_id: f.examinador_id || null,
      examinador_nome: f.examinador_nome || null,
      sessao_id: f.agendamento_slot_id || null,
      modelo_sessao_id: modeloSessaoResolvidoId,
      edicoes_pendentes_count: Number(f.edicoes_pendentes_count || 0),
      edicao_pendente: Number(f.edicoes_pendentes_count || 0) > 0,
    };

    return c.json({ success: true, data: ficha });
  } catch (e: any) {
    console.error('Erro ao buscar ficha:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

/**
 * POST /fichas/:id/pdf
 * Gerar PDF da ficha de treinamento
 */
app.post('/fichas/:id/pdf', async (c) => {
  try {
    const fichaId = c.req.param('id');
    const tenantEmpresaId = getEmpresaId(c);

    const f = await c.env.DB.prepare(
      `SELECT 
        fs.id,
        fs.uuid,
        fs.status,
        fs.observacoes,
        fs.assinatura_aluno_timestamp,
        fs.assinatura_instrutor_timestamp,
        fs.colaborador_id_aluno,
        fs.data_sessao as ficha_data_sessao,
        sa.tipo_sessao,
        sa.data as sessao_data,
        sa.hora_inicio as horario_inicio,
        sa.hora_fim as horario_fim,
        sa.duracao_minutos,
        ft.nome as tripulante_nome,
        ft.codigo_anac as tripulante_codigo_anac,
        sp.funcao as tripulante_funcao,
        fi.nome as instrutor_nome,
        fi.codigo_anac as instrutor_codigo_anac,
        COALESCE(s.nome, ae.prefixo, ae.modelo, 'N/A') as simulador_nome,
        COALESCE(s.modelo, ae.modelo, 'N/A') as simulador_modelo
      FROM fichas_sessao fs
      INNER JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id AND sa.deleted_at IS NULL
      INNER JOIN funcionarios ft ON fs.colaborador_id_aluno = ft.id AND ft.deleted_at IS NULL
      INNER JOIN funcionarios fi ON fs.instrutor_id = fi.id AND fi.deleted_at IS NULL
      LEFT JOIN simuladores s ON sa.simulador_id = s.id AND s.deleted_at IS NULL
      LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id AND ae.deleted_at IS NULL
      LEFT JOIN sessoes_participantes sp ON sp.sessao_id = sa.id
        AND sp.funcionario_id = ft.id
        AND sp.deleted_at IS NULL
      WHERE fs.id = ? AND fs.deleted_at IS NULL AND fs.empresa_id = ?
      `,
    )
      .bind(fichaId, tenantEmpresaId)
      .first<any>();

    if (!f) return c.json({ success: false, error: 'Ficha não encontrada' }, 404);

    let logoBytes: Buffer | undefined;
    try {
      console.log('[FICHA PDF] Buscando empresa_id do funcionário:', f.colaborador_id_aluno);

      const funcionario = await c.env.DB.prepare(
        `SELECT empresa_id FROM funcionarios WHERE id = ? AND deleted_at IS NULL`,
      )
        .bind(f.colaborador_id_aluno)
        .first<{ empresa_id: number }>();

      console.log('[FICHA PDF] Funcionário encontrado:', funcionario);

      if (funcionario?.empresa_id) {
        const dadosEmpresa = await c.env.DB.prepare(
          `SELECT 
            e.logo_url as logo_principal,
            ec.certificado_logo_url
          FROM empresas e
          LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
          WHERE e.id = ?`,
        )
          .bind(funcionario.empresa_id)
          .first<{ logo_principal: string; certificado_logo_url: string }>();

        console.log('[FICHA PDF] Dados da empresa:', dadosEmpresa);
        const logoUrl = dadosEmpresa?.certificado_logo_url || dadosEmpresa?.logo_principal;
        console.log('[FICHA PDF] Logo URL:', logoUrl);

        if (logoUrl) {
          if (logoUrl.startsWith('/api/assets/')) {
            const key = logoUrl.replace('/api/assets/', '');
            console.log('[FICHA PDF] Buscando logo do R2 com key:', key);
            const obj = await c.env.BUCKET.get(key);
            if (obj) {
              logoBytes = Buffer.from(await obj.arrayBuffer());
              console.log('[FICHA PDF] ✅ Logo carregado do R2:', logoBytes.length, 'bytes');
            } else {
              console.warn('[FICHA PDF] ⚠️ Logo não encontrado no R2 com key:', key);
            }
          } else {
            console.log('[FICHA PDF] Buscando logo de URL externa:', logoUrl);
            const res = await fetch(logoUrl);
            if (res.ok) {
              logoBytes = Buffer.from(await res.arrayBuffer());
              console.log(
                '[FICHA PDF] ✅ Logo carregado de URL externa:',
                logoBytes.length,
                'bytes',
              );
            } else {
              console.warn('[FICHA PDF] ⚠️ Falha ao carregar logo de URL externa:', res.status);
            }
          }
        } else {
          console.log('[FICHA PDF] ⚠️ Nenhuma URL de logo configurada para a empresa');
        }
      } else {
        console.log('[FICHA PDF] ⚠️ Funcionário não possui empresa_id');
      }
    } catch (logoError) {
      console.error('[FICHA PDF] ❌ Erro ao carregar logo:', logoError);
    }

    const m = await c.env.DB.prepare(
      `SELECT 
        ordem,
        descricao,
        codigo,
        resultado
      FROM fichas_sessao_manobras 
      WHERE ficha_id = ? AND deleted_at IS NULL 
      ORDER BY ordem ASC`,
    )
      .bind(fichaId)
      .all();

    const carga_horaria_total = f.duracao_minutos
      ? `${(f.duracao_minutos / 60).toFixed(1)}h`
      : 'N/A';
    const sessao_titulo = `${f.tipo_sessao} - ${f.simulador_nome}`;
    const dataSessaoFonte = f.sessao_data || f.ficha_data_sessao;
    const dataSessaoIso = extractIsoDateOnly(dataSessaoFonte);
    const dataSessaoPtBr = formatIsoDateOnlyPtBr(dataSessaoFonte);

    const dadosPDF = {
      fichaId: f.id.toString(),
      sessao_titulo,
      tripulante_nome: f.tripulante_nome,
      tripulante_codigo_anac: f.tripulante_codigo_anac || 'N/A',
      tripulante_funcao: f.tripulante_funcao || 'ALUNO',
      instrutor_nome: f.instrutor_nome,
      instrutor_codigo_anac: f.instrutor_codigo_anac || 'N/A',
      data: dataSessaoPtBr,
      horario_inicio: f.horario_inicio || 'N/A',
      horario_fim: f.horario_fim || 'N/A',
      simulador: `${f.simulador_nome} (${f.simulador_modelo})`,
      carga_horaria_total,
      status: f.status,
      observacoes_gerais: f.observacoes || '',
      assinatura_aluno_timestamp: f.assinatura_aluno_timestamp,
      assinatura_instrutor_timestamp: f.assinatura_instrutor_timestamp,
      logoBytes,
      manobras: m.results.map((man: any) => ({
        ordem: man.ordem,
        descricao: man.descricao,
        codigo: man.codigo,
        resultado: man.resultado,
      })),
    };

    const { gerarPDFFicha } = await import('../services/pdf-ficha.service');
    const pdfBuffer = await gerarPDFFicha(dadosPDF);

    // ── Nome padronizado: FICHA-{NOME}-{SESSAO}-{DDMMAAAA}-{ID}.pdf ──────────
    const sanitize = (str: string, maxLen: number) =>
      (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .toUpperCase()
        .substring(0, maxLen);

    const nomeSanitizado = sanitize(f.tripulante_nome as string, 25);
    const sessaoSanitizada = sanitize(sessao_titulo, 20);
    const [ano, mes, dia] = (dataSessaoIso || new Date().toISOString().split('T')[0]).split('-');
    const dataSessaoFile = `${dia}${mes}${ano}`;
    const idPadded = String(fichaId).padStart(6, '0');
    const fileName = `SIM-${nomeSanitizado}-${sessaoSanitizada}-${dataSessaoFile}-${idPadded}.pdf`;

    if ((c.env as any).R2_BUCKET) {
      try {
        await (c.env as any).R2_BUCKET.put(`fichas-pdf/${fichaId}/${fileName}`, pdfBuffer, {
          customMetadata: {
            fichaId: fichaId.toString(),
            tripulante: f.tripulante_nome,
            data_geracao: new Date().toISOString(),
          },
        });
      } catch (r2Error) {
        console.warn('Aviso: Não foi possível salvar em R2:', r2Error);
      }
    }

    await audit(c.env.DB, {
      tabela: 'fichas_sessao',
      acao: 'EXPORTAR_PDF',
      registro_id: fichaId,
      dados_novos: { fileName, tamanho_bytes: pdfBuffer.length },
    });

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e: any) {
    console.error('Erro ao gerar PDF:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.put('/fichas/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const tenantEmpresaId = getEmpresaId(c);
    const b = await c.req.json();
    const a = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(id, tenantEmpresaId)
      .first();
    if (!a) return c.json({ success: false, error: 'Não encontrada' }, 404);

    if (['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'].includes(String((a as any).status || '').toUpperCase())) {
      return c.json(
        {
          success: false,
          code: 'USE_POST_FINALIZATION_EDIT_FLOW',
          error:
            'Ficha finalizada não pode ser alterada diretamente. Use o fluxo de solicitação de edição com aprovação do gestor.',
        },
        409,
      );
    }

    // 1) Update manobras if present
    if (Array.isArray(b.manobras) && b.manobras.length > 0) {
      for (const m of b.manobras as any[]) {
        const ordem = Number(m?.ordem);
        if (!Number.isFinite(ordem) || ordem <= 0) continue;

        const update = await c.env.DB.prepare(
          'UPDATE fichas_sessao_manobras SET resultado=?, observacoes=?, updated_at=datetime("now") WHERE ficha_id=? AND ordem=? AND deleted_at IS NULL',
        )
          .bind(m?.resultado ?? null, m?.observacoes ?? '', id, ordem)
          .run();

        if (update.meta.changes === 0) {
          await c.env.DB.prepare(
            'INSERT INTO fichas_sessao_manobras(ficha_id, codigo, descricao, categoria, ordem, resultado, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
            .bind(
              id,
              `ORD-${ordem}`,
              `Manobra ordem ${ordem}`,
              'GERAL',
              ordem,
              m?.resultado ?? null,
              m?.observacoes ?? '',
            )
            .run();
        }
      }

      const manobrasPendentes = await listarManobrasPendentes(c.env.DB, id);
      if (manobrasPendentes.length > 0) {
        return c.json(
          {
            success: false,
            code: 'MISSING_MANEUVER_RESULTS',
            error:
              'Preencha todas as manobras com uma nota ou marque NR antes de salvar a avaliação.',
            details: {
              missingManobras: manobrasPendentes,
            },
          },
          400,
        );
      }
    }

    // 2) Determine new status
    let newStatus = b.status || a.status;

    // 3) Recalculate status if requested
    if (b.recalculate_status === true) {
      console.log(`🔍 [FICHA ${id}] Iniciando recálculo de status...`);
      console.log(`📊 [FICHA ${id}] Status atual: "${a.status}"`);

      const alunoAssinou = Boolean((a as any)?.assinatura_aluno_timestamp);
      const instrutorAssinou = Boolean((a as any)?.assinatura_instrutor_timestamp);

      if (instrutorAssinou) {
        const rf = String((a as any)?.resultado_final || '');
        if (rf === 'REPROVADO') newStatus = 'NAO_APROVADO';
        else if (rf === 'APROVADO') newStatus = 'APROVADO';
        else newStatus = String((a as any)?.status || 'APROVADO');
        console.log(`✅ [FICHA ${id}] Instrutor já assinou → ${newStatus}`);
      } else if (alunoAssinou) {
        newStatus = 'AGUARDANDO_ASSINATURA_INSTRUTOR';
        console.log(`✅ [FICHA ${id}] Aluno já assinou → AGUARDANDO_ASSINATURA_INSTRUTOR`);
      } else {
        const avaliacaoSalva = Array.isArray(b.manobras) || b.observacoes !== undefined;
        newStatus = avaliacaoSalva ? 'AGUARDANDO_ASSINATURA_ALUNO' : 'AVALIACAO_PENDENTE';
        console.log(
          `✅ [FICHA ${id}] Avaliação ${avaliacaoSalva ? 'salva' : 'não salva'} → ${newStatus}`,
        );
      }
    }

    // 4) Update header
    await c.env.DB.prepare(
      "UPDATE fichas_sessao SET status=?,observacoes=?,updated_at=datetime('now') WHERE id=? AND empresa_id = ?",
    )
      .bind(newStatus, b.observacoes !== undefined ? b.observacoes : a.observacoes, id, tenantEmpresaId)
      .run();
    const u = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(id, tenantEmpresaId)
      .first();
    await audit(c.env.DB, {
      tabela: 'fichas_sessao',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: a,
      dados_novos: u,
    });

    if (tenantEmpresaId && String(newStatus).toUpperCase() === 'CONCLUIDA') {
      await syncHorasVooFromSimulador(c.env.DB, Number(id), tenantEmpresaId);
    }

    // Notificar aluno quando avaliação for concluída e aguardar assinatura
    if (newStatus === 'AGUARDANDO_ASSINATURA_ALUNO') {
      const alunoInfo = await getFuncionarioUserInfo(
        c.env.DB,
        String((a as any).colaborador_id_aluno),
      );
      if (alunoInfo?.userId) {
        const instrutorInfo = await getFuncionarioUserInfo(
          c.env.DB,
          String((a as any).instrutor_id),
        );
        const instrutorNome = instrutorInfo?.nome || 'O instrutor';
        await criarNotificacaoFicha(c.env.DB, {
          empresaId: tenantEmpresaId,
          userId: alunoInfo.userId,
          tipo: 'FICHA_AGUARDANDO_ALUNO',
          titulo: 'Ficha pronta para sua assinatura',
          mensagem: `${instrutorNome} concluiu a avaliação da sua ficha. Falta sua assinatura para encaminhar a ficha à etapa final do instrutor.`,
          link: `/simuladores/fichas/${id}?mode=sign&papel=TRIPULANTE`,
          prioridade: 'ALTA',
          acaoPrimaria: 'Assinar ficha',
          dados: {
            ficha_id: Number(id),
            etapa_atual: 'AGUARDANDO_ASSINATURA_ALUNO',
            proxima_acao: 'ASSINAR_COMO_ALUNO',
          },
        });
      }

      // Check previous status to avoid duplicate emails on re-saves
      const statusAnterior = String((a as any).status || '');
      const eraAguardandoAluno =
        statusAnterior === 'AGUARDANDO_ASSINATURA_ALUNO' ||
        statusAnterior === 'AGUARDANDO_ASSINATURAS' ||
        statusAnterior === 'AVALIADA';
      if (!eraAguardandoAluno) {
        // Transition into awaiting-aluno state: notify aluno via email
        enviarEmailFichaSessao(c.env, c.env.DB, Number(id), 'aluno_assinatura_pendente').catch(
          (err) => console.error('[fichaEmails] fire-and-forget error:', err),
        );
      }
    }

    return c.json({ success: true, data: u });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.delete('/fichas/:id', async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');
    const tenantEmpresaId = getEmpresaId(c);
    const a = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(id, tenantEmpresaId)
      .first();
    if (!a) return c.json({ success: false, error: 'Não encontrada' }, 404);
    await c.env.DB.prepare("UPDATE fichas_sessao SET deleted_at=datetime('now') WHERE id=? AND empresa_id = ?")
      .bind(id, tenantEmpresaId)
      .run();
    await audit(c.env.DB, {
      tabela: 'fichas_sessao',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: a,
    });
    return c.json({ success: true, message: 'Excluída' });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
