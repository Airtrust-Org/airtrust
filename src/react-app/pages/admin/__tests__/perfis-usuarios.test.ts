import { describe, expect, it } from 'vitest';
import {
  PERFIS_USUARIOS,
  normalizePerfilUsuario,
  perfilUsuarioLabel,
  perfisUsuariosSelecionaveis,
} from '../perfis-usuarios';

describe('gestão de usuários — padronização de perfis', () => {
  it('oferece uma única opção por perfil e por rótulo', () => {
    expect(new Set(PERFIS_USUARIOS.map((p) => p.value)).size).toBe(PERFIS_USUARIOS.length);
    expect(new Set(PERFIS_USUARIOS.map((p) => p.label)).size).toBe(PERFIS_USUARIOS.length);
    expect(PERFIS_USUARIOS.filter((p) => p.label === 'Aluno')).toHaveLength(1);
  });

  it.each([
    ['ADMIN', 'ADMINISTRADOR', 'Administrador Geral'],
    ['MANAGER', 'GESTOR', 'Administrador da Empresa'],
    ['INSTRUCTOR', 'INSTRUTOR', 'Instrutor'],
    ['STUDENT', 'ALUNO', 'Aluno'],
    [' aluno ', 'ALUNO', 'Aluno'],
    ['MEMBER', 'ALUNO', 'Aluno'],
    ['USER', 'USUARIO', 'Usuário'],
    ['VIEWER', 'VIEWER', 'Visualizador'],
    ['EDITOR', 'EDITOR', 'Editor'],
  ])('exibe %s como %s (%s) sem alterar as permissões', (raw, normalized, label) => {
    expect(normalizePerfilUsuario(raw)).toBe(normalized);
    expect(perfilUsuarioLabel(raw)).toBe(label);
  });

  it('não apresenta perfil desconhecido como aluno', () => {
    expect(perfilUsuarioLabel('CUSTOM_ROLE')).toBe('CUSTOM_ROLE');
    expect(perfilUsuarioLabel(null)).toBe('Sem perfil');
  });

  it('não oferece atribuição administrativa a gestores', () => {
    const gestorValues = perfisUsuariosSelecionaveis(false).map((p) => p.value);
    expect(gestorValues).not.toContain('ADMINISTRADOR');
    expect(gestorValues).not.toContain('GESTOR');
    expect(gestorValues).not.toContain('COORDENACAO_VOO');
    expect(gestorValues).toContain('ALUNO');
    expect(gestorValues).not.toContain('USUARIO'); // viewer reservado à Coordenação
    expect(perfisUsuariosSelecionaveis(true).map((p) => p.value)).toContain('COORDENACAO_VOO');
  });
});
