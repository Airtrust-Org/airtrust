import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import {
  EMAIL_CONVOCACAO_ASSINATURA_PADRAO,
  EMAIL_CONVOCACAO_ASSUNTO_PADRAO,
  EMAIL_CONVOCACAO_TEMPLATE_PADRAO,
  applyTemplate,
  buildTemplateVariables,
  createGestorCopia,
  deleteGestorCopia,
  emailConvocacaoConfigSchema,
  gestorCopiaSchema,
  getEmailConvocacaoConfig,
  listGestoresCopia,
  saveEmailConvocacaoConfig,
  sendConvocacaoEmail,
  updateGestorCopia,
  validateRequiredTemplateVariables,
} from '../services/treinamentos-convocacao-email';

const notificacoesConvocacaoRoutes = new Hono<{ Bindings: Env }>();

notificacoesConvocacaoRoutes.use('*', auth());

notificacoesConvocacaoRoutes.get('/convocacoes/config', async (c) => {
  const empresaId = getEmpresaId(c);
  const empresa = await c.env.DB.prepare(
    'SELECT nome FROM empresas WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(empresaId)
    .first<{ nome?: string | null }>();
  const empresaNome = String(empresa?.nome || '').trim() || 'AirTrust';

  const config = await getEmailConvocacaoConfig(c.env.DB, empresaId);
  const gestores = await listGestoresCopia(c.env.DB, empresaId, false);

  return c.json({
    success: true,
    data: {
      ...config,
      gestores,
      defaults: {
        smtp_host: 'smtp-relay.brevo.com',
        smtp_port: 587,
        smtp_security: 'TLS' as const,
        smtp_user: c.env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online',
        sender_name: c.env.BREVO_FROM_NAME || empresaNome,
        reply_to: c.env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online',
        assunto_padrao: EMAIL_CONVOCACAO_ASSUNTO_PADRAO,
        assinatura_html: `<p>Atenciosamente,</p><p><strong>${empresaNome}</strong><br/>Departamento de Treinamento</p>`,
        template_html: EMAIL_CONVOCACAO_TEMPLATE_PADRAO,
      },
    },
  });
});

notificacoesConvocacaoRoutes.put(
  '/convocacoes/config',
  requireRole('admin', 'manager'),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const parsed = emailConvocacaoConfigSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    try {
      const config = await saveEmailConvocacaoConfig(c.env.DB, c.env, empresaId, parsed.data);
      const missingVariables = validateRequiredTemplateVariables(config.template_html);
      return c.json({
        success: true,
        data: {
          ...config,
          template_missing_variables: missingVariables,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configurações';
      return c.json({ success: false, error: message }, 400);
    }
  },
);

notificacoesConvocacaoRoutes.post(
  '/convocacoes/config/testar-conexao',
  requireRole('admin', 'manager'),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const config = await getEmailConvocacaoConfig(c.env.DB, empresaId);

    const errors: string[] = [];
    if (!config.smtp_host) errors.push('Servidor SMTP não configurado');
    if (!config.smtp_port) errors.push('Porta SMTP não configurada');
    if (!config.smtp_user) errors.push('Usuário SMTP não configurado');
    if (!config.smtp_password_configured) errors.push('Senha SMTP não configurada');
    if (!c.env.BREVO_API_KEY) errors.push('Gateway transacional do worker indisponível');

    if (errors.length > 0) {
      return c.json({ success: false, error: errors.join('; ') }, 400);
    }

    return c.json({
      success: true,
      data: {
        status: 'ok',
        provider: 'brevo',
        smtp_security: config.smtp_security,
      },
    });
  },
);

notificacoesConvocacaoRoutes.post(
  '/convocacoes/config/enviar-teste',
  requireRole('admin', 'manager'),
  async (c) => {
    try {
      const empresaId = getEmpresaId(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        email?: string;
        emails?: string[];
        nome?: string;
      };
      const config = await getEmailConvocacaoConfig(c.env.DB, empresaId);
      const destinos = Array.from(
        new Set(
          [body.email, ...(Array.isArray(body.emails) ? body.emails : [])]
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      );

      if (destinos.length === 0) {
        return c.json({ success: false, error: 'Informe o e-mail de destino para teste' }, 400);
      }

      for (const to of destinos) {
        await sendConvocacaoEmail({
          env: c.env,
          to,
          cc: [],
          subject: 'Teste de configuração — Convocação AirTrust',
          textContent: 'Teste de envio de convocação do AirTrust.',
          htmlContent: `<p>Olá ${body.nome || 'usuário'},</p><p>Este é um teste de envio da configuração de convocação do AirTrust.</p>${config.assinatura_html}`,
          replyTo: config.reply_to,
          senderName: config.sender_name,
          senderEmail: config.smtp_user,
        });
      }

      return c.json({ success: true, data: { sent: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar e-mail de teste';
      const status = message === 'EMAIL_NOT_CONFIGURED' ? 400 : 502;
      return c.json(
        { success: false, error: message, code: 'CONVOCACAO_EMAIL_TEST_FAILED' },
        status,
      );
    }
  },
);

notificacoesConvocacaoRoutes.post(
  '/convocacoes/planejadas/enviar',
  requireRole('admin', 'manager'),
  async (c) => {
    try {
      const empresaId = getEmpresaId(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        qualificacao_id?: number;
        qualificacao_codigo?: string;
        qualificacao_nome?: string;
        data_planejada?: string;
        funcionario_id?: number;
        turma_funcionario_ids?: number[];
        gestores_cc_ids?: number[];
        escopo?: 'turma' | 'funcionario';
        dry_run?: boolean;
        instrutor?: string;
        local?: string;
        horario?: string;
      };

      const qualificacaoId = Number(body.qualificacao_id || 0);
      const qualificacaoCodigo = String(body.qualificacao_codigo || '')
        .trim()
        .toUpperCase();
      const qualificacaoNome = String(body.qualificacao_nome || '').trim();
      const dataPlanejada = String(body.data_planejada || '').trim();
      const escopo = body.escopo === 'funcionario' ? 'funcionario' : 'turma';
      const funcionarioId = Number(body.funcionario_id || 0);
      const turmaFuncionarioIds = Array.from(
        new Set(
          (Array.isArray(body.turma_funcionario_ids) ? body.turma_funcionario_ids : [])
            .map((value) => Number(value || 0))
            .filter((value) => Number.isFinite(value) && value > 0),
        ),
      );
      const gestoresCcIdsInput = Array.isArray(body.gestores_cc_ids)
        ? Array.from(
            new Set(
              body.gestores_cc_ids
                .map((value) => Number(value || 0))
                .filter((value) => Number.isFinite(value) && value > 0),
            ),
          )
        : null;

      if (!dataPlanejada || !/^\d{4}-\d{2}-\d{2}$/.test(dataPlanejada)) {
        return c.json(
          { success: false, error: 'Informe a data planejada no formato YYYY-MM-DD' },
          400,
        );
      }
      if (turmaFuncionarioIds.length === 0 && qualificacaoId <= 0 && !qualificacaoCodigo) {
        return c.json({ success: false, error: 'Informe a qualificação planejada' }, 400);
      }
      if (escopo === 'funcionario' && funcionarioId <= 0) {
        return c.json({ success: false, error: 'Funcionário inválido para envio individual' }, 400);
      }

      let participantesTurma: Array<{
        historico_id: number | null;
        funcionario_id: number;
        qualificacao_id: number | null;
        qualificacao_codigo: string | null;
        data_planejada: string | null;
        qualificacao_nome: string | null;
        funcionario_nome: string | null;
        funcionario_matricula: string | null;
        funcionario_email: string;
      }> = [];

      if (turmaFuncionarioIds.length > 0) {
        const placeholders = turmaFuncionarioIds.map(() => '?').join(',');
        const idsOrderMap = new Map<number, number>();
        turmaFuncionarioIds.forEach((id, index) => idsOrderMap.set(id, index));

        const funcionariosRows = await c.env.DB.prepare(
          `
              SELECT
                f.id AS funcionario_id,
                COALESCE(f.nome, f.guerra, 'Tripulante') AS funcionario_nome,
                f.matricula AS funcionario_matricula,
                f.email AS funcionario_email
              FROM funcionarios f
              WHERE f.empresa_id = ?
                AND f.deleted_at IS NULL
                AND f.id IN (${placeholders})
            `,
        )
          .bind(empresaId, ...turmaFuncionarioIds)
          .all<{
            funcionario_id: number;
            funcionario_nome: string | null;
            funcionario_matricula: string | null;
            funcionario_email: string | null;
          }>();

        participantesTurma = (funcionariosRows.results || [])
          .map((row) => ({
            historico_id: null,
            funcionario_id: Number(row.funcionario_id || 0),
            qualificacao_id: qualificacaoId > 0 ? qualificacaoId : null,
            qualificacao_codigo: qualificacaoCodigo || null,
            data_planejada: dataPlanejada,
            qualificacao_nome: qualificacaoNome || null,
            funcionario_nome: row.funcionario_nome,
            funcionario_matricula: row.funcionario_matricula,
            funcionario_email: String(row.funcionario_email || '').trim(),
          }))
          .sort(
            (a, b) =>
              (idsOrderMap.get(a.funcionario_id) ?? Number.MAX_SAFE_INTEGER) -
              (idsOrderMap.get(b.funcionario_id) ?? Number.MAX_SAFE_INTEGER),
          );
      } else {
        const tableInfo = await c.env.DB.prepare(
          "PRAGMA table_info('qualificacoes_historico')",
        ).all<{ name: string }>();
        const tableColumns = new Set(
          (tableInfo.results || []).map((column) => String(column.name || '').toLowerCase()),
        );
        const hasDataRealizacao = tableColumns.has('data_realizacao');
        const hasQualificacaoId = tableColumns.has('qualificacao_id');
        const hasTipoId = tableColumns.has('tipo_id');
        const hasQualificacaoCodigo = tableColumns.has('qualificacao_codigo');
        const hasTipoCodigo = tableColumns.has('tipo_codigo');
        const dataPlanejadaExpr = hasDataRealizacao
          ? 'COALESCE(qh.data_realizacao, qh.data_conclusao)'
          : 'qh.data_conclusao';
        const qualificacaoIdExpr = hasQualificacaoId
          ? hasTipoId
            ? 'COALESCE(qh.qualificacao_id, qh.tipo_id)'
            : 'qh.qualificacao_id'
          : hasTipoId
            ? 'qh.tipo_id'
            : null;
        const qualificacaoCodigoExpr = hasQualificacaoCodigo
          ? hasTipoCodigo
            ? "COALESCE(qh.qualificacao_codigo, qh.tipo_codigo, '')"
            : "COALESCE(qh.qualificacao_codigo, '')"
          : hasTipoCodigo
            ? "COALESCE(qh.tipo_codigo, '')"
            : null;

        if (qualificacaoId > 0 && !qualificacaoIdExpr) {
          return c.json(
            {
              success: false,
              error: 'Schema sem coluna de identificação da qualificação planejada',
            },
            500,
          );
        }
        if (qualificacaoCodigo && !qualificacaoCodigoExpr) {
          return c.json(
            { success: false, error: 'Schema sem coluna de código da qualificação planejada' },
            500,
          );
        }

        const queryBase = `
          SELECT
            qh.id AS historico_id,
            qh.funcionario_id,
            ${qualificacaoIdExpr || 'NULL'} AS qualificacao_id,
            ${qualificacaoCodigoExpr || "''"} AS qualificacao_codigo,
            ${dataPlanejadaExpr} AS data_planejada,
            COALESCE(qt.nome, ${qualificacaoCodigoExpr || "''"}) AS qualificacao_nome,
            COALESCE(f.nome, f.guerra, 'Tripulante') AS funcionario_nome,
            f.matricula AS funcionario_matricula,
            f.email AS funcionario_email
          FROM qualificacoes_historico qh
          LEFT JOIN qualificacoes_tipos qt ON qt.id = ${qualificacaoIdExpr || 'NULL'} AND qt.deleted_at IS NULL
          INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
          WHERE qh.empresa_id = ?
            AND qh.deleted_at IS NULL
              AND date(${dataPlanejadaExpr}) = date(?)
        `;

        const params: unknown[] = [empresaId, dataPlanejada];
        let sql = queryBase;
        if (qualificacaoId > 0 && qualificacaoCodigo) {
          sql += ` AND (${qualificacaoIdExpr} = ? OR UPPER(${qualificacaoCodigoExpr}) = ?)`;
          params.push(qualificacaoId, qualificacaoCodigo);
        } else if (qualificacaoId > 0) {
          sql += ` AND ${qualificacaoIdExpr} = ?`;
          params.push(qualificacaoId);
        } else {
          sql += ` AND UPPER(${qualificacaoCodigoExpr}) = ?`;
          params.push(qualificacaoCodigo);
        }

        const rows = await c.env.DB.prepare(
          `${sql} ORDER BY UPPER(COALESCE(f.nome, f.guerra, '')) ASC`,
        )
          .bind(...params)
          .all<{
            historico_id: number;
            funcionario_id: number;
            qualificacao_id: number | null;
            qualificacao_codigo: string | null;
            data_planejada: string | null;
            qualificacao_nome: string | null;
            funcionario_nome: string | null;
            funcionario_matricula: string | null;
            funcionario_email: string | null;
          }>();

        participantesTurma = (rows.results || []).map((row) => ({
          ...row,
          funcionario_email: String(row.funcionario_email || '').trim(),
        }));
      }

      if (participantesTurma.length === 0) {
        return c.json(
          {
            success: false,
            error: 'Nenhuma turma planejada encontrada para esta data/qualificação',
          },
          404,
        );
      }

      const participantesSelecionados =
        escopo === 'funcionario'
          ? participantesTurma.filter((row) => Number(row.funcionario_id) === funcionarioId)
          : participantesTurma;

      if (participantesSelecionados.length === 0) {
        return c.json(
          { success: false, error: 'Funcionário não encontrado na turma planejada' },
          404,
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const destinatariosValidos = participantesSelecionados.filter((row) =>
        emailRegex.test(String(row.funcionario_email || '').trim()),
      );
      const destinatariosInvalidos = participantesSelecionados
        .filter((row) => !emailRegex.test(String(row.funcionario_email || '').trim()))
        .map((row) => row.funcionario_nome || `Funcionário ${row.funcionario_id}`);

      if (destinatariosValidos.length === 0) {
        return c.json(
          { success: false, error: 'Nenhum participante com e-mail válido nesta seleção' },
          400,
        );
      }

      const config = await getEmailConvocacaoConfig(c.env.DB, empresaId);
      const gestoresCcAtivos = (await listGestoresCopia(c.env.DB, empresaId, true)).filter(
        (gestor) => gestor.ativo,
      );
      const gestoresCc =
        gestoresCcIdsInput === null
          ? gestoresCcAtivos.map((gestor) => gestor.email)
          : gestoresCcAtivos
              .filter((gestor) => gestoresCcIdsInput.includes(gestor.id))
              .map((gestor) => gestor.email);
      const empresa = await c.env.DB.prepare('SELECT nome FROM empresas WHERE id = ?')
        .bind(empresaId)
        .first<{ nome: string | null }>();

      const treinamentoNome =
        String(
          participantesTurma[0]?.qualificacao_nome ||
            participantesTurma[0]?.qualificacao_codigo ||
            'Treinamento planejado',
        ).trim() || 'Treinamento planejado';

      const listaParticipantesHtml = `<ul>${participantesTurma
        .map((row) => {
          const nome = String(row.funcionario_nome || 'Tripulante').replace(/[&<>"']/g, '');
          const matricula = String(row.funcionario_matricula || 'Sem matrícula').replace(
            /[&<>"']/g,
            '',
          );
          return `<li>${nome} (${matricula})</li>`;
        })
        .join('')}</ul>`;

      if (body.dry_run) {
        return c.json({
          success: true,
          data: {
            escopo,
            data_planejada: dataPlanejada,
            qualificacao_nome: treinamentoNome,
            participantes_turma_total: participantesTurma.length,
            participantes_envio_total: participantesSelecionados.length,
            destinatarios_validos: destinatariosValidos.length,
            destinatarios_invalidos: destinatariosInvalidos,
          },
        });
      }

      let enviados = 0;
      let falhas = 0;

      for (const participante of destinatariosValidos) {
        const variables = buildTemplateVariables({
          tripulanteNome: String(participante.funcionario_nome || 'Tripulante'),
          matricula: participante.funcionario_matricula || null,
          treinamentoNome,
          modalidade: 'Presencial',
          dataInicio: dataPlanejada.split('-').reverse().join('/'),
          dataFim: dataPlanejada.split('-').reverse().join('/'),
          horario: String(body.horario || '').trim() || 'Não informado',
          local: String(body.local || '').trim() || 'A definir',
          linkAcesso: null,
          instrutor: String(body.instrutor || '').trim() || 'Não informado',
          empresa: empresa?.nome || 'AirTrust',
          dataEnvio: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          assinaturaHtml: config.assinatura_html,
          listaParticipantesHtml,
        });

        const subject = applyTemplate(config.assunto_padrao, variables)
          .replace(/<[^>]+>/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const htmlContent = applyTemplate(config.template_html, variables);
        const textContent = htmlContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        try {
          await sendConvocacaoEmail({
            env: c.env,
            to: participante.funcionario_email,
            cc: gestoresCc,
            subject,
            textContent,
            htmlContent,
            replyTo: config.reply_to,
            senderName: config.sender_name,
            senderEmail: config.smtp_user,
          });
          enviados += 1;
        } catch {
          falhas += 1;
        }
      }

      return c.json({
        success: true,
        data: {
          escopo,
          enviados,
          falhas,
          participantes_turma_total: participantesTurma.length,
          participantes_envio_total: participantesSelecionados.length,
          destinatarios_invalidos: destinatariosInvalidos,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao enviar convocação por turma planejada';
      return c.json(
        { success: false, error: message, code: 'CONVOCACAO_PLANEJADA_SEND_FAILED' },
        500,
      );
    }
  },
);

notificacoesConvocacaoRoutes.get('/convocacoes/gestores', async (c) => {
  const empresaId = getEmpresaId(c);
  const funcionarioIdRaw = c.req.query('funcionario_id');
  const funcionarioId = funcionarioIdRaw ? Number(funcionarioIdRaw) : null;
  let gestores;
  if (funcionarioId && Number.isInteger(funcionarioId) && funcionarioId > 0) {
    // If funcionario_id provided, filter by their sector
    const { getGestoresByFuncionarioSetor } = await import('../services/setores-gestores');
    gestores = await getGestoresByFuncionarioSetor(c.env.DB, empresaId, funcionarioId);
  } else {
    // Otherwise, return all active gestores (default behavior)
    gestores = await listGestoresCopia(c.env.DB, empresaId, false);
  }

  return c.json({ success: true, data: gestores });
});

notificacoesConvocacaoRoutes.post(
  '/convocacoes/gestores',
  requireRole('admin', 'manager'),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const parsed = gestorCopiaSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const gestor = await createGestorCopia(c.env.DB, empresaId, parsed.data);
    return c.json({ success: true, data: gestor }, 201);
  },
);

notificacoesConvocacaoRoutes.put(
  '/convocacoes/gestores/:id',
  requireRole('admin', 'manager'),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = gestorCopiaSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const gestor = await updateGestorCopia(c.env.DB, empresaId, id, parsed.data);
    if (!gestor) {
      return c.json({ success: false, error: 'Gestor não encontrado' }, 404);
    }
    return c.json({ success: true, data: gestor });
  },
);

notificacoesConvocacaoRoutes.delete(
  '/convocacoes/gestores/:id',
  requireRole('admin', 'manager'),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    await deleteGestorCopia(c.env.DB, empresaId, id);
    return c.json({ success: true });
  },
);

export default notificacoesConvocacaoRoutes;
