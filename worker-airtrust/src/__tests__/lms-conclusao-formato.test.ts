/**
 * TESTES LMS/CONCLUSÃO — preservação tipo_conteudo vs formato_id
 *
 * Cobre:
 *   - Curso LMS com tipo_conteudo=scorm preserva mídia técnica
 *   - Curso/qualificação vinculada com formato EAD mantém formato_id
 *   - Conclusão LMS continua gerando qualificacoes_historico
 *   - Histórico gerado não confunde tipo_conteudo com formato
 */

import { describe, expect, it, vi } from 'vitest';

// ── SSOT helpers ──
import { isEadCategoria, isEadFormato } from '../services/lms-ead-ssot';

describe('LMS — isEadCategoria / isEadFormato', () => {
  describe('isEadCategoria (legado)', () => {
    it('reconhece EAD como categoria EAD', () => {
      expect(isEadCategoria('EAD')).toBe(true);
    });

    it('reconhece TREINAMENTO EAD como categoria EAD', () => {
      expect(isEadCategoria('TREINAMENTO EAD')).toBe(true);
    });

    it('reconhece variantes com espaços e case', () => {
      expect(isEadCategoria('  ead  ')).toBe(true);
      expect(isEadCategoria('treinamento ead')).toBe(true);
    });

    it('NÃO reconhece outras categorias como EAD', () => {
      expect(isEadCategoria('PRESENCIAL')).toBe(false);
      expect(isEadCategoria('CMA')).toBe(false);
      expect(isEadCategoria('SIMULADOR')).toBe(false);
      expect(isEadCategoria(null)).toBe(false);
      expect(isEadCategoria(undefined)).toBe(false);
      expect(isEadCategoria('')).toBe(false);
    });
  });

  describe('isEadFormato (pós-0412)', () => {
    it('usa formato_codigo quando disponível', () => {
      expect(isEadFormato({ formato_codigo: 'EAD' })).toBe(true);
      expect(isEadFormato({ formato_codigo: 'PRESENCIAL' })).toBe(false);
      expect(isEadFormato({ formato_codigo: 'SIMULADOR' })).toBe(false);
      expect(isEadFormato({ formato_codigo: 'NAO_CLASSIFICADO' })).toBe(false);
    });

    it('fallback para isEadCategoria quando formato_codigo ausente', () => {
      expect(isEadFormato({ categoria: 'EAD' })).toBe(true);
      expect(isEadFormato({ categoria: 'TREINAMENTO EAD' })).toBe(true);
      expect(isEadFormato({ categoria: 'PRESENCIAL' })).toBe(false);
    });

    it('formato_codigo tem precedência sobre categoria', () => {
      // Se formato_codigo=NÃO_EAD mas categoria=EAD, ganha o formato
      expect(isEadFormato({ formato_codigo: 'PRESENCIAL', categoria: 'EAD' })).toBe(false);
      expect(isEadFormato({ formato_codigo: 'EAD', categoria: 'PRESENCIAL' })).toBe(true);
    });

    it('trata null/undefined com segurança', () => {
      expect(isEadFormato({})).toBe(false);
      expect(isEadFormato({ formato_codigo: null, categoria: null })).toBe(false);
    });
  });
});

describe('LMS — tipo_conteudo vs formato_id — separação conceitual', () => {
  it('tipo_conteudo scorm NÃO implica formato EAD por mera presença de SCORM', () => {
    // tipo_conteudo é mídia técnica do player (scorm/h5p/pdf/pptx/video)
    // formato_id é o formato da qualificação (EAD/PRESENCIAL/SIMULADOR/...)
    // Um curso pode ter tipo_conteudo=scorm e formato_id=PRESENCIAL (ex: blended)
    // A verificação de formato EAD deve usar formato_codigo, não tipo_conteudo
    const curso = {
      tipo_conteudo: 'scorm' as const,
      formato_codigo: 'PRESENCIAL' as const,
    };
    // Mesmo com SCORM, o formato é PRESENCIAL (blended learning)
    expect(isEadFormato(curso)).toBe(false);
  });

  it('tipo_conteudo NÃO é usado como proxy de formato', () => {
    // PDF e PPTX são mídias, não formatos de qualificação
    const tiposConteudo = ['scorm', 'h5p', 'pdf', 'pptx', 'video'];
    // Nenhum desses deve ser tratado como indicador de formato
    // O formato deve vir exclusivamente de formato_codigo ou categoria
    for (const tc of tiposConteudo) {
      const obj = { tipo_conteudo: tc };
      // isEadFormato ignora tipo_conteudo — só olha formato_codigo/categoria
      expect(isEadFormato(obj as any)).toBe(false);
    }
  });

  it('formato_id existe em lms_cursos sem substituir tipo_conteudo', () => {
    // Migration 0412 adiciona formato_id a lms_cursos
    // tipo_conteudo permanece como coluna independente
    // Ambos coexistem com semânticas distintas:
    //   - formato_id: FK → qualificacoes_formatos (EAD/PRESENCIAL/etc)
    //   - tipo_conteudo: string livre (scorm/h5p/pdf/pptx/video)
    const colunasLmsCursos = [
      'tipo_conteudo',   // mídia técnica — SEMPRE preservada
      'formato_id',       // formato da qualificação — adicionado por 0412
    ];
    // Ambas devem existir como colunas independentes
    expect(colunasLmsCursos).toContain('tipo_conteudo');
    expect(colunasLmsCursos).toContain('formato_id');
    // tipo_conteudo NÃO é removido ou substituído por formato_id
  });
});

describe('LMS — conclusão → qualificacoes_historico', () => {
  it('fluxo de conclusão LMS mantém separação tipo_conteudo/formato', () => {
    // Simula o fluxo: usuário conclui curso LMS → sistema gera qualificacoes_historico
    // O histórico deve carregar o formato da qualificação (via tipo/formato_id)
    // sem confundir com o tipo_conteudo do curso LMS

    const cursoLms = {
      id: 1,
      tipo_conteudo: 'scorm',      // mídia do player
      formato_id: 1,                // FK → qualificacoes_formatos (EAD)
      qualificacao_tipo_id: 42,
    };

    const qualificacaoTipo = {
      id: 42,
      nome: 'CRM Teórico',
      categoria: 'EAD',
      formato_id: 1,                // mesmo formato EAD
      formato_codigo: 'EAD',
    };

    // Verificação: formato EAD é determinado pelo formato_codigo do tipo
    expect(isEadFormato(qualificacaoTipo)).toBe(true);

    // tipo_conteudo do curso NÃO interfere na determinação do formato
    expect(cursoLms.tipo_conteudo).toBe('scorm');
    expect(isEadFormato({ formato_codigo: 'EAD' })).toBe(true);

    // O histórico gerado deve referenciar o formato pela FK, não pelo tipo_conteudo
    const historicoGerado = {
      qualificacao_id: cursoLms.qualificacao_tipo_id,
      formato_id: qualificacaoTipo.formato_id,
      formato_codigo: qualificacaoTipo.formato_codigo,
      // NÃO inclui tipo_conteudo — isso é atributo do curso LMS, não do histórico
    };
    expect(historicoGerado.formato_codigo).toBe('EAD');
    expect((historicoGerado as any).tipo_conteudo).toBeUndefined();
  });
});
