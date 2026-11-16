import type { Env } from '../types';
import { escalateOverdueCases } from '../lib/frms/case-overdue';
import { getModuleAlertSettings, renderAlertTemplate } from '../services/module-alert-settings';
import { getSaoPauloOperationalDate } from './frms-daily-check';

export interface FrmsCaseOverdueResult {
  empresas: number;
  casosVencidos: number;
  notificacoes: number;
  registros: number;
  falhas: number;
}

/**
 * Escalona, por empresa, os casos de fadiga abertos cujo prazo de tratamento (registrado pelo
 * gestor no próprio caso) já passou. A falha de uma empresa não interrompe as demais.
 */
export async function frmsCaseOverdueEscalation(env: Env): Promise<FrmsCaseOverdueResult> {
  const db = env.DB;
  const hoje = getSaoPauloOperationalDate();
  const tenants = await db
    .prepare(
      `SELECT DISTINCT f.empresa_id AS empresa_id
         FROM frms_alerta a
         JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER) AND f.deleted_at IS NULL
        WHERE a.deleted_at IS NULL
          AND COALESCE(a.resolvido, 0) = 0
          AND a.notas_resolucao IS NOT NULL
          AND f.empresa_id IS NOT NULL
        ORDER BY f.empresa_id`,
    )
    .all<{ empresa_id: number }>();

  const result: FrmsCaseOverdueResult = { empresas: 0, casosVencidos: 0, notificacoes: 0, registros: 0, falhas: 0 };
  for (const row of tenants.results || []) {
    const empresaId = Number(row.empresa_id);
    if (!Number.isInteger(empresaId) || empresaId <= 0) continue;
    try {
      const settings = (await getModuleAlertSettings(db, empresaId)).frms_case_overdue;
      if (!settings.enabled) continue;
      const outcome = await escalateOverdueCases(db, {
        empresaId, hoje, settings, render: renderAlertTemplate,
      });
      result.empresas += 1;
      result.casosVencidos += outcome.vencidos;
      result.notificacoes += outcome.notificado ? 1 : 0;
      result.registros += outcome.registrados;
    } catch {
      // Sem expor SQL ou dados do tenant: a contagem de falhas é o sinal operacional.
      result.falhas += 1;
    }
  }
  return result;
}
