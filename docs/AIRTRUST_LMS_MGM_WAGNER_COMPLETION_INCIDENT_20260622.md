# AIRTRUST LMS INCIDENT REPORT

Data: 2026-06-22
Incidente: curso MGM do Wagner nao conclui apos prova
Projeto: AirTrust
Escopo: LMS / SCORM / matricula 163

## 1. Resumo executivo

Foi identificado um bug no wrapper SCORM gerado pelo LMS do AirTrust. Em pacotes que marcam conclusao via `lesson_status` / `completion_status` mas nao executam `Commit` ou `Finish` logo em seguida, o player exibia conclusao local ao aluno, porem o backend nao persistia o estado final da tentativa.

No caso da matricula `163`, a base de producao registrou apenas o bootstrap inicial do progresso SCORM, sem score final nem status de conclusao persistidos. Isso explica o sintoma observado: o aluno via o curso como concluido no player, mas a matricula permanecia `EM_ANDAMENTO`.

## 2. Guardrails seguidos

- Nenhuma migration foi criada ou executada.
- Nenhum SQL de escrita em producao foi executado.
- Nenhum ajuste foi feito em SIGVOOS.
- Nenhuma alteracao foi feita em `frms-source-policy.ts`.
- As consultas em producao foram somente leitura, minimas e sanitizadas.

## 3. Evidencias de producao

### 3.1 Matricula 163

Consulta sanitizada em producao retornou:

- `matricula_id=163`
- `empresa_id=6`
- `curso_id=26`
- `curso_titulo="MGM - Manual Geral de Manutencao"`
- `tipo_conteudo="scorm"`
- `scorm_versao="1.2"`
- `scorm_launch_file="index.html"`
- `scorm_mastery_score=70`
- `gerar_qualificacao_ao_concluir=1`
- `qualificacao_tipo_id=125`
- `funcionario_mask="W***"`
- `setor="Manutencao"`
- `status="EM_ANDAMENTO"`
- `progresso_pct=0`
- `score_final=0`
- `data_inicio="2026-06-22 13:10:54"`
- `data_conclusao=null`
- `qualificacao_historico_id=null`

### 3.2 Estado SCORM persistido

Consulta sanitizada em `lms_progresso_scorm` para `matricula_id=163` retornou:

- `lesson_status=null`
- `completion_status=null`
- `success_status=null`
- `score_raw=0`
- `score_max=0`
- `score_min=0`
- `score_scaled=0`
- `total_time=null`
- `session_count=1`
- `last_commit_at="2026-06-22 13:10:54"`
- `updated_at="2026-06-22 13:10:54"`
- `cmi_json_prefix="{}"`

Interpretacao: houve apenas o estado inicial vazio do SCORM. Nao houve persistencia de score final nem de status final.

### 3.3 Verificacao de recorrencia imediata

Foi executada uma consulta minima para detectar outros casos recentes no mesmo curso (`curso_id=26`, `empresa_id=6`) com commit SCORM presente e matricula ainda nao concluida.

Resultado: somente a matricula `163` apareceu na amostra analisada.

Conclusao operacional: o incidente observado esta aderente a um bug de player/wrapper, mas a manifestacao verificada em producao neste momento parece isolada.

## 4. Causa raiz

### 4.1 Bug principal

Arquivo afetado: `worker-airtrust/src/routes/lms-assets.ts`

O wrapper SCORM chamava `checkCompletion()` quando o pacote marcava:

- SCORM 1.2: `cmi.core.lesson_status`
- SCORM 2004: `cmi.completion_status` ou `cmi.success_status`

Porem, antes do hotfix, essa transicao de estado nao agendava persistencia imediata. Se o pacote nao chamasse `LMSCommit` ou `LMSFinish` depois disso, o backend nunca recebia o estado final.

Esse comportamento explica exatamente a matricula `163`.

### 4.2 Bug secundario encontrado durante o endurecimento

Arquivo afetado: `worker-airtrust/src/services/lms-progress-guardrails.ts`

