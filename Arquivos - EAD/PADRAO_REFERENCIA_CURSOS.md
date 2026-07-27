# 📐 Padrão de Referência — Cursos EAD AirTrust

> **Destinatário:** Construtor de cursos (GPT / agente de criação)  
> **Framework:** Adapt Learning Framework — SCORM estático  
> **Superfície principal:** `config.json`  
> **Última atualização:** 27 de Julho de 2026

---

## 🎯 Objetivo

Cursos **modernos, úteis, didáticos, agradáveis e otimizados** para tripulantes e equipe de solo da aviação. Todo curso deve seguir este padrão como referência única.

---

## 1. 🎨 Design System

### 1.1 Paleta de Cores

| Papel | Hex | Uso |
|-------|-----|-----|
| Accent (laranja AirTrust) | `#E66C18` | Botões, links, destaque, progresso |
| Accent hover/active | `#CF5F10` | Hover em botões, estado ativo |
| Texto principal | `#122033` | Títulos, corpo, listas |
| Texto sobre escuro | `#F7FAFC` | Texto em cards escuros/transparentes |
| Fundo da página | `#00122D` | Cor de fundo global (azul marinho) |
| Fundo alternativo | `#0066A4` | Cor de texto secundária no tema escuro (NUNCA como corpo) |
| Card claro | `rgba(255,255,255,0.94)` | Fundo de cards de conteúdo |
| Card suave | `rgba(255,255,255,0.88)` | Fundo de cards com blur effect |
| Card escuro | `rgba(0,18,45,0.72)` | Cards sobre imagens claras |
| Sombra card | `rgba(0,18,45,0.12)` | Sombra padrão de cards |
| Sombra card forte | `rgba(0,18,45,0.18)` | Sombra mais intensa |
| Sombra accent | `rgba(230,108,24,0.18)` | Sombra de botões laranja |
| Erro | `#6B7280` | Resposta incorreta em quiz |
| Desabilitado | `#B9B9B9` | Botões desabilitados |

### ⚠️ Regra de contraste obrigatória

**NUNCA usar `#0066A4` como cor de texto principal sobre fundo escuro.** O contraste é apenas 3.05:1 (reprovado WCAG AA). Use sempre `#122033` sobre cards claros.

### 1.2 Tipografia

| Nível | Tamanho | Peso | Line-height | Uso |
|-------|---------|------|-------------|-----|
| Título | `2.55rem` (~41px) | 700 | 1.12 | Título principal do slide |
| Seção | `1.76rem` (~28px) | 700 | 1.20 | Subtítulos, seções |
| Sub-seção | `1.18rem` (~19px) | 600 | 1.45 | Headings de cards, perguntas |
| Corpo | `1.08rem` (~17px) | 400 | 1.68 | Parágrafos, listas, botões |
| Pequeno | `0.92rem` (~15px) | 400 | 1.5 | Notas de rodapé, legendas curtas |

**Fonte:** `"Noto Sans", "Segoe UI", system-ui, sans-serif` — SEMPRE.

**No mobile** (≤768px): reduzir todos os tamanhos em ~10% (title: 2rem, body: 1rem).

### 1.3 Efeitos e Elevação

| Elemento | Efeito |
|----------|--------|
| Cards de conteúdo | `border-radius: 1rem`, `box-shadow: 0 10px 24px`, fundo `var(--course-card)` |
| Cards de sequência | `border-radius: 1.1rem`, `box-shadow: 0 14px 34px`, borda sutil branca |
| Captions (imagem) | `backdrop-filter: blur(10px)`, `border-radius: 1.1rem` |
| Botões | `box-shadow: 0 8px 20px var(--accent-shadow)`, `border-radius: 0.5rem` |
| Hover em botões | `filter: brightness(0.9)` ou trocar para `var(--accent-colour-dark)` |
| Transições | `150-300ms ease-out` em hover, active, focus |

### 1.4 Layout

| Regra | Valor |
|-------|-------|
| Largura máxima do conteúdo | `62rem` (~992px) |
| Largura máxima de sequências | `48rem` (~768px) |
| Largura máxima de captions | `52rem` (~832px) |
| Padding interno de cards | `1rem 1.25rem` |
| Espaçamento entre parágrafos | `0.5rem` |
| Espaçamento entre itens de lista | `0.5rem` |

---

## 2. 📝 Padrão de HTML nos Slides

