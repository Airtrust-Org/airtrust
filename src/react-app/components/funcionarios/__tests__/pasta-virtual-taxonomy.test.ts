import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PASTA_VIRTUAL_CATEGORIAS,
  PASTA_VIRTUAL_GRUPOS,
  isTripulacaoVooFuncionario,
} from '@/react-app/config/pastaVirtual';

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
        'FTV',
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

  it('shows flight-only document families only for commander and copilot roles', () => {
    const flightOnly = PASTA_VIRTUAL_CATEGORIAS.filter(
      (categoria) => categoria.somenteTripulacaoVoo,
    ).map((categoria) => categoria.tipo);

    expect(flightOnly).toEqual(
      expect.arrayContaining(['AVALIACAO_CQ', 'FTV', 'SIMULADOR', 'EXPERIENCIA_HORAS']),
    );
    expect(isTripulacaoVooFuncionario('Comandante')).toBe(true);
    expect(isTripulacaoVooFuncionario('Copiloto')).toBe(true);
    expect(isTripulacaoVooFuncionario('Co-piloto')).toBe(true);
    expect(isTripulacaoVooFuncionario('Piloto')).toBe(false);
    expect(isTripulacaoVooFuncionario('Auxiliar de Manutenção')).toBe(false);
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

  it('optimizes generic Pasta Virtual PDFs before upload and records optimization metadata', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/react-app/components/funcionarios/UploadDocumentoModal.tsx'),
      'utf8',
    );
    const backend = readFileSync(
      resolve(process.cwd(), 'worker-airtrust/src/routes/pasta-virtual.ts'),
      'utf8',
    );

    expect(source).toContain('preparePdfUploadFile(file)');
    expect(source).toContain("formData.append('upload_original_size'");
    expect(source).toContain("formData.append('upload_optimized'");
    expect(backend).toContain('original_file_size');
    expect(backend).toContain('pdf_optimized');
    expect(backend).toContain('preserved_digital_signature');
  });

  it('keeps the canonical category structure visible for every employee', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/react-app/components/funcionarios/PastaVirtualCompleta.tsx'),
      'utf8',
    );

    expect(source).toContain('Buscar por documento ou categoria');
    expect(source).toContain('Mostrar histórico');
    expect(source).not.toContain('Mostrar categorias vazias');
    expect(source).toContain('return casaBusca;');
    expect(source).toContain('Adicionar documento');
  });

  it('guards flight training and flight log views for commander/copilot only', () => {
    const fichaSource = readFileSync(
      resolve(process.cwd(), 'src/react-app/pages/FichaFuncionarioPage.tsx'),
      'utf8',
    );
    const pastaSource = readFileSync(
      resolve(process.cwd(), 'src/react-app/pages/PastaVirtual.tsx'),
      'utf8',
    );

    expect(fichaSource).toContain("isTripulacaoVoo && tab === 'simulador'");
    expect(fichaSource).toContain("isTripulacaoVoo && tab === 'caderneta'");
    expect(fichaSource).toContain('funcao={f.funcao}');
    expect(pastaSource).toContain("isTripulacaoVoo && abaAtiva === 'desempenho'");
    expect(pastaSource).toContain("isTripulacaoVoo && abaAtiva === 'caderneta'");
  });
});
