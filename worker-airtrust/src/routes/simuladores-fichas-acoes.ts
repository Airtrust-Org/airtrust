/**
 * SIMULADORES — Fichas Ações (assinar, arquivar)
 * Sub-router mounted at /api/simuladores via app.route('/', ...)
 *
 *   POST /fichas/:id/assinar
 *   POST /fichas/:id/arquivar
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { audit } from './simuladores-shared';
import { enviarEmailFichaSessao } from '../lib/fichaEmails';
import {
  gerarQualificacaoDaFicha,
  getQualificacaoGeracaoErrorStatus,
  marcarNotificacoesFichaComoResolvidas,
  type ResultadoGeracaoQualificacao,
} from './simuladores-fichas-helpers';
import { getFichaAvailabilityFromDb } from '../utils/ficha-availability';
import {
  isInstructorSpecialSession,
  normalizeInstructionSeatValue,
} from '../../../src/shared/simuladores/ficha-header';

const app = new Hono<{ Bindings: Env }>();

const FICHA_INSTRUCTOR_META_SELECT = `
  fsi.equipamento_utilizado AS equipamento_utilizado,
  fsi.dispositivo_identificacao AS dispositivo_identificacao,
  fsi.assento_instrucao_utilizado AS assento_instrucao_utilizado
`;

const FICHA_INSTRUCTOR_META_JOIN = `
  LEFT JOIN fichas_sessao_instrutor_meta fsi
    ON fsi.ficha_id = fs.id
   AND fsi.empresa_id = fs.empresa_id
`;

// ─── Helper: sanitize string for file names ────────────────────────────────
function sanitizeForFilename(str: string, maxLen: number): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase()
    .substring(0, maxLen);
}

function getInstructorSignatureBlockers(ficha: Record<string, unknown>): string[] {
  if (!isInstructorSpecialSession(String(ficha.tipo_sessao || ''))) {
    return [];
  }

  const missing: string[] = [];
  if (!String(ficha.equipamento_utilizado || '').trim()) missing.push('equipamento utilizado');
  if (!String(ficha.dispositivo_identificacao || '').trim()) {
    missing.push('identificação do dispositivo/matrícula');
  }
  if (!normalizeInstructionSeatValue(String(ficha.assento_instrucao_utilizado || ''))) {
    missing.push('assento de instrução utilizado');
  }
  return missing;
}

/**
 * Arquiva automaticamente a ficha na pasta virtual do funcionário logo após
 * a conclusão (status APROVADO / NAO_APROVADO / CONCLUIDA).
 * Chamado no final do fluxo de assinatura; falhas são logadas mas não abortam
 * a resposta ao cliente.
 */
