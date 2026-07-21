import { describe, expect, it } from 'vitest';
import { ApiError } from '../../middleware/error-handler';
import {
  assertCasApplied,
  requireExpectedRdvVersion,
} from '../../services/controle-voos/rdv-workflow';

// Unit tests para os dois helpers introduzidos para corrigir a concorrência
// otimista das transições de fluxo do RDV (achado A2 da auditoria do PR
// #419): `versao` obrigatória em vez de opcional, e verificação de
// `meta.changes` após o UPDATE otimista (janela entre o SELECT que validou
// a versão e o UPDATE em si — só reproduzível de ponta a ponta com duas
// conexões D1 concorrentes reais, por isso testada aqui isoladamente no
// nível do helper).

describe('requireExpectedRdvVersion', () => {
  it('rejeita payload sem o campo versao', () => {
    expect(() => requireExpectedRdvVersion({})).toThrow(ApiError);
    try {
      requireExpectedRdvVersion({});
    } catch (error) {
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).code).toBe('CONTROLE_VOOS_RDV_VERSION_REQUIRED');
    }
  });

  it('rejeita versao null, undefined ou string vazia', () => {
    for (const value of [null, undefined, '']) {
      expect(() => requireExpectedRdvVersion({ versao: value })).toThrow(ApiError);
    }
  });

  it('rejeita versao nao inteira ou menor que 1', () => {
    for (const value of ['abc', 0, -1, 1.5, '1.5']) {
      try {
        requireExpectedRdvVersion({ versao: value });
        expect.unreachable(`deveria ter lancado para versao=${value}`);
      } catch (error) {
        expect((error as ApiError).statusCode).toBe(400);
        expect((error as ApiError).code).toBe('CONTROLE_VOOS_RDV_VERSION_INVALID');
      }
    }
  });

  it('aceita e normaliza versao numerica ou em string', () => {
    expect(requireExpectedRdvVersion({ versao: 3 })).toBe(3);
    expect(requireExpectedRdvVersion({ versao: '3' })).toBe(3);
  });
});

describe('assertCasApplied', () => {
  it('nao lanca quando o UPDATE otimista afetou uma linha', () => {
    expect(() => assertCasApplied({ meta: { changes: 1 } })).not.toThrow();
  });

  it('lanca 409 CONTROLE_VOOS_RDV_VERSION_CONFLICT quando o UPDATE afetou zero linhas', () => {
    // Simula a corrida real: outra requisicao venceu entre o SELECT que
    // validou `assertRdvVersion` e este UPDATE, entao o WHERE versao = ?
    // nao encontrou a linha esperada mesmo com o payload validado.
    try {
      assertCasApplied({ meta: { changes: 0 } });
      expect.unreachable('deveria ter lancado');
    } catch (error) {
      expect((error as ApiError).statusCode).toBe(409);
      expect((error as ApiError).code).toBe('CONTROLE_VOOS_RDV_VERSION_CONFLICT');
    }
  });
});
