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
import { normalizeSearchText } from '../utils/text-search';
import { listTrainingCommunications } from '../services/training-communication-history';
import {
  buildDailyComplianceSnapshots,
  readTrainingComplianceTrend,
} from '../services/training-compliance-snapshots';
import {
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../middleware/employee-sector-access';
import type { TrainingComplianceSnapshot } from '../services/training-compliance-snapshot-builder';
import {
  buildTrainingComplianceReportRows,
  getComplianceReportAutomationPolicy,
  normalizeComplianceReportAutomationPolicy,
  saveComplianceReportAutomationPolicy,
  sendTrainingComplianceReportToSectorManagers,
  type TrainingComplianceReportFilters,
  type TrainingComplianceStatus,
} from '../services/training-compliance-reports';

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
        requirement.qualificacao_tipo_nome ||
        requirement.qualificacao_tipo_codigo ||
        'Treinamento obrigatório',
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
      requested.map(
        (item) => `${Number(item.funcionario_id)}:${Number(item.qualificacao_tipo_id)}`,
      ),
    );
    const targets: ComplianceNotificationTarget[] = [];
    for (const person of snapshot.people) {
      for (const requirement of person.requisitos) {
        if (requirement.obrigatoriedade !== 'OBRIGATORIA' || requirement.evidencia_pendente_validacao) continue;
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
      {
        count: number;
        last_at: string | null;
        last_channel: string | null;
        last_status: string | null;
      }
    >();
    if (await tableExists(db, 'notificacoes_log')) try {
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
      // Histórico LMS pode continuar disponível mesmo sem logs de Compliance.
    }

    if (await tableExists(db, 'audit_logs')) try {
      const logs = await db.prepare(`
        WITH events AS (
          SELECT CAST(json_extract(a.new_values, '$.funcionario_id') AS INTEGER) AS funcionario_id,
                 c.qualificacao_tipo_id,
                 a.created_at AS event_at,
                 (CASE WHEN json_extract(a.new_values, '$.email_resultado') = 'ENVIADO' THEN 1 ELSE 0 END
                  + CASE WHEN json_extract(a.new_values, '$.whatsapp_resultado') = 'ENVIADO' THEN 1 ELSE 0 END) AS sent_count,
                 CASE WHEN json_extract(a.new_values, '$.whatsapp_resultado') IS NOT NULL
                      THEN 'WHATSAPP' ELSE 'EMAIL' END AS channel,
                 CASE WHEN json_extract(a.new_values, '$.email_resultado') = 'ENVIADO'
                          OR json_extract(a.new_values, '$.whatsapp_resultado') = 'ENVIADO'
                      THEN 'enviada'
                      WHEN json_extract(a.new_values, '$.email_resultado') = 'FALHA'
                          OR json_extract(a.new_values, '$.whatsapp_resultado') = 'FALHA'
                      THEN 'erro' ELSE 'sem_contato' END AS status
            FROM audit_logs a
            JOIN lms_cursos c ON c.empresa_id = a.empresa_id
              AND c.id = CAST(json_extract(a.new_values, '$.curso_id') AS INTEGER)
           WHERE a.empresa_id = ? AND a.action = 'LMS_MATRICULA_ALERTA'
             AND a.entity_type = 'lms_matriculas' AND json_valid(a.new_values) = 1
             AND c.qualificacao_tipo_id IS NOT NULL
        ), ranked AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY funcionario_id, qualificacao_tipo_id
            ORDER BY event_at DESC
          ) AS rn FROM events WHERE funcionario_id > 0
        )
        SELECT funcionario_id, qualificacao_tipo_id, SUM(sent_count) AS sent_count,
               MAX(CASE WHEN rn=1 THEN event_at END) AS last_at,
               MAX(CASE WHEN rn=1 THEN channel END) AS last_channel,
               MAX(CASE WHEN rn=1 THEN status END) AS last_status
          FROM ranked GROUP BY funcionario_id, qualificacao_tipo_id
      `).bind(empresaId).all<{
        funcionario_id: number;
        qualificacao_tipo_id: number;
        sent_count: number;
        last_at: string | null;
        last_channel: string | null;
        last_status: string | null;
      }>();
      for (const log of logs.results || []) {
        const key = `${Number(log.funcionario_id)}:${Number(log.qualificacao_tipo_id)}`;
        const existing = map.get(key);
        const later = !existing?.last_at || (log.last_at || '') > existing.last_at;
        map.set(key, {
          count: (existing?.count || 0) + Number(log.sent_count || 0),
          last_at: later ? log.last_at : existing?.last_at || null,
          last_channel: later ? log.last_channel : existing?.last_channel || null,
          last_status: later ? log.last_status : existing?.last_status || null,
        });
      }
    } catch {
      // Falha de consulta histórica não deve apagar estatísticas comprovadas.
    }
    return map;
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
    const funcionarioId = asPositiveInt(c.req.query('funcionario_id'));
    const qualificacaoTipoId = asPositiveInt(c.req.query('qualificacao_tipo_id'));
    const q = normalizeSearchText(c.req.query('q'));
    const funcionarioQ = normalizeSearchText(c.req.query('funcionario_q'));
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
      .filter(
        (person) =>
          (!setorId || person.setor_id === setorId) &&
          (!funcaoId || person.funcao_id === funcaoId) &&
          (!funcionarioId || person.id === funcionarioId) &&
          (!funcionarioQ || normalizeSearchText(person.nome).includes(funcionarioQ)),
      )
      .flatMap((person) =>
        person.requisitos
          .filter((requirement) => requirement.obrigatoriedade === 'OBRIGATORIA')
          .filter((requirement) => statuses.has(requirement.status_compliance))
          .filter(
            (requirement) =>
              !qualificacaoTipoId || requirement.qualificacao_tipo_id === qualificacaoTipoId,
          )
          .filter((requirement) => !critico || requirement.critico_operacional)
          .filter((requirement) => {
            if (ateDias == null || !Number.isFinite(ateDias)) return true;
            if (requirement.dias_para_vencer == null)
              return requirement.status_compliance === 'NAO_REALIZADO';
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
            ].some((value) => normalizeSearchText(value).includes(q));
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
              evidencia_pendente_validacao: requirement.evidencia_pendente_validacao,
              evidencia_pendente_motivo: requirement.evidencia_pendente_motivo,
              critico_operacional: requirement.critico_operacional,
              referencia_normativa: requirement.referencia_normativa,
              curso_ead_titulo: requirement.curso_ead_titulo,
              progresso_pct: requirement.progresso_pct,
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
        if (Boolean(a.critico_operacional) !== Boolean(b.critico_operacional))
          return a.critico_operacional ? -1 : 1;
        const statusDiff =
          (statusPriority[a.status_compliance] ?? 99) - (statusPriority[b.status_compliance] ?? 99);
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
    const payload = (await c.req.json().catch(() => ({}))) as {
      targets?: RequestedComplianceTarget[];
    };
    const requested = Array.isArray(payload.targets) ? payload.targets.slice(0, 200) : [];
    if (!requested.length) throw new ApiError('Selecione ao menos uma pendência', 400);
    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const targets = selectedComplianceTargets(empresaId, snapshot, requested);
    if (!targets.length)
      throw new ApiError('Nenhuma pendência válida encontrada no seu escopo', 404);
    return c.json({
      success: true,
      data: {
        selecionados: targets.length,
        com_email: targets.filter((item) => Boolean(item.email)).length,
        sem_email: targets.filter((item) => !item.email).length,
        com_whatsapp: targets.filter((item) => Boolean(item.telefone)).length,
        sem_whatsapp: targets.filter((item) => !item.telefone).length,
        vencidos: targets.filter((item) => item.status_compliance === 'VENCIDO').length,
        nunca_realizados: targets.filter((item) => item.status_compliance === 'NAO_REALIZADO')
          .length,
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
    if (!channels.email && !channels.whatsapp)
      throw new ApiError('Selecione e-mail e/ou WhatsApp', 400);
    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const targets = selectedComplianceTargets(empresaId, snapshot, requested);
    if (!targets.length)
      throw new ApiError('Nenhuma pendência válida encontrada no seu escopo', 404);
    const triggerKey = `MANUAL_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const results: Awaited<ReturnType<typeof sendComplianceNotification>>[] = [];
    for (let index = 0; index < targets.length; index += 5) {
      const chunk = targets.slice(index, index + 5);
      results.push(
        ...(await Promise.all(
          chunk.map((target) =>
            sendComplianceNotification(c.env, c.env.DB, target, channels, triggerKey),
          ),
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
    const rawLimit = Number(c.req.query('limit') || 100);
    const rawOffset = Number(c.req.query('offset') || 0);
    const validDate = (value: string | undefined) =>
      !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
    const inicio = c.req.query('inicio');
    const fim = c.req.query('fim');
    if (!validDate(inicio) || !validDate(fim) || (inicio && fim && inicio > fim)) {
      throw new ApiError('Período de comunicações inválido', 400);
    }
    if (!Number.isInteger(rawLimit) || rawLimit < 1 ||
        !Number.isInteger(rawOffset) || rawOffset < 0) {
      throw new ApiError('Paginação de comunicações inválida', 400);
    }
    const canal = c.req.query('canal');
    const origem = c.req.query('origem');
    const resultado = c.req.query('resultado');
    if ((canal && !['EMAIL', 'WHATSAPP'].includes(canal)) ||
        (origem && !['COMPLIANCE', 'LMS_ALERTA', 'LMS_CONVITE'].includes(origem)) ||
        (resultado && !['enviada', 'erro', 'sem_contato'].includes(resultado))) {
      throw new ApiError('Filtro de comunicações inválido', 400);
    }
    const limit = Math.min(200, rawLimit);
    const offset = rawOffset;
    const history = await listTrainingCommunications(
      c.env.DB,
      empresaId,
      access,
      {
        notifications: await tableExists(c.env.DB, 'notificacoes_log'),
        audit: await tableExists(c.env.DB, 'audit_logs'),
      },
      {
        funcionario_q: c.req.query('funcionario_q'),
        treinamento_q: c.req.query('treinamento_q') || c.req.query('q'),
        canal: canal as 'EMAIL' | 'WHATSAPP' | undefined,
        origem: origem as 'COMPLIANCE' | 'LMS_ALERTA' | 'LMS_CONVITE' | undefined,
        resultado: resultado as 'enviada' | 'erro' | 'sem_contato' | undefined,
        inicio,
        fim,
        setor_id: asPositiveInt(c.req.query('setor_id')) || undefined,
        funcao_id: asPositiveInt(c.req.query('funcao_id')) || undefined,
        limit,
        offset,
      },
    );
    return c.json({
      success: true,
      data: history.rows,
      pagination: { limit, offset, has_more: history.has_more },
    });
  });

  app.get('/relatorios/automacao', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const data = await getComplianceReportAutomationPolicy(c.env.DB, empresaId);
    return c.json({ success: true, data });
  });

  app.put('/relatorios/automacao', requireRole('admin'), async (c) => {
    const empresaId = getEmpresaId(c);
    const payload = await c.req.json().catch(() => ({}));
    const previous = await getComplianceReportAutomationPolicy(c.env.DB, empresaId);
    const normalized = normalizeComplianceReportAutomationPolicy(payload);
    if (normalized.enabled && !normalized.sector_ids.length) {
      throw new ApiError('Selecione ao menos um setor antes de ativar o envio', 400);
    }
    if (normalized.sector_ids.length) {
      const placeholders = normalized.sector_ids.map(() => '?').join(',');
      const rows = await c.env.DB.prepare(
        `SELECT id FROM setores
            WHERE empresa_id = ? AND id IN (${placeholders})
              AND deleted_at IS NULL AND COALESCE(ativo,1)=1`,
      )
        .bind(empresaId, ...normalized.sector_ids)
        .all<{ id: number }>();
      if ((rows.results || []).length !== normalized.sector_ids.length) {
        throw new ApiError('Um ou mais setores da automacao sao invalidos', 400);
      }
    }
    const data = await saveComplianceReportAutomationPolicy(c.env.DB, empresaId, normalized);
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'compliance_relatorios_config',
      acao: 'UPDATE',
      registro_id: empresaId,
      dados_anteriores: previous,
      dados_novos: data,
      ...extrairUsuarioAuditoria(c),
    });
    return c.json({ success: true, data });
  });

  app.post('/relatorios/enviar-gestores', requireRole('admin', 'manager'), async (c) => {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const payload = (await c.req.json().catch(() => ({}))) as {
      setor_ids?: unknown[];
      filters?: Record<string, unknown>;
    };
    const setorIds = [
      ...new Set(
        (Array.isArray(payload.setor_ids) ? payload.setor_ids : [])
          .map(asPositiveInt)
          .filter((id): id is number => id !== null),
      ),
    ].slice(0, 50);
    if (!setorIds.length) throw new ApiError('Selecione ao menos um setor', 400);
    const allowed = filterRequestedSetorIdsByAccess(setorIds, access);
    if (allowed.length !== setorIds.length)
      throw new ApiError('Setor fora do escopo do gestor', 403);
    const rawFilters = payload.filters || {};
    const allowedStatuses = new Set<TrainingComplianceStatus>([
      'CONFORME',
      'VENCENDO',
      'VENCIDO',
      'NAO_REALIZADO',
      'EM_ANDAMENTO',
    ]);
    const statuses = Array.isArray(rawFilters.statuses)
      ? rawFilters.statuses
          .map((item) => String(item).toUpperCase())
          .filter((item): item is TrainingComplianceStatus =>
            allowedStatuses.has(item as TrainingComplianceStatus),
          )
      : undefined;
    const dueRaw = rawFilters.ate_dias;
    const due = dueRaw === null || dueRaw === undefined || dueRaw === '' ? null : Number(dueRaw);
    const filters: TrainingComplianceReportFilters = {
      funcao_id: asPositiveInt(rawFilters.funcao_id),
      funcionario_id: asPositiveInt(rawFilters.funcionario_id),
      qualificacao_tipo_id: asPositiveInt(rawFilters.qualificacao_tipo_id),
      statuses,
      critico: rawFilters.critico === true,
      ate_dias: Number.isFinite(due) ? Number(due) : null,
    };
    const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
    const company = await c.env.DB.prepare(
      'SELECT nome FROM empresas WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(empresaId)
      .first<{ nome: string }>();
    const placeholders = setorIds.map(() => '?').join(',');
    const sectors = await c.env.DB.prepare(
      `SELECT id, nome FROM setores
          WHERE empresa_id = ? AND id IN (${placeholders})
            AND deleted_at IS NULL AND COALESCE(ativo,1)=1
          ORDER BY nome`,
    )
      .bind(empresaId, ...setorIds)
      .all<{ id: number; nome: string }>();
    if ((sectors.results || []).length !== setorIds.length) {
      throw new ApiError('Um ou mais setores nao foram encontrados', 404);
    }
    const details = [] as Array<{
      setor_id: number;
      setor_nome: string;
      enviados: number;
      erro: string | null;
    }>;
    for (const sector of sectors.results || []) {
      const rows = buildTrainingComplianceReportRows(snapshot, {
        ...filters,
        setor_id: Number(sector.id),
      });
      const result = await sendTrainingComplianceReportToSectorManagers({
        env: c.env,
        db: c.env.DB,
        empresaId,
        empresaNome: company?.nome || 'Empresa',
        setorId: Number(sector.id),
        setorNome: sector.nome,
        rows,
      });
      details.push({
        setor_id: Number(sector.id),
        setor_nome: sector.nome,
        enviados: result.sent ? result.recipients : 0,
        erro: result.error,
      });
    }
    const sentSectors = details.filter((item) => !item.erro).length;
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'compliance_relatorios',
      acao: 'CONVOCACAO_EMAIL',
      registro_id: `multi:${Date.now()}`,
      dados_novos: {
        empresa_id: empresaId,
        setor_ids: setorIds,
        filtros: filters,
        setores_enviados: sentSectors,
        setores_falha: details.length - sentSectors,
      },
      ...extrairUsuarioAuditoria(c),
    });
    if (!sentSectors)
      throw new ApiError('Nao foi possivel enviar o relatorio a nenhum gestor', 502);
    return c.json({
      success: true,
      data: {
        setores: details.length,
        setores_enviados: sentSectors,
        destinatarios: details.reduce((sum, item) => sum + item.enviados, 0),
        detalhes: details,
      },
    });
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
    const setor = await c.env.DB.prepare(
      'SELECT nome FROM setores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(setorId, empresaId)
      .first<{ nome: string }>();
    if (!setor) throw new ApiError('Setor não encontrado', 404);
    const pdf = String(payload.pdf_base64 || '').replace(/^data:application\/pdf;base64,/, '');
    if (!pdf || pdf.length > 9_500_000)
      throw new ApiError('PDF ausente ou acima do limite permitido', 400);
    try {
      const header = atob(pdf.slice(0, 16));
      if (!header.startsWith('%PDF')) throw new Error('invalid');
    } catch {
      throw new ApiError('Arquivo PDF inválido', 400);
    }
    const managers = await getSetorGestoresBySetor(c.env.DB, empresaId, setorId, true);
    const recipients = [
      ...new Map(
        managers
          .filter((item) => String(item.gestor_email || '').includes('@'))
          .map((item) => [
            String(item.gestor_email).trim().toLowerCase(),
            { email: String(item.gestor_email).trim(), name: item.gestor_nome },
          ]),
      ).values(),
    ];
    if (!recipients.length)
      throw new ApiError('Nenhum gestor com e-mail válido está vinculado ao setor', 409);
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
