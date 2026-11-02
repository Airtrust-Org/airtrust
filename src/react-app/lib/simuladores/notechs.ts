import { FICHA_AVALIACAO_FAIXAS } from './avaliacaoScale';

/**
 * Conteúdo de referência NOTECHS (Non-Technical Skills / CRM).
 *
 * AVISO DE PROVENIÊNCIA: os títulos de grupo/item seguem a estrutura padrão
 * internacional do sistema NOTECHS (JAR-OPS / CRM: 4 grupos, 15 elementos —
 * Flin, Martin et al., "Development of the NOTECHS system", 2003), amplamente
 * publicada na literatura de fatores humanos em aviação. Os descritores por
 * faixa de nota abaixo são uma adaptação do texto público/acadêmico desse
 * sistema para a régua 1-10 (faixas 1-2/3-4/5-7/8-10) já usada nas fichas.
 *
 * ESTE CONTEÚDO NÃO FOI VERIFICADO CONTRA A FICHA FONTE ESPECÍFICA DA EMPRESA.
 * Revisar e ajustar a redação dos 60 descritores antes de uso operacional —
 * ver docs/NOTECHS_FICHAS_MACROETAPA_20260702.md.
 */

export type NotechsGrupoCodigo =
  | 'COOPERACAO'
  | 'LIDERANCA'
  | 'CONSCIENCIA_SITUACIONAL'
  | 'TOMADA_DECISAO';

export interface NotechsGrupo {
  codigo: NotechsGrupoCodigo;
  tituloPt: string;
  tituloEn: string;
  ordem: number;
}

export interface NotechsItem {
  codigo: string;
  ordem: number;
  grupo: NotechsGrupoCodigo;
  tituloPt: string;
  tituloEn: string;
}

export interface NotechsDescritor {
  itemCodigo: string;
  rangeLabel: string;
  texto: string;
}

export const NOTECHS_CATEGORIA = 'NOTECHS' as const;

/** Namespace de ordem reservado — nunca colide com o intervalo 1-22 das manobras técnicas variáveis. */
export const NOTECHS_ORDEM_BASE = 1001;

export const NOTECHS_GRUPOS: NotechsGrupo[] = [
  { codigo: 'COOPERACAO', tituloPt: 'Cooperação', tituloEn: 'Cooperation', ordem: 1 },
  {
    codigo: 'LIDERANCA',
    tituloPt: 'Liderança e Habilidades Gerenciais',
    tituloEn: 'Leadership and Management Skills',
    ordem: 2,
  },
  {
    codigo: 'CONSCIENCIA_SITUACIONAL',
    tituloPt: 'Consciência Situacional',
    tituloEn: 'Situational Awareness',
    ordem: 3,
  },
  {
    codigo: 'TOMADA_DECISAO',
    tituloPt: 'Tomada de Decisão',
    tituloEn: 'Decision Making',
    ordem: 4,
  },
];

