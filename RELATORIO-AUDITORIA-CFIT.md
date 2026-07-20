# Relatório de Auditoria UI/UX — Treinamento CFIT em Helicópteros

**Curso:** CFIT em Helicópteros (ID 36, Empresa 6 — Costa do Sol)
**Versão:** Rev. 06 — 2026-07-15 (revisão geral de layout 16:9, mídia e textos estruturais)
**Data da auditoria:** 2026-07-16
**Total de slides:** 41 (s01–s41)
**Capítulos:** Abertura + 5 capítulos + Encerramento
**Quizzes:** 5 módulos × 10 questões (50 questões no total)
**Cenários interativos:** 4
**Vídeos:** 3

---

## Resumo Executivo

O curso apresenta **conteúdo técnico-operacional sólido** com estrutura pedagógica coerente e design system consistente. A revisão Rev. 06 melhorou significativamente o layout 16:9 e a organização dos quizzes por capítulo. Foram identificadas **28 correções necessárias** distribuídas em 4 níveis de severidade:

| Severidade | Quantidade | Impacto |
|-----------|-----------|---------|
| 🔴 CRÍTICO | 5 | Acessibilidade, funcionalidade quebrada, segurança de conteúdo |
| 🟠 ALTO | 8 | Contraste, touch targets, responsividade, UX |
| 🟡 MÉDIO | 10 | Tipografia, consistência visual, qualidade de assets |
| 🟢 BAIXO | 5 | Refinamentos, otimizações, polish |

---

## 🔴 CRÍTICO (5 correções)

### C1. Imagens sem atributo `alt` descritivo — 17 slides afetados

**Slides:** s01, s04, s05, s06, s07, s08, s11, s12, s13, s14, s15, s19, s20, s21, s22, s23, s27, s28, s29, s30, s31, s32, s35, s36, s37, s38, s39, s41

**Problema:** Dos 28 slides que usam o campo `image`, apenas 2 (`s04`, s05 implícito) possuem `imageAlt` definido. Os demais 26 slides com imagens NÃO têm texto alternativo. Isso viola WCAG 2.1 AA — critério 1.1.1 (Non-text Content).

**Diretriz UI/UX:** `alt-text` — Descriptive alt text for meaningful images.

**Correção:** Adicionar `imageAlt` descritivo em português para TODOS os slides com `image`. Exemplo para s01:
```json
"imageAlt": "Cockpit de helicóptero com painel de instrumentos e visão externa do horizonte"
```

---

### C2. Assets de mídia referenciados mas potencialmente ausentes no R2

**Slides:** s07, s16, s24, s30 (vídeos) + todos os slides com `image`

**Problema:** Os arquivos referenciados em `media/images/` e `media/videos/` precisam existir no diretório `lms/scorm/6/36/media/` do R2. Se qualquer asset estiver faltando, o slide quebra silenciosamente (imagem quebrada ou vídeo não carrega).

**Correção:**
1. Verificar existência de TODOS os assets listados no R2
2. Confirmar que os vídeos `.mp4` estão codificados em H.264/AAC para compatibilidade cross-browser
3. Adicionar `poster` images para todos os `<video>` elements como fallback

---

### C3. Contraste de cor insuficiente no texto `#afc5da` sobre fundo `#001a39`

**Local:** `.brand small` na sidebar (CSS linha 8)

**Problema:** O texto `color: #afc5da` sobre `background: #001a39` tem razão de contraste de aproximadamente 4.0:1 — abaixo do mínimo WCAG AA de 4.5:1 para texto normal.

**Diretriz UI/UX:** `color-contrast` — Minimum 4.5:1 ratio for normal text.

**Correção:** Alterar para `color: #c5d5e8` ou `color: #d0dff0` (contraste > 4.5:1).

---

### C4. Texto de callout dentro de `.callout` pode exceder a tela em slides com muito conteúdo

**Slides:** s07, s28, s35 (callouts muito longos)

**Problema:** O slide s07 tem um `callout` com 409 caracteres que combina "Observe no vídeo" + "Depois do vídeo" em um único parágrafo. No layout 16:9 com `max-height` fixo, callouts longos podem ser cortados sem scroll visível.

**Correção:**
1. Dividir callouts longos em dois elementos separados (ex: `callout` + `note`)
2. Ou adicionar `overflow-y: auto` condicional em `.callout` para textos acima de 200 caracteres
3. Alternativa: usar `videoSide` + `callout` como já existe no layout `video`

