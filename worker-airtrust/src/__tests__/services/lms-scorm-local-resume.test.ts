/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { buildResumeStorageScript } from '../../services/lms-scorm-local-resume';

const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock
});

describe('LMS SCORM Local Resume fail-closed behavior', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  it('migra do legado para a nova chave quando for ciclo 1', () => {
    localStorage.setItem('airtrust:scorm:resume:123', JSON.stringify({ location: '22/40' }));
    
    const script = buildResumeStorageScript({
      matriculaId: 123,
      cicloId: 456,
      numeroCiclo: 1
    });

    const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    // Executa no JSDOM
    const readFn = new Function(script + '; return readLocalResumeBackup();');
    const result = readFn();

    expect(result).toMatchObject({
      schema_version: 2,
      matricula_id: 123,
      ciclo_id: 456,
      numero_ciclo: 1,
      location: '22/40'
    });
    
    // A chave antiga foi deletada e a nova criada
    expect(localStorage.getItem('airtrust:scorm:resume:123')).toBeNull();
    expect(localStorage.getItem('airtrust:scorm:resume:123:456')).toContain('"location":"22/40"');
    expect(mockConsoleInfo).not.toHaveBeenCalled();
  });

  it('NAO migra do legado se numero_ciclo > 1 (fail-closed) e preserva a chave legado', () => {
    localStorage.setItem('airtrust:scorm:resume:123', JSON.stringify({ location: '22/40' }));
    
    const script = buildResumeStorageScript({
      matriculaId: 123,
      cicloId: 457,
      numeroCiclo: 2
    });

    const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const readFn = new Function(script + '; return readLocalResumeBackup();');
    const result = readFn();

    // Rejeitado silenciosamente e loga telemetria
    expect(result).toBeNull();
    expect(mockConsoleInfo).toHaveBeenCalledWith('[SCORM_TELEMETRY] LEGACY_RESUME_AMBIGUOUS', expect.anything());

    // Legado não foi deletado
    expect(localStorage.getItem('airtrust:scorm:resume:123')).not.toBeNull();
    // Chave nova não foi criada
    expect(localStorage.getItem('airtrust:scorm:resume:123:457')).toBeNull();
  });

  it('se JSON legado for inválido, rejeita sem apagar (mesmo no ciclo 1)', () => {
    localStorage.setItem('airtrust:scorm:resume:123', 'NOT_JSON');
    
    const script = buildResumeStorageScript({
      matriculaId: 123,
      cicloId: 456,
      numeroCiclo: 1
    });

    const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const readFn = new Function(script + '; return readLocalResumeBackup();');
    const result = readFn();

    expect(result).toBeNull();
    expect(mockConsoleInfo).toHaveBeenCalledWith('[SCORM_TELEMETRY] LEGACY_RESUME_INVALID', expect.anything());
    expect(localStorage.getItem('airtrust:scorm:resume:123')).toBe('NOT_JSON');
  });

  it('chave nova com schema v2 e ciclo correto é aceita e legado é ignorado', () => {
    localStorage.setItem('airtrust:scorm:resume:123:456', JSON.stringify({
      schema_version: 2,
      matricula_id: 123,
      ciclo_id: 456,
      numero_ciclo: 1,
      location: '10/40'
    }));
    localStorage.setItem('airtrust:scorm:resume:123', JSON.stringify({ location: '22/40' }));
    
    const script = buildResumeStorageScript({
      matriculaId: 123,
      cicloId: 456,
      numeroCiclo: 1
    });

    const readFn = new Function(script + '; return readLocalResumeBackup();');
    const result = readFn();

    expect(result.location).toBe('10/40');
  });

  it('rejeita se a chave nova schema v2 tiver ciclo errado', () => {
    localStorage.setItem('airtrust:scorm:resume:123:456', JSON.stringify({
      schema_version: 2,
      matricula_id: 123,
      ciclo_id: 999,
      numero_ciclo: 1,
      location: '10/40'
    }));
    
    const script = buildResumeStorageScript({
      matriculaId: 123,
      cicloId: 456,
      numeroCiclo: 1
    });

    const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const readFn = new Function(script + '; return readLocalResumeBackup();');
    const result = readFn();

    expect(result).toBeNull();
    expect(mockConsoleInfo).toHaveBeenCalledWith('[SCORM_TELEMETRY] RESUME_SCHEMA_MISMATCH', expect.anything());
  });

  it('clearLocalResumeBackup apaga APENAS a chave nova', () => {
    localStorage.setItem('airtrust:scorm:resume:123:456', 'NOVA');
    localStorage.setItem('airtrust:scorm:resume:123', 'LEGADA');

    const script = buildResumeStorageScript({
      matriculaId: 123,
      cicloId: 456,
      numeroCiclo: 1
    });

    const clearFn = new Function(script + '; clearLocalResumeBackup();');
    clearFn();

    expect(localStorage.getItem('airtrust:scorm:resume:123:456')).toBeNull();
    expect(localStorage.getItem('airtrust:scorm:resume:123')).toBe('LEGADA');
  });
});