### 2.1 ✅ HTML LIMPO (obrigatório)

Use APENAS tags semânticas simples. **NUNCA** cole HTML do Microsoft Word.

```html
<!-- ✅ CERTO — HTML limpo e semântico -->
<p class="text-lg"><strong>O que é a liberação de voo?</strong></p>
<p>O detentor do certificado deve garantir que todo voo seja 
<strong>formalmente autorizado</strong> antes de cada decolagem.</p>
<ul>
  <li><strong>Liberação de voo:</strong> autorização formal confirmando 
  que aeronave, piloto e condições atendem aos requisitos.</li>
  <li><strong>Localização contínua:</strong> o sistema deve conhecer a 
  posição da aeronave a todo momento.</li>
</ul>
```

### 2.2 ❌ HTML PROIBIDO

```html
<!-- ❌ ERRADO — HTML copiado do Word -->
<p style="text-align: center" class="text-lg">
  <span style="mso-ansi-language:PT-BR">Uma aeronave é considerada
  em estado de urgência quando o piloto manifesta qualquer dúvida
  sobre a posição.</span>
</p>
<p style="mso-pagination: none; mso-line-height-rule: exactly;">
  <font face="Arial" size="3">Conteúdo...</font>
</p>
```

### 2.3 Tags e atributos PROIBIDOS

| Proibido | Motivo | Substituir por |
|----------|--------|----------------|
| `<font>` | Obsoleto HTML5 | Classes CSS |
| `mso-*` | Proprietário Word | Nada (remover) |
| `style="..."` inline | Manutenção impossível | Classes CSS |
| `<span>` sem classe | Ruído herdado do Word | Remover ou usar tag semântica |
| `&nbsp;` repetido | Gambiarra de espaçamento | margin/padding CSS |
| `<b>` / `<i>` | Obsoleto (semântica) | `<strong>` / `<em>` |
| `<br><br>` duplo | Gambiarra de parágrafo | Tag `<p>` separada |
| `<table>` para layout | Não responsivo | Nunca usar |
| `<u>` | Confunde com link | `<em>` ou classe |

### 2.4 Classes de texto permitidas

Use APENAS estas classes para hierarquia de texto:

| Classe | Quando usar |
|--------|------------|
| `text-xxl` | Título principal do slide (raro) |
| `text-xl` | Subtítulo, nome de seção |
| `text-lg` | Destaque dentro do texto, pergunta introdutória |
| `text-md` | Corpo de texto padrão |
| `text-sm` | Nota de rodapé, fonte, legenda curta |

**Regra:** Não invente classes. Use só essas 5 + as tags HTML nativas (`<h1>`–`<h3>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<strong>`, `<em>`).

---

## 3. 🧩 Templates de Slides — Quando Usar Cada Um

### 3.1 Templates essenciais (presentes em todo curso)

| Template | Tipo Adapt | Finalidade | Dica |
|----------|-----------|------------|------|
| **Title** | `title` | Abertura de módulo/capítulo | Máximo 2 linhas de título + 1 de subtítulo |
| **Scrolling mix** | `scrolling-media` | Conteúdo longo, teoria, explicações | Preferir para texto > 3 parágrafos |
| **Bulleted list** | `list` | Tópicos, checklists, enumerações | Cada item: 1-3 linhas |
| **Sequence** | `text-sequence` | Passo a passo, procedimentos | Cada step = 1 ação clara |
| **Multiple Choice** | `multiple-choice-game` | Quiz, verificação de aprendizado | 3-5 alternativas, feedback claro |
| **Expandable list** | `expandable-list` | FAQ, tópicos com detalhes | Título curto no botão, detalhe dentro |

### 3.2 Templates visuais (usar com moderação)

| Template | Quando usar | Cuidado |
|----------|------------|---------|
| **Vertical/Horizontal series** | Galeria de imagens com legenda | Cada imagem deve ter alt text |
| **Image gallery** | Coleção de 4-8 imagens | Máximo 8; otimizar antes |
| **Single video** | Vídeo essencial | Máximo 5min; comprimir |
| **Image collection** | Cards com imagem + texto | Bom para categorias |
| **Comparison** | Dois conceitos lado a lado | Funciona bem em desktop; testar mobile |

### 3.3 Templates interativos (engajamento)

