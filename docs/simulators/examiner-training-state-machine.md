# Máquina de estados — treinamento prático de examinador (EXA-V01..V04)

Este documento separa as cinco etapas do processo completo de formação de
examinador e descreve o que este trabalho implementa (as quatro sessões
práticas internas) e o que fica fora dele.

## As cinco etapas do processo completo

1. **Treinamento de solo** — teórico, fora do escopo desta implementação.
2. **Quatro sessões práticas internas (EXA-V01..V04)** — escopo desta
   implementação. Cada uma gera uma ficha interna do AirTrust, com 33 itens
   (18 técnicos + 15 NOTECHS), assinada por instrutor + participante.
3. **Exame sob observação** — conduzido pela autoridade/checador externo,
   fora do escopo desta implementação. Não modelado no AirTrust.
4. **FAP manual externa** — preenchida fora do sistema, em papel/processo
   próprio da autoridade aeronáutica. O AirTrust não gera, não preenche, não
   converte e não exporta para FAP.
5. **Credenciamento confirmado pela autoridade** — evento externo,
   registrado manualmente quando/se a autoridade confirmar. Não é inferido,
   não é automatizado, e não é assumido por este trabalho.

Este documento e a implementação associada cobrem **apenas a etapa 2**.

## Estados por segmento/ficha

Cada uma das 4 fichas (uma por segmento/atribuição curricular) segue o
mesmo ciclo de vida já usado por qualquer ficha de sessão de simulador no
AirTrust (`fichas_sessao.status`):

```
PENDENTE / AVALIACAO_PENDENTE
  → AGUARDANDO_ASSINATURA_INSTRUTOR   (após assinatura do aluno)
  → APROVADO | NAO_APROVADO           (após assinatura do instrutor)
```

`simulador_segmento_atribuicoes.status` acompanha em paralelo, no nível do
segmento:

```
PLANEJADA → CUMPRIDA (quando a ficha correspondente é concluída)
          → CANCELADA (cancelamento isolado do segmento, PR #278)
```

As 4 fichas evoluem **independentemente**. Não existe estado agregado "todo
o treinamento prático concluído" derivado automaticamente pela soma de
minutos ou pela contagem de fichas concluídas — ver seção seguinte.

## Requisito sequencial (não é soma de minutos)

`modelos_sessao_requisitos` (tabela do PR #278, migration 0422) registra:

| Modelo | Requer (ETAPA_ANTERIOR, obrigatório) |
|---|---|
| EXA-V02 | EXA-V01 concluída |
| EXA-V03 | EXA-V02 concluída |
| EXA-V04 | EXA-V03 concluída |

Isto é uma dependência de **conclusão de etapa**, não de tempo acumulado.
240 minutos de sessão sem as 4 fichas devidamente aprovadas não representam
conclusão do treinamento prático. Cada ficha carrega seu próprio
`nota_final` / `resultado_final` / `aprovado`, avaliados pelos critérios já
existentes (escala 1–10, ver
`src/react-app/pages/simuladores/fichas/avaliacaoScale.ts`).

## Evento de conclusão (não implementado nesta entrega)

A tabela `domain_events` (migration 0240) e o middleware
`domainEventProcessorMiddleware` já existem no AirTrust para eventos
internos idempotentes, mas não há hoje nenhum evento equivalente a
`TREINAMENTO_PRATICO_EXAMINADOR_CONCLUIDO`.

Decisão desta entrega: **não criar infraestrutura nova só para isto.** As
quatro conclusões independentes e rastreáveis (uma por atribuição
curricular/ficha) já são evidência suficiente e consultável. Se um evento de
domínio agregado vier a ser necessário no futuro, deve ser desenhado como
extensão aditiva separada, reaproveitando `domain_events` — não faz parte
desta entrega.

## O que nunca acontece automaticamente

- nenhuma FAP13-CRED-AW139 ou FAP13-CRED-SK76 é gerada;
- nenhum status "credenciado pela ANAC" é marcado;
- nenhuma qualificação externa é criada;
- nenhum evento oficial ANAC é criado;
- a conclusão das 4 fichas não dispara, por si só, nenhuma dessas ações.

Essas etapas (3–5 da lista acima) permanecem manuais e externas ao AirTrust
por decisão de produto, não por limitação técnica.