export const NOTECHS_ITENS: NotechsItem[] = [
  // COO = Cooperação / Cooperation
  {
    codigo: 'NOTECHS-COO-01',
    ordem: 1001,
    grupo: 'COOPERACAO',
    tituloPt: 'Formação e Manutenção da Equipe',
    tituloEn: 'Team Building and Maintaining',
  },
  {
    codigo: 'NOTECHS-COO-02',
    ordem: 1002,
    grupo: 'COOPERACAO',
    tituloPt: 'Consideração pelos Outros',
    tituloEn: 'Considering Others',
  },
  {
    codigo: 'NOTECHS-COO-03',
    ordem: 1003,
    grupo: 'COOPERACAO',
    tituloPt: 'Apoio aos Outros',
    tituloEn: 'Supporting Others',
  },
  {
    codigo: 'NOTECHS-COO-04',
    ordem: 1004,
    grupo: 'COOPERACAO',
    tituloPt: 'Resolução de Conflitos',
    tituloEn: 'Conflict Solving',
  },
  // LID = Liderança e Habilidades Gerenciais / Leadership and Management Skills
  {
    codigo: 'NOTECHS-LID-05',
    ordem: 1005,
    grupo: 'LIDERANCA',
    tituloPt: 'Uso da Autoridade e Assertividade',
    tituloEn: 'Use of Authority and Assertiveness',
  },
  {
    codigo: 'NOTECHS-LID-06',
    ordem: 1006,
    grupo: 'LIDERANCA',
    tituloPt: 'Manutenção de Padrões',
    tituloEn: 'Maintaining Standards',
  },
  {
    codigo: 'NOTECHS-LID-07',
    ordem: 1007,
    grupo: 'LIDERANCA',
    tituloPt: 'Planejamento e Coordenação',
    tituloEn: 'Planning and Coordination',
  },
  {
    codigo: 'NOTECHS-LID-08',
    ordem: 1008,
    grupo: 'LIDERANCA',
    tituloPt: 'Gerenciamento da Carga de Trabalho',
    tituloEn: 'Workload Management',
  },
  // CSA = Consciência Situacional / Situational Awareness
  {
    codigo: 'NOTECHS-CSA-09',
    ordem: 1009,
    grupo: 'CONSCIENCIA_SITUACIONAL',
    tituloPt: 'Consciência dos Sistemas da Aeronave',
    tituloEn: 'Aircraft Systems Awareness',
  },
  {
    codigo: 'NOTECHS-CSA-10',
    ordem: 1010,
    grupo: 'CONSCIENCIA_SITUACIONAL',
    tituloPt: 'Consciência do Ambiente Externo',
    tituloEn: 'Awareness of External Environment',
  },
  {
    codigo: 'NOTECHS-CSA-11',
    ordem: 1011,
    grupo: 'CONSCIENCIA_SITUACIONAL',
    tituloPt: 'Consciência do Tempo',
    tituloEn: 'Awareness of Time',
  },
  // TMD = Tomada de Decisão / Decision Making
  {
    codigo: 'NOTECHS-TMD-12',
    ordem: 1012,
    grupo: 'TOMADA_DECISAO',
    tituloPt: 'Definição e Diagnóstico do Problema',
    tituloEn: 'Problem Definition and Diagnosis',
  },
  {
    codigo: 'NOTECHS-TMD-13',
    ordem: 1013,
    grupo: 'TOMADA_DECISAO',
    tituloPt: 'Geração de Opções',
    tituloEn: 'Option Generation',
  },
  {
    codigo: 'NOTECHS-TMD-14',
    ordem: 1014,
    grupo: 'TOMADA_DECISAO',
    tituloPt: 'Avaliação de Risco e Seleção de Opção',
    tituloEn: 'Risk Assessment and Option Selection',
  },
  {
    codigo: 'NOTECHS-TMD-15',
    ordem: 1015,
    grupo: 'TOMADA_DECISAO',
    tituloPt: 'Revisão do Resultado',
    tituloEn: 'Outcome Review',
  },
];

// Faixas reaproveitadas 1:1 da régua global existente (avaliacaoScale.ts) —
// mesmas 4 bandas (1-2/3-4/5-7/8-10) já usadas para as manobras técnicas.
const RANGE_LABELS = FICHA_AVALIACAO_FAIXAS.map((faixa) => faixa.rangeLabel);

/**
 * 60 descritores (15 itens x 4 faixas). Adaptação do texto público NOTECHS —
 * ver aviso de proveniência no topo do arquivo.
 */
