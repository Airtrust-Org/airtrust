# AirTrust — DQ01/MIG01 Controlled Execution Runbook v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `6bec63ad638011f1510ec4b97a06966c0e810875`  
**Modo:** documental/local. Sem mutation nesta fase.

---

## 1. Objetivo

Runbook único para futuras janelas controladas de:
- `DQ-01 controlled backfill`
- `MIG-01 controlled rebaseline`

Ordem mandatória:
1. `DQ-01` primeiro
2. `MIG-01` depois
3. deploy funcional, se necessário, em janela separada

---

## 2. Checklist antes da execução

- árvore git limpa ou somente mudanças aprovadas da própria janela;
- `npm run ops:guard` em `PASS`;
- `npx tsc --noEmit` em `PASS`;
- `npm run test:worker` em `PASS`;
- `bash scripts/audit-data-quality-readiness.sh` em `PASS`;
- `bash scripts/audit-migration-chain-readiness.sh` em `PASS`;
- snapshot criado e evidenciado;
- rollback criado e evidenciado;
- target aprovado e declarado;
- comando seguro revisado e declarado;
- produção explicitamente proibida ou autorizada de forma adicional;
- nenhuma ação de deploy acoplada à mesma janela.

---

## 3. Checklist durante a execução

- registrar hora de início;
- registrar modo (`dq01-backfill` ou `mig01-rebaseline`);
- registrar target (`local-copy`, `staging`, `production`);
- executar o gate correspondente antes de qualquer mutation;
- abortar imediatamente se o gate falhar;
- manter logs sem PII;
- registrar somente contagens agregadas e evidências aprovadas;
- confirmar que nenhum comando real foi trocado após a revisão.

---

## 4. Checklist após a execução

- registrar hora de término;
- registrar comando efetivamente usado;
- registrar contagens pré/pós;
- registrar smoke/validação estrutural pós-execução;
- registrar se houve abort ou rollback;
- anexar snapshot id, rollback id e aprovação;
- atualizar os docs de status do stream;
- registrar explicitamente se produção permaneceu intocada.

---

## 5. Critérios de abort

Abortar a janela se ocorrer qualquer um destes:
- gate fail-closed;
- evidência de snapshot ausente ou ilegível;
- rollback ausente ou incompleto;
- target não bate com o ambiente aprovado;
- comando revisado não bate com o comando da janela;
- presença de `deploy` ou `D1 remote` sem autorização adicional;
- divergência inesperada em contagens críticas;
- erro estrutural que mude o escopo aprovado.

---

## 6. Critérios de rollback

Rollback obrigatório se:
- o lote executado divergir do plano aprovado;
- houver mutação fora do domínio previsto;
- as validações pós-execução falharem;
- o target correto não puder mais ser garantido;
- aparecer evidência de risco de produção não aprovado.

Rollback deve:
- restaurar snapshot anterior;
- registrar evidência do restauro;
- rerodar as validações mínimas após a restauração;
- atualizar o status para refletir a tentativa abortada.

---

## 7. Evidências obrigatórias

Evidências mínimas por janela:
- aprovação operacional;
- target aprovado;
- snapshot;
- rollback;
- comando seguro revisado;
- resultado do gate;
- resultado dos testes/guards;
- contagens agregadas pré/pós;
- decisão final: concluída, abortada ou revertida.

---

## 8. Como registrar contagens pré/pós

Usar somente:
- contagens agregadas por domínio;
- número de linhas candidatas;
- número de linhas corrigidas;
- número de linhas ignoradas por decisão manual;
- número de divergências remanescentes.

Não registrar:
- dados reais de linha;
- nomes pessoais;
- identificadores sensíveis;
- payloads completos.

---

## 9. Como atualizar status final

Se a janela ainda não foi executada:
- usar `READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`

Se a execução falhar por ausência de target/snapshot/rollback/autorização:
- usar `BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS` para DQ
- usar `READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT` ou status bloqueado equivalente para MIG, conforme a evidência

Se a execução ocorrer e não fechar completamente o stream:
- manter status conservador e descrever a evidência real

Nunca usar `RESOLVED` sem execução real validada e fechamento explícito do stream.

---

## 10. O que não fazer

- não executar mutation sem passar pelo gate;
- não executar `D1 remote` por conveniência;
- não misturar `DQ-01` com `MIG-01` na mesma mutation sem necessidade explícita;
- não acoplar deploy funcional à janela de dados/schema;
- não logar PII;
- não usar dados reais em testes locais;
- não editar migrations históricas;
- não criar migration nova fora de sprint autorizada;
- não “aprovar” produção implicitamente.
