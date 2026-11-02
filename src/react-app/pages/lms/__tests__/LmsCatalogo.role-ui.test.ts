import { describe, expect, it } from 'vitest';
import { canMutateLmsCourse, resolveLmsCatalogRoleView, shouldLoadPersonalEnrollments } from '../LmsCatalogo';

describe('resolveLmsCatalogRoleView', () => {
  it('remove filtros administrativos e usa visão limpa para aluno', () => {
    expect(
      resolveLmsCatalogRoleView({
        canManage: false,
        restrictToEnrolledCourses: true,
      }),
    ).toEqual({
      showAdministrativeFilters: false,
      title: 'Cursos matriculados',
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
      title: 'Cursos matriculados',
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

describe('personal enrollment query by catalog role', () => {
  it('does not request employee-linked enrollments for admin or gestor in management view', () => {
    expect(shouldLoadPersonalEnrollments(true, false)).toBe(false);
  });

  it('loads existing enrollments for COMPLIANCE/USUARIO without ALUNO or INSTRUTOR role', () => {
    // No management privilege and no explicit learner tab are required.
    const nonManagerCanResume = shouldLoadPersonalEnrollments(false, false);
    expect(nonManagerCanResume).toBe(true);
    const existingEnrollments = [{ curso_id: 55, status: 'EM_ANDAMENTO' }];
    const visible = nonManagerCanResume ? existingEnrollments : [];
    expect(visible).toContainEqual({ curso_id: 55, status: 'EM_ANDAMENTO' });
  });

  it('loads enrollments for gestores in their personal learner tab', () => {
    expect(shouldLoadPersonalEnrollments(true, true)).toBe(true);
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
