import { describe, expect, it } from 'vitest';
import { safeOperationalRbacErrorMessage } from '../operationalDomainRbacUi';

describe('operationalDomainRbacUi', () => {
  it('does not expose backend technical details in visible messages', () => {
    const technicalDetail = 'SQLITE_ERROR: no such column dominio_codigo\n at worker.ts:441:12';

    for (const operation of ['load', 'classify', 'activation'] as const) {
      const message = safeOperationalRbacErrorMessage(operation, technicalDetail);
      expect(message).not.toContain('SQLITE_ERROR');
      expect(message).not.toContain('worker.ts');
      expect(message).not.toContain('dominio_codigo');
    }
  });
});