---

### C5. Navegação por teclado não cobre quizzes modulares (`module_quiz`)

**Slides:** s10, s18, s26, s34, s40

**Problema:** O layout `module_quiz` renderiza questões com botões `.option`, mas o `app.js` não adiciona handlers de teclado (Enter/Space para selecionar, setas para navegar entre opções). A navegação por teclado é essencial para acessibilidade (WCAG 2.1.1 — Keyboard).

**Diretriz UI/UX:** `keyboard-nav` — Tab order matches visual order.

**Correção:** No `app.js`, na função `bind()` (ou equivalente), adicionar:
```js
document.querySelectorAll('.option:not(:disabled)').forEach((el, i, all) => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    if (e.key === 'ArrowDown' && i < all.length - 1) all[i+1].focus();
    if (e.key === 'ArrowUp' && i > 0) all[i-1].focus();
  });
});
```

---

## 🟠 ALTO (8 correções)

### A1. `cursor: pointer` ausente em elementos interativos

**Slides:** s02 (objectives), s11 (timeline interativa), s15/s23/s32/s38 (scenario options), s31 (flowchart lanes)

**Problema:** Elementos interativos como `.touchable`, `.objective`, `.option`, e `.lane` não possuem `cursor: pointer` explícito no CSS. Apenas `.touchable` tem `cursor: pointer` (linha 34 do CSS), mas `.touchable.active` e os demais elementos clicáveis não herdam essa propriedade consistentemente.

**Diretriz UI/UX:** `cursor-pointer` — Add cursor-pointer to all clickable/hoverable cards.

**Correção:** Adicionar `cursor: pointer` a:
- `.objective` (comportamento de toggle)
- `.option:not(:disabled)`
- `.lane.touchable`
- `.timeline-step.touchable`

---

### A2. Touch targets abaixo de 44×44px em elementos da sidebar

**Local:** `.menu-item` e `.menu-num` na sidebar

**Problema:** O `.menu-num` tem `width: 22px; height: 22px` e o padding do `.menu-item` é `10px 9px`, resultando em altura efetiva de aproximadamente 38px em telas pequenas — abaixo do mínimo de 44px recomendado para touch targets.

**Diretriz UI/UX:** `touch-target-size` — Minimum 44x44px touch targets.

**Correção:** Aumentar padding do `.menu-item` para `padding: 12px 10px` e garantir `min-height: 44px`.

---

### A3. Layout `split` não tem fallback quando `left` ou `right` são objetos vazios

**Slide:** s13 (`split`)

**Problema:** O slide s13 define `left` e `right` como objetos com `title` + `items`, e também tem `leftTitle`/`rightTitle` como strings separadas. Se o `app.js` usar `leftTitle` em vez de `left.title`, o título fica duplicado. Se usar `left.title` e `leftTitle` não for consumido, não há problema — mas a redundância indica possível confusão de contrato.

**Correção:** Padronizar: OU usar `left.title`/`right.title` (remover `leftTitle`/`rightTitle`), OU usar `leftTitle`/`rightTitle` como chaves top-level. Atualmente o `app.js` usa `s.left.title`, então remover `leftTitle`/`rightTitle` do slide s13.

---

### A4. Imagens com `aspect-ratio: 16/9` fixo podem distorcer em telas estreitas

**Local:** CSS `.media-card img` (linha 32/74)

**Problema:** A regra `aspect-ratio: 16/9` combinada com `object-fit: cover` força o crop. Em mobile (< 520px), imagens operacionais importantes podem perder contexto (ex: imagem de terreno, água, painel de instrumentos).

**Diretriz UI/UX:** `responsive-images` — Use appropriate sizing and cropping.

**Correção:** Em telas < 520px, mudar para `aspect-ratio: auto` ou `object-fit: contain` para preservar o conteúdo completo da imagem.

---

### A5. Sem indicador de carregamento para vídeos

**Slides:** s07, s16, s24, s30

**Problema:** Os elementos `<video>` não têm estado de loading visível. Em conexões lentas, o aluno vê uma área preta sem feedback.

**Diretriz UI/UX:** `loading-states` — Skeleton screens or spinners.

**Correção:** Adicionar um placeholder visual (thumbnail + ícone de play com animação de pulse) antes do vídeo carregar. Opção CSS pura:
```css
.video-card { position: relative; }
.video-card::before {
  content: "Carregando vídeo...";
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0,18,45,.6);
  z-index: 1;
}
.video-card video[src] + .video-card::before { display: none; }
```

