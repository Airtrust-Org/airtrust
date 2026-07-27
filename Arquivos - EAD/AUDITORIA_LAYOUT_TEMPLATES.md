# 🔍 Auditoria de Layout e Templates — Cursos EAD AirTrust

**Data:** 27 de Julho de 2026  
**Cursos auditados:** CGA, Emergências Gerais, Operações Offshore, Operações PBN  
**Framework:** Adapt Learning Framework (SCORM 1.2)  
**4 cursos | 416 slides no total | 95MB em imagens + 164MB em vídeos**

---

## 📊 Visão Geral

| Curso | Slides | Templates | CSS (custom) | Imagens | Vídeos |
|-------|--------|-----------|-------------|---------|--------|
| CGA | 89 | 11 tipos | 4.7KB | 76 (29MB) | 0 |
| Emergências Gerais | 103 | 22 tipos | 9.8KB ⭐ | 106 (40MB) | 2 (10MB) |
| Operações Offshore | 148 | 16 tipos | 3.0KB | 82 (20MB) | 14 (106MB) |
| Operações PBN | 76 | 13 tipos | 3.0KB | 44 (5MB) | 1 (48MB) |

**⭐ Emergências Gerais é o curso de referência** — tem o CSS mais completo e bem estruturado.

---

## 🔴 CRÍTICO — Contraste de texto (Acessibilidade)

### Problema

3 dos 4 cursos usam `#0066A4` (azul médio) como cor de texto sobre fundo `#00122D` (azul marinho escuro).

| Combinação | Contraste | WCAG AA (4.5:1) |
|------------|-----------|-------------------|
| `#0066A4` sobre `#00122D` | **~3.05:1** | ❌ REPROVADO |
| `#122033` sobre `#FFFFFF` (Emergências) | **~16.5:1** | ✅ Aprovado |

> ⚠️ **3 cursos têm texto ilegível para usuários com baixa visão.** O contraste atual é 33% abaixo do mínimo exigido pela WCAG 2.1 AA.

### Recomendação
- Adotar o padrão do **Emergências Gerais** nos outros 3 cursos: texto escuro (`#122033`) sobre cards claros, OU
- Subir a cor de texto para `#B0D4F1` (contraste 4.6:1) se mantiver fundo escuro sem cards.

---

## 🔴 CRÍTICO — `user-scalable=no` (Acessibilidade)

### Problema

```html
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,viewport-fit=cover">
```

O atributo `user-scalable=no` **impede zoom** no mobile. Isso viola WCAG 2.1 (1.4.4 Resize Text) e é uma barreira de acessibilidade para usuários com baixa visão.

### Recomendação
- Remover `user-scalable=no` de `index.html` e `player.html` em todos os cursos.
- Se o layout quebrar com zoom, ajustar com CSS responsivo ao invés de bloquear.

---

## 🔴 ALTO — Imagens enormes sem otimização

### Problema

| Curso | Maior imagem | Tamanho |
|-------|-------------|---------|
| CGA | `RAF_Chinook_Helicopter...jpg` | **8.976 KB** |
| Emergências Gerais | `bPUvUVxPzGE_mtxcos.jpg` | **2.380 KB** |
| Operações Offshore | `YVM_yymrur.png` | **1.398 KB** |
| Operações PBN | `image_y0kn0k.png` | 659 KB |

- Nenhuma imagem usa **WebP** (reduziria ~30-50% sem perda visual)
- Muitas imagens `.png` que deveriam ser `.jpg` ou `.webp` (gráficos, fotos)
- Nenhum `srcset` ou carregamento responsivo (limitação do Adapt, mas as imagens poderiam ser pré-otimizadas)

### Recomendação
1. Converter todas as imagens >500KB para WebP com qualidade 80%
2. Redimensionar imagens para no máximo 1920px de largura (nunca serão exibidas maiores)
3. Comprimir PNGs com `pngquant` ou similar
4. **Economia estimada: ~40MB nos 4 cursos**

---

## 🟠 ALTO — Vídeos sem compressão

### Problema

| Curso | Pior caso | Tamanho |
|-------|-----------|---------|
| Operações PBN | `PBN_-_DECEA_ehy0f3.mp4` | **47.5 MB** |
| Operações Offshore | `Procedimentos_com_o_helicoptero_pousado2_c63mct.mp4` | **19.3 MB** |
| Operações Offshore | `Comunicacao_com_a_UM_1_sw57rd.mp4` | **17.4 MB** |
| Operações Offshore | `Pouse_Assim_que_Possivel_e6tums.mp4` | **12.9 MB** |

