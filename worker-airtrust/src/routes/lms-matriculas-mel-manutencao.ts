/**
 * LMS — Matrícula automática MEL para Manutenção
 *
 * Endpoint dedicado para:
 * 1. Identificar funcionários da Manutenção com qualificação MEL vencida
 * 2. Matriculá-los automaticamente no curso MEL correspondente
 * 3. Enviar e-mail de notificação
 *
 * A renovação automática contínua (quando outros vencerem) é feita pelo
 * cron job de EAD renewal (ead-renewal.ts) que já cobre todas as qualificações
 * EAD, incluindo MEL, desde que o curso tenha qualificacao_tipo_id vinculado.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { logAudit } from '../utils/db';
import { sendEmail } from '../lib/email';
import type { Env } from '../types';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import { getQualificacoesVencimentoExpr } from '../utils/qualificacoes-alerta-config';
import { ensureMatriculaCycle } from '../services/lms-matricula-cycle';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMatriculaUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('UNIQUE constraint failed') && message.includes('lms_matriculas');
}

async function findExistingMatricula(
  db: D1Database,
  cursoId: number,
  funcionarioId: number,
  empresaId: number,
) {
  return db
    .prepare(
      `SELECT id, status, deleted_at
         FROM lms_matriculas
        WHERE curso_id = ?
          AND funcionario_id = ?
          AND empresa_id = ?
        ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
        LIMIT 1`,
    )
    .bind(cursoId, funcionarioId, empresaId)
    .first<{ id: number; status: string; deleted_at: string | null }>();
}

async function sendMelMatriculaEmail(
  env: Env,
  db: D1Database,
  params: {
    funcionarioId: number;
    empresaId: number;
    cursoId: number;
    cursoTitulo: string;
    qualificacaoNome: string;
    dataVencimento: string;
  },
): Promise<void> {
  try {
    const funcionario = await db
      .prepare(
        `SELECT nome, email FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(params.funcionarioId, params.empresaId)
      .first<{ nome: string; email: string | null }>();

    if (!funcionario?.email) return;

    const frontendUrl = String(env.FRONTEND_URL || 'https://airtrust.online').replace(/\/$/, '');
    const cursoUrl = `${frontendUrl}/lms/cursos/${params.cursoId}`;
    const nomeAluno = funcionario.nome || `Funcionário ${params.funcionarioId}`;
    const vencimentoFormatado = params.dataVencimento.split('-').reverse().join('/');

    const subject = `Atualização Obrigatória: ${params.cursoTitulo}`;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
        <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin-bottom:20px;border-radius:4px">
          <p style="font-weight:700;color:#991b1b;margin:0">⚠️ Qualificação Vencida</p>
        </div>
        <p>Olá <strong>${nomeAluno}</strong>,</p>
        <p>Identificamos que sua qualificação <strong>${params.qualificacaoNome}</strong> venceu em <strong>${vencimentoFormatado}</strong>.</p>
        <p>Você foi matriculado automaticamente no curso de reciclagem para regularização:</p>
        <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:12px 0;border-radius:4px">
          <p style="font-size:16px;font-weight:600;margin:0;color:#1e3a5f">${params.cursoTitulo}</p>
        </div>
        <p>É fundamental concluir este treinamento o quanto antes para manter a conformidade operacional.</p>
        <p style="margin:24px 0">
          <a href="${cursoUrl}" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Acessar curso agora
          </a>
        </p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">
          Este e-mail foi enviado automaticamente pela plataforma AirTrust.
        </p>
      </div>`;

    const textContent = [
      `⚠️ Qualificação Vencida: ${params.qualificacaoNome}`,
      '',
      `Olá ${nomeAluno},`,
      '',
      `Sua qualificação ${params.qualificacaoNome} venceu em ${vencimentoFormatado}.`,
      `Você foi matriculado automaticamente em: ${params.cursoTitulo}`,
      '',
      `Acesse o curso em: ${cursoUrl}`,
      '',
      'Este e-mail foi enviado automaticamente pela plataforma AirTrust.',
    ].join('\n');

    const sent = await sendEmail(env, {
      to: [{ email: funcionario.email, name: nomeAluno }],
      subject,
      textContent,
      htmlContent,
    });

    if (sent) {
      console.log('[mel-manutencao] Email enviado para funcionario', params.funcionarioId);
    }
  } catch (err) {
    console.warn('[mel-manutencao] Falha ao enviar email:', err);
  }
}

// ── POST /api/lms/matriculas/mel-manutencao/processar ─────────────────────────

app.post('/processar', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userIdRaw = c.get('userId' as never) as unknown;
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const vencExpr = getQualificacoesVencimentoExpr();

  // 1. Encontrar o setor "Manutenção"
  const setorManutencao = await db
    .prepare(
      `SELECT id, nome FROM setores
        WHERE empresa_id = ? AND deleted_at IS NULL
          AND (nome LIKE '%Manuten%' OR nome LIKE '%MANUTEN%')
        LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ id: number; nome: string }>();

  if (!setorManutencao) {
    throw new ApiError('Setor "Manutenção" não encontrado nesta empresa', 404);
  }

  // 2. Validar escopo do usuário
  const access = await getEmployeeSectorAccess(c, empresaId);
  if (access.mode === 'restricted') {
    if (!access.setorIds.includes(setorManutencao.id)) {
      throw new ApiError('Acesso negado: setor Manutenção fora do seu escopo', 403);
    }
  }

  // 3. Encontrar a qualificação MEL
  const qualMEL = await db
    .prepare(
      `SELECT id, nome, codigo, validade FROM qualificacoes_tipos
        WHERE empresa_id = ? AND deleted_at IS NULL
          AND (nome LIKE '%MEL%' OR codigo LIKE '%MEL%' OR codigo LIKE '%MNT_MEL%')
        ORDER BY CASE WHEN TRIM(codigo) = 'MEL' THEN 0 WHEN TRIM(codigo) LIKE '%MEL%' THEN 1 ELSE 2 END
        LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ id: number; nome: string; codigo: string | null; validade: number | null }>();

  if (!qualMEL) {
    throw new ApiError('Qualificação MEL não encontrada', 404);
  }

  // 4. Encontrar o curso MEL vinculado
  const cursoMEL = await db
    .prepare(
      `SELECT id, titulo, qualificacao_tipo_id FROM lms_cursos
        WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
          AND qualificacao_tipo_id = ?
        LIMIT 1`,
    )
    .bind(empresaId, qualMEL.id)
    .first<{ id: number; titulo: string; qualificacao_tipo_id: number | null }>();

  if (!cursoMEL) {
    throw new ApiError(
      `Nenhum curso LMS vinculado à qualificação "${qualMEL.nome}" (ID ${qualMEL.id}). ` +
        'Cadastre um curso com qualificacao_tipo_id apropriado.',
      404,
    );
  }

  // 5. Buscar funcionários da Manutenção com MEL vencida
  const funcionariosQuery = `
    SELECT DISTINCT
      f.id AS funcionario_id,
      f.nome AS funcionario_nome,
      f.email AS funcionario_email,
      f.matricula AS funcionario_matricula,
      s.nome AS setor_nome,
      qh.id AS qualificacao_historico_id,
      qt.id AS qualificacao_tipo_id,
      qt.nome AS qualificacao_nome,
      ${vencExpr} AS data_vencimento,
      CAST(julianday('now') - julianday(${vencExpr}) AS INTEGER) AS dias_vencida
    FROM qualificacoes_historico qh
    JOIN funcionarios f
      ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id
     AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
     AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
    JOIN setores s
      ON s.id = f.setor_id AND s.empresa_id = f.empresa_id AND s.deleted_at IS NULL
    JOIN qualificacoes_tipos qt
      ON qt.empresa_id = qh.empresa_id AND qt.deleted_at IS NULL
     AND (qt.id = qh.qualificacao_id OR (qh.qualificacao_id IS NULL
       AND UPPER(TRIM(COALESCE(qh.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))))
    WHERE qh.empresa_id = ? AND qh.deleted_at IS NULL
      AND (qh.data_vencimento IS NOT NULL OR qh.data_conclusao IS NOT NULL)
      AND COALESCE(qh.renovada, 0) = 0
      AND qt.id = ? AND f.setor_id = ?
      AND date(${vencExpr}) < date('now')
      AND NOT EXISTS (
        SELECT 1 FROM qualificacoes_historico qh2
         WHERE qh2.empresa_id = qh.empresa_id AND qh2.funcionario_id = qh.funcionario_id
           AND qh2.id <> qh.id AND qh2.deleted_at IS NULL
           AND COALESCE(qh2.renovada, 0) = 0
           AND (qh2.data_vencimento IS NOT NULL OR qh2.data_conclusao IS NOT NULL)
           AND (qh2.qualificacao_id = qt.id
             OR UPPER(TRIM(COALESCE(qh2.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, ''))))
           AND date(${getQualificacoesVencimentoExpr('qh2', 'qt')}) > date(${vencExpr}))
    ORDER BY f.nome ASC`;

  const funcionarios = await db
    .prepare(funcionariosQuery)
    .bind(empresaId, qualMEL.id, setorManutencao.id)
    .all<{
      funcionario_id: number;
      funcionario_nome: string;
      funcionario_email: string | null;
      funcionario_matricula: string | null;
      setor_nome: string;
      qualificacao_historico_id: number;
      qualificacao_tipo_id: number;
      qualificacao_nome: string;
      data_vencimento: string;
      dias_vencida: number;
    }>();

  const lista = funcionarios.results ?? [];

  // 6. Processar matrículas
  const resultado = {
    processados: lista.length,
    matriculados: 0,
    ignorados: 0,
    erros: 0,
    detalhes: [] as Array<{
      funcionario_id: number;
      funcionario_nome: string;
      status: 'MATRICULADO' | 'JA_MATRICULADO' | 'ERRO';
      matricula_id?: number;
      erro?: string;
    }>,
  };

  for (const func of lista) {
    try {
      const existente = await findExistingMatricula(
        db,
        cursoMEL.id,
        func.funcionario_id,
        empresaId,
      );
      if (existente && !existente.deleted_at) {
        resultado.ignorados++;
        resultado.detalhes.push({
          funcionario_id: func.funcionario_id,
          funcionario_nome: func.funcionario_nome,
          status: 'JA_MATRICULADO',
          matricula_id: existente.id,
        });
        continue;
      }

      const insertResult = await db
        .prepare(
          `INSERT INTO lms_matriculas (empresa_id, curso_id, funcionario_id, observacoes, matriculado_por)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          empresaId,
          cursoMEL.id,
          func.funcionario_id,
          `Matrícula automática: qualificação MEL vencida desde ${func.data_vencimento}`,
          Number.isFinite(userId) && userId > 0 ? userId : null,
        )
        .run();

      const matriculaId = Number(insertResult.meta.last_row_id);
      if (!matriculaId) throw new Error('Falha ao criar matrícula');

      await ensureMatriculaCycle(db, { matriculaId, origin: 'MANUAL' });

      // Notificação in-app
      const createdAt = new Date().toISOString();
      const notificationId = [
        'lms',
        'mel_manutencao_vencida',
        empresaId,
        func.funcionario_id,
        'lms_matricula',
        matriculaId,
      ].join(':');
      await db
        .prepare(
          `INSERT OR IGNORE INTO notificacoes_inapp (id, funcionario_id, empresa_id, tipo, titulo, mensagem, referencia_id, referencia_tipo, created_at)
         VALUES (?, ?, ?, 'mel_manutencao_vencida', '⚠️ Reciclagem MEL obrigatória',
         'Sua qualificação ' || ? || ' está vencida. Você foi matriculado automaticamente no curso ' || ? || '.',
         ?, 'lms_matricula', ?)`,
        )
        .bind(
          notificationId,
          String(func.funcionario_id),
          empresaId,
          func.qualificacao_nome,
          cursoMEL.titulo,
          String(matriculaId),
          createdAt,
        )
        .run();

      // Audit log
      try {
        await logAudit(db, {
          userId,
          action: 'LMS_MATRICULA_MEL_MANUTENCAO',
          entityType: 'lms_matricula',
          entityId: matriculaId,
          newValues: {
            curso_id: cursoMEL.id,
            curso_titulo: cursoMEL.titulo,
            funcionario_id: func.funcionario_id,
            funcionario_nome: func.funcionario_nome,
            qualificacao_historico_id: func.qualificacao_historico_id,
            setor: setorManutencao.nome,
          },
        });
      } catch (auditErr) {
        console.warn('[mel-manutencao] Falha ao registrar audit log:', auditErr);
      }

      // Email
      await sendMelMatriculaEmail(c.env, db, {
        funcionarioId: func.funcionario_id,
        empresaId,
        cursoId: cursoMEL.id,
        cursoTitulo: cursoMEL.titulo,
        qualificacaoNome: func.qualificacao_nome,
        dataVencimento: func.data_vencimento,
      });

      resultado.matriculados++;
      resultado.detalhes.push({
        funcionario_id: func.funcionario_id,
        funcionario_nome: func.funcionario_nome,
        status: 'MATRICULADO',
        matricula_id: matriculaId,
      });
    } catch (error) {
      if (isMatriculaUniqueConstraintError(error)) {
        const concorrente = await findExistingMatricula(
          db,
          cursoMEL.id,
          func.funcionario_id,
          empresaId,
        );
        if (concorrente && !concorrente.deleted_at) {
          resultado.ignorados++;
          resultado.detalhes.push({
            funcionario_id: func.funcionario_id,
            funcionario_nome: func.funcionario_nome,
            status: 'JA_MATRICULADO',
            matricula_id: concorrente.id,
          });
          continue;
        }
      }
      resultado.erros++;
      resultado.detalhes.push({
        funcionario_id: func.funcionario_id,
        funcionario_nome: func.funcionario_nome,
        status: 'ERRO',
        erro: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 7. Auditoria do lote
  try {
    await logAudit(db, {
      userId,
      action: 'LMS_MATRICULA_MEL_MANUTENCAO_LOTE',
      entityType: 'lms_matricula',
      entityId: 0,
      newValues: {
        setor: setorManutencao.nome,
        setor_id: setorManutencao.id,
        qualificacao: qualMEL.nome,
        qualificacao_id: qualMEL.id,
        curso: cursoMEL.titulo,
        curso_id: cursoMEL.id,
        processados: resultado.processados,
        matriculados: resultado.matriculados,
        ignorados: resultado.ignorados,
        erros: resultado.erros,
      },
    });
  } catch (auditErr) {
    console.warn('[mel-manutencao] Falha ao registrar audit log do lote:', auditErr);
  }

  return c.json({ success: true, data: resultado });
});

// ── GET /api/lms/matriculas/mel-manutencao/status ──────────────────────────────

app.get('/status', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const vencExpr = getQualificacoesVencimentoExpr();

  const setorManutencao = await db
    .prepare(
      `SELECT id, nome FROM setores WHERE empresa_id = ? AND deleted_at IS NULL AND (nome LIKE '%Manuten%' OR nome LIKE '%MANUTEN%') LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ id: number; nome: string }>();
  if (!setorManutencao)
    return c.json({ success: true, data: { funcionarios: [], total: 0, setor: null } });

  const qualMEL = await db
    .prepare(
      `SELECT id, nome FROM qualificacoes_tipos WHERE empresa_id = ? AND deleted_at IS NULL AND (nome LIKE '%MEL%' OR codigo LIKE '%MEL%' OR codigo LIKE '%MNT_MEL%') ORDER BY CASE WHEN TRIM(codigo) = 'MEL' THEN 0 WHEN TRIM(codigo) LIKE '%MEL%' THEN 1 ELSE 2 END LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ id: number; nome: string }>();
  if (!qualMEL)
    return c.json({
      success: true,
      data: { funcionarios: [], total: 0, setor: setorManutencao, qualificacao: null },
    });

  const cursoMEL = await db
    .prepare(
      `SELECT id, titulo FROM lms_cursos WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL AND qualificacao_tipo_id = ? LIMIT 1`,
    )
    .bind(empresaId, qualMEL.id)
    .first<{ id: number; titulo: string }>();

  const funcionariosQuery = `
    SELECT DISTINCT f.id AS funcionario_id, f.nome AS funcionario_nome, f.email AS funcionario_email,
      f.matricula AS funcionario_matricula, s.nome AS setor_nome, qh.id AS qualificacao_historico_id,
      qt.nome AS qualificacao_nome, ${vencExpr} AS data_vencimento,
      CAST(julianday('now') - julianday(${vencExpr}) AS INTEGER) AS dias_vencida,
      CASE WHEN lm.id IS NOT NULL AND lm.deleted_at IS NULL THEN 1 ELSE 0 END AS ja_matriculado
    FROM qualificacoes_historico qh
    JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id
     AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1
     AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
    JOIN setores s ON s.id = f.setor_id AND s.empresa_id = f.empresa_id AND s.deleted_at IS NULL
    JOIN qualificacoes_tipos qt ON qt.empresa_id = qh.empresa_id AND qt.deleted_at IS NULL
     AND (qt.id = qh.qualificacao_id OR (qh.qualificacao_id IS NULL
       AND UPPER(TRIM(COALESCE(qh.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))))
    LEFT JOIN lms_matriculas lm ON lm.curso_id = ? AND lm.funcionario_id = f.id AND lm.empresa_id = f.empresa_id
    WHERE qh.empresa_id = ? AND qh.deleted_at IS NULL
      AND (qh.data_vencimento IS NOT NULL OR qh.data_conclusao IS NOT NULL)
      AND COALESCE(qh.renovada, 0) = 0 AND qt.id = ? AND f.setor_id = ?
      AND date(${vencExpr}) < date('now')
      AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh2
        WHERE qh2.empresa_id = qh.empresa_id AND qh2.funcionario_id = qh.funcionario_id
          AND qh2.id <> qh.id AND qh2.deleted_at IS NULL AND COALESCE(qh2.renovada, 0) = 0
          AND (qh2.data_vencimento IS NOT NULL OR qh2.data_conclusao IS NOT NULL)
          AND (qh2.qualificacao_id = qt.id
            OR UPPER(TRIM(COALESCE(qh2.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, ''))))
          AND date(${getQualificacoesVencimentoExpr('qh2', 'qt')}) > date(${vencExpr}))
    ORDER BY f.nome ASC`;

  const funcionarios = await db
    .prepare(funcionariosQuery)
    .bind(cursoMEL?.id ?? 0, empresaId, qualMEL.id, setorManutencao.id)
    .all();

  return c.json({
    success: true,
    data: {
      setor: setorManutencao,
      qualificacao: qualMEL,
      curso: cursoMEL ?? null,
      total: (funcionarios.results ?? []).length,
      funcionarios: funcionarios.results ?? [],
    },
  });
});

export default app;
