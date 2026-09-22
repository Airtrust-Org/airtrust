import type { Env } from '../types';
import { buildSnapshot } from '../routes/compliance-treinamentos';
import type { EmployeeSectorAccess } from '../services/employee-sector-access';
import {
  getComplianceNotificationPolicy,
  hasSuccessfulComplianceLog,
  latestNeverDoneNotificationAt,
  notifySectorManagersForOverdue,
  selectDueThreshold,
  sendComplianceNotification,
  type ComplianceNotificationTarget,
} from '../services/training-compliance-notifications';
import { persistTrainingComplianceDailySnapshots } from '../services/training-compliance-snapshots';

const ALL_ACCESS: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };

function toTarget(
  empresaId: number,
  person: Awaited<ReturnType<typeof buildSnapshot>>['people'][number],
  requirement: Awaited<ReturnType<typeof buildSnapshot>>['people'][number]['requisitos'][number],
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

function daysSince(value: string, now: Date): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - timestamp) / 86_400_000);
}

export async function processTrainingComplianceNotifications(env: Env): Promise<{
  empresas: number;
  avaliadas: number;
  enviadas: number;
  gestores: number;
  falhas: number;
}> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const companies = await env.DB
    .prepare('SELECT id FROM empresas WHERE deleted_at IS NULL ORDER BY id')
    .all<{ id: number }>();

  let evaluated = 0;
  let sent = 0;
  let managersSent = 0;
  let failures = 0;

  for (const company of companies.results || []) {
    const empresaId = Number(company.id);
    if (!empresaId) continue;
    try {
      const snapshot = await buildSnapshot(env.DB, empresaId, ALL_ACCESS);
      await persistTrainingComplianceDailySnapshots(env.DB, empresaId, snapshot.people, today);

      const policy = await getComplianceNotificationPolicy(env.DB, empresaId);
      if (!policy.enabled || (!policy.email && !policy.whatsapp)) continue;

      for (const person of snapshot.people) {
        for (const requirement of person.requisitos) {
          if (requirement.obrigatoriedade !== 'OBRIGATORIA') continue;
          if (!['VENCENDO', 'VENCIDO', 'NAO_REALIZADO'].includes(requirement.status_compliance)) continue;
          const target = toTarget(empresaId, person, requirement);
          evaluated += 1;

          // CPF is the stable tenant-scoped correlation key used by notificacoes_log.
          // Without it, automatic retries could duplicate indefinitely; manual sending remains available.
          if (!target.funcionario_cpf) continue;

          let employeeTrigger: string | null = null;
          if (target.status_compliance === 'NAO_REALIZADO') {
            const latest = await latestNeverDoneNotificationAt(env.DB, target);
            if (!latest || daysSince(latest, now) >= policy.never_done_every_days) {
              employeeTrigger = `NEVER_${today}`;
            }
          } else if (target.dias_para_vencer != null) {
            const threshold = selectDueThreshold(target.dias_para_vencer, policy.due_day_thresholds);
            if (threshold != null) {
              const cycle = target.data_validade || 'SEM_DATA';
              employeeTrigger = `DUE_${cycle}_${threshold}`;
              if (await hasSuccessfulComplianceLog(env.DB, target, employeeTrigger)) {
                employeeTrigger = null;
              }
            }
          }

          if (employeeTrigger) {
            const result = await sendComplianceNotification(
              env,
              env.DB,
              target,
              { email: policy.email, whatsapp: policy.whatsapp },
              employeeTrigger,
            );
            const successes = Number(result.email.ok) + Number(result.whatsapp.ok);
            sent += successes;
            if (successes === 0 && (result.email.attempted || result.whatsapp.attempted)) failures += 1;
          }

          if (
            policy.notify_manager_on_overdue &&
            target.status_compliance === 'VENCIDO' &&
            target.dias_para_vencer != null
          ) {
            const threshold = selectDueThreshold(
              target.dias_para_vencer,
              policy.manager_overdue_thresholds,
            );
            if (threshold != null) {
              const cycle = target.data_validade || 'SEM_DATA';
              const managerTrigger = `OVERDUE_${cycle}_${threshold}`;
              if (!(await hasSuccessfulComplianceLog(env.DB, target, managerTrigger, true))) {
                managersSent += await notifySectorManagersForOverdue(
                  env,
                  env.DB,
                  target,
                  managerTrigger,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      failures += 1;
      console.error('[training-compliance] Falha ao processar empresa', empresaId, error);
    }
  }

  return {
    empresas: (companies.results || []).length,
    avaliadas: evaluated,
    enviadas: sent,
    gestores: managersSent,
    falhas: failures,
  };
}