async function arquivarFichaAutomaticamente(db: D1Database, fichaId: string): Promise<void> {
  try {
    const ficha = await db
      .prepare(
        `SELECT
          fs.*,
          ft.nome  AS aluno_nome,
          fi.nome  AS instrutor_nome,
          sa.data  AS sessao_data,
          COALESCE(fs.tipo_sessao, 'SIM') || ' - ' || COALESCE(tpl.codigo, '') ||
            CASE WHEN tpl.codigo IS NOT NULL THEN ' - ' ELSE '' END ||
            COALESCE(tpl.tema, 'Sessao') AS sessao_titulo,
          COALESCE(sim.nome, ae.prefixo, ae.modelo, 'N/A') AS simulador_nome
         FROM fichas_sessao fs
         INNER JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id AND sa.deleted_at IS NULL
         INNER JOIN funcionarios ft ON fs.colaborador_id_aluno = ft.id
         INNER JOIN funcionarios fi ON fs.instrutor_id = fi.id
         LEFT JOIN simuladores sim ON sa.simulador_id = sim.id
         LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id AND ae.deleted_at IS NULL
         LEFT  JOIN sessoes_template tpl ON fs.template_id = tpl.id
         WHERE fs.id = ? AND fs.deleted_at IS NULL`,
      )
      .bind(fichaId)
      .first();

    if (!ficha) {
      console.warn(`[AUTO-ARQUIVAR] Ficha ${fichaId} não encontrada`);
      return;
    }

    // Já arquivada → não duplicar
    if (ficha.arquivado) {
      console.log(`[AUTO-ARQUIVAR] Ficha ${fichaId} já estava arquivada, ignorando`);
      return;
    }

    const nomeFuncionario = sanitizeForFilename((ficha.aluno_nome as string) || 'SEM_NOME', 25);
    const nomeSessao     = sanitizeForFilename((ficha.sessao_titulo as string) || 'SESSAO', 20);
    const dataSessao     = ((ficha.sessao_data as string) || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    // DDMMAAAA
    const [ano, mes, dia] = ((ficha.sessao_data as string) || '').split('-');
    const dataFile = ano ? `${dia}${mes}${ano}` : dataSessao;
    const idPadded     = fichaId.padStart(6, '0');
    const nomeArquivo  = `SIM-${nomeFuncionario}-${nomeSessao}-${dataFile}-${idPadded}.pdf`;
    const caminhoR2    = `pasta-virtual/${ficha.colaborador_id_aluno}/simuladores/${nomeArquivo}`;

    // Inserir na pasta_virtual (idempotente via ON CONFLICT IGNORE se houver unique)
    await db
      .prepare(
        `INSERT INTO pasta_virtual (
          funcionario_id, tipo_documento, categoria, caminho_arquivo, nome_arquivo,
          dataupload, descricao, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`,
      )
      .bind(
        ficha.colaborador_id_aluno,
        'SIMULADOR',
        'Simuladores',
        caminhoR2,
        nomeArquivo,
        `Ficha de Simulador - ${ficha.sessao_titulo || 'Sessão'} - ${ficha.sessao_data || ''}`,
      )
      .run();

    await db
      .prepare(
        `UPDATE fichas_sessao
           SET arquivado = 1,
               caminho_arquivo = ?,
               data_arquivamento = datetime('now'),
               updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(caminhoR2, fichaId)
      .run();

    console.log(`✅ [AUTO-ARQUIVAR] Ficha ${fichaId} arquivada → ${nomeArquivo}`);
  } catch (err) {
    // Falha no arquivamento nunca deve bloquear a assinatura
    console.error(`❌ [AUTO-ARQUIVAR] Erro ao arquivar ficha ${fichaId}:`, err);
  }
}

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
  return ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'COMPLIANCE'].includes(role.toUpperCase());
}

async function getFichaWithInstructorMeta(
  db: D1Database,
  fichaId: string | number,
  empresaId: string | number,
) {
  return db
    .prepare(
      `SELECT
        fs.*,
        ${FICHA_INSTRUCTOR_META_SELECT}
      FROM fichas_sessao fs
      ${FICHA_INSTRUCTOR_META_JOIN}
      WHERE fs.id = ? AND fs.empresa_id = ? AND fs.deleted_at IS NULL`,
    )
    .bind(String(fichaId), String(empresaId))
    .first();
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

app.post('/fichas/:id/assinar', async (c) => {
  try {
    const id = c.req.param('id');
    const ctx = c as unknown as { get: (k: string) => unknown };
    const userId = String(ctx.get('userId') || '');
    const role = String(ctx.get('userRole') || '');
    const empresaId = String(ctx.get('empresaId') || '');

    const b = await c.req.json();
    if (!b.tipo || !['ALUNO', 'INSTRUTOR'].includes(b.tipo))
      return c.json({ success: false, error: 'tipo:ALUNO ou INSTRUTOR' }, 400);

    const gerarQualificacao = b.gerar_qualificacao === true;

    const f = await getFichaWithInstructorMeta(c.env.DB, id, empresaId);
    if (!f) return c.json({ success: false, error: 'Não encontrada' }, 404);

    const availability = await getFichaAvailabilityFromDb(c.env.DB, id);
    if (!availability.available) {
      return c.json(
        {
          success: false,
          code: availability.code,
          error: availability.message,
          details: {
            ficha_id: Number(id),
            session_starts_at: availability.sessionStartsAt,
            timezone: availability.timezone,
          },
        },
        409,
      );
    }

    const manobrasAtivas = await c.env.DB.prepare(
      'SELECT COUNT(1) as total FROM fichas_sessao_manobras WHERE ficha_id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .first<{ total: number }>();

    if (Number(manobrasAtivas?.total || 0) === 0) {
      return c.json(
        {
          success: false,
          code: 'FICHA_SEM_MANOBRAS',
          error:
            'Ficha sem manobras. Corrija o cadastro do modelo antes de assinar esta ficha.',
        },
        409,
      );
    }

    const signatureBlockers = getInstructorSignatureBlockers(f as Record<string, unknown>);
    if (signatureBlockers.length > 0) {
      return c.json(
        {
          success: false,
          code: 'INSTRUCTOR_FICHA_REQUIRED_FIELDS',
          error: `Preencha os campos obrigatórios da ficha de instrutor: ${signatureBlockers.join(', ')}`,
          details: { missingFields: signatureBlockers },
        },
        400,
      );
    }

    // ── Verificar se o usuário é quem diz ser ────────────────────────────────
    if (!isFullAccess(role)) {
      const funcId = await getFuncionarioId(c.env.DB, userId, empresaId);
      if (!funcId) return c.json({ success: false, error: 'Usuário sem vínculo funcional' }, 403);

      if (b.tipo === 'ALUNO' && String(f.colaborador_id_aluno) !== String(funcId)) {
        return c.json({
          success: false,
          code: 'STUDENT_SIGNATURE_FORBIDDEN',
          error: 'Apenas o aluno avaliado pode assinar como aluno',
        }, 403);
      }
      // Para assinar como INSTRUTOR: deve ser o instrutor da ficha
      // (mesmo que também seja aluno em outra ficha, aqui o papel é de instrutor)
      if (b.tipo === 'INSTRUTOR' && String(f.instrutor_id) !== String(funcId)) {
        return c.json({ success: false, error: 'Você não é o instrutor desta ficha' }, 403);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown';
    const ts = new Date().toISOString();
    let ns = f.status;

    if (b.tipo === 'ALUNO') {
      await c.env.DB.prepare(
        "UPDATE fichas_sessao SET assinatura_aluno_ip=?,assinatura_aluno_timestamp=?,assinatura_aluno_imagem=?,assinatura_tripulante=1,status='AGUARDANDO_ASSINATURA_INSTRUTOR' WHERE id=? AND empresa_id = ?",
      )
        .bind(ip, ts, b.assinatura_imagem || null, id, empresaId)
        .run();
      ns = 'AGUARDANDO_ASSINATURA_INSTRUTOR';
      console.log(`✍️ [FICHA ${id}] Aluno assinou → AGUARDANDO_ASSINATURA_INSTRUTOR`);

      const alunoInfo = await getFuncionarioUserInfo(c.env.DB, String(f.colaborador_id_aluno));
      if (alunoInfo?.userId) {
        await marcarNotificacoesFichaComoResolvidas(c.env.DB, {
          userId: alunoInfo.userId,
          tipos: ['FICHA_AGUARDANDO_ALUNO'],
          fichaId: id,
        });
      }

      // Notificar instrutor (in-system)
      const instrutorInfo = await getFuncionarioUserInfo(c.env.DB, String(f.instrutor_id));
      if (instrutorInfo?.userId) {
        const alunoNome = alunoInfo?.nome || 'O aluno';
        await criarNotificacaoFicha(c.env.DB, {
          empresaId,
          userId: instrutorInfo.userId,
          tipo: 'FICHA_AGUARDANDO_INSTRUTOR',
          titulo: 'Ficha aguardando sua assinatura final',
          mensagem: `${alunoNome} já assinou a ficha. Falta sua assinatura final para concluir o processo e liberar o resultado ao aluno.`,
          link: `/simuladores/fichas/${id}?mode=sign&papel=INSTRUTOR`,
          prioridade: 'ALTA',
          acaoPrimaria: 'Assinar como instrutor',
          dados: {
            ficha_id: Number(id),
            etapa_atual: 'AGUARDANDO_ASSINATURA_INSTRUTOR',
            proxima_acao: 'ASSINAR_COMO_INSTRUTOR',
          },
        });
      }

      // Email: aluno assinou → notificar instrutor para assinatura final
      // Only send if aluno_timestamp was previously null (first signature)
      if (!f.assinatura_aluno_timestamp) {
        enviarEmailFichaSessao(
          c.env,
          c.env.DB,
          Number(id),
          'instrutor_assinatura_final_pendente',
        ).catch((err) => console.error('[fichaEmails] fire-and-forget error:', err));
      }
    } else if (b.tipo === 'INSTRUTOR') {
      if (!f.assinatura_aluno_timestamp)
        return c.json({ success: false, error: 'Aluno ainda não assinou' }, 400);

      const aprovadoInstrutor = b.aprovado;
      if (aprovadoInstrutor === undefined || typeof aprovadoInstrutor !== 'boolean') {
        return c.json(
          {
            success: false,
            error: 'Instrutor deve indicar se aprovou ou não (campo aprovado obrigatório)',
          },
          400,
        );
      }

      const resultadoFinal = aprovadoInstrutor ? 'APROVADO' : 'REPROVADO';
      const aprovado = aprovadoInstrutor ? 1 : 0;
      ns = aprovadoInstrutor ? 'APROVADO' : 'NAO_APROVADO';

      if (gerarQualificacao && !aprovadoInstrutor) {
        return c.json(
          {
            success: false,
            error: 'Geração de qualificação só está disponível para fichas aprovadas',
          },
          400,
        );
      }

      await c.env.DB.prepare(
        "UPDATE fichas_sessao SET assinatura_instrutor_ip=?,assinatura_instrutor_timestamp=?,assinatura_instrutor_imagem=?,assinatura_instrutor=1,status=?,resultado_final=?,aprovado=?,updated_at=datetime('now') WHERE id=? AND empresa_id = ?",
      )
        .bind(ip, ts, b.assinatura_imagem || null, ns, resultadoFinal, aprovado, id, empresaId)
        .run();

      console.log(`✍️ [FICHA ${id}] Instrutor assinou → ${ns} (${resultadoFinal})`);

      const instrutorInfo = await getFuncionarioUserInfo(c.env.DB, String(f.instrutor_id));
      if (instrutorInfo?.userId) {
        await marcarNotificacoesFichaComoResolvidas(c.env.DB, {
          userId: instrutorInfo.userId,
          tipos: ['FICHA_AGUARDANDO_INSTRUTOR'],
          fichaId: id,
        });
      }

      // Notificar aluno
      const alunoInfo = await getFuncionarioUserInfo(c.env.DB, String(f.colaborador_id_aluno));
      if (alunoInfo?.userId) {
        const resultadoTexto = aprovadoInstrutor ? '✅ APROVADO' : '❌ NÃO APROVADO';
        await criarNotificacaoFicha(c.env.DB, {
          empresaId,
          userId: alunoInfo.userId,
          tipo: 'FICHA_CONCLUIDA',
          titulo: `Ficha concluída — ${resultadoTexto}`,
          mensagem: `Sua assinatura e a assinatura do instrutor já foram registradas. Resultado final: ${resultadoTexto}. Não há mais ações pendentes; você pode abrir a ficha e visualizar o PDF.`,
          link: `/simuladores/fichas/${id}`,
          prioridade: aprovadoInstrutor ? 'MEDIA' : 'ALTA',
          acaoPrimaria: 'Ver ficha',
          dados: {
            ficha_id: Number(id),
            etapa_atual: 'CONCLUIDA',
            proxima_acao: 'VISUALIZAR_RESULTADO',
            aprovado: aprovadoInstrutor,
          },
        });
      }
    }

    let qualificacoesGeradas: ResultadoGeracaoQualificacao | null = null;
    let qualificacaoErro: string | null = null;
    if (b.tipo === 'INSTRUTOR' && gerarQualificacao) {
      try {
        qualificacoesGeradas = await gerarQualificacaoDaFicha(c.env.DB, id);
      } catch (e: any) {
        const message = String(e?.message || 'Erro ao gerar qualificação');
        const status = getQualificacaoGeracaoErrorStatus(message);

        if (!status) {
          throw e;
        }

        qualificacaoErro = message;
      }
    }

    // ── Auto-arquivamento na pasta virtual ────────────────────────────────────
    // Quando a ficha fica concluída (instrutor assinou → APROVADO / NAO_APROVADO),
    // registra automaticamente o documento na pasta virtual do funcionário.
    // Também cobre fichas que chegam ao status CONCLUIDA por outros fluxos.
    if (['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'].includes(ns as string)) {
      await arquivarFichaAutomaticamente(c.env.DB, id);
    }

    const fa = await getFichaWithInstructorMeta(c.env.DB, id, empresaId);
    await audit(c.env.DB, {
      tabela: 'fichas_sessao',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: f,
      dados_novos: fa,
    });
    return c.json({
      success: true,
      message:
        b.tipo === 'INSTRUTOR' && qualificacoesGeradas
          ? `Assinatura registrada (${b.tipo}) e qualificação gerada`
          : b.tipo === 'INSTRUTOR' && qualificacaoErro
            ? `Assinatura registrada (${b.tipo}), mas a qualificação não pôde ser gerada`
            : `Assinatura registrada (${b.tipo})`,
      data: {
        status: ns,
        ip,
        timestamp: ts,
        qualificacoes_geradas: qualificacoesGeradas?.qualificacoes_geradas || [],
        qualificacao_erro: qualificacaoErro,
      },
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /fichas/:id/arquivar - Archive ficha to Pasta Virtual
app.post('/fichas/:id/arquivar', async (c) => {
  try {
    const ctx = c as unknown as { get: (k: string) => unknown };
    const userId = String(ctx.get('userId') || '');
    const role = String(ctx.get('userRole') || '');
    const empresaId = String(ctx.get('empresaId') || '');
    const fichaId = c.req.param('id');

    const ficha = await c.env.DB.prepare(
      `SELECT
        fs.*,
        ft.nome as aluno_nome,
        ft.cpf as aluno_cpf,
        ft.matricula as aluno_matricula,
        ft.codigo_anac as aluno_codigo_anac,
        fi.nome as instrutor_nome,
        fi.cpf as instrutor_cpf,
        fi.codigo_anac as instrutor_codigo_anac,
        sa.data as sessao_data,
        sa.hora_inicio as horario_inicio,
        sa.hora_fim as horario_fim,
        COALESCE(fs.tipo_sessao, 'SIM') || ' - ' || COALESCE(tpl.codigo, '') || CASE WHEN tpl.codigo IS NOT NULL THEN ' - ' ELSE '' END || COALESCE(tpl.tema, 'Sessão') as sessao_titulo,
        COALESCE(sim.nome, ae.prefixo, ae.modelo, 'N/A') as simulador_nome
       FROM fichas_sessao fs
       INNER JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id AND sa.deleted_at IS NULL
       INNER JOIN funcionarios ft ON fs.colaborador_id_aluno = ft.id
       INNER JOIN funcionarios fi ON fs.instrutor_id = fi.id
       LEFT JOIN simuladores sim ON sa.simulador_id = sim.id
       LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id AND ae.deleted_at IS NULL
       LEFT JOIN sessoes_template tpl ON fs.template_id = tpl.id
       WHERE fs.id = ?
         AND fs.empresa_id = ?
         AND fs.deleted_at IS NULL`,
    )
      .bind(fichaId, empresaId)
      .first();

    if (!ficha) {
      return c.json({ success: false, error: 'Ficha não encontrada' }, 404);
    }

    if (!['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(String((ficha as any)?.status || ''))) {
      return c.json({ success: false, error: 'Ficha precisa estar finalizada para arquivar' }, 400);
    }

    // ── Verificar permissão ────────────────────────────────────────────────
    if (!isFullAccess(role)) {
      const funcId = await getFuncionarioId(c.env.DB, userId, empresaId);
      if (!funcId || String((ficha as any).instrutor_id) !== String(funcId)) {
        return c.json({ success: false, error: 'Acesso negado' }, 403);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const manobras = await c.env.DB.prepare(
      `SELECT *
       FROM fichas_sessao_manobras
       WHERE ficha_id = ?
         AND deleted_at IS NULL
       ORDER BY ordem ASC`,
    )
      .bind(fichaId)
      .all();

    const nomeFuncionario = ((ficha.aluno_nome as string) || 'SEM_NOME')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase()
      .substring(0, 30);
    const nomeSessao = ((ficha.sessao_titulo as string) || 'SESSAO')
      .replace(/\s+/g, '_')
      .toUpperCase()
      .substring(0, 30);
    const dataSessao = (
      (ficha.sessao_data as string) || new Date().toISOString().split('T')[0]
    ).replace(/-/g, '');
    const numeroControle = `${fichaId}`.padStart(6, '0');
    const nomeArquivo = `SIM-${nomeFuncionario}-${nomeSessao}-${dataSessao}-${numeroControle}.pdf`;

    const metadados = {
      ficha_id: fichaId,
      funcionario_id: ficha.colaborador_id_aluno,
      tipo_documento: 'FICHA_SIMULADOR',
      sessao_titulo: ficha.sessao_titulo,
      data_sessao: ficha.sessao_data,
      simulador: ficha.simulador_nome,
      instrutor: ficha.instrutor_nome,
      nota_final: ficha.nota_final,
      status: ficha.status,
      manobras_count: manobras.results.length,
      assinatura_aluno: ficha.assinatura_aluno_timestamp,
      assinatura_instrutor: ficha.assinatura_instrutor_timestamp,
      arquivado_em: new Date().toISOString(),
    };

    const caminhoR2 = `pasta-virtual/${ficha.colaborador_id_aluno}/simuladores/${nomeArquivo}`;

    try {
      await c.env.DB.prepare(
        `INSERT INTO pasta_virtual (
          funcionario_id, tipo_documento, categoria, caminho_arquivo, nome_arquivo,
          dataupload, descricao, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`,
      )
        .bind(
          ficha.colaborador_id_aluno,
          'SIMULADOR',
          'Simuladores',
          caminhoR2,
          nomeArquivo,
          `Ficha de Simulador - ${ficha.sessao_titulo || 'Sessão'} - ${ficha.sessao_data || ''}`,
        )
        .run();
      console.log('✅ Ficha inserida na pasta_virtual');
    } catch (e) {
      console.error('❌ Erro ao inserir na pasta_virtual:', e);
    }

    await c.env.DB.prepare(
      `UPDATE fichas_sessao
       SET arquivado = 1,
           caminho_arquivo = ?,
           data_arquivamento = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ?`,
    )
      .bind(caminhoR2, fichaId, empresaId)
      .run();

    await audit(c.env.DB, {
      tabela: 'fichas_sessao',
      acao: 'ARQUIVAR',
      registro_id: fichaId,
      dados_novos: { caminho_r2: caminhoR2, nome_arquivo: nomeArquivo },
    });

    return c.json({
      success: true,
      data: {
        nome_arquivo: nomeArquivo,
        caminho_r2: caminhoR2,
        metadados,
        message: 'Ficha arquivada com sucesso. Use o botão "Gerar PDF" para baixar o documento.',
      },
    });
  } catch (e: any) {
    console.error('Erro ao arquivar ficha:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
