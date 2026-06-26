# SCORM PACKAGE FIX REQUEST — AW139 - MANUTENÇÃO
## AirTrust LMS — 2026-06-26

---

## 1. Identificação do curso

- **Título**: AW139 - Manutenção
- **Categoria**: Manutenção Aeronáutica
- **Versão SCORM esperada**: 1.2
- **Prioridade**: CRÍTICA — maior volume de alunos afetados
- **Casos reportados**: Bruno Justino (módulo 4), Alan Cortes (módulo 6 + regressão), Wagner Domas (avançado/prova)

---

## 2. Problemas observados (relatos operacionais)

### 2.1 Regressão de progresso

- **Aluno afetado**: Alan Cortes
- **Sintoma**: chegou ao módulo 6, fechou o curso, reabriu e estava no início
- **Hipótese técnica**: `lesson_location` e/ou `suspend_data` não foram persistidos antes do fechamento (`LMSFinish` ausente ou chamado sem `LMSCommit` antes)
- **Classificação**: `AW139_PACKAGE_BAD_RESUME` ou `AW139_PACKAGE_MISSING_FINAL_COMMIT`

### 2.2 Progresso baixo com posição alta

- **Sintoma sistêmico**: alunos com location em posições como `18` ou `115` mas `progresso_pct = 1%`
- **Causa confirmada no backend**: o worker calculava progresso a partir do commit de entrada, não do estado reconciliado — **já corrigido no PR #153 + #156**
- **Causa pendente no pacote**: se `lesson_location` não está sendo gravada no formato `{n}/{total}`, o worker não consegue calcular progresso mesmo após a correção

### 2.3 Slides em branco nos módulos 12, 13, 14

- **Relato**: módulos 12, 13 e 14 com conteúdo potencialmente em branco
- **Status de verificação**: NÃO CONFIRMADO — exige exportação do pacote real do R2
- **Hipótese**: assets de slides (imagens, vídeos, HTML inline) com caminhos relativos quebrados ou não incluídos no zip

---

## 3. Evidência técnica disponível

### Harness local (fixture)

No harness de teste `lms-matriculas-progress-integrity.test.ts`:

- Fixture de location usada: `380/380`
- Isso implica que o curso tem 380 posições mapeadas no `lesson_location`
- O harness testa conclusão com `location = 380/380` e `lesson_status = passed`

### Worker — estado após PR #153 + #156

```javascript
// lms-matriculas.ts — extractProgressPctFromCmiJson
// Derivação: location "14/380" → progresso = round(14/380 * 100) = 4%
// Antes: usava payload bruto do commit → podia mostrar 1% mesmo com location 115/380
```

O worker agora:
1. Faz merge defensivo: preserva `lesson_location` mais forte entre payload e estado persistido
2. Calcula `progresso_pct` a partir do `lesson_location` reconciliado
3. Nunca regride progresso

### O que NÃO foi auditado ainda

- Conteúdo real dos slides 1-380
- Presença de `imsmanifest.xml` no pacote publicado
- Launch file real e seu comportamento
- `suspend_data` efetivamente gravado/lido no pacote publicado
- Módulos 12, 13, 14 (slides em branco?)
- Quiz no slide final (presença, comportamento, score)

---

## 4. Campos SCORM obrigatórios para AW139

| campo | formato | obrigatoriedade |
|---|---|---|
| `cmi.core.lesson_location` | `"{n}/380"` (n de 1 a 380) | OBRIGATÓRIO em cada slide |
| `cmi.suspend_data` | JSON string ≤ 4096 chars | OBRIGATÓRIO em cada commit |
| `cmi.core.lesson_status` | `"incomplete"` (andamento), `"passed"` (final) | OBRIGATÓRIO |
| `cmi.core.score.raw` | 0–100 (se houver quiz) | OBRIGATÓRIO se quiz presente |
| `cmi.core.session_time` | `"HH:MM:SS"` | OBRIGATÓRIO |
| `LMSCommit("")` | chamado após cada SetValue | OBRIGATÓRIO |
| `LMSFinish("")` | chamado ao fechar janela | OBRIGATÓRIO |

---

## 5. Padrão de lesson_location para AW139

```
Slide 1 de 380:   "1/380"
Slide 14 de 380:  "14/380"
Slide 380 de 380: "380/380"  ← candidato a conclusão
```

O player AirTrust interpreta `lesson_location = "380/380"` como 100% de progresso.

---

## 6. Padrão de suspend_data para AW139

