import { describe, expect, it } from 'vitest';
import { resolveLmsCatalogRoleView } from '../LmsCatalogo';

describe('resolveLmsCatalogRoleView', () => {
  it('remove filtros administrativos e usa visão limpa para aluno', () => {
    expect(
      resolveLmsCatalogRoleView({
        canManage: false,
        restrictToEnrolledCourses: true,
      }),
    ).toEqual({
      showAdministrativeFilters: false,
      title: 'Meus treinamentos',
    });
  });

  it('remove filtros administrativos e usa visão limpa para instrutor', () => {
    expect(
      resolveLmsCatalogRoleView({
        canManage: false,
        restrictToEnrolledCourses: true,
      }),
    ).toEqual({
      showAdministrativeFilters: false,
      title: 'Meus treinamentos',
    });
  });

  it('preserva filtros administrativos para gestor e admin', () => {
    expect(
      resolveLmsCatalogRoleView({
        canManage: true,
        restrictToEnrolledCourses: false,
      }),
    ).toEqual({
      showAdministrativeFilters: true,
      title: 'Catálogo LMS',
    });
  });
});
