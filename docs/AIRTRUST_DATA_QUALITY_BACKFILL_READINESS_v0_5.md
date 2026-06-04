# AirTrust — Data Quality Backfill Readiness v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `72583a31aecf3d0c68e7659880ad5cbba1973f02`  
**Modo:** local/read-only. Sem D1 remoto. Sem dados reais. Sem backfill real. Sem mutation.

---

## 1. Veredito

```text
DQ-01 = READY_FOR_CONTROLLED_BACKFILL
```

O status acima significa somente que os riscos, os critérios de detecção e a ordem segura de uma futura execução controlada estão documentados. Nenhum backfill foi executado nesta etapa.

---

## 2. Escopo do readiness

Este readiness cobre:
- orfandade e inconsistência de tenant;
- simuladores, sessões e participantes;
- qualificações;
- escalas e alocações;
- FRMS/fadiga;
- aeronaves;
- funcionários;
- dashboards/contagens derivadas.

Não cobre:
- saneamento real em produção;
- decisões manuais já aprovadas por negócio;
- correções destrutivas;
- backfill acoplado a deploy funcional.

---

## 3. Mapa de riscos e futura remediação

| Risco DQ | Tabela(s) | Regra de integridade | Como detectar | Correção futura | Exige migration? | Exige backfill? | Exige decisão manual? | Risco operacional | Validação esperada |
|---|---|---|---|---|---|---|---|---|---|
| Funcionário ativo sem tenant | `funcionarios` | todo registro ativo deve ter `empresa_id` válido | `funcionario_sem_empresa` | vincular tenant correto ou inativar registro inconsistente | Possível, se faltar constraint futura | Sim | Sim, quando origem não for inferível | alto | `0 rows` |
| Funcionário duplicado no tenant | `funcionarios` | não pode haver duplicidade operacional por chave local | `funcionario_duplicado_tenant` | consolidar duplicatas e preservar referência correta | Não obrigatória | Sim | Sim | médio | `0 rows` |
| Qualificação ativa duplicada | `qualificacoes_historico` | um mesmo ciclo ativo não deve duplicar por funcionário/qualificação | `qualificacao_duplicada` | consolidar histórico ou cancelar duplicata errada | Possível, se índice/constraint futuro for aprovado | Sim | Sim | médio | `0 rows` |
| Qualificação planejada órfã | `qualificacoes_historico`, `funcionarios` | planejamento deve apontar para funcionário e referência válidos | `qualificacao_planejada_orfa` | recompor referência ou encerrar registro inválido | Não obrigatória | Sim | Sim | médio | `0 rows` |
| Sessão sem participantes | `simulador_sessoes`, `simulador_sessao_participantes` | sessão operacional não deve ficar sem participante quando ativa | `sessao_simulador_sem_participantes` | revisar sessão, cancelar ou recompor participantes | Não | Sim | Sim | médio | `0 rows` ou exceções justificadas |
| Participante cross-tenant ou fora da sessão válida | `sessoes_participantes`, `simulador_agendamentos`, `funcionarios` | participante, sessão e funcionário devem pertencer ao mesmo tenant | testes/guards de rota + auditoria futura por snapshot | reancorar referência correta ou remover lixo histórico | Não | Sim | Sim | alto | `0 casos` em snapshot |
| Tipo de check puxado de outro tenant | `qualificacoes_tipos`, rotas de simuladores | fallback deve respeitar tenant | testes `simuladores-sessoes-data-quality.test.ts` | corrigir referências órfãs ou catálogo tenant indevido | Possível, se surgir necessidade de constraint | Sim | Sim | alto | `0 casos` em snapshot |
| Escala sem tenant válido | `escalas_mensais`, `empresas` | escala deve apontar para tenant existente | `escala_sem_tenant_valido` | completar vínculo ou remover resíduo inválido | Possível | Sim | Sim | alto | `0 rows` |
| Alocação órfã | `escala_alocacoes`, `escalas_mensais` | alocação deve ter escala pai válida | `alocacao_sem_escala_valida` | reancorar ou remover órfão | Possível | Sim | Sim | médio | `0 rows` |
| Alocação duplicada | `escala_alocacoes` | não pode haver duplicata no mesmo intervalo | `alocacao_duplicada` | deduplicar e preservar apenas a linha correta | Possível, com índice futuro | Sim | Sim | médio | `0 rows` |
| Status legado divergente | `qualificacoes_historico` | valores antigos incompatíveis devem ser normalizados | `status_divergente` | normalizar status legado ou converter em batch aprovado | Não obrigatória | Sim | Não | médio | `0 rows` |
| Soft delete inconsistente | `funcionarios` | registro com `deleted_at` não pode seguir ativo | `registro_ativo_deleted_at_inconsistente` | alinhar `status` ou remover inconsistência | Não | Sim | Não | baixo/médio | `0 rows` |
| FRMS sem dados mínimos | `frms_jornadas` | jornada ativa precisa de campos mínimos obrigatórios | `frms_jornada_sem_dados_minimos` | recompor origem ou encerrar jornada inválida | Possível, conforme constraint futura | Sim | Sim | alto | `0 rows` |
| Usuário sem tenant | `usuarios`, `usuarios_empresas` | usuário ativo deve pertencer a pelo menos uma empresa | `usuario_sem_empresa` | completar vínculo ou inativar conta | Não obrigatória | Sim | Sim | alto | `0 rows` |
| Tenant sem admin/manager ativo | `empresas`, `usuarios_empresas`, `usuarios` | tenant operacional deve ter responsável ativo | `empresa_sem_admin` | vincular admin/manager válido | Não | Sim | Sim | alto | `0 rows` |
| Usuário multiempresa sem primária | `usuarios_empresas` | multiempresa precisa de primária/current coerente | `usuario_multiplas_empresas_sem_primaria` | marcar tenant primário ou normalizar vínculo | Não | Sim | Sim | médio | `0 rows` |
| AERONAVES com tenant ausente ou referência cruzada | `aeronaves`, tabelas dependentes | cadastro operacional deve manter tenant coerente | snapshot/query futura específica | recompor tenant e vínculos em lote controlado | Possível | Sim | Sim | médio | `0 casos` em snapshot |
| Dashboards divergentes por base suja | tabelas fonte (`funcionarios`, `qualificacoes_historico`, `simulador_agendamentos`, `lms_*`) | contagens derivadas só são confiáveis se a base fonte estiver íntegra | comparação em staging após backfill | recalcular métricas após saneamento, não antes | Não | Indireto | Não | médio | métricas estabilizadas após saneamento |

