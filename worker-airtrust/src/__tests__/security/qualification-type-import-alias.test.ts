import { describe, expect, it } from 'vitest';
import {
  QualificacaoTipoImportacaoService as CanonicalService,
  QualificacaoTipoImportSchema as canonicalSchema,
} from '../../services/importacao/QualificacaoTipoImportacao';
import {
  QualificacaoTipoImportacaoService as CompatibilityService,
  QualificacaoTipoImportSchema as compatibilitySchema,
} from '../../services/importacao/QualificacaoTipoImportacaoRefactored';

describe('qualification type import canonical compatibility', () => {
  it('resolves both import paths to the same tenant-scoped service and schema', () => {
    expect(CompatibilityService).toBe(CanonicalService);
    expect(compatibilitySchema).toBe(canonicalSchema);
  });

  it('preserves the CSV template through the compatibility path without accessing D1', () => {
    const compat = new CompatibilityService({} as never, 1);
    const canonical = new CanonicalService({} as never, 1);
    expect(compat.getTemplate()).toBe(canonical.getTemplate());
  });
});