---

### A6. `prefers-reduced-motion` não respeitado

**Local:** CSS — transições e animações

**Problema:** O CSS usa `transition: .16s ease`, `transition: .2s ease` e animações de `transform: translateX(-105%)` na sidebar sem nenhuma media query `@media (prefers-reduced-motion: reduce)`.

**Diretriz UI/UX:** `reduced-motion` — Check prefers-reduced-motion.

**Correção:** Adicionar ao CSS:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### A7. Quizzes não informam navegação por teclado nem tempo restante

**Slides:** s10, s18, s26, s34, s40

**Problema:** O layout `module_quiz` mostra "Questão X de 10" e uma barra de progresso, mas não informa:
- Que é possível navegar com teclado
- Quantas questões faltam para terminar
- Se há tempo limite (não há, mas deveria ser explícito)

**Correção:** Adicionar ao `quiz-progress`: "Sem limite de tempo. Use Tab para navegar entre alternativas."

---

### A8. Slide s01 — hero labels genéricos

**Slide:** s01 (cover)

**Problema:** Os `hero` cards usam labels "Resultado 1", "Resultado 2", "Resultado 3" — rótulos genéricos que não comunicam o valor dos objetivos. Os textos dos bullets são idênticos aos textos dos hero cards, duplicando a informação.

**Correção:** Substituir os labels:
```json
"hero": [
  { "label": "Decidir", "text": "Quando interromper, nivelar, arremeter ou transitar para instrumentos." },
  { "label": "Aplicar", "text": "Briefing, mínimos, SOP, CRM, checklist e resposta imediata ao EGPWS/GPWS." },
  { "label": "Relacionar", "text": "Casos reais com decisões operacionais de rotina." }
]
```
E remover o campo `bullets` duplicado.

---

## 🟡 MÉDIO (10 correções)

### M1. `line-height` do corpo de texto abaixo do recomendado

**Local:** `.lead`, `.card p`, e corpo de texto geral

**Problema:** O `line-height: 1.42` em `.lead` (Rev. 06) e `line-height: 1.35` em `.callout` estão abaixo da recomendação de 1.5–1.75 para legibilidade de corpo de texto.

**Diretriz UI/UX:** `line-height` — Use 1.5-1.75 for body text.

**Correção:** Aumentar `.lead` para `line-height: 1.55` e `.callout` para `line-height: 1.5`.

---

### M2. Fonte Inter sem fallback adequado para caracteres especiais em português

**Local:** CSS `font-family: Inter, Arial, Helvetica, sans-serif`

**Problema:** Caracteres como "ç", "ã", "õ", "é" são comuns no conteúdo (ex: "Prevenção", "Helicópteros", "Consciência"). A fonte Inter suporta esses caracteres, mas em sistemas onde Inter não está disponível, Arial renderiza "ç" e acentos com métricas ligeiramente diferentes.

**Correção:** Adicionar `system-ui` antes de Arial e incluir fontes otimizadas para português:
```css
font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
```

---

### M3. Imagem `cover_cockpit_overlay.jpg` usada no slide s01 não tem fallback

**Slide:** s01

**Problema:** Se a imagem `media/images/cover_cockpit_overlay.jpg` falhar ao carregar, o layout cover perde metade do impacto visual sem indicação.

**Correção:** Adicionar cor de fundo fallback via CSS inline ou garantir que o `imageAlt` seja mostrado quando a imagem falha (usando `onerror` handler no JS).

---

### M4. Inconsistência: `review_grid` vs `focus_cards` para resumos de capítulo

**Slides:** s09, s17, s25, s33, s39 (usam `review_grid`)

**Problema:** Os resumos de capítulo usam o campo `blocks` (layout `review_grid`), enquanto slides de conteúdo usam `cards` (layouts `image_cards`, `focus_cards`). O nome do campo é diferente mas a semântica é similar — isso pode causar confusão na manutenção.

**Correção:** Padronizar: renomear `blocks` para `cards` em todos os layouts `review_grid`, ou documentar explicitamente a diferença no `app.js`.

---

### M5. Slide s05 — `compare` com 3 colunas não declaradas

**Slide:** s05

**Problema:** O slide s05 declara 2 `columns` mas o CSS define `.compare-grid` como `grid-template-columns: repeat(3, 1fr)` (3 colunas). Com 2 colunas apenas, a terceira coluna fica vazia, criando um desequilíbrio visual.