| Template | Quando usar |
|----------|------------|
| **Circle the answer** | Quiz visual com hotspots |
| **Connect / Drag to match** | Associar conceitos |
| **Reveal** | Conteúdo surpresa, curiosidades |
| **Scratch to reveal** | Gamificação leve |
| **Chat** | Simulação de diálogo (ATC, briefing) |

### 3.4 Regras de sequenciamento

```
Título do módulo → Teoria (scrolling/list) → Visual (imagem) → Quiz → Próximo módulo
```

- **NUNCA** coloque 2 quizzes seguidos sem conteúdo entre eles
- **SEMPRE** intercale texto com imagem a cada 3-4 slides textuais
- **Máximo 12 slides por módulo** (atenção cai depois disso)
- **SEMPRE** finalize com um slide de saída (`exit`)

---

## 4. 🖼️ Regras de Assets

### 4.1 Imagens

| Regra | Valor |
|-------|-------|
| Formato obrigatório | **WebP** (qualidade 80%) ou JPEG (qualidade 85%) |
| PNG só quando | Transparência necessária OU gráfico com texto |
| Tamanho máximo | **500 KB** por imagem |
| Largura máxima | **1920 px** |
| Nome do arquivo | Descritivo, kebab-case: `helicoptero-offshore-pouso.webp` |

**Antes de adicionar ao curso, SEMPRE:**
```bash
# Converter para WebP
cwebp -q 80 input.jpg -o output.webp

# Redimensionar se > 1920px
convert input.jpg -resize 1920x output.jpg

# Comprimir PNG
pngquant --quality=65-80 input.png --output output.png
```

### 4.2 Vídeos

| Regra | Valor |
|-------|-------|
| Codec | H.264 |
| Resolução máxima | 1080p (1920×1080) |
| Bitrate | 2-4 Mbps |
| Áudio | AAC 128 kbps |
| Tamanho máximo | **15 MB** por vídeo |
| Duração máxima | **5 minutos** |

**Antes de adicionar ao curso, SEMPRE:**
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -c:a aac -b:a 128k -vf scale=1920:-2 output.mp4
```

### 4.3 Nomenclatura de arquivos

```
✅ helicoptero-pouso-offshore.webp
✅ procedimento-emergencia-fogo.jpg
✅ extintor-co2.png

❌ image_0001.png
❌ DSC04532.jpg
❌ Captura de Tela 2024-01-15.png
❌ imagem (1).jpg
```

### 4.4 Background do curso

- Cada curso deve ter **seu próprio background temático** em `fit_content_assets/`
- Resolução: 1920×1080 WebP, máximo 300 KB
- Manter o arquivo com nome descritivo: `bg-emergencias-gerais.webp`

---

## 5. ♿ Acessibilidade (OBRIGATÓRIO)

### 5.1 Contraste

| Combinação | Contraste mínimo |
|------------|-----------------|
| Texto normal | **4.5:1** |
| Texto grande (≥18px bold) | **3:1** |
| Ícones, gráficos | **3:1** |

**Ferramenta:** https://webaim.org/resources/contrastchecker/

### 5.2 Zoom

**NUNCA** usar `user-scalable=no` no viewport meta tag.

```html
<!-- ✅ CERTO -->
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">

<!-- ❌ ERRADO -->
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
```

### 5.3 Imagens

- **TODA** imagem deve ter `alt` descritivo (não deixar vazio a menos que seja decorativa)
- Imagens decorativas: `alt=""` (vazio, não ausente)
- Imagens de conteúdo: `alt="Extintor de CO2 sendo usado em fogo classe B"`

### 5.4 Quiz e interação

- Botões de resposta: mínimo **44×44 px** de área tocável
- Feedback de acerto/erro: **nunca usar só cor** (vermelho/verde) — incluir ícone ou texto
- Estado de foco visível em todos os elementos interativos

### 5.5 Idioma

```html
<html lang="pt-BR">
```
E o `<title>` deve conter o nome do curso:
```html
<title>CGA – Conhecimentos Gerais de Aeronaves</title>
```

---

## 6. ⚡ Performance

### 6.1 Peso total do curso (SCORM zip)

| Componente | Peso máximo |
|------------|------------|
| Imagens (total) | 15 MB |
| Vídeos (total) | 30 MB |
| JS/CSS/Fonts (total) | 2 MB |
| **Total do zip** | **50 MB** |

### 6.2 Otimizações obrigatórias

- [ ] Todas as imagens convertidas para WebP
- [ ] Todos os vídeos comprimidos com ffmpeg (H.264, CRF 23)
- [ ] Arquivos `.map` removidos do pacote final
- [ ] Fontes limitadas a Noto Sans (regular + semi-bold + italic) — 3 variações no máximo
- [ ] Sem imagens ou vídeos não referenciados no `config.json`

---

## 7. 📋 CSS Padrão — Template Copy-Paste

Este é o CSS base que **TODO curso deve usar**. Copie e cole no campo `customCSS` do `config.json`. Ajuste apenas as variáveis na seção `:root` se necessário.

```css
/* ============================================================
   AIRTRUST EAD — DESIGN SYSTEM v2.0
   Adapt Learning Framework — CSS Padrão
   ============================================================ */

