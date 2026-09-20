import { describe, expect, it } from 'vitest';
import {
  calcularAtualizacaoDominio,
  periodoQuinzena,
  pontuarCandidato,
  selecionarQuestoesDesafio,
} from '../../services/conhecimento-ativo/retencao';

describe('Conhecimento Ativo — motor de retenção', () => {
  it('trata acerto com certeza como evidência forte de domínio', () => {
    expect(
      calcularAtualizacaoDominio({ nivel: 62, exposicoes: 4, acertos: 3, erros: 1 }, true, 'SABIA'),
    ).toMatchObject({
      nivel: 80,
      exposicoes: 5,
      acertos: 4,
      erros: 1,
      estado: 'CONSOLIDADO',
      proximaRevisaoDias: 30,
    });
  });

  it('prioriza erro com certeza como possível modelo mental incorreto', () => {
    const result = calcularAtualizacaoDominio(
      { nivel: 70, exposicoes: 5, acertos: 4, erros: 1 },
      false,
      'SABIA',
    );
    expect(result.nivel).toBe(52);
    expect(result.proximaRevisaoDias).toBe(2);
    expect(result.estado).toBe('EM_REFORCO');
  });

  it('não considera chute correto como conhecimento consolidado', () => {
    const result = calcularAtualizacaoDominio(
      { nivel: 78, exposicoes: 4, acertos: 4, erros: 0 },
      true,
      'CHUTEI',
    );
    expect(result.nivel).toBe(82);
    expect(result.estado).toBe('EM_REFORCO');
    expect(result.proximaRevisaoDias).toBe(3);
  });

  it('prioriza revisão vencida, baixa retenção e criticidade', () => {
    const now = Date.parse('2026-09-18T12:00:00Z');
    const due = pontuarCandidato(
      {
        questaoId: 1,
        itemId: 1,
        criticidade: 'CRITICA',
        nivel: 30,
        proximaRevisaoEm: '2026-09-17T12:00:00Z',
        ultimaExposicaoEm: null,
      },
      now,
    );
    const stable = pontuarCandidato(
      {
        questaoId: 2,
        itemId: 2,
        criticidade: 'MEDIA',
        nivel: 90,
        proximaRevisaoEm: '2026-10-01T12:00:00Z',
        ultimaExposicaoEm: null,
      },
      now,
    );
    expect(due).toBeGreaterThan(stable);
  });


  it('faz revisão vencida superar item novo quando o risco demonstrado é maior', () => {
    const now = Date.parse('2026-09-20T12:00:00Z');
    const novo = pontuarCandidato(
      {
        questaoId: 10,
        itemId: 10,
        criticidade: 'MEDIA',
        nivel: null,
        proximaRevisaoEm: null,
        ultimaExposicaoEm: null,
      },
      now,
    );
    const vencido = pontuarCandidato(
      {
        questaoId: 11,
        itemId: 11,
        criticidade: 'ALTA',
        nivel: 35,
        proximaRevisaoEm: '2026-09-15T12:00:00Z',
        ultimaExposicaoEm: '2026-09-01T12:00:00Z',
      },
      now,
    );
    expect(vencido).toBeGreaterThan(novo);
  });

  it('diversifica sistemas antes de repetir o mesmo tópico no desafio misto', () => {
    const candidatos = [
      { questaoId: 1, itemId: 1, topicoId: 101, criticidade: 'CRITICA' as const, nivel: 20, proximaRevisaoEm: null, ultimaExposicaoEm: null },
      { questaoId: 2, itemId: 2, topicoId: 101, criticidade: 'CRITICA' as const, nivel: 25, proximaRevisaoEm: null, ultimaExposicaoEm: null },
      { questaoId: 3, itemId: 3, topicoId: 102, criticidade: 'ALTA' as const, nivel: 40, proximaRevisaoEm: null, ultimaExposicaoEm: null },
      { questaoId: 4, itemId: 4, topicoId: 103, criticidade: 'MEDIA' as const, nivel: 50, proximaRevisaoEm: null, ultimaExposicaoEm: null },
    ];
    const selected = selecionarQuestoesDesafio(candidatos, 3, { diversificarTopicos: true });
    expect(new Set(selected.map((item) => item.topicoId))).toEqual(new Set([101, 102, 103]));
  });

  it('rota perguntas do mesmo item preferindo a menos exposta', () => {
    const selected = selecionarQuestoesDesafio(
      [
        { questaoId: 1, itemId: 1, criticidade: 'ALTA', nivel: 50, proximaRevisaoEm: null, ultimaExposicaoEm: null, respondidaVezes: 4, ultimaRespostaEm: '2026-09-19T12:00:00Z' },
        { questaoId: 2, itemId: 1, criticidade: 'ALTA', nivel: 50, proximaRevisaoEm: null, ultimaExposicaoEm: null, respondidaVezes: 0, ultimaRespostaEm: null },
      ],
      1,
    );
    expect(selected[0]?.questaoId).toBe(2);
  });

  it('seleciona no máximo uma questão por item de conhecimento', () => {
    const selected = selecionarQuestoesDesafio([
      { questaoId: 2, itemId: 1, criticidade: 'ALTA', nivel: 40, proximaRevisaoEm: null, ultimaExposicaoEm: null },
      { questaoId: 1, itemId: 1, criticidade: 'ALTA', nivel: 20, proximaRevisaoEm: null, ultimaExposicaoEm: null },
      { questaoId: 3, itemId: 2, criticidade: 'MEDIA', nivel: null, proximaRevisaoEm: null, ultimaExposicaoEm: null },
    ], 5);
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map((row) => row.itemId)).size).toBe(2);
  });

  it('seleciona 10 questões por padrão quando há conteúdo elegível suficiente', () => {
    const candidatos = Array.from({ length: 12 }, (_, index) => ({
      questaoId: index + 1,
      itemId: index + 1,
      criticidade: 'ALTA' as const,
      nivel: 50,
      proximaRevisaoEm: null,
      ultimaExposicaoEm: null,
    }));
    expect(selecionarQuestoesDesafio(candidatos)).toHaveLength(10);
  });

  it('produz janelas quinzenais determinísticas', () => {
    expect(periodoQuinzena(new Date('2026-09-08T10:00:00Z')).chave).toBe('2026-09-Q1');
    expect(periodoQuinzena(new Date('2026-09-18T10:00:00Z')).chave).toBe('2026-09-Q2');
  });
});
