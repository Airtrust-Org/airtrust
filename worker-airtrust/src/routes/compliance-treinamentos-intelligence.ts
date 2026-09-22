import { Hono } from 'hono';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import { sendEmailDetailed } from '../lib/email';
import { getSetorGestoresBySetor } from '../services/setores-gestores';
import {
  getComplianceNotificationPolicy,
  saveComplianceNotificationPolicy,
  sendComplianceNotification,
  type ComplianceNotificationTarget,
} from '../services/training-compliance-notifications';
import {
  buildDailyComplianceSnapshots,
  readTrainingComplianceTrend,
} from '../services/training-compliance-snapshots';
import {
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../services/employee-sector-access';
import type { TrainingComplianceSnapshot } from './compliance-treinamentos';

type IntelligenceDeps = {
  buildSnapshot: (
    db: D1Database,
    empresaId: number,
    access: EmployeeSectorAccess,
  ) => Promise<TrainingComplianceSnapshot>;
  tableExists: (db: D1Database, tableName: string) => Promise<boolean>;
};

function asPositiveInt(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function createTrainingComplianceIntelligenceRoutes({
  buildSnapshot,
  tableExists,
}: IntelligenceDeps) {
  const app = new Hono<{ Bindings: Env }>();

  type CompliancePerson = TrainingComplianceSnapshot['people'][number];
  type ComplianceRequirement = CompliancePerson['requisitos'][number];

  type RequestedComplianceTarget = {
    funcionario_id: number;
    qualificacao_tipo_id: number;
  };

  function notificationTargetFrom(
    empresaId: number,
    person: CompliancePerson,
    requirement: ComplianceRequirement,
  ): ComplianceNotificationTarget {
    return {
      empresa_id: empresaId,
      funcionario_id: person.id,
      funcionario_nome: person.nome,
      funcionario_cpf: person.cpf || null,
      email: person.email || null,
      telefone: person.telefone || null,
      setor_id: person.setor_id,
      setor_nome: person.setor_nome,
      qualificacao_tipo_id: requirement.qualificacao_tipo_id,
      qualificacao_nome:
        requirement.qualificacao_tipo_nome || requirement.qualificacao_tipo_codigo || 'Treinamento obrigatório',
      status_compliance: requirement.status_compliance,
      data_validade: requirement.data_validade,
      dias_para_vencer: requirement.dias_para_vencer,
      evidencia_origem: requirement.evidencia_origem,
      evidencia_id: requirement.evidencia_id,
    };
  }

  function selectedComplianceTargets(
    empresaId: number,
    snapshot: TrainingComplianceSnapshot,
    requested: RequestedComplianceTarget[],
  ): ComplianceNotificationTarget[] {
    const requestedKeys = new Set(
      requested.map((item) => `${Number(item.funcionario_id)}:${Number(item.qualificacao_tipo_id)}`),
    );
    const targets: ComplianceNotificationTarget[] = [];
    for (const person of snapshot.people) {
      for (const requirement of person.requisitos) {
        if (requirement.obrigatoriedade !== 'OBRIGATORIA') continue;
        const key = `${person.id}:${requirement.qualificacao_tipo_id}`;
        if (!requestedKeys.has(key)) continue;
        targets.push(notificationTargetFrom(empresaId, person, requirement));
      }
    }
    return targets;
  }

  async function loadComplianceNotificationStats(db: D1Database, empresaId: number) {
    const map = new Map<
      string,
      { count: number; last_at: string | null; last_channel: string | null; last_status: string | null }
    >();
    if (!(await tableExists(db, 'notificacoes_log'))) return map;
    try {
      const rows = await db
        .prepare(
          `WITH parsed AS (
             SELECT id,
                    CAST(json_extract(corpo, '$.funcionario_id') AS INTEGER) AS funcionario_id,
                    CAST(json_extract(corpo, '$.qualificacao_tipo_id') AS INTEGER) AS qualificacao_tipo_id,
                    tipo,
                    status,
                    COALESCE(enviado_em, created_at) AS event_at
               FROM notificacoes_log
              WHERE empresa_id = ?
                AND assunto LIKE '[COMPLIANCE_TREINAMENTO:%'
                AND json_valid(corpo) = 1
           ), ranked AS (
             SELECT *,
                    ROW_NUMBER() OVER (
                      PARTITION BY funcionario_id, qualificacao_tipo_id
                      ORDER BY event_at DESC, id DESC
                    ) AS rn
               FROM parsed
              WHERE funcionario_id > 0 AND qualificacao_tipo_id > 0
           )
           SELECT funcionario_id,
                  qualificacao_tipo_id,
                  SUM(CASE WHEN status = 'enviada' THEN 1 ELSE 0 END) AS sent_count,
                  MAX(CASE WHEN rn = 1 THEN event_at END) AS last_at,
                  MAX(CASE WHEN rn = 1 THEN tipo END) AS last_channel,
                  MAX(CASE WHEN rn = 1 THEN status END) AS last_status
             FROM ranked
            GROUP BY funcionario_id, qualificacao_tipo_id`,
        )
        .bind(empresaId)
        .all<{
          funcionario_id: number;
          qualificacao_tipo_id: number;
          sent_count: number;
          last_at: string | null;
          last_channel: string | null;
          last_status: string | null;
        }>();
      for (const row of rows.results || []) {
        map.set(`${Number(row.funcionario_id)}:${Number(row.qualificacao_tipo_id)}`, {
          count: Number(row.sent_count || 0),
          last_at: row.last_at || null,
          last_channel: row.last_channel || null,
          last_status: row.last_status || null,
        });
      }
    } catch {
      return map;
    }
    return map;
  }

  function maskNotificationDestination(value: unknown): string | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.includes('@')) {
      const [local, domain] = raw.split('@');
      return `${local?.slice(0, 1) || '*'}***@${domain || '***'}`;
    }
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 4) return `***${digits.slice(-4)}`;
    return '***';
  }

  app.get('/configuracao-alertas', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const data = await getComplianceNotificationPolicy(c.env.DB, empresaId);
    return c.json({ success: true, data });
  });

  app.put('/configuracao-alertas', requireRole('admin'), async (c) => {
    const empresaId = getEmpresaId(c);
    const payload = await c.req.json().catch(() => ({}));
    const previous = await getComplianceNotificationPolicy(c.env.DB, empresaId);
    const data = await saveComplianceNotificationPolicy(c.env.DB, empresaId, payload);
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'compliance_treinamentos_config',
      acao: 'UPDATE',
      registro_id: empresaId,
      dados_anteriores: previous,
      dados_novos: data,
      ...extrairUsuarioAuditoria(c),
    });
    return c.json({ success: true, data });
  });

  app.get('/pendencias', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const setorId = asPositiveInt(c.req.query('setor_id'));
    const funcaoId = asPositiveInt(c.req.query('funcao_id'));
    const qualificacaoTipoId = asPositiveInt(c.req.query('qualificacao_tipo_id'));
    const q = String(c.req.query('q') || '').trim().toLowerCase();
    const critico = String(c.req.query('critico') || '').toLowerCase() === 'true';
    const ateDiasRaw = c.req.query('ate_dias');
    const ateDias = ateDiasRaw === undefined || ateDiasRaw === '' ? null : Number(ateDiasRaw);
    const statuses = new Set(
      String(c.req.query('status') || 'VENCIDO,NAO_REALIZADO,VENCENDO,EM_ANDAMENTO')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    );
    const allowed = new Set(['VENCIDO', 'NAO_REALIZADO', 'VENCENDO', 'EM_ANDAMENTO', 'CONFORME']);
    if ([...statuses].some((status) => !allowed.has(status))) {
      throw new ApiError('Status de pendência inválido', 400);
    }
    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const notificationStats = await loadComplianceNotificationStats(c.env.DB, empresaId);
    const statusPriority: Record<string, number> = {
      VENCIDO: 0,
      NAO_REALIZADO: 1,
      VENCENDO: 2,
      EM_ANDAMENTO: 3,
      CONFORME: 4,
    };
    const data = snapshot.people
      .filter((person) => (!setorId || person.setor_id === setorId) && (!funcaoId || person.funcao_id === funcaoId))
      .flatMap((person) =>
        person.requisitos
          .filter((requirement) => requirement.obrigatoriedade === 'OBRIGATORIA')
          .filter((requirement) => statuses.has(requirement.status_compliance))
          .filter((requirement) => !qualificacaoTipoId || requirement.qualificacao_tipo_id === qualificacaoTipoId)
          .filter((requirement) => !critico || requirement.critico_operacional)
          .filter((requirement) => {
            if (ateDias == null || !Number.isFinite(ateDias)) return true;
            if (requirement.dias_para_vencer == null) return requirement.status_compliance === 'NAO_REALIZADO';
            return requirement.dias_para_vencer <= ateDias;
          })
          .filter((requirement) => {
            if (!q) return true;
            return [
              person.nome,
              person.setor_nome,
              person.funcao_nome,
              requirement.qualificacao_tipo_nome,
              requirement.qualificacao_tipo_codigo,
            ].some((value) => String(value || '').toLowerCase().includes(q));
          })
          .map((requirement) => {
            const stats = notificationStats.get(`${person.id}:${requirement.qualificacao_tipo_id}`);
            return {
              funcionario_id: person.id,
              funcionario_nome: person.nome,
              matricula: person.matricula,
              setor_id: person.setor_id,
              setor_nome: person.setor_nome,
              funcao_id: person.funcao_id,
              funcao_nome: person.funcao_nome,
              qualificacao_tipo_id: requirement.qualificacao_tipo_id,
              qualificacao_tipo_nome: requirement.qualificacao_tipo_nome,
              qualificacao_tipo_codigo: requirement.qualificacao_tipo_codigo,
              status_compliance: requirement.status_compliance,
              data_validade: requirement.data_validade,
              dias_para_vencer: requirement.dias_para_vencer,
              ultima_data: requirement.ultima_data,
              critico_operacional: requirement.critico_operacional,
              referencia_normativa: requirement.referencia_normativa,
              curso_ead_titulo: requirement.curso_ead_titulo,
              tem_email: Boolean(person.email),
              tem_whatsapp: Boolean(person.telefone),
              avisos_enviados: stats?.count || 0,
              ultimo_aviso_em: stats?.last_at || null,
              ultimo_canal: stats?.last_channel || null,
              ultimo_status_envio: stats?.last_status || null,
            };
          }),
      )
      .sort((a, b) => {
        if (Boolean(a.critico_operacional) !== Boolean(b.critico_operacional)) return a.critico_operacional ? -1 : 1;
        const statusDiff = (statusPriority[a.status_compliance] ?? 99) - (statusPriority[b.status_compliance] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        const daysA = a.dias_para_vencer ?? -9999;
        const daysB = b.dias_para_vencer ?? -9999;
        if (daysA !== daysB) return daysA - daysB;
        return a.funcionario_nome.localeCompare(b.funcionario_nome, 'pt-BR');
      });
    return c.json({
      success: true,
      data,
      meta: {
        total: data.length,
        funcionarios: new Set(data.map((row) => row.funcionario_id)).size,
        vencidos: data.filter((row) => row.status_compliance === 'VENCIDO').length,
        nunca_realizados: data.filter((row) => row.status_compliance === 'NAO_REALIZADO').length,
        vencendo: data.filter((row) => row.status_compliance === 'VENCENDO').length,
        em_andamento: data.filter((row) => row.status_compliance === 'EM_ANDAMENTO').length,
      },
    });
  });

  app.post('/avisos/preview', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const payload = (await c.req.json().catch(() => ({}))) as { targets?: RequestedComplianceTarget[] };
    const requested = Array.isArray(payload.targets) ? payload.targets.slice(0, 200) : [];
    if (!requested.length) throw new ApiError('Selecione ao menos uma pendência', 400);
    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const targets = selectedComplianceTargets(empresaId, snapshot, requested);
    if (!targets.length) throw new ApiError('Nenhuma pendência válida encontrada no seu escopo', 404);
    return c.json({
      success: true,
      data: {
        selecionados: targets.length,
        com_email: targets.filter((item) => Boolean(item.email)).length,
        sem_email: targets.filter((item) => !item.email).length,
        com_whatsapp: targets.filter((item) => Boolean(item.telefone)).length,
        sem_whatsapp: targets.filter((item) => !item.telefone).length,
        vencidos: targets.filter((item) => item.status_compliance === 'VENCIDO').length,
        nunca_realizados: targets.filter((item) => item.status_compliance === 'NAO_REALIZADO').length,
      },
    });
  });

  app.post('/avisos/enviar', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const payload = (await c.req.json().catch(() => ({}))) as {
      targets?: RequestedComplianceTarget[];
      canais?: { email?: boolean; whatsapp?: boolean };
    };
    const requested = Array.isArray(payload.targets) ? payload.targets.slice(0, 200) : [];
    if (!requested.length) throw new ApiError('Selecione ao menos uma pendência', 400);
    const channels = {
      email: payload.canais?.email === true,
      whatsapp: payload.canais?.whatsapp === true,
    };
    if (!channels.email && !channels.whatsapp) throw new ApiError('Selecione e-mail e/ou WhatsApp', 400);
    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const targets = selectedComplianceTargets(empresaId, snapshot, requested);
    if (!targets.length) throw new ApiError('Nenhuma pendência válida encontrada no seu escopo', 404);
    const triggerKey = `MANUAL_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const results: Awaited<ReturnType<typeof sendComplianceNotification>>[] = [];
    for (let index = 0; index < targets.length; index += 5) {
      const chunk = targets.slice(index, index + 5);
      results.push(
        ...(await Promise.all(
          chunk.map((target) => sendComplianceNotification(c.env, c.env.DB, target, channels, triggerKey)),
        )),
      );
    }
    const emailSuccess = results.filter((row) => row.email.ok).length;
    const whatsappSuccess = results.filter((row) => row.whatsapp.ok).length;
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'compliance_treinamentos_avisos',
      acao: 'BULK_UPDATE',
      registro_id: triggerKey,
      dados_novos: {
        empresa_id: empresaId,
        selecionados: targets.length,
        canais: channels,
        email_sucesso: emailSuccess,
        whatsapp_sucesso: whatsappSuccess,
      },
      ...extrairUsuarioAuditoria(c),
    });
    return c.json({
      success: true,
      data: {
        trigger_key: triggerKey,
        selecionados: targets.length,
        email_sucesso: emailSuccess,
        whatsapp_sucesso: whatsappSuccess,
        email_falha: results.filter((row) => row.email.attempted && !row.email.ok).length,
        whatsapp_falha: results.filter((row) => row.whatsapp.attempted && !row.whatsapp.ok).length,
        sem_email: results.filter((row) => !row.email.attempted && channels.email).length,
        sem_whatsapp: results.filter((row) => !row.whatsapp.attempted && channels.whatsapp).length,
      },
    });
  });

  app.get('/tendencias', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const requestedSetorId = asPositiveInt(c.req.query('setor_id'));
    const requestedFuncaoId = asPositiveInt(c.req.query('funcao_id'));
    const days = Math.max(7, Math.min(365, Number(c.req.query('days') || 90) || 90));

    let scopes: Array<{ setor_id: number; funcao_id: number }> = [];
    if (requestedSetorId) {
      if (access.mode !== 'all') {
        const allowed = filterRequestedSetorIdsByAccess([requestedSetorId], access);
        if (allowed.length !== 1) throw new ApiError('Setor fora do escopo do gestor', 403);
      }
      scopes = [{ setor_id: requestedSetorId, funcao_id: requestedFuncaoId || 0 }];
    } else if (access.mode === 'all') {
      scopes = [{ setor_id: 0, funcao_id: requestedFuncaoId || 0 }];
    } else if (access.mode === 'restricted') {
      scopes = access.setorIds
        .filter((id) => id > 0)
        .map((id) => ({ setor_id: id, funcao_id: requestedFuncaoId || 0 }));
    }

    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const currentPeople = snapshot.people.filter(
      (person) =>
        (!requestedSetorId || person.setor_id === requestedSetorId) &&
        (!requestedFuncaoId || person.funcao_id === requestedFuncaoId),
    );
    const currentBase = buildDailyComplianceSnapshots(currentPeople)[0];
    const current = {
      ...currentBase,
      setor_id: requestedSetorId || (access.mode === 'all' ? 0 : -1),
      funcao_id: requestedFuncaoId || 0,
    };
    const historical = await readTrainingComplianceTrend(c.env.DB, empresaId, scopes, days);

    const data = historical.data.filter((row) => row.snapshot_date !== current.snapshot_date);
    data.push(current);
    data.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

    return c.json({
      success: true,
      data,
      meta: {
        history_ready: historical.ready,
        days,
        scope: requestedSetorId
          ? requestedFuncaoId
            ? 'SETOR_FUNCAO'
            : 'SETOR'
          : requestedFuncaoId
            ? 'FUNCAO'
            : access.mode === 'all'
              ? 'EMPRESA'
              : 'SETORES_GERENCIADOS',
      },
    });
  });

  app.get('/comunicacoes', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const allowedIds = new Set(snapshot.people.map((person) => person.id));
    const limit = Math.min(300, Math.max(1, Number(c.req.query('limit') || 100)));
    if (!(await tableExists(c.env.DB, 'notificacoes_log'))) return c.json({ success: true, data: [] });
    const rows = await c.env.DB
      .prepare(
        `SELECT id, tipo, destinatario, assunto, corpo, status, erro_mensagem,
                COALESCE(enviado_em, created_at) AS event_at
           FROM notificacoes_log
          WHERE empresa_id = ?
            AND (assunto LIKE '[COMPLIANCE_TREINAMENTO:%' OR assunto LIKE '[COMPLIANCE_GESTOR:%')
          ORDER BY COALESCE(enviado_em, created_at) DESC
          LIMIT ?`,
      )
      .bind(empresaId, limit * 4)
      .all<{
        id: number;
        tipo: string | null;
        destinatario: string | null;
        assunto: string | null;
        corpo: string | null;
        status: string | null;
        erro_mensagem: string | null;
        event_at: string | null;
      }>();
    const data = [] as Array<Record<string, unknown>>;
    for (const row of rows.results || []) {
      let body: Record<string, unknown> = {};
      try {
        body = row.corpo ? (JSON.parse(row.corpo) as Record<string, unknown>) : {};
      } catch {
        body = {};
      }
      const funcionarioId = Number(body.funcionario_id || 0);
      if (!funcionarioId || !allowedIds.has(funcionarioId)) continue;
      data.push({
        id: row.id,
        funcionario_id: funcionarioId,
        funcionario_nome: body.funcionario_nome || null,
        setor_nome: body.setor_nome || null,
        qualificacao_tipo_id: Number(body.qualificacao_tipo_id || 0) || null,
        qualificacao_nome: body.qualificacao_nome || null,
        status_compliance: body.status_compliance || null,
        tipo: row.tipo,
        destinatario: maskNotificationDestination(row.destinatario),
        status_envio: row.status,
        erro: row.erro_mensagem || null,
        enviado_em: row.event_at,
        gestor: String(row.assunto || '').startsWith('[COMPLIANCE_GESTOR:'),
      });
      if (data.length >= limit) break;
    }
    return c.json({ success: true, data });
  });

  app.post('/relatorios/enviar-gestor', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const payload = (await c.req.json().catch(() => ({}))) as {
      setor_id?: number;
      pdf_base64?: string;
      arquivo_nome?: string;
    };
    const setorId = asPositiveInt(payload.setor_id);
    if (!setorId) throw new ApiError('setor_id é obrigatório', 400);
    if (access.mode !== 'all') {
      const allowed = filterRequestedSetorIdsByAccess([setorId], access);
      if (allowed.length !== 1) throw new ApiError('Setor fora do escopo do gestor', 403);
    }
    const setor = await c.env.DB
      .prepare('SELECT nome FROM setores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(setorId, empresaId)
      .first<{ nome: string }>();
    if (!setor) throw new ApiError('Setor não encontrado', 404);
    const pdf = String(payload.pdf_base64 || '').replace(/^data:application\/pdf;base64,/, '');
    if (!pdf || pdf.length > 9_500_000) throw new ApiError('PDF ausente ou acima do limite permitido', 400);
    try {
      const header = atob(pdf.slice(0, 16));
      if (!header.startsWith('%PDF')) throw new Error('invalid');
    } catch {
      throw new ApiError('Arquivo PDF inválido', 400);
    }
    const managers = await getSetorGestoresBySetor(c.env.DB, empresaId, setorId, true);
    const recipients = [...new Map(
      managers
        .filter((item) => String(item.gestor_email || '').includes('@'))
        .map((item) => [String(item.gestor_email).trim().toLowerCase(), { email: String(item.gestor_email).trim(), name: item.gestor_nome }]),
    ).values()];
    if (!recipients.length) throw new ApiError('Nenhum gestor com e-mail válido está vinculado ao setor', 409);
    const fileName = String(payload.arquivo_nome || `compliance-${setor.nome}.pdf`)
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 120);
    const result = await sendEmailDetailed(c.env, {
      to: recipients,
      subject: `Relatório de Compliance de Treinamentos — ${setor.nome}`,
      textContent: `Segue o relatório atualizado de treinamentos obrigatórios do setor ${setor.nome}. Solicitamos acompanhamento das pendências indicadas no documento.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55"><h2>Gerência de Treinamento | Costa do Sol</h2><p>Segue o relatório atualizado de treinamentos obrigatórios do setor <strong>${setor.nome}</strong>.</p><p>Solicitamos acompanhamento e apoio para regularização das pendências indicadas no documento anexo.</p></div>`,
      attachments: [{ content: pdf, name: fileName }],
    });
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'compliance_relatorios',
      acao: 'CONVOCACAO_EMAIL',
      registro_id: `${setorId}:${Date.now()}`,
      dados_novos: {
        empresa_id: empresaId,
        setor_id: setorId,
        destinatarios: recipients.length,
        arquivo: fileName,
        enviado: result.ok,
      },
      ...extrairUsuarioAuditoria(c),
    });
    if (!result.ok) throw new ApiError('Não foi possível enviar o relatório ao gestor', 502);
    return c.json({ success: true, data: { enviados: recipients.length, setor_nome: setor.nome } });
  });

  return app;
}
