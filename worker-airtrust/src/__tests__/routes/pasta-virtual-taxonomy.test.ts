import { describe, expect, it } from 'vitest';
import { inferirCategoriaDocumento, normalizarCategoriaLegada } from '../../routes/pasta-virtual';
import {
  gerarNomeArquivoPadronizado,
  normalizarTipoDocumento,
  type TipoDocumento,
} from '../../utils/nomenclatura-padronizada';

const base = {
  nomeFuncionario: 'Piloto Teste',
  data: new Date(2026, 9, 1),
  uuid: '12345678-abcd-ef01-2345-6789abcdef01',
};

describe('Pasta Virtual backend taxonomy', () => {
  it('normalizes legacy category labels into the new taxonomy', () => {
    expect(normalizarCategoriaLegada('Certificados de Qualificação')).toBe(
      'Treinamentos e Qualificações',
    );
    expect(normalizarCategoriaLegada('Treinamento')).toBe('Treinamentos e Qualificações');
    expect(normalizarCategoriaLegada('Licenças')).toBe('Licenças e Extratos ANAC');
    expect(normalizarCategoriaLegada('Simuladores')).toBe('Simuladores');
  });

  it('classifies old and new filename prefixes without moving stored records', () => {
    expect(inferirCategoriaDocumento('CERT-PILOTO-D2-20261001-abcd1234.pdf')).toBe(
      'Treinamentos e Qualificações',
    );
    expect(inferirCategoriaDocumento('AVAL-FAP14_139-PILOTO-20261001-abcd1234.pdf')).toBe(
      'FAPs e Checks',
    );
    expect(inferirCategoriaDocumento('FTV-A139_FFS-PILOTO-20261001-abcd1234.pdf')).toBe(
      'Fichas de Treinamento de Voo',
    );
    expect(inferirCategoriaDocumento('VINC-CONTRATO-PILOTO-20261001-abcd1234.pdf')).toBe(
      'Vínculo e Registro Funcional',
    );
    expect(inferirCategoriaDocumento('EXP-DECLARACAO_HORAS-PILOTO-20261001-abcd1234.pdf')).toBe(
      'Experiência e Horas de Voo',
    );
    expect(inferirCategoriaDocumento('DOC-OUTROS-PILOTO-20261001-abcd1234.pdf')).toBe('Outros');
    expect(inferirCategoriaDocumento('DOC-CNH-PILOTO-20261001-abcd1234.pdf')).toBe(
      'Documentos Pessoais',
    );
    expect(
      inferirCategoriaDocumento(
        'certificado original.pdf',
        null,
        'application/pdf',
        'funcionarios/10/certificados-upload/qualificacao/uuid.pdf',
      ),
    ).toBe('Treinamentos e Qualificações');
    expect(
      inferirCategoriaDocumento(
        'curso externo.pdf',
        null,
        'application/pdf',
        'funcionarios/10/certificados-upload/profissional/uuid.pdf',
      ),
    ).toBe('Treinamentos e Qualificações');
  });

  it('normalizes UI aliases and generates category-specific filenames', () => {
    expect(normalizarTipoDocumento('LICENCA_ANAC')).toBe('LICENCA');
    expect(normalizarTipoDocumento('CONTRATO')).toBe('VINCULO_FUNCIONAL');
    expect(normalizarTipoDocumento('CERTIFICADO_PROFISSIONAL')).toBe('CERTIFICADO_QUALIFICACAO');
    expect(normalizarTipoDocumento('FTV')).toBe('FTV');

    const cases: Array<[TipoDocumento, string, string]> = [
      ['AVALIACAO_CQ', 'FAP14-139', 'AVAL-FAP14_139-PILOTO_TESTE-20261001-12345678.pdf'],
      ['FTV', 'A139-FFS', 'FTV-A139_FFS-PILOTO_TESTE-20261001-12345678.pdf'],
      ['DESIGNACAO_OPERACIONAL', 'PIC', 'DESIG-PIC-PILOTO_TESTE-20261001-12345678.pdf'],
      [
        'EXPERIENCIA_HORAS',
        'DECLARACAO_HORAS',
        'EXP-DECLARACAO_HORAS-PILOTO_TESTE-20261001-12345678.pdf',
      ],
      [
        'INSTRUTOR_EXAMINADOR',
        'CREDENCIAMENTO',
        'INST-CREDENCIAMENTO-PILOTO_TESTE-20261001-12345678.pdf',
      ],
      ['VINCULO_FUNCIONAL', 'CONTRATO', 'VINC-CONTRATO-PILOTO_TESTE-20261001-12345678.pdf'],
      ['CURRICULO_PROFISSIONAL', 'CURRICULO', 'CURR-CURRICULO-PILOTO_TESTE-20261001-12345678.pdf'],
    ];

    cases.forEach(([tipo, subTipo, expected]) => {
      expect(gerarNomeArquivoPadronizado({ ...base, tipo, subTipo })).toBe(expected);
    });
  });
});
