/**
 * Catálogo NOTECHS canônico do PTO Revisão 10.
 *
 * Os códigos NTS-* e as evidências observáveis vêm dos pacotes canônicos
 * AW139/S-76 auditados em 30/07/2026. Os aliases NOTECHS-* existem apenas
 * para reconhecer fichas históricas sem duplicar itens durante o self-heal.
 */
export interface CanonicalNotechsItem {
  codigo: string;
  nome: string;
  categoria: string;
  evidenciaObservavel: string;
  ordem: number;
}

export const NOTECHS_CANONICAL_ITEMS: readonly CanonicalNotechsItem[] = [
  {
    codigo: 'NTS-TEM-01',
    nome: 'Formação e manutenção da equipe',
    categoria: 'Trabalho em equipe',
    evidenciaObservavel:
      'Contribui para constituir e manter uma equipe coordenada, com objetivos e papéis compreendidos.',
    ordem: 1001,
  },
  {
    codigo: 'NTS-TEM-02',
    nome: 'Consideração pelos outros',
    categoria: 'Trabalho em equipe',
    evidenciaObservavel:
      'Demonstra respeito, atenção às necessidades dos demais e comportamento cooperativo.',
    ordem: 1002,
  },
  {
    codigo: 'NTS-TEM-03',
    nome: 'Apoio aos outros',
    categoria: 'Trabalho em equipe',
    evidenciaObservavel:
      'Oferece e solicita apoio de modo oportuno, especialmente sob carga de trabalho elevada.',
    ordem: 1003,
  },
  {
    codigo: 'NTS-TEM-04',
    nome: 'Resolução de conflitos',
    categoria: 'Trabalho em equipe',
    evidenciaObservavel:
      'Identifica e trata divergências de modo construtivo, preservando segurança e coordenação.',
    ordem: 1004,
  },
  {
    codigo: 'NTS-LDR-05',
    nome: 'Uso da autoridade e assertividade',
    categoria: 'Liderança e gestão',
    evidenciaObservavel:
      'Exerce autoridade adequada e intervém assertivamente quando a segurança ou o padrão exige.',
    ordem: 1005,
  },
  {
    codigo: 'NTS-LDR-06',
    nome: 'Manutenção de padrões',
    categoria: 'Liderança e gestão',
    evidenciaObservavel:
      'Mantém SOP, disciplina operacional e padrões mesmo sob pressão ou mudança de cenário.',
    ordem: 1006,
  },
  {
    codigo: 'NTS-LDR-07',
    nome: 'Planejamento e coordenação',
    categoria: 'Liderança e gestão',
    evidenciaObservavel:
      'Planeja, distribui tarefas, coordena recursos e atualiza o plano conforme a situação.',
    ordem: 1007,
  },
  {
    codigo: 'NTS-WLM-08',
    nome: 'Gerenciamento da carga de trabalho',
    categoria: 'Liderança e gestão',
    evidenciaObservavel:
      'Prioriza, distribui e acompanha tarefas sem perder capacidade de monitoramento.',
    ordem: 1008,
  },
  {
    codigo: 'NTS-SA-09',
    nome: 'Consciência dos sistemas da aeronave',
    categoria: 'Consciência situacional',
    evidenciaObservavel:
      'Mantém modelo mental atualizado do estado, configuração e tendências dos sistemas.',
    ordem: 1009,
  },
  {
    codigo: 'NTS-SA-10',
    nome: 'Consciência do ambiente externo',
    categoria: 'Consciência situacional',
    evidenciaObservavel:
      'Monitora tráfego, terreno, meteorologia, helideck, ATC e demais ameaças externas.',
    ordem: 1010,
  },
  {
    codigo: 'NTS-SA-11',
    nome: 'Consciência do tempo',
    categoria: 'Consciência situacional',
    evidenciaObservavel:
      'Reconhece pressões temporais, antecipa marcos e evita decisões tardias.',
    ordem: 1011,
  },
  {
    codigo: 'NTS-DEC-12',
    nome: 'Definição e diagnóstico do problema',
    categoria: 'Tomada de decisão',
    evidenciaObservavel:
      'Identifica corretamente o problema, distingue sintomas de causas e confirma informações críticas.',
    ordem: 1012,
  },
  {
    codigo: 'NTS-DEC-13',
    nome: 'Geração de opções',
    categoria: 'Tomada de decisão',
    evidenciaObservavel:
      'Produz alternativas viáveis e considera recursos, restrições e consequências.',
    ordem: 1013,
  },
  {
    codigo: 'NTS-DEC-14',
    nome: 'Avaliação de risco e seleção de opção',
    categoria: 'Tomada de decisão',
    evidenciaObservavel:
      'Compara riscos e benefícios e seleciona opção compatível com a margem de segurança.',
    ordem: 1014,
  },
  {
    codigo: 'NTS-DEC-15',
    nome: 'Revisão do resultado',
    categoria: 'Tomada de decisão',
    evidenciaObservavel:
      'Monitora o efeito da decisão, revisa o plano e corrige a ação quando necessário.',
    ordem: 1015,
  },
] as const;

export const LEGACY_NOTECHS_TO_CANONICAL: Readonly<Record<string, string>> = Object.freeze({
  'NOTECHS-COO-01': 'NTS-TEM-01',
  'NOTECHS-COO-02': 'NTS-TEM-02',
  'NOTECHS-COO-03': 'NTS-TEM-03',
  'NOTECHS-COO-04': 'NTS-TEM-04',
  'NOTECHS-LID-05': 'NTS-LDR-05',
  'NOTECHS-LID-06': 'NTS-LDR-06',
  'NOTECHS-LID-07': 'NTS-LDR-07',
  'NOTECHS-LID-08': 'NTS-WLM-08',
  'NOTECHS-CSA-09': 'NTS-SA-09',
  'NOTECHS-CSA-10': 'NTS-SA-10',
  'NOTECHS-CSA-11': 'NTS-SA-11',
  'NOTECHS-TMD-12': 'NTS-DEC-12',
  'NOTECHS-TMD-13': 'NTS-DEC-13',
  'NOTECHS-TMD-14': 'NTS-DEC-14',
  'NOTECHS-TMD-15': 'NTS-DEC-15',
});

export const CANONICAL_NOTECHS_TO_LEGACY: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(LEGACY_NOTECHS_TO_CANONICAL).map(([legacy, canonical]) => [canonical, legacy]),
  ),
);

export function canonicalizeNotechsCode(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toUpperCase();
  return LEGACY_NOTECHS_TO_CANONICAL[normalized] || normalized;
}

export function legacyDescriptorCodeForNotechs(value: string | null | undefined): string {
  const canonical = canonicalizeNotechsCode(value);
  return CANONICAL_NOTECHS_TO_LEGACY[canonical] || canonical;
}
