import { describe, expect, it } from 'vitest';
import {
  resolveQualificationExportExpiry,
  type QualificationExportExpiryInput,
} from '../../services/qualificacoes/export-expiry';

const base: QualificationExportExpiryInput = {
  validadeMeses: 24,
  dataVencimentoPersistida: null,
  dataRealizacao: '2025-09-03',
  codigoQualificacao: 'EAD_COORDENADOR_VOO',
  nascimentoFuncionario: null,
};

describe('qualificacoes export expiry parity', () => {
  it('não inventa vencimento nem validade de 12 meses para modelo sem periodicidade', () => {
    expect(resolveQualificationExportExpiry({ ...base, validadeMeses: null })).toEqual({
      validadeMeses: null,
      dataVencimento: null,
    });
    expect(resolveQualificationExportExpiry({ ...base, validadeMeses: 0 })).toEqual({
      validadeMeses: null,
      dataVencimento: null,
    });
  });

  it('calcula 24 meses para o dia exato como o Histórico', () => {
    expect(resolveQualificationExportExpiry(base)).toEqual({
      validadeMeses: 24,
      dataVencimento: '2027-09-03',
    });
  });

  it('usa a data explicitamente persistida no Histórico como evidência', () => {
    expect(resolveQualificationExportExpiry({
      ...base,
      dataVencimentoPersistida: '2027-09-29',
    })).toEqual({
      validadeMeses: 24,
      dataVencimento: '2027-09-29',
    });
  });

  it('preserva a regra de 6 meses para CMA após 60 anos na conclusão', () => {
    expect(resolveQualificationExportExpiry({
      ...base,
      codigoQualificacao: 'CMA',
      nascimentoFuncionario: '1960-01-01',
      dataRealizacao: '2026-04-01',
      validadeMeses: 12,
    })).toEqual({
      validadeMeses: 6,
      dataVencimento: '2026-10-01',
    });
  });

  it('não inventa vencimento para G1-SEM sem a data vinculada', () => {
    expect(resolveQualificationExportExpiry({
      ...base,
      codigoQualificacao: 'G1-SEM',
    })).toEqual({ validadeMeses: 24, dataVencimento: null });
  });
});