/* ----- VARIÁVEIS (ajustar apenas esta seção por curso) ----- */
:root {
  --course-title-size: 2.55rem;
  --course-section-size: 1.76rem;
  --course-body-size: 1.08rem;
  --course-body-max-width: 62rem;
  --course-text: #122033;
  --course-text-on-dark: #F7FAFC;
  --course-card: rgba(255, 255, 255, 0.94);
  --course-card-strong: rgba(255, 255, 255, 0.96);
  --course-card-soft: rgba(255, 255, 255, 0.88);
  --course-card-shadow: rgba(0, 18, 45, 0.12);
  --course-card-shadow-strong: rgba(0, 18, 45, 0.18);
  --course-dark-card: rgba(0, 18, 45, 0.72);
  --accent-colour: #E66C18;
  --accent-colour-dark: #CF5F10;
  --accent-contrast: #FFFFFF;
  --accent-shadow: rgba(230, 108, 24, 0.18);
}

/* ----- FONTE GLOBAL ----- */
html, body, button, input, textarea, select,
.slide-parent, .slide-parent * {
  font-family: "Noto Sans", "Segoe UI", system-ui, sans-serif !important;
}

/* ----- IMAGENS E VÍDEOS RESPONSIVOS ----- */
.slide-parent img, .slide-parent video {
  max-width: 100%;
  height: auto;
}

/* ----- BOTÕES (ACENTO LARANJA) ----- */
.btn.btn-muted, .btn.btn-solid, .btn.btn-primary,
.slide-list .btn,
.slide-expandable-list .item-button,
.selectable .btn,
.slide-multiple-choice-game .selectable .btn,
.slide-image-multiple-choice .selectable .btn {
  background: var(--accent-colour) !important;
  border-color: var(--accent-colour) !important;
  color: var(--accent-contrast) !important;
  box-shadow: 0 8px 20px var(--accent-shadow);
  transition: all 200ms ease-out;
}

.btn.btn-muted.__active, .btn.btn-muted:hover,
.btn.btn-solid.__active, .btn.btn-solid:hover,
.btn.btn-primary__active, .btn.btn-primary:hover,
.slide-expandable-list .item.active .item-button,
.selectable.active .btn,
.slide-multiple-choice-game.state-complete .selectable.correct .btn {
  background: var(--accent-colour-dark) !important;
  border-color: var(--accent-colour-dark) !important;
  color: var(--accent-contrast) !important;
  cursor: pointer;
}

.slide-multiple-choice-game.state-complete .selectable.incorrect .btn {
  background: #6B7280 !important;
  border-color: #6B7280 !important;
  color: var(--accent-contrast) !important;
}

.btn[disabled], .btn.disabled {
  background: #B9B9B9 !important;
  border-color: #B9B9B9 !important;
  color: #FFFFFF !important;
  box-shadow: none !important;
  cursor: not-allowed;
}

/* ----- HIERARQUIA TIPOGRÁFICA ----- */
.slide-parent h1, .slide-parent .text-xxl,
.slide-title #title,
.slide-text-sequence .title,
.slide-text-sequence .title p {
  font-size: var(--course-title-size) !important;
  line-height: 1.12 !important;
  font-weight: 700 !important;
  color: var(--course-text) !important;
}

.slide-parent h2, .slide-parent .text-xl,
.slide-parent .slide-title,
.slide-scrollable .slide-title p,
.slide-scrolling-media .slide-title p {
  font-size: var(--course-section-size) !important;
  line-height: 1.2 !important;
  font-weight: 700 !important;
  color: var(--course-text) !important;
}

