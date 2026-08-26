import { describe, expect, it } from 'vitest';
import { buildQualificationHistoryDomainColumn } from '../../routes/qualificacoes/historico-domain';

const MANAGED_EMPLOYEE_SECTOR_DOMAIN_SQL = `(SELECT s.dominio_codigo
    FROM setores s
    WHERE s.id = f.setor_id
      AND s.empresa_id = f.empresa_id
      AND s.ativo = 1
      AND s.deleted_at IS NULL
    LIMIT 1)`;

describe('qualification history read scope for transversal qualifications', () => {
  it('authorizes reads by the managed employee setor even when tipo domain override exists', () => {
    expect(buildQualificationHistoryDomainColumn(true)).toBe(MANAGED_EMPLOYEE_SECTOR_DOMAIN_SQL);
  });

  it('keeps the same employee-setor read boundary on pre-0454 schemas', () => {
    expect(buildQualificationHistoryDomainColumn(false)).toBe(MANAGED_EMPLOYEE_SECTOR_DOMAIN_SQL);
  });
});