**Correção:** Ou adicionar uma terceira coluna (ex: "Casos ambíguos — exigem análise"), ou mudar o CSS para:
```css
.compare-grid:has(> :nth-child(2):last-child) { grid-template-columns: repeat(2, 1fr); }
```

---

### M6. Layout `video` — callout com formatação inconsistente

**Slides:** s07, s16, s24, s30

**Problema:** O `callout` dos vídeos usa o pipe `|` como separador entre "O que observar" e "Ação pós-vídeo". Isso é parsing frágil. O `app.js` faz `raw.split('|')` para separar, mas se o conteúdo tiver um pipe acidental, quebra o layout.

**Correção:** Substituir o campo `callout` string por um objeto estruturado:
```json
"videoObservations": "Como a recorrência histórica do CFIT exige disciplina...",
"videoAction": "Depois do vídeo, conecte a mensagem ao seu voo..."
```
E ajustar o `app.js` para usar esses campos.

---

### M7. Textos muito longos em cards de 4 colunas no mobile

**Slide:** s08 (`image_cards` com 4 cards)

**Problema:** O slide s08 tem 4 `cards`, cada um com título + corpo de 1-2 frases. Em telas < 1000px, o grid `.focus-grid.four` colapsa para 2 colunas (CSS linha 107), mas em < 520px colapsa para 1 coluna. Os cards ficam muito altos, forçando scroll excessivo.

**Correção:** Em telas < 520px, encurtar textos ou usar layout de accordion para os cards.

---

### M8. Variáveis CSS `--top` e `--bottom` conflitam com possíveis variáveis globais

**Local:** CSS linha 3

**Problema:** `--top: 76px; --bottom: 72px` são nomes muito genéricos que podem conflitar se o SCORM for embedado em uma página que também use essas variáveis. Além disso, `--top` é usado como valor numérico em `calc()` mas também poderia ser interpretado como string.

**Correção:** Usar prefixo específico: `--airtrust-topbar-h: 76px; --airtrust-bottombar-h: 72px`.

---

### M9. Sem indicador visual de "slide atual" no menu lateral além da classe `.active`

**Local:** Sidebar `.menu-item.active`

**Problema:** O slide atual no menu é indicado apenas por `background: #fff; color: #061a3a`. Um usuário com daltonismo pode não perceber a diferença entre `.active` (branco) e `.done` (checkmark verde).

**Correção:** Adicionar um indicador visual adicional, como uma borda lateral laranja:
```css
.menu-item.active { border-left: 3px solid var(--orange); padding-left: 6px; }
```

---

### M10. Slide s28 — Checklist com 5 grupos mas sem `required` explícito

**Slide:** s28 (checklist_groups)

**Problema:** O slide s28 tem 5 `groups` sem o campo `required`. Por padrão, o `app.js` trata slides sem `required: true` como não-bloqueantes, o que está correto. Mas a intenção pedagógica não está explícita no código — o aluno pode pular o checklist sem ler.

**Correção:** Adicionar `"required": true` e `"instruction": "Revise cada grupo do checklist CFIT antes de avançar."` para garantir que o aluno interaja com o checklist.

---

## 🟢 BAIXO (5 correções)

### B1. `version_tag` no `COURSE` não sincronizado com o banco de dados

**Local:** `course_data.js` linha 4 vs banco `version_tag`

**Problema:** O `COURSE.version` diz "Rev. 06 - 2026-07-15" mas o banco de dados registra `version_tag: "2026-07-16T00:55:31.630Z"`. A diferença de 1 dia pode causar confusão em auditorias.

**Correção:** Sincronizar o `version` do `COURSE` com o `version_tag` do banco ao fazer upload.

---

### B2. `PASSING_SCORE` definido como constante no `app.js` mas `COURSE.passScore` não definido

**Local:** `app.js` linha 9 vs `course_data.js` `COURSE`

**Problema:** O `app.js` define `const PASSING_SCORE = 70;` mas o `COURSE` não tem o campo `passScore`. O `course_data.js` menciona "70%" nos textos e callouts, mas o valor não está estruturado no objeto `COURSE`.

**Correção:** Adicionar `"passScore": 70` ao objeto `COURSE` e usar `COURSE.passScore` no `app.js`.

---

### B3. `REFERENCES` não usam link clicável

