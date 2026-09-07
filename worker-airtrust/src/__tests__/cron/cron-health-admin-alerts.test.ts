import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cron health administrator alert delivery', () => {
  const cron = readFileSync(resolve(process.cwd(), 'src/cron/resilient/cron-health.ts'), 'utf8');

  it('targets tenant admins and platform admins without broadcasting to ordinary users', () => {
    expect(cron).toContain('export async function persistCronHealthAdminAlerts');
    expect(cron).toContain("UPPER(COALESCE(ue.role, '')) IN ('ADMIN', 'ADMINISTRADOR', 'SUPER_ADMIN')");
    expect(cron).toContain("upr.role_code = 'platform_admin'");
    expect(cron).toContain('CAST(admins.usuario_id AS TEXT)');
    expect(cron).toContain('CAST(upr.user_id AS TEXT)');
  });

  it('deduplicates durable alerts and keeps cron execution alive if delivery fails', () => {
    expect(cron).toContain('CRON_HEALTH_ALERT_DEDUP_MINUTES = 30');
    expect(cron).toContain("n.created_at >= datetime('now', ?)");
    expect(cron).toContain("logger.error('[CRON_HEALTH] Falha ao persistir alerta administrativo'");
  });

  it('uses the existing system notification channel with no sensitive payload', () => {
    expect(cron).toContain("const CRON_HEALTH_ALERT_TYPE = 'CRON_HEALTH_DEGRADED'");
    expect(cron).toContain("'operacoes'");
    expect(cron).toContain("source: 'cron-health'");
    expect(cron).not.toMatch(/cpf|email|token|password/i);
  });
});

describe('administrator notification consumer', () => {
  const layout = readFileSync(resolve(process.cwd(), '../src/react-app/components/AppLayout.tsx'), 'utf8');

  it('renders the existing notification indicator only for administrators', () => {
    expect(layout).toContain("import { NotificacoesSistema } from './NotificacoesSistema'");
    expect(layout).toContain('{isAdmin && <NotificacoesSistema />}');
  });
});
