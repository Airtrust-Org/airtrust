import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASTA_VIRTUAL_CATEGORIAS, PASTA_VIRTUAL_GRUPOS } from '@/react-app/config/pastaVirtual';

describe('Pasta Virtual taxonomy', () => {
  it('exposes the operational, regulatory, personal and fallback groups', () => {
    expect(PASTA_VIRTUAL_GRUPOS.map((grupo) => grupo.id)).toEqual([
      'OPERACIONAL',
      'REGULATORIO',
      'PESSOAL',
      'OUTROS',
    ]);
  });

  it('covers the document families needed by employee dossiers without duplicate types', () => {
    const tipos = PASTA_VIRTUAL_CATEGORIAS.map((categoria) => categoria.tipo);
    expect(new Set(tipos).size).toBe(tipos.length);
    expect(tipos).toEqual(
      expect.arrayContaining([
        'CERTIFICADO_QUALIFICACAO',
        'AVALIACAO_CQ',
        'EXAME_MEDICO',
        'LICENCA_ANAC',
        'SIMULADOR',
        'DESIGNACAO_OPERACIONAL',
        'EXPERIENCIA_HORAS',
        'INSTRUTOR_EXAMINADOR',
        'VINCULO_FUNCIONAL',
        'DOCUMENTO_PESSOAL',
        'CURRICULO_PROFISSIONAL',
        'OUTROS',
      ]),
    );
  });

  it('keeps legacy backend labels mapped into the new canonical categories', () => {
    const qualificacoes = PASTA_VIRTUAL_CATEGORIAS.find(
      (categoria) => categoria.tipo === 'CERTIFICADO_QUALIFICACAO',
    );
    const licencas = PASTA_VIRTUAL_CATEGORIAS.find(
      (categoria) => categoria.tipo === 'LICENCA_ANAC',
    );

    expect(qualificacoes?.apiCategorias).toEqual(
      expect.arrayContaining([
        'Certificados de Qualificação',
        'Treinamento',
        'Certificados Profissionais',
      ]),
    );
    expect(licencas?.apiCategorias).toEqual(expect.arrayContaining(['Licenças']));
  });

  it('preserves the original filename for manually uploaded qualification certificates', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/react-app/components/funcionarios/UploadDocumentoModal.tsx'),
      'utf8',
    );

    expect(source).toContain("if (tipoDocumento === 'CERTIFICADO_QUALIFICACAO') return file.name;");
  });

  it('provides search, history and empty-category controls in the canonical view', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/react-app/components/funcionarios/PastaVirtualCompleta.tsx'),
      'utf8',
    );

    expect(source).toContain('Buscar por documento ou categoria');
    expect(source).toContain('Mostrar histórico');
    expect(source).toContain('Mostrar categorias vazias');
    expect(source).toContain('Adicionar documento');
  });
});
