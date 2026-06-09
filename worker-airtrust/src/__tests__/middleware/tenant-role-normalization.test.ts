import { describe, expect, it } from 'vitest';
import { normalizeTenantRole } from '../../middleware/tenant';

describe('normalizeTenantRole — PT-BR role vocabulary coverage', () => {
  // ─── PT‑BR: instrutor ──────────────────────────────────────────
  it('maps PT-BR "instrutor" to "instructor"', () => {
    expect(normalizeTenantRole('instrutor')).toBe('instructor');
  });

  it('maps uppercase "INSTRUTOR" to "instructor"', () => {
    expect(normalizeTenantRole('INSTRUTOR')).toBe('instructor');
  });

  it('maps mixed-case "Instrutor" to "instructor"', () => {
    expect(normalizeTenantRole('Instrutor')).toBe('instructor');
  });

  // ─── PT‑BR: aluno ──────────────────────────────────────────────
  it('maps PT-BR "aluno" to "student"', () => {
    expect(normalizeTenantRole('aluno')).toBe('student');
  });

  it('maps uppercase "ALUNO" to "student"', () => {
    expect(normalizeTenantRole('ALUNO')).toBe('student');
  });

  it('maps "member" to "student"', () => {
    expect(normalizeTenantRole('member')).toBe('student');
  });

  it('maps "MEMBER" to "student"', () => {
    expect(normalizeTenantRole('MEMBER')).toBe('student');
  });

  // ─── English still works ───────────────────────────────────────
  it('keeps English "instructor" → "instructor"', () => {
    expect(normalizeTenantRole('instructor')).toBe('instructor');
  });

  it('keeps English "student" → "student"', () => {
    expect(normalizeTenantRole('student')).toBe('student');
  });

  // ─── Regression: canonical roles ───────────────────────────────
  it('maps "admin" → "admin"', () => {
    expect(normalizeTenantRole('admin')).toBe('admin');
  });

  it('maps "administrador" → "admin"', () => {
    expect(normalizeTenantRole('administrador')).toBe('admin');
  });

  it('maps "manager" → "manager"', () => {
    expect(normalizeTenantRole('manager')).toBe('manager');
  });

  it('maps "gestor" → "manager"', () => {
    expect(normalizeTenantRole('gestor')).toBe('manager');
  });

  it('maps "editor" → "editor"', () => {
    expect(normalizeTenantRole('editor')).toBe('editor');
  });

  it('maps "viewer" → "viewer"', () => {
    expect(normalizeTenantRole('viewer')).toBe('viewer');
  });

  // ─── Fail‑closed: unknown / empty / null ───────────────────────
  it('falls back to "viewer" for unknown roles', () => {
    expect(normalizeTenantRole('superadmin')).toBe('viewer');
  });

  it('falls back to "viewer" for empty string', () => {
    expect(normalizeTenantRole('')).toBe('viewer');
  });

  it('falls back to "viewer" for null/undefined', () => {
    expect(normalizeTenantRole(null)).toBe('viewer');
    expect(normalizeTenantRole(undefined)).toBe('viewer');
  });

  // ─── No privilege escalation ───────────────────────────────────
  it('does not map unknown PT-BR roles to admin', () => {
    // "diretor", "piloto" etc must stay viewer
    expect(normalizeTenantRole('diretor')).toBe('viewer');
    expect(normalizeTenantRole('piloto')).toBe('viewer');
  });

  it('does not escalate aluno/instrutor above their canonical level', () => {
    const alunoRole = normalizeTenantRole('aluno');
    const instrutorRole = normalizeTenantRole('instrutor');
    // student < instructor < manager < admin in hierarchy
    expect(alunoRole).not.toBe('admin');
    expect(alunoRole).not.toBe('manager');
    expect(instrutorRole).not.toBe('admin');
    expect(instrutorRole).not.toBe('manager');
  });
});