export const NOTECHS_DESCRITORES: NotechsDescritor[] = [
  // NOTECHS-COO-01 — Formação e Manutenção da Equipe
  {
    itemCodigo: 'NOTECHS-COO-01',
    rangeLabel: '1-2',
    texto:
      'Não estabelece clima de trabalho em equipe; ignora contribuições dos demais tripulantes; cria ou tolera atrito que compromete a operação.',
  },
  {
    itemCodigo: 'NOTECHS-COO-01',
    rangeLabel: '3-4',
    texto:
      'Estabelece clima de equipe de forma inconsistente; interações pontuais, sem reforço contínuo da coesão da tripulação.',
  },
  {
    itemCodigo: 'NOTECHS-COO-01',
    rangeLabel: '5-7',
    texto:
      'Mantém clima de trabalho em equipe adequado durante a maior parte da sessão; incentiva participação dos demais.',
  },
  {
    itemCodigo: 'NOTECHS-COO-01',
    rangeLabel: '8-10',
    texto:
      'Constrói e mantém clima de equipe exemplar; promove ativamente participação, escuta e coesão em todas as fases do voo.',
  },

  // NOTECHS-COO-02 — Consideração pelos Outros
  {
    itemCodigo: 'NOTECHS-COO-02',
    rangeLabel: '1-2',
    texto:
      'Desconsidera estado, carga de trabalho ou dificuldades dos demais tripulantes; comunicação unilateral.',
  },
  {
    itemCodigo: 'NOTECHS-COO-02',
    rangeLabel: '3-4',
    texto:
      'Considera os demais de forma esporádica; nem sempre ajusta o próprio comportamento ao estado da equipe.',
  },
  {
    itemCodigo: 'NOTECHS-COO-02',
    rangeLabel: '5-7',
    texto:
      'Demonstra consideração pelo estado e carga de trabalho dos demais tripulantes na maior parte do tempo.',
  },
  {
    itemCodigo: 'NOTECHS-COO-02',
    rangeLabel: '8-10',
    texto:
      'Considera ativa e continuamente o estado, a carga de trabalho e as dificuldades de toda a tripulação.',
  },

  // NOTECHS-COO-03 — Apoio aos Outros
  {
    itemCodigo: 'NOTECHS-COO-03',
    rangeLabel: '1-2',
    texto:
      'Não oferece nem aceita ajuda; ignora sinais de sobrecarga ou dificuldade de outros tripulantes.',
  },
  {
    itemCodigo: 'NOTECHS-COO-03',
    rangeLabel: '3-4',
    texto: 'Apoio ocasional; nem sempre oferece ou aceita ajuda quando necessário.',
  },
  {
    itemCodigo: 'NOTECHS-COO-03',
    rangeLabel: '5-7',
    texto: 'Oferece e aceita apoio adequadamente na maioria das situações que exigem.',
  },
  {
    itemCodigo: 'NOTECHS-COO-03',
    rangeLabel: '8-10',
    texto:
      'Oferece e aceita apoio de forma proativa e oportuna, redistribuindo carga de trabalho quando necessário.',
  },

  // NOTECHS-COO-04 — Resolução de Conflitos
  {
    itemCodigo: 'NOTECHS-COO-04',
    rangeLabel: '1-2',
    texto:
      'Evita ou agrava conflitos; posições divergentes não são tratadas, comprometendo a operação.',
  },
  {
    itemCodigo: 'NOTECHS-COO-04',
    rangeLabel: '3-4',
    texto:
      'Trata conflitos de forma inconsistente; nem sempre busca convergência de forma construtiva.',
  },
  {
    itemCodigo: 'NOTECHS-COO-04',
    rangeLabel: '5-7',
    texto: 'Identifica e trata divergências de forma construtiva, buscando consenso operacional.',
  },
  {
    itemCodigo: 'NOTECHS-COO-04',
    rangeLabel: '8-10',
    texto:
      'Identifica, media e resolve conflitos de forma proativa e construtiva, preservando a segurança e o clima da equipe.',
  },

  // NOTECHS-LID-05 — Uso da Autoridade e Assertividade
  {
    itemCodigo: 'NOTECHS-LID-05',
    rangeLabel: '1-2',
    texto:
      'Autoridade ausente (passivo) ou excessiva (autoritário); não se posiciona ou não aceita questionamentos, comprometendo a segurança.',
  },
  {
    itemCodigo: 'NOTECHS-LID-05',
    rangeLabel: '3-4',
    texto:
      'Exerce autoridade de forma inconsistente; assertividade insuficiente em momentos críticos.',
  },
  {
    itemCodigo: 'NOTECHS-LID-05',
    rangeLabel: '5-7',
    texto:
      'Exerce autoridade e assertividade de forma adequada, aceitando contribuições da equipe.',
  },
  {
    itemCodigo: 'NOTECHS-LID-05',
    rangeLabel: '8-10',
    texto:
      'Usa autoridade e assertividade de forma exemplar, tomando posição clara quando necessário e mantendo-se aberto a input da equipe.',
  },

  // NOTECHS-LID-06 — Manutenção de Padrões
  {
    itemCodigo: 'NOTECHS-LID-06',
    rangeLabel: '1-2',
    texto:
      'Não observa nem reforça padrões e procedimentos; desvios não são identificados ou corrigidos.',
  },
  {
    itemCodigo: 'NOTECHS-LID-06',
    rangeLabel: '3-4',
    texto: 'Observa padrões de forma inconsistente; correções de desvio ocorrem tardiamente.',
  },
  {
    itemCodigo: 'NOTECHS-LID-06',
    rangeLabel: '5-7',
    texto: 'Observa e reforça padrões e procedimentos operacionais na maior parte da sessão.',
  },
  {
    itemCodigo: 'NOTECHS-LID-06',
    rangeLabel: '8-10',
    texto:
      'Monitora e reforça padrões continuamente, corrigindo desvios de forma imediata e construtiva.',
  },

  // NOTECHS-LID-07 — Planejamento e Coordenação
  {
    itemCodigo: 'NOTECHS-LID-07',
    rangeLabel: '1-2',
    texto:
      'Não planeja nem coordena atividades com a equipe; ações não são antecipadas ou comunicadas.',
  },
  {
    itemCodigo: 'NOTECHS-LID-07',
    rangeLabel: '3-4',
    texto: 'Planejamento presente, porém incompleto ou pouco coordenado com os demais tripulantes.',
  },
  {
    itemCodigo: 'NOTECHS-LID-07',
    rangeLabel: '5-7',
    texto: 'Planeja e coordena atividades de forma adequada, com briefings e ajustes pertinentes.',
  },
  {
    itemCodigo: 'NOTECHS-LID-07',
    rangeLabel: '8-10',
    texto:
      'Planeja e coordena de forma antecipada e completa, com briefings claros e ajustes proativos conforme a situação evolui.',
  },

  // NOTECHS-LID-08 — Gerenciamento da Carga de Trabalho
  {
    itemCodigo: 'NOTECHS-LID-08',
    rangeLabel: '1-2',
    texto:
      'Não gerencia a própria carga de trabalho nem a da equipe; sobrecarga ou ociosidade comprometem o desempenho.',
  },
  {
    itemCodigo: 'NOTECHS-LID-08',
    rangeLabel: '3-4',
    texto:
      'Gerenciamento de carga de trabalho inconsistente; distribuição de tarefas nem sempre adequada.',
  },
  {
    itemCodigo: 'NOTECHS-LID-08',
    rangeLabel: '5-7',
    texto:
      'Gerencia a carga de trabalho própria e da equipe de forma adequada na maior parte da sessão.',
  },
  {
    itemCodigo: 'NOTECHS-LID-08',
    rangeLabel: '8-10',
    texto:
      'Antecipa e redistribui a carga de trabalho de forma proativa, mantendo margem de capacidade em toda a sessão.',
  },

  // NOTECHS-CSA-09 — Consciência dos Sistemas da Aeronave
  {
    itemCodigo: 'NOTECHS-CSA-09',
    rangeLabel: '1-2',
    texto:
      'Não monitora o estado dos sistemas da aeronave; falha em detectar anomalias relevantes.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-09',
    rangeLabel: '3-4',
    texto: 'Monitoramento de sistemas inconsistente; algumas anomalias não são detectadas a tempo.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-09',
    rangeLabel: '5-7',
    texto:
      'Monitora os sistemas da aeronave de forma adequada, identificando anomalias relevantes.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-09',
    rangeLabel: '8-10',
    texto:
      'Mantém monitoramento contínuo e antecipatório dos sistemas, identificando e comunicando anomalias precocemente.',
  },

  // NOTECHS-CSA-10 — Consciência do Ambiente Externo
  {
    itemCodigo: 'NOTECHS-CSA-10',
    rangeLabel: '1-2',
    texto:
      'Não monitora condições externas (meteorologia, tráfego, terreno); desconsidera fatores ambientais relevantes.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-10',
    rangeLabel: '3-4',
    texto:
      'Monitoramento do ambiente externo inconsistente; nem sempre integra essas informações à condução do voo.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-10',
    rangeLabel: '5-7',
    texto: 'Monitora adequadamente as condições externas relevantes para a operação.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-10',
    rangeLabel: '8-10',
    texto:
      'Mantém consciência contínua e integrada do ambiente externo, antecipando impactos na operação.',
  },

  // NOTECHS-CSA-11 — Consciência do Tempo
  {
    itemCodigo: 'NOTECHS-CSA-11',
    rangeLabel: '1-2',
    texto:
      'Não gerencia o tempo disponível; atrasos ou pressa comprometem a segurança da operação.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-11',
    rangeLabel: '3-4',
    texto:
      'Gerenciamento de tempo inconsistente; margens de tempo nem sempre são consideradas nas decisões.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-11',
    rangeLabel: '5-7',
    texto:
      'Gerencia o tempo disponível de forma adequada, considerando prazos e margens operacionais.',
  },
  {
    itemCodigo: 'NOTECHS-CSA-11',
    rangeLabel: '8-10',
    texto:
      'Antecipa restrições de tempo e ajusta o ritmo da operação de forma proativa, preservando margens de segurança.',
  },

  // NOTECHS-TMD-12 — Definição e Diagnóstico do Problema
  {
    itemCodigo: 'NOTECHS-TMD-12',
    rangeLabel: '1-2',
    texto:
      'Não identifica ou diagnostica corretamente o problema; age sem compreender a situação real.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-12',
    rangeLabel: '3-4',
    texto: 'Identificação do problema incompleta ou tardia; diagnóstico superficial.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-12',
    rangeLabel: '5-7',
    texto:
      'Identifica e diagnostica o problema de forma adequada, reunindo informações relevantes.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-12',
    rangeLabel: '8-10',
    texto:
      'Identifica e diagnostica o problema de forma rápida e completa, integrando todas as fontes de informação disponíveis.',
  },

  // NOTECHS-TMD-13 — Geração de Opções
  {
    itemCodigo: 'NOTECHS-TMD-13',
    rangeLabel: '1-2',
    texto: 'Não considera alternativas; adota a primeira opção sem avaliar outras possibilidades.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-13',
    rangeLabel: '3-4',
    texto: 'Considera poucas alternativas, sem explorar opções relevantes disponíveis.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-13',
    rangeLabel: '5-7',
    texto:
      'Gera alternativas relevantes antes de decidir, com participação da equipe quando aplicável.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-13',
    rangeLabel: '8-10',
    texto:
      'Gera múltiplas alternativas de forma sistemática, envolvendo a equipe e considerando cenários contingenciais.',
  },

  // NOTECHS-TMD-14 — Avaliação de Risco e Seleção de Opção
  {
    itemCodigo: 'NOTECHS-TMD-14',
    rangeLabel: '1-2',
    texto:
      'Não avalia riscos das opções disponíveis; escolhe sem considerar consequências de segurança.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-14',
    rangeLabel: '3-4',
    texto: 'Avaliação de risco incompleta; seleção de opção nem sempre justificada.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-14',
    rangeLabel: '5-7',
    texto: 'Avalia riscos das alternativas e seleciona a opção mais adequada à situação.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-14',
    rangeLabel: '8-10',
    texto:
      'Avalia riscos de forma criteriosa e seleciona a opção mais segura, comunicando a justificativa à equipe.',
  },

  // NOTECHS-TMD-15 — Revisão do Resultado
  {
    itemCodigo: 'NOTECHS-TMD-15',
    rangeLabel: '1-2',
    texto:
      'Não revisa o resultado da decisão tomada; não ajusta a conduta mesmo diante de resultado inadequado.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-15',
    rangeLabel: '3-4',
    texto: 'Revisão do resultado esporádica; ajustes de conduta tardios ou incompletos.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-15',
    rangeLabel: '5-7',
    texto: 'Revisa o resultado da decisão e ajusta a conduta quando necessário.',
  },
  {
    itemCodigo: 'NOTECHS-TMD-15',
    rangeLabel: '8-10',
    texto:
      'Revisa continuamente o resultado das decisões, ajustando a conduta de forma proativa e comunicando à equipe.',
  },
];