---

## 4. Como detectar sem tocar dados reais

Ferramentas locais/read-only já disponíveis:
- `scripts/validation/validate-data-quality-sql.sh`
- `scripts/validation/run-data-quality-local.sh`
- `scripts/audit-data-quality-readiness.sh`
- `worker-airtrust/src/__tests__/routes/simuladores-sessoes-data-quality.test.ts`

Ordem recomendada:
1. validar que o SQL continua `SELECT-only`;
2. executar o audit dry-run local de readiness;
3. usar snapshot local/staging aprovado;
4. só então rodar a auditoria operacional completa em cópia read-only.

---

## 5. O que exigirá migration futura

Pode exigir migration futura, dependendo do lote de achados reais:
- constraints adicionais de tenant ou unicidade;
- índices/constraints para evitar recorrência de duplicatas;
- reforço estrutural onde hoje a integridade depende de regra de aplicação e não de schema.

Nada disso foi implementado nesta etapa.

---

## 6. O que exigirá backfill futuro

Certamente exigirá backfill controlado se o snapshot aprovado confirmar:
- órfãos reais;
- `empresa_id` ausente em registros ativos;
- duplicatas operacionais persistidas;
- status legados incompatíveis;
- jornadas FRMS incompletas;
- ligações inválidas entre sessão, participante e funcionário.

---

## 7. O que exigirá decisão manual

Decisão manual será obrigatória quando:
- houver ambiguidade sobre o tenant correto;
- houver duplicatas onde mais de um registro parece “válido”;
- a remoção puder afetar histórico regulatório;
- a regra de negócio divergir entre áreas operacional, treinamento e compliance.

---

## 8. Critérios para futura execução controlada

Pré-condições de entrada:
1. snapshot aprovado e isolado;
2. credencial/local path read-only quando aplicável;
3. janela sem deploy funcional acoplado;
4. plano de rollback do snapshot;
5. checklist por domínio com responsável nomeado;
6. evidência de `tsc`, `ops:guard`, `test:worker` e guards DQ PASS.

Ordem recomendada:
1. detectar;
2. classificar por severidade;
3. separar o que é auto-corrigível do que exige decisão manual;
4. aprovar o lote de correções;
5. executar em staging/clone;
6. validar dashboard e rotas críticas;
7. só então considerar promoção controlada.

---

## 9. Critérios para `DQ-01 = READY_FOR_CONTROLLED_BACKFILL`

Os critérios agora atendidos são:
1. riscos mapeados por domínio;
2. regra de integridade explícita por risco;
3. forma de detecção documentada;
4. separação entre migration, backfill e decisão manual;
5. runner e SQL read-only preservados;
6. guards críticos de simuladores continuam ativos e testados;
7. nenhum dado real foi tocado.

---

## 10. Próxima etapa recomendada

Executar uma sprint separada de **controlled backfill execution** em snapshot/staging aprovado, começando pelos domínios bloqueadores (`usuarios/tenant`, `funcionarios`, `qualificacoes`, `simuladores`, `escalas`, `FRMS`) e deixando dashboards apenas como validação derivada pós-saneamento.

**Atualização Sprint AJ (2026-06-04):** a tentativa de sair desta readiness para execução real ficou bloqueada por falta de staging aprovado, snapshot, rollback e autorização explícita na sessão atual. Ver `docs/AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md`.