- Operações Offshore: **106 MB só em vídeos** — carregamento inviável em redes móveis
- Nenhum vídeo usa codec H.265 ou compressão otimizada para web

### Recomendação
1. Recomprimir vídeos com `ffmpeg`: H.264, CRF 23-26, áudio AAC 128k
2. Para o vídeo de 47.5MB do PBN: gerar também versão 720p
3. **Economia estimada: ~80MB nos 4 cursos**

---

## 🟠 ALTO — HTML legado do Microsoft Word (Emergências Gerais)

### Problema

O curso **Emergências Gerais** contém HTML copiado de documentos Word:

| Tag/Atributo | Ocorrências | Problema |
|-------------|-------------|----------|
| `<font>` | 96 | Tag obsoleta (HTML5) |
| `mso-*` | 168 | Atributos proprietários Word |
| `style=` inline | 308 | Incha o JSON, difícil manutenção |
| `<span>` | 144 | Uso excessivo (herança Word) |

### Exemplo típico encontrado:
```html
<p style="mso-pagination: none; mso-line-height-rule: exactly;">
  <font face="Arial" size="3">Conteúdo...</font>
</p>
```

O CSS do Emergências Gerais já faz um bom trabalho de neutralizar esses estilos com `[style*="mso-"] { ... inherit !important }`, mas o HTML sujo permanece no `config.json`.

### Recomendação
- Limpar o HTML legado do `config.json` do Emergências Gerais (manter conteúdo, remover `font`, `mso-*`, `style` inline desnecessário)
- Isso reduziria o arquivo em ~15-20% e facilitaria manutenção futura

---

## 🟡 MÉDIO — Inconsistência de CSS entre cursos

### Problema

Os 4 cursos usam **3 níveis diferentes de qualidade de CSS**:

| Nível | Curso | Características |
|-------|-------|-----------------|
| ⭐ Avançado | Emergências Gerais | CSS variables, glass cards, hierarquia tipográfica, max-width, sombras |
| 🔸 Básico | CGA | Força `font-size: 18px !important` em tudo, quebra hierarquia |
| 🔸 Básico | Offshore, PBN | CSS mínimo (3KB), sem variáveis, sem max-width |

### Problemas específicos

**CGA:**
```css
#slides-view-inner .slide * {
  font-size: 18px !important;  /* ❌ Força mesmo tamanho em títulos e corpo */
}
```
→ Títulos, subtítulos e corpo ficam todos com 18px. A hierarquia visual some.

**Offshore e PBN:**
- Sem `max-width` → texto estica até as bordas em telas largas
- Sem cards com fundo → texto azul sobre fundo escuro = baixo contraste

### Recomendação
- Unificar o CSS base entre os 4 cursos usando o Emergências Gerais como referência
- Extrair as variáveis CSS comuns para um arquivo compartilhado
- Manter apenas overrides específicos de cada curso

---

## 🟡 MÉDIO — Assets duplicados entre cursos

### Problema

**39 arquivos são idênticos** entre os 4 cursos e estão duplicados em cada pasta:

| Tipo | Arquivos | Duplicação |
|------|----------|------------|
| Fontes (Noto Sans) | 3 × 4 cursos | 12 cópias |
| Ícones (.woff) | 1 × 4 cursos | 4 cópias |
| Templates (loader.gif, expand-*.png) | 7 × 4 cursos | 28 cópias |
| Áudio (14 .mp3) | 14 × 4 cursos | 56 cópias |
| JS bundles | 5 × 4 cursos | 20 cópias |
| CSS bundles | 2 × 4 cursos | 8 cópias |

> Cada curso tem ~250KB de fontes + ~300KB de áudio + ~700KB de JS/CSS duplicados.  
> **~5MB desperdiçados em duplicação.**

### Recomendação
- Estruturar com assets compartilhados:
  ```
  shared/
    assets/   (fonts, icons)
    audio/    (game sounds)
    js/       (bundles)
    css/      (bundles)
    img/      (templates)
  CGA - .../fit_content_assets/  (apenas assets específicos)
  ```
- Alternativa: usar symlinks no empacotamento SCORM

---

## 🟡 MÉDIO — Background image genérico

