import { describe, expect, it } from 'vitest';
import { resolveSessionEntryDestination, sessionEntryOptions } from '../session-entry-options';

describe('login — entradas operacionais por grupo', () => {
  it('reúne ALUNO e INSTRUTOR em apenas uma entrada com autorização de instrutor', () => {
    expect(sessionEntryOptions(['INSTRUTOR', 'ALUNO'])).toEqual([
      expect.objectContaining({ id: 'learning', role: 'INSTRUTOR', label: 'Aluno / Instrutor' }),
    ]);
  });

  it('um aluno comum não recebe papel de instrutor', () => {
    expect(sessionEntryOptions(['ALUNO'])).toEqual([
      expect.objectContaining({ id: 'learning', role: 'ALUNO' }),
    ]);
  });

  it('GESTOR pode escolher entre gestão e modo Aluno / Instrutor', () => {
    expect(sessionEntryOptions(['GESTOR', 'INSTRUTOR', 'ALUNO']).map(({ id, role, label }) =>
      ({ id, role, label }))).toEqual([
      { id: 'manager', role: 'GESTOR', label: 'Gestor' },
      { id: 'learning', role: 'INSTRUTOR', label: 'Aluno / Instrutor' },
    ]);
  });

  it('GESTOR sem papel de instrutor mantém o modo Aluno sem elevação', () => {
    expect(sessionEntryOptions(['GESTOR', 'ALUNO']).map(({ role }) => role)).toEqual([
      'GESTOR', 'ALUNO',
    ]);
  });

  it('ADMINISTRADOR não vê Aluno nem Instrutor mesmo com perfis legados adicionais', () => {
    expect(sessionEntryOptions(['ADMINISTRADOR', 'GESTOR', 'INSTRUTOR', 'ALUNO'])).toEqual([
      expect.objectContaining({ id: 'admin', role: 'ADMINISTRADOR' }),
    ]);
  });
});

describe('login — destino seguro após escolha de perfil', () => {
  it('reproduz a matrícula #67: Aluno não volta à grade exclusiva de Gestor', () => {
    expect(resolveSessionEntryDestination('ALUNO', '/lms/matriculas/67?refresh=1793200463819')).toBe('/lms');
    expect(resolveSessionEntryDestination('INSTRUTOR', '/lms/matriculas/67')).toBe('/lms');
  });

  it('mantém o mesmo deep-link para gestor autorizado', () => {
    expect(resolveSessionEntryDestination('GESTOR', '/lms/matriculas/67?refresh=1')).toBe('/lms/matriculas/67?refresh=1');
  });

  it('preserva cursos e players válidos para Aluno e Instrutor', () => {
    expect(resolveSessionEntryDestination('ALUNO', '/lms/cursos/67')).toBe('/lms/cursos/67');
    expect(resolveSessionEntryDestination('ALUNO', '/lms/player/859')).toBe('/lms/player/859');
    expect(resolveSessionEntryDestination('INSTRUTOR', '/lms/player/pdf/859?lesson=2')).toBe('/lms/player/pdf/859?lesson=2');
    expect(resolveSessionEntryDestination('ALUNO', '/treinamentos')).toBe('/treinamentos');
  });

  it('não reenvia aluno para páginas administrativas ou para preview de curso', () => {
    for (const path of ['/admin', '/lms/admin/cursos', '/lms/native/revisao', '/lms/player/preview/67', '/configuracoes', '/conhecimento-ativo/admin']) {
      expect(resolveSessionEntryDestination('ALUNO', path)).toBe('/lms');
    }
  });

  it('sem URL de retorno, aluno entra diretamente nos seus treinamentos', () => {
    expect(resolveSessionEntryDestination('ALUNO', '/')).toBe('/lms');
    expect(resolveSessionEntryDestination('INSTRUTOR', null)).toBe('/lms');
    expect(resolveSessionEntryDestination('GESTOR', '/')).toBe('/');
    expect(resolveSessionEntryDestination('COORDENACAO_VOO', '/')).toBe('/controle-voos');
  });

  it('não aceita URLs protocol-relative, absolutas ou backslashes como destino de reload', () => {
    for (const path of ['//outside.example', '/\\outside.example', 'https://outside.example', 'javascript:alert(1)']) {
      expect(resolveSessionEntryDestination('ALUNO', path)).toBe('/lms');
      expect(resolveSessionEntryDestination('GESTOR', path)).toBe('/');
    }
  });

  it('gestor não conserva URL da administração global, mas administrador conserva', () => {
    expect(resolveSessionEntryDestination('GESTOR', '/admin/usuarios')).toBe('/');
    expect(resolveSessionEntryDestination('ADMINISTRADOR', '/admin/usuarios')).toBe('/admin/usuarios');
  });
});
