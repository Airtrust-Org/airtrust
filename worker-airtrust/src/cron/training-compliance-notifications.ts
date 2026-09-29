import type { Env } from '../types';
import { buildSnapshot } from '../routes/compliance-treinamentos';
import type { EmployeeSectorAccess } from '../services/employee-sector-access';
import { persistTrainingComplianceDailySnapshots } from '../services/training-compliance-snapshots';

const ALL_ACCESS: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };

export async function refreshTrainingComplianceSnapshots(env: Env): Promise<{
  empresas: number;
  gravados: number;
  falhas: number;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const companies = await env.DB
    .prepare('SELECT id FROM empresas WHERE deleted_at IS NULL ORDER BY id')
    .all<{ id: number }>();

  let written = 0;
  let failures = 0;

  for (const company of companies.results || []) {
    const empresaId = Number(company.id);
    if (!empresaId) continue;
    try {
      const snapshot = await buildSnapshot(env.DB, empresaId, ALL_ACCESS);
      const result = await persistTrainingComplianceDailySnapshots(
        env.DB,
        empresaId,
        snapshot.people,
        today,
      );
      written += result.written;
    } catch (error) {
      failures += 1;
      console.error('[training-compliance-snapshots] Falha ao processar empresa', empresaId, error);
    }
  }

  return {
    empresas: (companies.results || []).length,
    gravados: written,
    falhas: failures,
  };
}

/**
 * Compatibilidade para chamadas antigas. A comunicação automática foi desativada
 * neste caminho; alertas de treinamento são responsabilidade exclusiva da régua
 * canônica em cron/notificacoes.ts.
 */
export async function processTrainingComplianceNotifications(_env: Env): Promise<{
  empresas: number;
  avaliadas: number;
  enviadas: number;
  gestores: number;
  falhas: number;
}> {
  return { empresas: 0, avaliadas: 0, enviadas: 0, gestores: 0, falhas: 0 };
}
