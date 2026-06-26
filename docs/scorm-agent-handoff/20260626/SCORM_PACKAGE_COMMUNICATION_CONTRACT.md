# SCORM PACKAGE COMMUNICATION CONTRACT
## AirTrust LMS — Manutenção — 2026-06-26

Este documento define o contrato técnico entre o AirTrust LMS e qualquer pacote SCORM publicado para os cursos de Manutenção. O agente SCORM deve produzir pacotes que respeitem este contrato integralmente.

---

## 1. Versão SCORM alvo

SCORM 1.2 (IEEE 1484.11.1-2004 LMS RTE).

Todos os campos referem-se à API SCORM 1.2 (`cmi.*`). Pacotes SCORM 2004 não são o alvo desta fase.

---

## 2. API obrigatória no launch file

O launch file (geralmente `index.html` ou `story.html`) DEVE:

```javascript
// Inicialização obrigatória ao carregar
LMSInitialize("") // retorna "true" ou será tratado como falha

// Gravação de estado (mínimo obrigatório)
LMSSetValue("cmi.core.lesson_location", "<posição>")
LMSSetValue("cmi.suspend_data", "<dados de retomada>")
LMSSetValue("cmi.core.lesson_status", "<status>")
LMSSetValue("cmi.core.score.raw", "<pontuação>")
LMSSetValue("cmi.core.session_time", "<tempo>")

// Commit após cada bloco de mudanças (não apenas no final)
LMSCommit("") // mínimo: ao sair de cada slide/módulo

// Finalização obrigatória
LMSFinish("") // chamado ANTES de fechar a janela
```

### Proibições absolutas

- `alert()` nativo proibido em qualquer parte do código
- `window.close()` sem `LMSFinish("")` chamado antes
- `LMSFinish("")` sem `LMSCommit("")` imediatamente antes
- `LMSSetValue` com campo inválido ignorado silenciosamente sem log

---

## 3. lesson_location — padrão obrigatório

### Formato esperado

```
{slide_atual}/{total_slides}
```

Exemplos válidos:

```
1/380       # slide 1 de 380 (AW139)
14/380      # slide 14 de 380 (AW139)
380/380     # slide final (candidato a conclusão)
2/108       # slide 2 de 108 (PT6C)
```

### Regras

1. `lesson_location` DEVE ser gravada ao entrar em CADA slide/módulo
2. O formato `{atual}/{total}` é obrigatório para que o wrapper AirTrust calcule `progresso_pct`
3. A posição zero (`0/{total}` ou `""`) é permitida apenas na inicialização
4. Nunca gravar uma posição menor do que a já persistida (proteção anti-regressão fica no LMS, mas o pacote não deve regredir intencionalmente)

### Como o AirTrust calcula progresso

O worker deriva `progresso_pct` do `lesson_location` reconciliado:

```javascript
// extractProgressPctFromCmiJson em lms-matriculas.ts
const [current, total] = location.split('/').map(Number)
progresso_pct = Math.round((current / total) * 100)
```

Se `lesson_location` estiver ausente ou malformado, `progresso_pct` não é atualizado.

---

## 4. suspend_data — padrão obrigatório

### Propósito

`suspend_data` armazena o estado interno do curso para permitir retomada no ponto exato onde o aluno parou.

### Requisitos

1. DEVE ser gravado com `LMSSetValue("cmi.suspend_data", ...)` a cada commit
2. Tamanho máximo: 4096 caracteres (SCORM 1.2)
3. Deve incluir pelo menos: posição atual, slides visitados, respostas de quiz (se houver)
4. Formato recomendado: JSON compacto serializado como string:
   ```javascript
   LMSSetValue("cmi.suspend_data", JSON.stringify({
     pos: currentSlide,
     visited: visitedSlides,
     quiz: quizState
   }))
   ```
5. DEVE ser lido em `LMSGetValue("cmi.suspend_data")` no `LMSInitialize` para restaurar estado

---

## 5. lesson_status — padrão obrigatório

### Valores permitidos (SCORM 1.2)

```
not attempted  — estado inicial
incomplete     — em andamento
passed         — aprovado (requer score >= mastery_score E conclusão confirmada)
failed         — reprovado (requer conclusão com score < mastery_score)
completed      — completado sem nota (aceito pelo AirTrust como conclusão)
browsed        — visitado sem interação (não aceito como conclusão)
```

### Regras de transição

1. O status NUNCA deve regredir de `passed`/`completed` para `incomplete`
2. `passed` ou `completed` DEVE ser gravado apenas no slide/tela de conclusão final
3. `LMSSetValue("cmi.core.lesson_status", "passed")` DEVE ser seguido imediatamente por `LMSCommit("")` e depois `LMSFinish("")`
4. Não gravar `passed` em slides intermediários

