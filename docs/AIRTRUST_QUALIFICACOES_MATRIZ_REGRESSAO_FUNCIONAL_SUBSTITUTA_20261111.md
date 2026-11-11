# Qualificações / LMS / Compliance — matriz de regressão funcional (SUBSTITUTA PROPOSTA)

> **Aviso:** esta NÃO é a matriz P00–P13 original. A fonte canônica P00–P13 de Qualificações não foi encontrada no repositório
> (as únicas ocorrências de `P00`/`P13` são da frente FRMS e da auditoria SIGVOOS, outro escopo). Este documento é uma matriz nova,
> construída a partir de contratos verificáveis e decisões gerenciais registradas (#2158, #1492, #776), e deve ser lida como proposta.

Base: `origin/main` = `08808f4cb`; produção Worker/Pages = `995dbca1`; staging Worker = `d752e00f`. Evidências sem PII.

| # | Caso | Critério de aceite | Evidência 11/11/2026 | Estado |
|---|---|---|---|---|
| R1 | Alterar validade do modelo atualiza históricos | Históricos vivos do tipo recalculados pela regra do dia; vencidos/RENOVADA preservados | Testes `qualification-model-batch-executor.sqlite`, `qualification-validity-no-dia-executor.sqlite`; planner de produção sem operações pendentes | Código/dados OK; **UI em navegador não exercitada** |
| R2 | Inicial → Periódico persiste após salvar/recarregar | Classificação gravada e relida | Contrato coberto por testes de rota; **não exercitado em navegador** | Pendente de QA autenticado |
| R3 | Vence no dia (meses de tamanhos diferentes, 29/02) e CMA por idade | 31/01+1m=28/02; 29/02/2024+24m=28/02/2026; CMA 12/6 meses | `cma-validity.test.ts`, `qualificacoes-expiration*.test.ts` PASS; planners read-only de produção: validade-no-dia 0 operações, CMA 0 corrigíveis | **OK** |
| R4 | Coerência histórico × Ficha 360 × Compliance × matrícula × certificado | Validade documental separada do status da matrícula | Nenhuma matrícula aponta para histórico excluído (0); 0 matrículas/históricos com empresa divergente do funcionário | OK em dados; telas não inspecionadas |
| R5 | Deduplicação preserva vínculos de matrícula e ciclo | Duplicata excluída nunca é a referenciada | 9 grupos / 18 linhas duplicadas vivas (todas legadas, `tipo_codigo` nulo, 0 matrículas e 0 ciclos vinculados) | **Achado F2** — remoção exige autorização |
| R6 | Exclusão lógica sem referência inválida | Nenhum vínculo vivo para registro excluído | Matrículas: 0 ponteiros inválidos. **Ciclos: 13 apontam para histórico excluído** (excluídos em 16/06 e 03/07) | **Achado F1** |
| R7 | Isolamento entre empresas e permissão de edição | 0 cruzamentos; escrita exige papel | 0 cruzamentos em matrículas/históricos; 11 arquivos / 144 testes de tenant/RBAC PASS | OK (testes + dados); sem teste de navegador |
| R8 | Coordenador de Voo com 24 meses | Modelo e históricos em 24; vencimento = conclusão + 24 meses | Modelo `EAD_COORDENADOR_VOO` validade 24; 7/7 históricos com validade 24 e vencimento exato; `coordenador-voo-qualificacoes-chain.test.ts` PASS | **OK** |

## Achados residuais

- **F1 — 13 ciclos LMS com `qualificacao_historico_id` apontando para histórico com `deleted_at`** (ciclos 8, 9, 10, 296, 511, 512, 516, 518, 520, 524, 531, 543, 574). Origem: exclusões lógicas de 16/06 e 03/07, anteriores às decisões #1492. Correção proposta: limpar o ponteiro (mesma operação `cptr` do grupo 2 da #1492), sem restaurar históricos, via workflow governado com plano/hash/aprovação. **Nenhuma escrita feita.**
- **F2 — 9 grupos de históricos duplicados** (mesmo funcionário, modelo, data e certificado). Escolher o sobrevivente (preferir o que está CONCLUIDO/não renovado) exige decisão do Gerente de Treinamento; não há vínculos a preservar. **Nenhuma escrita feita.**

## Lacunas de verificação (não declarar produção validada sem elas)

1. QA autenticado em navegador (R1, R2, R4, tela do Compliance, Meus Treinamentos, Histórico) — o QA autenticado de produção não possui mecanismo sancionado (`docs/ops/production-qa-session-gap.md`); em staging exige workflow governado (`staging-training-compliance-*`).
2. Aceite visual da #1279.
