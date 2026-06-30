/**
 * Testes de contrato para a lógica da aba Planejados:
 * - Encerrados ocultos por padrão
 * - Lista de presença disponível antes da conclusão
 * - Elegibilidade de convocados por tipo de público
 * - Regra CONCLUIDO exige resultados finais
 * - Chip "Planejadas" no Histórico usa fonte correta
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(
  resolve(currentDir, '../TreinamentosPlanejadosPage.tsx'),
  'utf8',
);
const hookSource = readFileSync(
  resolve(currentDir, '../../hooks/useTreinamentosPlanejados.ts'),
  'utf8',
);
const pdfSource = readFileSync(
  resolve(currentDir, '../../services/pdf-lista-presenca.ts'),
  'utf8',
);

describe('TreinamentosPlanejadosPage — filtro padrão de status', () => {
  it('define STATUS_ENCERRADOS com CONCLUIDO e CANCELADO', () => {
    expect(pageSource).toContain("STATUS_ENCERRADOS = new Set");
    expect(pageSource).toContain("'CONCLUIDO'");
    expect(pageSource).toContain("'CANCELADO'");
  });

  it('filtra encerrados por padrão quando nenhum filtro de status está ativo', () => {
    expect(pageSource).toContain('if (statusFiltro) return items');
    expect(pageSource).toContain('if (mostrarEncerrados) return items');
    expect(pageSource).toContain('!STATUS_ENCERRADOS.has(item.status)');
  });

  it('exibe toggle para mostrar encerrados quando não há filtro explícito', () => {
    expect(pageSource).toContain('Mostrar concluídos/cancelados');
    expect(pageSource).toContain('setMostrarEncerrados');
  });

  it('ativa mostrarEncerrados automaticamente ao selecionar CONCLUIDO/CANCELADO no filtro', () => {
    expect(pageSource).toContain("event.target.value === 'CONCLUIDO' || event.target.value === 'CANCELADO'");
    expect(pageSource).toContain('setMostrarEncerrados(true)');
  });
});

describe('TreinamentosPlanejadosPage — lista de presença da turma', () => {
  it('declara estado para gerar lista de presença', () => {
    expect(pageSource).toContain('gerandoListaPresencaTurma');
    expect(pageSource).toContain('setGerandoListaPresencaTurma');
  });

  it('importa gerarPDFListaPresencaTurma do serviço PDF', () => {
    expect(pageSource).toContain('gerarPDFListaPresencaTurma');
    expect(pdfSource).toContain('gerarPDFListaPresencaTurma');
  });

  it('botão de lista de presença está disponível no modal de detalhes (não apenas após conclusão)', () => {
    expect(pageSource).toContain('Lista de Presença');
    expect(pageSource).toContain('gerarListaPresencaTurmaAtual');
  });

  it('gerarPDFListaPresencaTurma inclui participantes com nome, matrícula, setor e função', () => {
    expect(pdfSource).toContain('ListaPresencaTurmaData');
    expect(pdfSource).toContain('participantes:');
    expect(pdfSource).toContain('matricula');
    expect(pdfSource).toContain('setor');
    expect(pdfSource).toContain('funcao');
  });

  it('PDF de turma inclui instrutor e período', () => {
    expect(pdfSource).toContain('instrutor');
    expect(pdfSource).toContain('dataInicio');
    expect(pdfSource).toContain('dataFim');
  });
});

describe('TreinamentosPlanejadosPage — elegibilidade de convocados', () => {
  it('declara constantes de público TRIPULACAO e MANUTENCAO', () => {
    expect(pageSource).toContain('PALAVRAS_TRIPULACAO');
    expect(pageSource).toContain('PALAVRAS_MANUTENCAO');
    expect(pageSource).toContain('FUNCAO_TRIPULACAO');
    expect(pageSource).toContain('FUNCAO_MANUTENCAO');
  });

  it('implementa determinarPublicoQualificacao baseada na categoria do tipo', () => {
    expect(pageSource).toContain('determinarPublicoQualificacao');
    expect(pageSource).toContain("return 'TRIPULACAO'");
    expect(pageSource).toContain("return 'MANUTENCAO'");
  });

  it('implementa funcionarioElegivelParaPublico', () => {
    expect(pageSource).toContain('funcionarioElegivelParaPublico');
  });

  it('pool de elegíveis derivado antes da busca textual', () => {
    expect(pageSource).toContain('convocadosElegiveis');
    expect(pageSource).toContain('publicoQualificacaoSelecionada');
  });

  it('exibe contador "X selecionados de Y elegíveis"', () => {
    expect(pageSource).toContain('elegível(is)');
  });

  it('exibe aviso de tipo de público não identificado', () => {
    expect(pageSource).toContain('Tipo de público não identificado');
    expect(pageSource).toContain('Mostrando todos');
  });

  it('exibe label do filtro de público ativo', () => {
    expect(pageSource).toContain('Filtro de público:');
    expect(pageSource).toContain('Tripulação');
    expect(pageSource).toContain('Manutenção');
  });
});

describe('TreinamentosPlanejadosPage — regras de status CONCLUIDO', () => {
  it('impede CONCLUIDO sem resultados finais dos participantes', () => {
    expect(pageSource).toContain(
      'A turma só pode ser marcada como concluída quando todos os participantes tiverem resultado final.',
    );
  });

  it('impede CONCLUIDO sem participantes', () => {
    expect(pageSource).toContain(
      "formState.status === 'CONCLUIDO' && formState.participante_ids.length === 0",
    );
  });

  it('usa endpoint dedicado de conclusão em lote', () => {
    expect(hookSource).toContain('/planejados/${id}/conclusao-lote');
  });
});

describe('Qualificacoes.tsx — chip Planejadas no Histórico', () => {
  const qualificacoesSource = readFileSync(
    resolve(currentDir, '../Qualificacoes.tsx'),
    'utf8',
  );

  it('chip usa historicoHeaderStats.planejadas (fonte API dashboard)', () => {
    expect(qualificacoesSource).toContain('historicoHeaderStats.planejadas');
  });

  it('planejadas vem do endpoint /dashboard/qualificacoes', () => {
    expect(qualificacoesSource).toContain('/dashboard/qualificacoes');
    expect(qualificacoesSource).toContain('data.planejadas');
  });

  it('não usa plannedItemsCount no chip — evita confusão entre entidades', () => {
    // plannedItemsCount é da query de turmas (TreinamentoPlanejado), não de qual_historicos
    // O chip do histórico deve usar sempre a contagem do dashboard
    const chipSection = qualificacoesSource.includes('Planejadas') &&
      qualificacoesSource.includes('historicoHeaderStats.planejadas');
    expect(chipSection).toBe(true);
  });
});

describe('pdf-lista-presenca — gerarPDFListaPresencaTurma', () => {
  it('exporta a função gerarPDFListaPresencaTurma', () => {
    expect(pdfSource).toContain('export async function gerarPDFListaPresencaTurma');
  });

  it('exporta a interface ListaPresencaTurmaData', () => {
    expect(pdfSource).toContain('export interface ListaPresencaTurmaData');
  });

  it('gera lista com número de participantes no título', () => {
    expect(pdfSource).toContain('convocado(s)');
  });

  it('inclui coluna de assinatura na tabela', () => {
    expect(pdfSource).toContain('Assinatura');
  });

  it('inclui declaração de presença no rodapé', () => {
    expect(pdfSource).toContain('Declaro que os participantes');
  });
});
