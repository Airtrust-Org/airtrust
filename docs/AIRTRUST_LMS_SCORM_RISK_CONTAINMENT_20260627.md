# AIRTRUST LMS SCORM RISK CONTAINMENT 2026-06-27

## 1. Resumo executivo

As auditorias de `2026-06-27` confirmam duas frentes de risco:

1. Manutenção teve remediação administrativa fora do escopo autorizado, com 8 conclusões e 8 qualificações geradas por SQL direto.
2. Tripulação possui marcações administrativas históricas e defeitos estruturais no engine SCORM, com caso crítico confirmado em `EFB / matrícula 12 / qh 4449`.

Conclusão geral:

- `NO_NEW_RECOVERY_WRITES`
- `AUDIT_MEMO_REQUIRED`
- `ROLLBACK_REVIEW_REQUIRED_FOR_SUBSET`
- `EFB_M12_ROLLBACK_REVIEW_REQUIRED`
- `TRIPULACAO_SCORM_ENGINE_REWORK_REQUIRED`
- `NO_MANUAL_COMPLETION_ALLOWED`
- `INCIDENT_STILL_OPEN`

## 2. Riscos de Manutenção

### Achados principais

- 8 matrículas alteradas para `CONCLUIDO`
- 8 novas qualificações `4888..4895`
- 2 qualificações antigas `4596`, `4599` marcadas `RENOVADA`
- timestamp persistido em banco: `2026-06-27 07:58:53`
- ausência de `audit_logs` do recovery
- estado SCORM inconsistente:
  - coluna `lesson_status=passed`
  - `cmi_json` preservado `incomplete`

### Casos críticos

- `328`
- `344`
- `396`
- `398`

### Casos sob revisão

- `323`
- `326`
- `331`
- `394`

## 3. Riscos de Tripulação

### Risco estrutural

Os pacotes de Tripulação compartilham os mesmos defeitos sistêmicos:

- ausência de `cmi.suspend_data`
- `lesson_location` fraco/inconsistente
- UX de quiz baseada em `alert()`

### Risco de dados históricos

Há marcações administrativas suspeitas em:

- `M3`
- `M5`
- `M6`
- `M7`
- `M8`
- `M9`
- `M11`
- `M12`
- `M25`
- `M26`
- `M29`
- `M37`

### Classificação das marcações administrativas históricas

| caso | matrícula | curso | classificação |
| --- | ---: | --- | --- |
| `M3` | `3` | CGA | `ADMIN_COMPLETION_WITHOUT_SCORM_STATUS` |
| `M5` | `5` | Emergências Gerais | `ADMIN_COMPLETION_WITHOUT_SCORM_STATUS` |
| `M6` | `6` | PBN | `ADMIN_COMPLETION_WITHOUT_SCORM_STATUS` |
| `M7` | `7` | Operação Aeromédica | `ADMIN_COMPLETION_WITHOUT_SCORM_STATUS` |
| `M8` | `8` | Operações Offshore | `ADMIN_COMPLETION_WITHOUT_SCORM_STATUS` |
| `M9` | `9` | PBN | `ADMIN_COMPLETION_WITHOUT_SCORM_STATUS` |
| `M11` | `11` | PBN | `REVIEW_REQUIRED` |
| `M12` | `12` | EFB | `FAILED_BUT_COMPLETED` |
| `M25` | `25` | FDM | `ZERO_SCORM_DATA` |
| `M26` | `26` | FDM | `ZERO_SCORM_DATA` |
| `M29` | `29` | CGA | `REVIEW_REQUIRED` |
| `M37` | `37` | EFB | `KEEP_AS_ADMIN_EXCEPTION` |

### Caso crítico EFB M12

- matrícula `12`
- curso `EFB`
- qualificação `4449`
- `lesson_status=failed`
- `score=0/2`
- `status=CONCLUIDO`
- `audit_logs` mostram `LMS_MATRICULA_REPROVADA` seguido de `LMS_MATRICULA_FINALIZADA_MANUAL`

Decisão:

- `EFB_M12_ROLLBACK_REVIEW_REQUIRED`

## 4. Decisão sobre novas escritas

Decisão operacional desta fase:

- nenhuma nova escrita de recovery;
- nenhum rollback imediato;
- nenhuma conclusão manual;
- nenhuma geração ou revogação de qualificação;
- nenhuma correção de score;
- nenhuma alteração de pacote;
- nenhum deploy.

## 5. Decisões pendentes de rollback

### Manutenção

| matrícula | qualificação | risco | recomendação | evidência faltante | decisão pendente |
| --- | ---: | --- | --- | --- | --- |
| `323` | `4888` | alto | `ROLLBACK_REVIEW_REQUIRED` | aprovação formal + evidência final de conclusão | revisão com gestor |
| `326` | `4889` | médio | `NEEDS_MANAGER_CONFIRMATION` | confirmação humana da conclusão | decisão do gestor |
| `328` | `4890` | crítico | `ROLLBACK_STRONGLY_RECOMMENDED` | prova final real de conclusão | revisão de rollback |
| `331` | `4891` | médio | `KEEP_PROVISIONALLY_WITH_REVIEW` | justificativa para score divergente | revisão documental |
| `344` | `4892` | crítico | `ROLLBACK_STRONGLY_RECOMMENDED` | prova final real + justificativa do score | revisão de rollback |
| `394` | `4893` | médio | `KEEP_PROVISIONALLY_WITH_REVIEW` | justificativa para score divergente | revisão documental |
| `396` | `4894` | crítico | `ROLLBACK_STRONGLY_RECOMMENDED` | prova final real de conclusão | revisão de rollback |
| `398` | `4895` | crítico | `ROLLBACK_STRONGLY_RECOMMENDED` | prova final real de conclusão | revisão de rollback |

### Tripulação

| matrícula | qualificação | risco | recomendação | evidência faltante | decisão pendente |
| --- | ---: | --- | --- | --- | --- |
| `12` | `4449` | crítico | `EFB_M12_ROLLBACK_REVIEW_REQUIRED` | justificativa administrativa + eventual evidência externa de aprovação | revisão com Operações |

## 6. Ações imediatas

1. preservar `NO_NEW_RECOVERY_WRITES`
2. formalizar memorando administrativo de Manutenção
3. preservar snapshot read-only dos registros de Manutenção
4. revisar M12 com Operações antes de qualquer nova ação
5. sinalizar as conclusões administrativas como exceção, não como SCORM normal

## 7. Ações bloqueadas

Bloqueadas nesta fase:

- rollback em produção
- SQL de escrita
- migrations/schema
- reempacotamento de SCORM
- upload de ZIP para R2
- deploy
- qualquer alteração em SIGVOOS, SegVoo ou FRMS

## 8. Próximos passos

### Manutenção

1. consolidar snapshot e memo
2. revisar subconjunto crítico com gestor
3. decidir rollback apenas em fase separada e revisada

### Tripulação

1. revisar caso `M12 / qh 4449`
2. registrar marcações administrativas históricas como exceção sob revisão
3. planejar rework do engine SCORM por prioridade

## 9. Decisão final

Decisão final desta contenção:

- `NO_NEW_RECOVERY_WRITES`
- `AUDIT_MEMO_REQUIRED`
- `ROLLBACK_REVIEW_REQUIRED_FOR_SUBSET`
- `EFB_M12_ROLLBACK_REVIEW_REQUIRED`
- `TRIPULACAO_SCORM_ENGINE_REWORK_REQUIRED`
- `NO_MANUAL_COMPLETION_ALLOWED`
- `INCIDENT_STILL_OPEN`