### Fluxo de conclusão obrigatório

```javascript
// Ao chegar no slide final com aprovação confirmada
LMSSetValue("cmi.core.lesson_status", "passed")   // ou "completed"
LMSSetValue("cmi.core.score.raw", score)
LMSSetValue("cmi.core.lesson_location", totalSlides + "/" + totalSlides)
LMSCommit("")                                       // OBRIGATÓRIO antes do finish
LMSFinish("")                                       // OBRIGATÓRIO ao encerrar
```

---

## 6. score.raw — padrão obrigatório para cursos com quiz

### Campos obrigatórios quando há avaliação

```javascript
LMSSetValue("cmi.core.score.raw", pontuacao)    // 0 a 100
LMSSetValue("cmi.core.score.min", 0)
LMSSetValue("cmi.core.score.max", 100)
```

### Mastery score

O AirTrust usa `scorm_mastery_score` da tabela `lms_cursos` (padrão: 70). O pacote DEVE:

1. Ler `LMSGetValue("cmi.student_data.mastery_score")` para saber o threshold configurado
2. Só gravar `lesson_status = "passed"` se `score.raw >= mastery_score`
3. Gravar `lesson_status = "failed"` se o aluno chegou ao final com `score.raw < mastery_score`

---

## 7. session_time — obrigatório

```javascript
// Formato HH:MM:SS
LMSSetValue("cmi.core.session_time", "00:45:30")
```

Deve refletir o tempo real de sessão desde o `LMSInitialize`. Sem isso, o LMS não acumula `total_time`.

---

## 8. Slides vazios — critério de aceite

Um slide é considerado inválido se:

- Não tem texto, imagem, vídeo ou interação
- O asset referenciado não carrega (404, CORS, path relativo quebrado)
- É uma tela de loading que nunca resolve

O pacote DEVE:

1. Não incluir slides sem conteúdo
2. Garantir que todos os paths de assets são relativos ao diretório do launch file
3. Não depender de CDN externo para conteúdo de slides

---

## 9. Critérios de aceite do pacote

Para que um pacote seja aceito para publicação no AirTrust:

| critério | verificação |
|---|---|
| `imsmanifest.xml` válido | launch file listado como `<resource href="...">` |
| `LMSInitialize("")` chamado | grep no bundle JS |
| `LMSSetValue` chamado | grep no bundle JS |
| `LMSCommit("")` chamado | grep no bundle JS |
| `LMSFinish("")` chamado | grep no bundle JS |
| `lesson_location` no formato `{n}/{total}` | grep + teste manual |
| `suspend_data` gravado e lido | grep + teste manual de retomada |
| `lesson_status` = `passed` ou `completed` apenas no slide final | teste manual |
| Nenhum `alert()` | grep no bundle JS |
| Todos os assets carregando | abertura manual + console network |
| Nenhum slide em branco | revisão visual de todos os slides |
| Conclusão persistida após fechar e reabrir | teste de retomada |
| `LMSFinish` antes de fechar janela | teste com devtools |

---

## 10. Teste mínimo obrigatório antes da entrega

O agente SCORM DEVE executar e documentar os seguintes testes antes de entregar o pacote:

1. **Teste de inicialização**: abrir o curso, confirmar `LMSInitialize` chamado
2. **Teste de progresso**: avançar 3 slides, fechar, reabrir — confirmar retomada no slide 3
3. **Teste anti-regressão**: avançar ao slide 10, fechar, reabrir, confirmar posição >= 10
4. **Teste de conclusão**: completar o curso, fechar, reabrir — confirmar `lesson_status = passed/completed`
5. **Teste de quiz** (se houver): responder incorretamente, verificar `failed`; responder corretamente, verificar `passed`
6. **Teste de slides vazios**: navegar por todos os slides, confirmar ausência de telas em branco
7. **Teste de assets**: abrir DevTools Network, confirmar 0 erros 404 em assets de slides

---

## 11. Entregáveis esperados do agente SCORM

Para cada curso:

1. Arquivo `.zip` com o pacote SCORM corrigido
2. `imsmanifest.xml` válido na raiz do zip
3. Relatório de teste (captura de tela ou texto) cobrindo os 7 testes acima
4. Checksum SHA256 do `.zip`
5. Nota sobre quais issues foram corrigidos

Entregar para: `tmp/scorm-packages-audit/20260626/{slug_do_curso}/`

---

## 12. Proibições de entrega

O agente SCORM NÃO DEVE:

- Incluir credenciais, tokens ou secrets no pacote
- Incluir dados de alunos reais no pacote
- Depender de servidor externo para funcionar offline
- Usar `alert()` para qualquer interação
- Alterar o catálogo LMS ou banco de dados
- Substituir pacotes em produção sem autorização explícita