A funcao `mergeMonotonicNumber` convertia `null` em `0` por usar `Number(null)`. No fluxo de conclusao SCORM isso podia transformar `score_scaled` ausente em `0`, mascarando um `score_raw/score_max` valido.

Esse problema foi corrigido para tratar `null`, `undefined` e string vazia como ausencia de valor numerico.

## 5. Correcao aplicada

### 5.1 Hotfix do wrapper SCORM

Arquivo: `worker-airtrust/src/routes/lms-assets.ts`

Foi adicionado `scheduleCommit(800)` quando o pacote marca conclusao via:

- `cmi.core.lesson_status`
- `cmi.completion_status`
- `cmi.success_status`

Efeito: mesmo que o pacote nao chame `Commit` explicitamente depois de marcar conclusao, o player agenda a persistencia do estado final no backend.

### 5.2 Hardening da avaliacao de sucesso SCORM

Arquivo: `worker-airtrust/src/routes/lms-matriculas.ts`

Foram adicionados:

- calculo de score efetivo SCORM com preferencia por `score_scaled` valido e fallback para `score_raw/score_max`
- regra explicita para `mastery score`
- tratamento distinto para:
  - SCORM 1.2 `passed`
  - SCORM 1.2 `completed`
  - SCORM 2004 `success_status=passed`
  - SCORM 2004 `completion_status=completed` com `success_status` vazio ou `unknown`

Objetivo: evitar conclusao indevida quando o pacote envia apenas `completed` mas o score nao atinge o `mastery score`.

### 5.3 Correcao do merge numerico monotonic

Arquivo: `worker-airtrust/src/services/lms-progress-guardrails.ts`

`mergeMonotonicNumber` passou a preservar `null` como ausencia de valor, em vez de converter silenciosamente para zero.

## 6. Testes adicionados e executados

### 6.1 Testes adicionados

`worker-airtrust/src/__tests__/routes/lms-assets-resume.test.ts`

- valida que o source do wrapper agora agenda commit ao marcar conclusao SCORM

`worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`

- conclui commit SCORM 1.2 quando `lesson_status=completed` e score atende mastery
- conclui commit SCORM 2004 quando `completion_status=completed` e `success_status=passed`
- nao conclui commit SCORM completed quando score fica abaixo do mastery

### 6.2 Execucao

Executado com sucesso:

```bash
cd worker-airtrust && npx vitest run src/__tests__/routes/lms-matriculas-progress-integrity.test.ts src/__tests__/routes/lms-assets-resume.test.ts src/__tests__/routes/lms-progresso.test.ts
```

Resultado:

- `3` arquivos de teste aprovados
- `12` testes aprovados

Executado com sucesso:

```bash
npm run test:run -- src/__tests__/lms-access-and-finalize.test.tsx
```

Resultado:

- `1` arquivo de teste aprovado
- `13` testes aprovados

Executado com sucesso:

```bash
npm run lint
npm run build
```

## 7. Risco residual

O hotfix evita reincidencia para pacotes SCORM que sinalizam conclusao sem chamar `Commit` logo depois. A matricula `163` ja afetada continua dependendo de remediacao operacional se a empresa quiser refletir imediatamente a conclusao historica, porque o backend nao possui evidencia final persistida dessa tentativa alem do relato operacional.

## 8. Remediacao operacional da matricula 163

Nenhum SQL de escrita foi executado.

Como a causa raiz foi bug de persistencia do player, e nao inconsistencia interna isolada de banco, nao foi aplicada remediacao automatica em producao nesta analise.

Se o time operacional optar por concluir manualmente a matricula `163`, a recomendacao e fazer isso apenas com aprovacao explicita e evidencia de negocio suficiente sobre a nota/aprovacao final do aluno. Essa remediacao deve ser tratada fora deste hotfix.

## 9. Classificacao final

- Tipo: bug de codigo
- Camada primaria: player/wrapper SCORM
- Impacto: conclusao visual no player sem persistencia final no backend
- Escopo verificado em producao: matricula `163`, sem recorrencia imediata detectada na amostra minima do mesmo curso
