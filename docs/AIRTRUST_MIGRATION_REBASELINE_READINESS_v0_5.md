# AirTrust — Migration Rebaseline Readiness v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `72583a31aecf3d0c68e7659880ad5cbba1973f02`  
**Modo:** local/read-only. Sem D1 remoto. Sem apply de migration. Sem deploy. Sem editar migrations históricas.

---

## 1. Veredito

```text
MIG-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT
```

O status acima significa que a estratégia, os guardrails e a trilha de validação ficaram suficientemente explícitos para uma execução futura controlada, e que agora também existe contrato operacional compartilhado, gate genérico fail-closed e runbook versionado para a janela futura. Nenhum rebaseline real foi executado nesta etapa.

---

## 2. Inventário dos problemas históricos

| Tema | Evidência atual | Impacto |
|---|---|---|
| Prefixos duplicados | 30 grupos históricos no diretório canônico `worker-airtrust/migrations/` | governança ambígua e replay difícil de auditar |
| Nomes fora do padrão | `0098-indices-performance.sql`, `132_add_funcionario_ativo.sql`, `purge-soft-deleted-qualificacoes.sql` | naming inconsistente e baixa previsibilidade do runner |
| Replay frágil | casos documentados `0058 -> 0059` e `0354 -> 0387` | ambiente novo não pode confiar em replay limpo puro |
| Exceções hostis ao runner | histórico com `CREATE TEMP TABLE` e `PRAGMA foreign_keys = OFF` | reconstrução total da cadeia é mais sensível |
| Sentinel fora da cadeia regular | `9999_add_modelo_sessao_id_to_agendamentos.sql` | exceção deliberada que precisa permanecer rastreável |

---

## 3. Decisão recomendada

Decisão recomendada: **rebaseline controlado por snapshot canônico, preservando a história antiga intacta**.

Estratégia:
1. preservar todas as migrations históricas como trilha de auditoria, sem edição nem rename;
2. definir um ponto de corte seguro após o estado estrutural conhecido até `0388_documentos_canonical_schema.sql`;
3. incorporar explicitamente o conhecimento operacional já necessário para ambientes novos, incluindo o bootstrap SIGVOOS;
4. gerar uma baseline nova apenas em sprint autorizada, com validação local e staging antes de qualquer uso em produção;
5. manter a cadeia histórica antiga apenas como histórico, não como caminho principal para bootstrap de ambiente novo.

---

## 4. Opções rejeitadas

| Opção | Motivo da rejeição |
|---|---|
| Editar migrations históricas já aplicadas | quebra rastreabilidade e invalida a trilha real de produção |
| Renomear arquivos históricos para “corrigir” prefixos | altera identidade de artefatos já conhecidos pelo projeto |
| Criar novas migrations incrementais para “consertar” replay antigo | não resolve a ambiguidade estrutural da cadeia já acumulada |
| Continuar aceitando replay limpo puro da cadeia atual | contradiz a evidência documentada em `0058 -> 0059` e `0354 -> 0387` |
| Aplicar baseline/remediação direto em produção | risco desnecessário sem ensaio local/staging controlado |

---

## 5. Estratégia de snapshot/rebaseline

### 5.1 Ponto de corte seguro

Ponto de corte recomendado para o novo baseline:
- estado estrutural equivalente ao schema canônico conhecido após `0388_documentos_canonical_schema.sql`;
- com o requisito SIGVOOS de ambiente novo explicitado pelo bootstrap `scripts/bootstrap-new-environment.sql`;
- sem depender do replay integral da cadeia histórica para provar viabilidade de novo ambiente.

### 5.2 Forma recomendada

1. gerar snapshot/baseline somente em sprint dedicada;
2. manter `worker-airtrust/migrations/` histórico intacto;
3. registrar no novo baseline a origem: “baseline derivado da cadeia histórica auditada + bootstrap SIGVOOS documentado”;
4. exigir que novos ambientes usem:
   - baseline controlado;
   - migrations novas apenas acima do corte aprovado;
   - validação local/staging antes de qualquer rollout.

### 5.3 Rastreabilidade preservada