```javascript
// Exemplo mínimo — ajustar para a estrutura real do conteúdo
LMSSetValue("cmi.suspend_data", JSON.stringify({
  currentSlide: 14,
  totalSlides: 380,
  visitedSlides: [1, 2, 3, ..., 14],
  moduleProgress: { 1: true, 2: true, 3: true }  // módulos completados
}))
```

Regra: se `suspend_data` está vazio após reabrir o curso, o conteúdo começa do zero — regressão confirmada.

---

## 7. Exigências específicas para módulos 12, 13, 14

Antes de entregar o pacote corrigido, o agente SCORM DEVE verificar:

1. Cada slide dos módulos 12, 13 e 14 tem conteúdo visível (texto ou mídia)
2. Nenhum asset (imagem, vídeo, áudio) desses módulos tem path relativo quebrado
3. O `lesson_location` é gravado ao entrar nesses módulos
4. O `suspend_data` inclui referência a esses módulos
5. Capturar screenshot de pelo menos 1 slide de cada módulo como prova

---

## 8. Casos de alunos afetados — mapeamento

### Bruno Justino — AW139 até módulo 4

- **Ação solicitada**: restaurar progresso para posição equivalente ao módulo 4 (slide estimado: ~40/380 se módulos uniformes)
- **Classificação**: `RESTORE_PROGRESS_ONLY`
- **Não concluir, não gerar qualificação**

### Alan Cortes — AW139 passou módulo 6, voltou

- **Ação solicitada**: restaurar progresso para posição pós-módulo 6 (slide estimado: ~60/380 se módulos uniformes)
- **Classificação**: `RESTORE_PROGRESS_ONLY`
- **Confirmar posição exata de módulo 6 após auditar o pacote real**

### Wagner Domas — AW139 avançado/prova

- **Classificação**: `NEEDS_MORE_EVIDENCE`
- **Necessário**: documentar posição específica, tentativas de quiz, score
- **Não agir sem evidência adicional**

---

## 9. Classificação esperada após auditoria do pacote real

Para preencher após exportar e auditar o pacote:

| check | resultado esperado |
|---|---|
| `imsmanifest.xml` presente | `PACKAGE_OK` ou `PACKAGE_REPACKAGING_REQUIRED` |
| Launch file presente e válido | a preencher |
| `LMSInitialize` presente | a preencher |
| `LMSSetValue("cmi.core.lesson_location", ...)` com formato `n/380` | a preencher |
| `suspend_data` gravado | a preencher |
| `LMSCommit` chamado | a preencher |
| `LMSFinish` chamado | a preencher |
| `alert()` ausente | a preencher |
| Slides 12, 13, 14 com conteúdo | a preencher |
| Nenhum asset 404 | a preencher |
| Teste de retomada: OK | a preencher |
| Teste de conclusão: OK | a preencher |

Classificações possíveis após auditoria:

- `AW139_PACKAGE_OK_READY_FOR_DEPLOY`
- `AW139_PACKAGE_CONTENT_BLANK_REPACKAGING_REQUIRED`
- `AW139_PACKAGE_RESUME_BROKEN`
- `AW139_PACKAGE_FINAL_STATUS_MISSING`
- `AW139_PACKAGE_MISSING_FINAL_COMMIT`
- `AW139_WRAPPER_COMPENSATION_POSSIBLE`
- `AW139_PACKAGE_BAD_LESSON_LOCATION_FORMAT`

---

## 10. Critérios de aceite do pacote AW139 corrigido

Para aceitar o pacote:

1. 380 slides mapeados com `lesson_location` em formato `{n}/380`
2. `suspend_data` gravado e recuperado corretamente
3. `LMSFinish("")` chamado ANTES de `window.close()`
4. Módulos 12, 13, 14 sem slides em branco
5. Nenhum `alert()` no código
6. Teste de retomada passando (fechar no slide 14, reabrir, estar no slide 14)
7. Teste de conclusão passando (chegar no 380/380 com `lesson_status = passed`)
8. 0 erros 404 no DevTools Network ao percorrer o curso

---

## 11. Entregável esperado

1. `AW139-Manutencao-v{versao}.zip` com o pacote corrigido
2. `AW139-Manutencao-v{versao}-test-report.md` cobrindo os 7 testes do contrato
3. SHA256 do `.zip`
4. Lista de issues corrigidos com referência ao item do contrato

Entregar para: `tmp/scorm-packages-audit/20260626/AW139-Manutencao/`