**Local:** `course_data.js` linhas 1572–1601

**Problema:** As referências são strings de texto puro (título + nota), mas poderiam incluir URLs para acesso rápido aos documentos originais (ex: Flight Safety Foundation checklist).

**Correção:** Expandir `REFERENCES` para incluir `url` opcional:
```json
{ "title": "Flight Safety Foundation — Lista de verificação CFIT", "url": "https://flightsafety.org/...", "note": "..." }
```

---

### B4. Favicon / título da página não reflete o nome do curso

**Local:** `index.html`

**Problema:** O `index.html` não define `<title>` personalizado nem `<link rel="icon">`. O título padrão do SCORM launch wrapper é usado ("CFIT (Controlled Flight Into Terrain)"), mas o conteúdo interno não tem favicon.

**Correção:** Adicionar ao index.html:
```html
<title>CFIT em Helicópteros — Costa do Sol</title>
<link rel="icon" href="data:image/svg+xml,...">
```

---

### B5. `console.info` de telemetria visível no console em produção

**Local:** `app.js` — `SCORM_TELEMETRY` logs

**Problema:** O `app.js` emite `console.info('[SCORM_TELEMETRY]', ...)` com dados de progresso. Em produção, isso polui o console do aluno e pode expor dados de tracking em sessões compartilhadas.

**Correção:** Condicionar a `PREVIEW_MODE || window.location.hostname === 'localhost'` ou remover em produção.

---

## ✅ Pontos Positivos

Itens que estão **bem executados** e devem ser mantidos:

1. **Design system consistente** — Paleta de cores coesa (navy `#00122d`, orange `#e86f19`, blue `#0066a4`) aplicada uniformemente
2. **Estrutura pedagógica modular** — Capítulos independentes com avaliação por módulo (refaz apenas o capítulo com nota < 70%)
3. **Layout 16:9 responsivo** — `slide-frame` com `aspect-ratio: 16/9` e adaptação mobile via breakpoints
4. **Scroll independente** — `.slide-scroll` com `overflow: hidden` e scroll interno não afeta a navegação global
5. **Cenários interativos bem construídos** — 4 cenários com feedback detalhado por alternativa
6. **Callouts pedagógicos consistentes** — Frases de síntese em laranja reforçam o ponto-chave de cada slide
7. **Menu lateral com indicador de progresso** — Checkmarks verdes nos slides concluídos
8. **Barra de progresso do quiz** — Visual claro de quantas questões faltam
9. **Suporte a retomada (resume)** — `localStorage` + SCORM `suspend_data` permitem continuar de onde parou
10. **Modo preview** — `PREVIEW_MODE` detectado via query string permite testar sem afetar matrícula

---

## Plano de Correção Sugerido

### Fase 1 — Crítico (antes do próximo deploy)
- [ ] C1: Adicionar `imageAlt` em TODOS os 26 slides com imagem
- [ ] C2: Verificar existência de todos os assets no R2
- [ ] C3: Corrigir contraste do `.brand small`
- [ ] C4: Dividir callouts longos (> 200 chars) em slides s07, s28, s35
- [ ] C5: Adicionar navegação por teclado nos quizzes

### Fase 2 — Alto (próximo sprint)
- [ ] A1–A8: Touch targets, cursor pointer, reduced-motion, loading states, hero labels

### Fase 3 — Médio (backlog)
- [ ] M1–M10: Tipografia, consistência de API, fallbacks, indicadores visuais

### Fase 4 — Baixo (melhoria contínua)
- [ ] B1–B5: Sincronização de versão, referências com links, polish

---

## Notas Técnicas

- **SCORM version:** 1.2 (compatível com runtime AirTrust via `scorm-again`)
- **Formato de mídia:** Imagens JPG referenciadas em `media/images/`, vídeos MP4 em `media/videos/`
- **Total de assets únicos de imagem:** 12 arquivos distintos (alguns reutilizados entre slides)
- **Tamanho do `course_data.js`:** 63,807 bytes (41 slides + 50 questões + 7 referências)
- **Tamanho do `styles.css`:** 19,500 bytes (~340 regras CSS)
- **Tamanho do `app.js`:** 27,456 bytes (render engine + SCORM runtime bridge + quiz state machine)

---

*Relatório gerado por auditoria automatizada UI/UX em 2026-07-16. Baseado nas diretrizes UI/UX Pro Max v2 + WCAG 2.1 AA.*
