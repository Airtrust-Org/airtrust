import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconcileFdmMaintenance72 } from '../../services/training-compliance-fdm72-reconciliation';

const route = readFileSync(resolve(process.cwd(), 'src/routes/compliance-treinamentos.ts'), 'utf8');
const handler = readFileSync(resolve(process.cwd(), 'src/services/training-compliance-fdm72-reconciliation.ts'), 'utf8');

describe('governed FDM Manutenção 72 reconciliation', () => {
  it('rejects cross-tenant execution before any D1 queries', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    await expect(reconcileFdmMaintenance72(db, 7, {}, {}, async () => ({ rules: [], people: [] })))
      .rejects.toThrow('FDM72_TENANT_MISMATCH');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('rejects missing/ambiguous course-qualification mapping without writing', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const db = { prepare: vi.fn().mockReturnValue({ bind: () => ({ all }) }) } as unknown as D1Database;
    await expect(reconcileFdmMaintenance72(db, 6, {}, {}, async () => ({ rules: [], people: [] })))
      .rejects.toThrow('FDM72_COURSE_QUALIFICATION_MAPPING_INVALID');
    expect(all).toHaveBeenCalledOnce();
  });

  it('requires active mandatory effective rules before reconciliation', async () => {
    const db = { prepare: () => ({ bind: () => ({ all: async () => ({
      results: [{ curso_id: 72, qualificacao_tipo_id: 12 }],
    }) }) }) } as unknown as D1Database;
    await expect(reconcileFdmMaintenance72(db, 6, {}, {}, async () => ({ rules: [], people: [] })))
      .rejects.toThrow('FDM72_OBLIGATORY_RULES_MISSING');
  });

  it('uses administrator-only API and canonical audited enrollment cycle service', () => {
    expect(route).toContain("app.post('/reconciliacao/fdm-mnt72/sincronizar', requireRole('admin')");
    expect(route).toContain("payload?.scope !== 'FDM_MNT_72'");
    expect(route).toContain('payload?.course_id !== 72');
    expect(handler).toContain("UPPER(TRIM(qt.codigo))='FDM-MECANICO'");
    expect(handler).toContain('c.id=72 AND c.empresa_id=? AND c.ativo=1 AND c.publicado=1');
    expect(handler).toContain('reconcileTrainingComplianceRuleEnrollment(');
    expect(handler).not.toMatch(/sendMatriculaEmail|convites\/lote|enviar_convite_email: true/);
  });
});
