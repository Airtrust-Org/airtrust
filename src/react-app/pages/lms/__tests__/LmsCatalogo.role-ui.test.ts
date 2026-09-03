import { describe, expect, it } from 'vitest';
import { canMutateLmsCourse, resolveLmsCatalogRoleView } from '../LmsCatalogo';

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

describe('canMutateLmsCourse', () => {
  it('preserva a gestão normal quando o RBAC operacional do tenant está desligado', () => {
    expect(
      canMutateLmsCourse({
        canManage: true,
        operationalAccessReady: true,
        operationalRbacEnabled: false,
        setorIds: [],
        actions: {},
        cursoDomain: 'SGSO',
        action: 'delete',
      }),
    ).toBe(true);
  });

  it('não oferece exclusão para curso fora do domínio operacional do usuário', () => {
    expect(
      canMutateLmsCourse({
        canManage: true,
        operationalAccessReady: true,
        operationalRbacEnabled: true,
        setorIds: [10],
        actions: { OPERACOES: ['update', 'delete'] },
        cursoDomain: 'SGSO',
        action: 'delete',
      }),
    ).toBe(false);
  });

  it('oferece exclusão somente quando a ação está no escopo do domínio do curso', () => {
    expect(
      canMutateLmsCourse({
        canManage: true,
        operationalAccessReady: true,
        operationalRbacEnabled: true,
        setorIds: [10],
        actions: { SGSO: ['update', 'delete'] },
        cursoDomain: 'SGSO',
        action: 'delete',
      }),
    ).toBe(true);
  });

  it('não expõe ação mutável enquanto o escopo ainda está sendo carregado', () => {
    expect(
      canMutateLmsCourse({
        canManage: true,
        operationalAccessReady: false,
        operationalRbacEnabled: false,
        setorIds: [],
        actions: {},
        cursoDomain: 'SGSO',
        action: 'delete',
      }),
    ).toBe(false);
  });
});