.slide-parent h3, .slide-parent .text-lg,
.slide-expandable-list .item-button p {
  font-size: 1.18rem !important;
  line-height: 1.45 !important;
  font-weight: 600 !important;
  color: var(--course-text) !important;
}

.slide-parent p, .slide-parent li, .slide-parent .text-md,
.slide-text-sequence .step, .slide-text-sequence .step p,
.slide-scrollable .content-scroll-inner p,
.slide-scrollable .content-scroll-inner li,
.slide-scrolling-media .content-scroll-inner p,
.slide-scrolling-media .content-scroll-inner li,
.slide-list .btn,
.slide-expandable-list .item-content p,
.slide-parent ul, .slide-parent ol {
  font-size: var(--course-body-size) !important;
  line-height: 1.68 !important;
  color: var(--course-text) !important;
}

/* ----- NEUTRALIZA HTML LEGADO DO WORD ----- */
.slide-parent p span, .slide-parent li span,
.slide-parent h1 span, .slide-parent h2 span, .slide-parent h3 span,
.slide-parent p font, .slide-parent li font,
.slide-parent [style*="mso-"],
.slide-parent [style*="font-family"],
.slide-parent [class*="Mso"] {
  font-size: inherit !important;
  line-height: inherit !important;
  font-family: inherit !important;
  font-weight: inherit !important;
  color: inherit !important;
  white-space: normal !important;
}

/* ----- ESPACAMENTO ----- */
.slide-parent p, .slide-parent li,
.slide-expandable-list .item-content p,
.slide-text-sequence .step {
  margin-bottom: 0.5rem !important;
}

.slide-parent ul, .slide-parent ol {
  padding-left: 1.2rem !important;
}

/* ----- MAX-WIDTH DO CONTEÚDO ----- */
.slide-title .content-scroll-inner,
.slide-list .content-fill,
.slide-scrollable .content-scroll-inner,
.slide-scrolling-media .content-scroll-inner,
.slide-text-sequence .steps-container {
  max-width: var(--course-body-max-width);
  margin-left: auto;
  margin-right: auto;
}

/* ----- CARDS DE CONTEÚDO (GLASS EFFECT) ----- */
.slide-scrollable .content-scroll-inner,
.slide-scrolling-media .content-scroll-inner,
.slide-expandable-list .item-content,
.slide-image-collection .image-content,
.slide-media-collection .text-content {
  background: var(--course-card);
  border-radius: 1rem;
  box-shadow: 0 10px 24px var(--course-card-shadow);
}

.slide-scrollable .content-scroll-inner,
.slide-scrolling-media .content-scroll-inner,
.slide-expandable-list .item-content {
  padding: 1rem 1.1rem;
}

/* ----- TEXT SEQUENCE (PASSO A PASSO) ----- */
.slide-text-sequence .steps {
  width: 100%;
  max-width: 48rem;
  margin-left: auto;
  margin-right: auto;
}

.slide-text-sequence .title,
.slide-text-sequence .step {
  max-width: 46rem;
  margin-left: auto !important;
  margin-right: auto !important;
}

.slide-text-sequence .title {
  margin-bottom: 1rem !important;
}

.slide-text-sequence .step {
  background: var(--course-card-strong);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 1.1rem;
  box-shadow: 0 14px 34px var(--course-card-shadow);
  padding: 1rem 1.25rem !important;
}

/* ----- IMAGE SLIDER & GALLERY CAPTIONS ----- */
.slide-image-slider .caption,
.slide-image-gallery .caption,
.slide-image-waypoints .caption {
  max-width: 52rem;
  margin-left: auto;
  margin-right: auto;
}

.slide-image-slider .caption {
  padding-left: 1rem;
  padding-right: 1rem;
}