Para não perder rastreabilidade:
- a pasta histórica não deve ser reescrita;
- a baseline futura deve apontar explicitamente para os docs `AIRTRUST_SIGVOOS_R01_*`, `AIRTRUST_DATA_QUALITY_AND_MIGRATION_INTEGRITY_AUDIT_v0_5.md` e este documento;
- o guard `migration-governance.test.ts` deve continuar congelando as exceções históricas até a troca formal de estratégia.

---

## 6. Critérios para não editar migrations históricas

Não editar migrations históricas enquanto:
- elas já fizerem parte da trilha aplicada ou documentada em produção/staging;
- o problema for de replay/governança histórica, não de schema incremental novo;
- existir alternativa mais segura por baseline novo, bootstrap controlado ou documentação operacional;
- a correção exigir mudar ordem, nome ou conteúdo sem replay fiel em todos os ambientes relevantes.

---

## 7. Plano de validação local

Validação local mínima antes da sprint de execução:
- `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts`
- `worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts`
- `scripts/audit-migration-chain-readiness.sh`
- `npm run ops:guard`
- `npx tsc --noEmit`
- `npm run test:worker`

Objetivo local:
- provar que a cadeia histórica continua documentada;
- provar que o bootstrap SIGVOOS segue íntegro;
- impedir novas duplicidades silenciosas, novos nomes fora do padrão e regressões de replay já conhecidas.

---

## 8. Plano de staging futuro

Execução futura recomendada em staging:
1. snapshot do schema aprovado;
2. validação read-only do inventário e do ponto de corte;
3. criação do baseline novo em staging isolado;
4. aplicação apenas das migrations pós-corte esperadas;
5. smoke funcional e comparação estrutural contra o schema esperado;
6. rollback por restauração do snapshot anterior se qualquer divergência relevante surgir.

Critérios de entrada:
- árvore limpa;
- janela aprovada;
- snapshot disponível;
- rollback ensaiado;
- contrato `AIRTRUST_CONTROLLED_*` completo;
- gate de execução controlada em PASS;
- nenhum deploy acoplado à mesma janela sem necessidade explícita.

---

## 9. Plano de rollback

Rollback recomendado para a futura execução controlada:
- manter snapshot anterior ao rebaseline;
- manter baseline novo e cadeia histórica separados durante a validação;
- abortar a promoção se houver divergência em tabelas críticas, índices esperados ou incompatibilidade com o runtime;
- restaurar o snapshot anterior em staging antes de qualquer nova tentativa.

Nenhum rollback foi necessário nesta etapa porque nada foi aplicado.

---

## 10. Riscos residuais

- a cadeia histórica continua frágil para replay limpo amplo até a sprint de execução real;
- o caso `0058 -> 0059` segue como dívida documentada, ainda sem reprodução fiel local;
- o bootstrap SIGVOOS continua sendo um artefato operacional separado até o baseline futuro absorver esse conhecimento;
- qualquer baseline futuro ainda exigirá comparação estrutural rigorosa com o estado aprovado.

---

## 11. Guardrails já prontos

- `migration-governance.test.ts` congela duplicatas, nomes fora do padrão e exceções históricas;
- `sigvoos-base-tables-schema.test.ts` preserva a prova sem/com bootstrap;
- `scripts/audit-migration-chain-readiness.sh` fornece auditoria dry-run local do estado de readiness;
- `docs/MIGRATION_GOVERNANCE_PLAN.md` continua como política macro de governança.

---

## 12. Critérios para `MIG-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`

Os critérios agora atendidos são:
1. problemas históricos inventariados;
2. opção recomendada documentada;
3. opções rejeitadas registradas;
4. bootstrap de ambiente novo já comprovado localmente;
5. guardrails permanentes de governança ativos;
6. plano local, plano de staging e rollback definidos;
7. contrato de ambiente controlado e runbook compartilhado versionados;
8. gate genérico fail-closed pronto para local-copy/staging/production com travas extras para produção;
9. nenhuma migration histórica editada;
10. nenhum rebaseline real executado prematuramente.

---

## 13. Próxima etapa recomendada

Executar uma sprint separada de **controlled rebaseline execution** em ambiente isolado/staging aprovado, usando este documento, `AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md`, `AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md` e `scripts/mig01-controlled-rebaseline-gate.sh` como gates de entrada, sem misturar a janela com backfill real ou mudanças funcionais de runtime.