### Problema

Todos os 4 cursos usam a mesma imagem de fundo:  
`fit_content_assets/0001-1676870055140806134_ssebai.png`

A imagem está duplicada em cada `fit_content_assets/` — provavelmente é a mesma em todos, mas ocupa espaço 4×.

### Recomendação
- Mover para `shared/` ou criar backgrounds temáticos por curso (ex: helicóptero offshore para Offshore, painel de instrumentos para CGA)

---

## 🟢 BAIXO — Metadados e SEO

### Problemas

| Issue | Detalhe |
|-------|---------|
| `<html lang="en">` | `index.html` usa `lang="en"` mas o conteúdo é em português |
| `<title>` | "Loading your lesson..." — nada descritivo |
| Sem Open Graph | Sem `og:title`, `og:description` |
| `player.html` | Tem `lang="pt-BR"` e title "Carregando aula..." — inconsistente com `index.html` |

### Recomendação
- Unificar `lang="pt-BR"` em ambos os HTMLs
- Colocar título do curso no `<title>` (ex: "CGA – Conhecimentos Gerais de Aeronaves")

---

## 🟢 BAIXO — Arquivo de backup esquecido

### Problema

```
Operações Offshore/config.backup_$(date +%Y%m%d_%H%M%S).json
```

O nome do arquivo contém `$(date +%Y%m%d_%H%M%S)` literal (não expandido). Provavelmente um bug de script de backup. O backup pode conter dados desatualizados ou sensíveis.

### Recomendação
- Remover ou renomear o arquivo
- Corrigir o script que gera backups

---

## 📋 Resumo Executivo

| Prioridade | Problema | Cursos Afetados | Impacto |
|-----------|----------|-----------------|---------|
| 🔴 CRÍTICO | Contraste de texto < 4.5:1 | CGA, Offshore, PBN | Acessibilidade |
| 🔴 CRÍTICO | `user-scalable=no` | Todos | Acessibilidade |
| 🔴 ALTO | Imagens >1MB não otimizadas | Todos | Performance |
| 🔴 ALTO | Vídeos sem compressão | Offshore, PBN | Performance |
| 🟠 ALTO | HTML legado Word (font, mso) | Emergências Gerais | Manutenção |
| 🟡 MÉDIO | CSS inconsistente | CGA, Offshore, PBN | Consistência |
| 🟡 MÉDIO | 39 assets duplicados ×4 | Todos | Performance |
| 🟡 MÉDIO | Background genérico | Todos | Identidade visual |
| 🟢 BAIXO | Metadados incorretos | Todos | SEO |
| 🟢 BAIXO | Backup com nome quebrado | Offshore | Organização |

---

## 🎯 Plano de Ação Recomendado

### Fase 1 — Acessibilidade (urgente)
1. Corrigir contraste de texto nos 3 cursos (adotar padrão Emergências Gerais)
2. Remover `user-scalable=no` do viewport

### Fase 2 — Performance (alto impacto)
3. Converter imagens >500KB para WebP
4. Recomprimir vídeos
5. Criar estrutura de assets compartilhados

### Fase 3 — Consistência (qualidade)
6. Unificar CSS base (usar Emergências Gerais como referência)
7. Limpar HTML legado do Word
8. Corrigir metadados (lang, title)

### Fase 4 — Polimento
9. Criar backgrounds temáticos por curso
10. Remover arquivo de backup quebrado

---

## 📐 Referência: Emergências Gerais (modelo a seguir)

O CSS do Emergências Gerais implementa boas práticas que deveriam ser replicadas:

```css
:root {
  --course-title-size: 2.55rem;
  --course-section-size: 1.76rem;
  --course-body-size: 1.08rem;
  --course-body-max-width: 62rem;
  --course-text: #122033;           /* Contraste 16.5:1 ✅ */
  --course-card: rgba(255,255,255,0.94);
  --course-card-shadow: rgba(0,18,45,0.12);
  --accent-colour: #E66C18;         /* Laranja AirTrust */
}
```

Padrões que funcionam bem:
- Cards com `backdrop-filter: blur(10px)` (glass morphism)
- `max-width: 62rem` no conteúdo
- Hierarquia com 4 níveis (title/section/body)
- Sombras e bordas consistentes
- Override de HTML legado com `inherit !important`

---

*Relatório gerado por auditoria automatizada — nenhum arquivo foi modificado.*