.slide-image-slider .caption .caption-content {
  display: inline-block;
  width: auto;
  max-width: min(48rem, 100%);
  border-radius: 1.1rem;
  padding: 1rem 1.35rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 14px 34px var(--course-card-shadow-strong);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

.slide-image-slider .style-default .caption-content,
.slide-image-slider .style-light .caption-content {
  background: var(--course-card-soft) !important;
  color: var(--course-text) !important;
}

.slide-image-slider .style-default .caption-content p,
.slide-image-slider .style-default .caption-content h1,
.slide-image-slider .style-default .caption-content h2,
.slide-image-slider .style-default .caption-content h3,
.slide-image-slider .style-light .caption-content p,
.slide-image-slider .style-light .caption-content h1,
.slide-image-slider .style-light .caption-content h2,
.slide-image-slider .style-light .caption-content h3,
.slide-image-gallery .caption p,
.slide-image-gallery .caption h1,
.slide-image-gallery .caption h2,
.slide-image-gallery .caption h3 {
  color: var(--course-text) !important;
  text-shadow: none !important;
}

.slide-image-slider .style-dark .caption-content,
.slide-image-slider .style-transparent-light-text .caption-content {
  background: var(--course-dark-card) !important;
  color: var(--course-text-on-dark) !important;
  border-color: rgba(255, 255, 255, 0.18);
}

.slide-image-slider .style-dark .caption-content p,
.slide-image-slider .style-dark .caption-content h1,
.slide-image-slider .style-dark .caption-content h2,
.slide-image-slider .style-dark .caption-content h3,
.slide-image-slider .style-transparent-light-text .caption-content p,
.slide-image-slider .style-transparent-light-text .caption-content h1,
.slide-image-slider .style-transparent-light-text .caption-content h2,
.slide-image-slider .style-transparent-light-text .caption-content h3,
.slide-image-waypoints .caption p,
.slide-image-waypoints .caption h1,
.slide-image-waypoints .caption h2,
.slide-image-waypoints .caption h3 {
  color: var(--course-text-on-dark) !important;
  text-shadow: 0 2px 14px rgba(0, 18, 45, 0.45);
}

.slide-image-slider .style-transparent-dark-text .caption-content,
.slide-image-slider .style-transparent-dark-text .caption-content p,
.slide-image-slider .style-transparent-dark-text .caption-content h1,
.slide-image-slider .style-transparent-dark-text .caption-content h2,
.slide-image-slider .style-transparent-dark-text .caption-content h3 {
  color: var(--course-text) !important;
  text-shadow: none !important;
}

/* ----- CHAT BUBBLE ----- */
.slide-chat.show-msg-true .message--answer.active {
  background: var(--accent-colour);
  color: var(--accent-contrast);
}

.slide-chat.show-msg-true .message--answer.active:after {
  border-color: var(--accent-colour) transparent transparent;
}

/* ----- RESPONSIVO: MOBILE (≤768px) ----- */
@media (max-width: 768px) {
  :root {
    --course-title-size: 2rem;
    --course-section-size: 1.5rem;
    --course-body-size: 1rem;
  }

  .slide-scrollable .content-scroll-inner,
  .slide-scrolling-media .content-scroll-inner,
  .slide-expandable-list .item-content {
    padding: 0.75rem 0.9rem;
  }

  .slide-text-sequence .step {
    padding: 0.75rem 1rem !important;
  }

  .slide-image-slider .caption .caption-content {
    padding: 0.75rem 1rem;
  }
}

/* ----- REDUCED MOTION (respeita preferência do SO) ----- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ----- CORREÇÃO: BACKGROUND DOS SLIDES ----- */
#slides-view, #slides-view-inner, #lesson-menu {
  color: var(--course-text) !important;
  background-color: #00122D !important;
}

/* ----- HEADER DA LIÇÃO ----- */
#lesson-header-nav {
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
}

#lesson-header-nav-menu-btn {
  border-left: 1px solid rgba(255, 255, 255, 0.15);
}

#lesson-header-title-content {
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
}

/* ----- PROGRESS BAR ----- */
#indicator {
  background-color: rgba(0, 0, 0, 0.25);
  color: var(--accent-colour);
}

/* ----- PSWP (Image Zoom Background) ----- */
.pswp__item {
  background: var(--accent-colour);
}