export function getNotechsGrupo(codigo: NotechsGrupoCodigo): NotechsGrupo | undefined {
  return NOTECHS_GRUPOS.find((g) => g.codigo === codigo);
}

export function getNotechsItensPorGrupo(grupo: NotechsGrupoCodigo): NotechsItem[] {
  return NOTECHS_ITENS.filter((item) => item.grupo === grupo).sort((a, b) => a.ordem - b.ordem);
}

export function getNotechsDescritores(itemCodigo: string): NotechsDescritor[] {
  return NOTECHS_DESCRITORES.filter((d) => d.itemCodigo === itemCodigo).sort(
    (a, b) => RANGE_LABELS.indexOf(a.rangeLabel) - RANGE_LABELS.indexOf(b.rangeLabel),
  );
}

export function isNotechsCategoria(categoria: string | null | undefined): boolean {
  return (categoria || '').trim().toUpperCase() === NOTECHS_CATEGORIA;
}

/**
 * Separa uma lista de manobras da ficha em técnicas variáveis vs NOTECHS,
 * usando o namespace de ordem reservado (>= NOTECHS_ORDEM_BASE). Reaproveitada
 * pela página de edição da ficha e pelo gerador de PDF client-side, para que
 * ambos apliquem exatamente a mesma regra de separação.
 */
export function splitManobrasNotechs<T extends { ordem: number }>(
  manobras: T[],
): { tecnicas: T[]; notechs: T[] } {
  const tecnicas: T[] = [];
  const notechs: T[] = [];
  for (const m of manobras) {
    if (m.ordem >= NOTECHS_ORDEM_BASE) {
      notechs.push(m);
    } else {
      tecnicas.push(m);
    }
  }
  notechs.sort((a, b) => a.ordem - b.ordem);
  return { tecnicas, notechs };
}

export const NOTECHS_PROVENIENCIA_AVISO =
  'Estrutura padrão NOTECHS (JAR-OPS/CRM). Descritores adaptados de texto público — revisar contra a ficha fonte da empresa antes de uso operacional.';
