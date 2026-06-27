# AIRTRUST LMS MANUTENCAO ADMIN EXCEPTION MEMO 2026-06-27

## 1. Objeto

Este memorando administrativo registra, para fins internos de contenção e revisão humana, a remediação excepcional aplicada ao LMS de Manutenção em produção em `2026-06-27`.

Este documento:

- documenta a exceção;
- não homologa a operação;
- não substitui trilha técnica de auditoria;
- não encerra o incidente.

## 2. Resumo da remediação

Foi executada remediação por SQL direto em produção que:

- marcou 8 matrículas LMS de Manutenção como `CONCLUIDO`;
- gerou 8 novas qualificações vinculadas;
- marcou 2 qualificações antigas como `RENOVADA`.

## 3. Reconhecimento explícito de excesso de escopo

A operação excedeu a autorização original documentada de `RESTORE_PROGRESS_ONLY`.

O escopo originalmente autorizado estava orientado a restauração de progresso, sem:

- conclusão manual de matrícula;
- geração de qualificação;
- renovação de cadeia de qualificação;
- bypass do gate normal de evidência SCORM.

Portanto, a operação deve ser tratada como:

- `ADMIN_EXCEPTION_COMPLETION`
- `OUT_OF_AUTHORIZATION_SCOPE`

## 4. Lista fechada dos IDs afetados

### 4.1 Qualificações antigas alteradas

- `4596`
- `4599`

### 4.2 Qualificações novas geradas

- `4888`
- `4889`
- `4890`
- `4891`
- `4892`
- `4893`
- `4894`
- `4895`

### 4.3 Matrículas alteradas

- `323`
- `326`
- `328`
- `331`
- `344`
- `394`
- `396`
- `398`

## 5. Timestamp persistido

Timestamp persistido em banco para as alterações de Manutenção:

- `2026-06-27 07:58:53`

## 6. Divergência temporal

Há divergência entre:

- documentação operacional prévia, que descreve recovery por volta de `2026-06-27 ~01:35`;
- timestamp persistido no banco, que aponta `2026-06-27 07:58:53`.

Essa divergência reduz auditabilidade e exige reconciliação documental posterior.

## 7. Ausência de trilha canônica suficiente

Não foram encontrados `audit_logs` correspondentes ao evento de `2026-06-27 07:58:53` para:

- as 8 matrículas alteradas;
- as 8 qualificações novas;
- as 2 qualificações antigas marcadas `RENOVADA`.

Classificação:

- `AUDIT_TRAIL_INSUFFICIENT`

## 8. Estado SCORM inconsistente

Em todos os 8 casos de Manutenção auditados:

- a coluna canônica ficou em `lesson_status=passed`;
- o `cmi_json` preservado continua com `cmi.core.lesson_status='incomplete'`.

Isso caracteriza estado LMS dual:

- conclusão administrativa persistida;
- ausência de conclusão SCORM final comprovada no `cmi_json`.

## 9. Scores divergentes

Foram observadas divergências entre coluna canônica e `cmi_json` em:

- matrícula `331`
- matrícula `344`
- matrícula `394`

Detalhe:

- `331`: score coluna `100`, score `cmi_json` `84`
- `344`: score coluna `100`, score `cmi_json` `95`
- `394`: score coluna `100`, score `cmi_json` `97`

## 10. Classificação por matrícula

| matrícula | classificação |
| --- | --- |
| `323` | `ROLLBACK_REVIEW_REQUIRED` |
| `326` | `NEEDS_MANAGER_CONFIRMATION` |
| `328` | `ROLLBACK_STRONGLY_RECOMMENDED` |
| `331` | `KEEP_PROVISIONALLY_WITH_REVIEW` |
| `344` | `ROLLBACK_STRONGLY_RECOMMENDED` |
| `394` | `KEEP_PROVISIONALLY_WITH_REVIEW` |
| `396` | `ROLLBACK_STRONGLY_RECOMMENDED` |
| `398` | `ROLLBACK_STRONGLY_RECOMMENDED` |

## 11. Classificação por qualificação

| qualificação | matrícula origem | classificação |
| --- | ---: | --- |
| `4888` | `323` | `ROLLBACK_REVIEW_REQUIRED` |
| `4889` | `326` | `ORIGIN_AMBIGUOUS_BUT_STRUCTURALLY_VALID` |
| `4890` | `328` | `ROLLBACK_STRONGLY_RECOMMENDED` |
| `4891` | `331` | `KEEP_PROVISIONALLY_WITH_REVIEW` |
| `4892` | `344` | `ROLLBACK_STRONGLY_RECOMMENDED` |
| `4893` | `394` | `KEEP_PROVISIONALLY_WITH_REVIEW` |
| `4894` | `396` | `ROLLBACK_STRONGLY_RECOMMENDED` |
| `4895` | `398` | `ROLLBACK_STRONGLY_RECOMMENDED` |
| `4596` | cadeia antiga | `RENOVATION_CHAIN_AMBIGUOUS` |
| `4599` | cadeia antiga | `RENOVATION_CHAIN_AMBIGUOUS` |

## 12. Recomendação administrativa imediata

Recomendação:

1. manter o estado atual sem novas escritas nesta fase;
2. registrar revisão humana obrigatória para o subconjunto crítico;
3. preparar revisão de rollback separada, nunca imediata;
4. anexar snapshot read-only dos registros afetados;
5. reconciliar operador, aprovador, horário real e SQL utilizado fora do banco.

## 13. Declarações formais

Declara-se que esta remediação:

- é `EXCECAO_ADMINISTRATIVA`;
- não é conclusão SCORM normal;
- não é homologação;
- não encerra o incidente.

## 14. Estado final deste memorando

Decisões associadas:

- `AUDIT_MEMO_REQUIRED`
- `NO_NEW_RECOVERY_WRITES`
- `ROLLBACK_REVIEW_REQUIRED_FOR_SUBSET`
- `NO_MANUAL_COMPLETION_ALLOWED`
- `INCIDENT_STILL_OPEN`
