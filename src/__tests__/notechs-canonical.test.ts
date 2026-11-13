import { describe, expect, it } from 'vitest';
import {
  NOTECHS_CANONICAL_ITEMS,
  canonicalizeNotechsCode,
  legacyDescriptorCodeForNotechs,
} from '../shared/simuladores/notechs-canonical';

describe('NOTECHS canonical PTO Rev10 codes', () => {
  it('contains 15 ordered NTS codes with observable evidence', () => {
    expect(NOTECHS_CANONICAL_ITEMS).toHaveLength(15);
    expect(NOTECHS_CANONICAL_ITEMS.map((item) => item.ordem)).toEqual(
      Array.from({ length: 15 }, (_, index) => 1001 + index),
    );
    for (const item of NOTECHS_CANONICAL_ITEMS) {
      expect(item.codigo).toMatch(/^NTS-(TEM|LDR|WLM|SA|DEC)-\d{2}$/);
      expect(item.evidenciaObservavel.trim()).not.toBe('');
    }
  });

  it('matches all 15 approved PTO Rev10 V18 NOTECHS names, categories and observable evidence', () => {
    // Source: PRG-OPS-001_PTO_Rev10_V18.docx, §4.2, SHA-256 040a0287...06912.
    const approved = [
    {
        "codigo": "NTS-TEM-01",
        "nome": "Construção e manutenção de equipe",
        "categoria": "Cooperação",
        "evidenciaObservavel": "Contribui para constituir e manter uma equipe coordenada, com objetivos e papéis compreendidos."
    },
    {
        "codigo": "NTS-TEM-02",
        "nome": "Consideração pelos outros",
        "categoria": "Cooperação",
        "evidenciaObservavel": "Demonstra respeito, atenção às necessidades dos demais e comportamento cooperativo."
    },
    {
        "codigo": "NTS-TEM-03",
        "nome": "Dar suporte aos outros",
        "categoria": "Cooperação",
        "evidenciaObservavel": "Oferece e solicita apoio de modo oportuno, especialmente sob carga de trabalho elevada."
    },
    {
        "codigo": "NTS-TEM-04",
        "nome": "Resolução de conflitos",
        "categoria": "Cooperação",
        "evidenciaObservavel": "Identifica e trata divergências de modo construtivo, preservando segurança e coordenação."
    },
    {
        "codigo": "NTS-LDR-05",
        "nome": "Uso de autoridade e assertividade",
        "categoria": "Liderança e Habilidades Gerenciais",
        "evidenciaObservavel": "Exerce autoridade adequada e intervém assertivamente quando a segurança ou o padrão exige."
    },
    {
        "codigo": "NTS-LDR-06",
        "nome": "Oferecer e manter padrões",
        "categoria": "Liderança e Habilidades Gerenciais",
        "evidenciaObservavel": "Mantém SOP, disciplina operacional e padrões mesmo sob pressão ou mudança de cenário."
    },
    {
        "codigo": "NTS-LDR-07",
        "nome": "Planejamento e coordenação",
        "categoria": "Liderança e Habilidades Gerenciais",
        "evidenciaObservavel": "Planeja, distribui tarefas, coordena recursos e atualiza o plano conforme a situação."
    },
    {
        "codigo": "NTS-WLM-08",
        "nome": "Gerenciamento da carga de trabalho",
        "categoria": "Liderança e Habilidades Gerenciais",
        "evidenciaObservavel": "Prioriza, distribui e acompanha tarefas sem perder capacidade de monitoramento."
    },
    {
        "codigo": "NTS-SA-09",
        "nome": "Consciência dos sistemas da aeronave",
        "categoria": "Consciência Situacional",
        "evidenciaObservavel": "Mantém modelo mental atualizado do estado, configuração e tendências dos sistemas."
    },
    {
        "codigo": "NTS-SA-10",
        "nome": "Consciência do ambiente externo",
        "categoria": "Consciência Situacional",
        "evidenciaObservavel": "Monitora tráfego, terreno, meteorologia, helideck, ATC e demais ameaças externas."
    },
    {
        "codigo": "NTS-SA-11",
        "nome": "Consciência do tempo (time)",
        "categoria": "Consciência Situacional",
        "evidenciaObservavel": "Reconhece pressões temporais, antecipa marcos e evita decisões tardias."
    },
    {
        "codigo": "NTS-DEC-12",
        "nome": "Definição e diagnóstico do problema",
        "categoria": "Tomada de Decisão",
        "evidenciaObservavel": "Identifica corretamente o problema, distingue sintomas de causas e confirma informações críticas."
    },
    {
        "codigo": "NTS-DEC-13",
        "nome": "Produção de opções",
        "categoria": "Tomada de Decisão",
        "evidenciaObservavel": "Produz alternativas viáveis e considera recursos, restrições e consequências."
    },
    {
        "codigo": "NTS-DEC-14",
        "nome": "Avaliação do risco e seleção de opções",
        "categoria": "Tomada de Decisão",
        "evidenciaObservavel": "Compara riscos e benefícios e seleciona opção compatível com a margem de segurança."
    },
    {
        "codigo": "NTS-DEC-15",
        "nome": "Revisão dos resultados",
        "categoria": "Tomada de Decisão",
        "evidenciaObservavel": "Monitora o efeito da decisão, revisa o plano e corrige a ação quando necessário."
    }
];
    expect(NOTECHS_CANONICAL_ITEMS.map(({ codigo, nome, categoria, evidenciaObservavel }) => ({
      codigo, nome, categoria, evidenciaObservavel,
    }))).toEqual(approved);
  });

  it('normalizes every legacy NOTECHS family without changing canonical codes', () => {
    expect(canonicalizeNotechsCode('NOTECHS-COO-01')).toBe('NTS-TEM-01');
    expect(canonicalizeNotechsCode('NOTECHS-LID-08')).toBe('NTS-WLM-08');
    expect(canonicalizeNotechsCode('NOTECHS-CSA-11')).toBe('NTS-SA-11');
    expect(canonicalizeNotechsCode('NOTECHS-TMD-15')).toBe('NTS-DEC-15');
    expect(canonicalizeNotechsCode('nts-dec-15')).toBe('NTS-DEC-15');
    expect(legacyDescriptorCodeForNotechs('NTS-DEC-15')).toBe('NOTECHS-TMD-15');
  });
});