/* ----- SLIDE TITLE ----- */
#lesson-header-title-content, 
.slide.title .title, 
.slide.title h1, 
.slide.title p { 
  font-size: var(--course-title-size) !important; 
  line-height: 1.12 !important; 
}
```

---

## 8. 📦 Estrutura de Arquivos do Curso

```
meu-curso/
  index.html              # Entry point SCORM
  player.html             # Player shell
  config.json             # ⭐ SUPERFÍCIE PRINCIPAL
  imsmanifest.xml         # Manifesto SCORM
  ims_xml.xsd             # Schema SCORM (não mexer)
  imscp_rootv1p1p2.xsd    # Schema SCORM (não mexer)
  imsmd_rootv1p2p1.xsd    # Schema SCORM (não mexer)
  adlcp_rootv1p2.xsd      # Schema SCORM (não mexer)

  # Bundles (gerados pelo Adapt, não mexer)
  runtime.*.js
  modules.*.js
  scorm.*.js
  vendors.*.js
  app.*.js
  modules.*.css
  app.*.css

  assets/                 # Assets compartilhados (fonts, ícones)
    NotoSans-*.woff
    icons.*.woff
    loader.*.gif
    rotate-device.*.png
    expand-icon.*.png

  audio/                  # Sons de interação (game)
    correct.mp3
    incorrect.mp3
    ...

  img/                    # Templates visuais (não mexer)
    templates/
    examples/

  fit_content_assets/     # ⭐ ASSETS DO CURSO (imagens, vídeos)
    bg-meu-curso.webp     # Background temático
    topico-1-imagem.webp  # Imagens nomeadas descritivamente
    procedimento-x.mp4    # Vídeos comprimidos
    ...
```

---

## 9. 🔒 Regras de Preservação

Estas regras são herdadas do contexto AirTrust e **NUNCA** devem ser violadas:

1. **Termos técnicos e siglas** são sagrados — `PLB`, `ELT`, `ADELT`, `EPIRB`, `PIC`, `SIC`, `ATC`, `CCO`, `ANAC`, `RBAC`, `NORMAM`, etc.
2. **Paleta laranja** (`#E66C18`) é identidade AirTrust — nunca trocar
3. **Conteúdo regulatório** não pode ser simplificado a ponto de perder precisão técnica
4. **Didática melhora, terminologia preserva** — reescrever para clareza sem diluir conteúdo
5. **Validação JSON** obrigatória após qualquer edição no `config.json`

---

## 10. ✅ Checklist de Entrega

Antes de finalizar qualquer curso, verificar:

### Design & Visual
- [ ] CSS padrão copiado e colado no `customCSS`
- [ ] Cores seguem a paleta (laranja `#E66C18`, texto `#122033`)
- [ ] Cards com glass effect em slides de conteúdo
- [ ] Background temático em `fit_content_assets/`

### Acessibilidade
- [ ] Contraste de texto ≥ 4.5:1 (verificar com ferramenta)
- [ ] `user-scalable=no` **REMOVIDO** do viewport
- [ ] Todas as imagens têm `alt` descritivo
- [ ] `lang="pt-BR"` no `<html>`
- [ ] `<title>` contém nome do curso

### Performance
- [ ] Imagens convertidas para WebP (todas < 500 KB)
- [ ] Vídeos comprimidos (todos < 15 MB)
- [ ] Arquivos `.map` removidos
- [ ] Zip final < 50 MB

### HTML
- [ ] Nenhum `<font>`, `mso-*`, ou `style=` inline
- [ ] Nenhum `&nbsp;` repetido, `<br><br>`, ou `<table>`
- [ ] Apenas classes `text-xxl`, `text-xl`, `text-lg`, `text-md`, `text-sm`
- [ ] Tags semânticas: `<h1>`–`<h3>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<strong>`, `<em>`

### Estrutura
- [ ] JSON válido (testar com `python -m json.tool config.json`)
- [ ] Assets nomeados descritivamente (kebab-case)
- [ ] Nenhum arquivo não referenciado em `fit_content_assets/`
- [ ] `imsmanifest.xml` presente e válido

### Didática
- [ ] Slides alternam texto e imagem a cada 3-4 slides
- [ ] Quiz após cada bloco de conteúdo
- [ ] Máximo 12 slides por módulo
- [ ] Slide de saída no final

---

## 📚 Referência Rápida

| O que | Onde |
|-------|------|
| CSS padrão | Seção 7 — copiar e colar |
| Cores | Seção 1.1 |
| Fontes e tamanhos | Seção 1.2 |
| HTML proibido | Seção 2.2 e 2.3 |
| Templates e quando usar | Seção 3 |
| Otimização de imagens | Seção 4.1 |
| Otimização de vídeos | Seção 4.2 |
| Checklist final | Seção 10 |

---

> **Este documento é a única fonte de verdade para o design de cursos AirTrust.**  
> Qualquer desvio deve ser justificado e aprovado.
