import { describe, expect, it } from 'vitest';
import { mapEffectivenessNivelToBiologicalLevel } from '../../lib/frms/frms-iogp-biological-adapter';

describe('mapEffectivenessNivelToBiologicalLevel — adapter from canonical engine to IOGP shadow', () => {
  describe('canonical verde band', () => {
    it("maps 'verde' to NORMAL", () => {
      expect(mapEffectivenessNivelToBiologicalLevel('verde')).toBe('NORMAL');
    });

    it('is case-insensitive for verde', () => {
      expect(mapEffectivenessNivelToBiologicalLevel('Verde')).toBe('NORMAL');
      expect(mapEffectivenessNivelToBiologicalLevel('VERDE')).toBe('NORMAL');
    });
  });

  describe('elevated band — amarelo and transição', () => {
    it("maps 'amarelo' to ELEVATED", () => {
      expect(mapEffectivenessNivelToBiologicalLevel('amarelo')).toBe('ELEVATED');
    });

    it("maps 'transição' (unicode) to ELEVATED", () => {
      expect(mapEffectivenessNivelToBiologicalLevel('transição')).toBe('ELEVATED');
    });

    it("maps 'transicao' (ASCII fallback) to ELEVATED", () => {
      expect(mapEffectivenessNivelToBiologicalLevel('transicao')).toBe('ELEVATED');
    });
  });

  describe('high band — vermelho', () => {
    it("maps 'vermelho' to HIGH", () => {
      expect(mapEffectivenessNivelToBiologicalLevel('vermelho')).toBe('HIGH');
    });

    it('is case-insensitive for vermelho', () => {
      expect(mapEffectivenessNivelToBiologicalLevel('VERMELHO')).toBe('HIGH');
    });
  });

  describe('unknown handling — fail conservative', () => {
    it('maps null to UNKNOWN', () => {
      expect(mapEffectivenessNivelToBiologicalLevel(null)).toBe('UNKNOWN');
    });

    it('maps undefined to UNKNOWN', () => {
      expect(mapEffectivenessNivelToBiologicalLevel(undefined)).toBe('UNKNOWN');
    });

    it('maps empty string to UNKNOWN', () => {
      expect(mapEffectivenessNivelToBiologicalLevel('')).toBe('UNKNOWN');
    });

    it('maps unrecognized value to UNKNOWN', () => {
      expect(mapEffectivenessNivelToBiologicalLevel('desconhecido')).toBe('UNKNOWN');
      expect(mapEffectivenessNivelToBiologicalLevel('N/A')).toBe('UNKNOWN');
      expect(mapEffectivenessNivelToBiologicalLevel('95')).toBe('UNKNOWN');
    });
  });

  describe('invariant — never recalculates fatigue', () => {
    it('is a pure synchronous function — no async, no DB access', () => {
      // The return type is a string literal, not a Promise.
      const result = mapEffectivenessNivelToBiologicalLevel('verde');
      expect(typeof result).toBe('string');
      expect(result).not.toBeInstanceOf(Promise);
    });
  });
});
