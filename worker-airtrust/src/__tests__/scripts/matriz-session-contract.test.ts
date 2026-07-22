import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AW139_CODES,
  SK76_CODES,
  loadSessionContract,
  validateSessionContract,
  defaultContractPath,
} from '../../../scripts/lib/matriz-session-contract.mjs';

const contractPath = defaultContractPath(join(process.cwd()));
const contract = loadSessionContract(contractPath);

describe('matriz session contract 51', () => {
  it('validates 30 AW139 + 21 S-76 codes and 51/918/22', () => {
    const result = validateSessionContract(contract);
    expect(result.totals).toEqual({ modelos: 51, vinculos: 918, loft: 22 });
    expect(AW139_CODES).toHaveLength(30);
    expect(SK76_CODES).toHaveLength(21);
    expect(contract.sessions.map((s) => s.codigo_canonico)).toEqual(
      expect.arrayContaining(AW139_CODES),
    );
    expect(contract.sessions.map((s) => s.codigo_canonico)).toEqual(
      expect.arrayContaining(SK76_CODES),
    );
    expect(result.aw139).toMatchObject({ INICIAL: 12, PERIODICO: 12, SEMESTRAL: 6, loft: 14 });
    expect(result.sk76).toMatchObject({ INICIAL: 12, PERIODICO: 7, SEMESTRAL: 2, loft: 8 });
  });

  it('rejects swapped codes, duplicates and loft/type tampering while keeping counts', () => {
    const clone = structuredClone(contract);
    clone.sessions[0].codigo_canonico = clone.sessions[1].codigo_canonico;
    expect(() => validateSessionContract(clone)).toThrow(/duplicados|ausente|inválido/);

    const dupHtml = structuredClone(contract);
    dupHtml.sessions[1].html_relpath = dupHtml.sessions[0].html_relpath;
    expect(() => validateSessionContract(dupHtml)).toThrow(/html_relpath/);

    const removed = structuredClone(contract);
    removed.sessions.pop();
    removed.totals.modelos = 50;
    expect(() => validateSessionContract(removed)).toThrow(/51/);

    const cycle = structuredClone(contract);
    const target = cycle.sessions.find((s) => s.codigo_canonico.includes('-C1'));
    target.ciclo = 'C9';
    target.tipo_qualificacao_estruturado = 'INICIAL';
    expect(() => validateSessionContract(cycle)).toThrow();

    const loft = structuredClone(contract);
    loft.sessions.find((s) => s.loft).loft = false;
    loft.totals.loft = 21;
    expect(() => validateSessionContract(loft)).toThrow(/LOFT|22/);
  });

  it('is committed as sanitized JSON without private bodies', () => {
    const raw = readFileSync(contractPath, 'utf8');
    expect(raw).not.toMatch(/<html|password|cpf\b|numero_documento/i);
    expect(JSON.parse(raw).sessions[0]).toHaveProperty('titulo_sanitizado');
  });
});
