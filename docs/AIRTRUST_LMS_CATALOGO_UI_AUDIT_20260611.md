# AirTrust LMS Catálogo — UI/UX Audit Report

**Data**: 2026-06-11  
**Página**: `/lms/cursos` (LmsCatalogo.tsx)  
**Componentes analisados**: `LmsCatalogo.tsx`, `lmsUi.tsx` (LmsCourseArtwork, CourseCard)  
**Severidade**: 🔴 Crítico · 🟠 Alto · 🟡 Médio · 🟢 Baixo

---

## Sumário Executivo

O catálogo de cursos do LMS tem **10 problemas** de UI/UX, sendo **3 críticos** que impactam diretamente a experiência do usuário e a consistência visual. O problema principal é o **aspect ratio incorreto das imagens** (`aspect-[16/8]` = 2:1, muito achatado), inconsistente com o preview de upload (`aspect-[16/10]`) e com o padrão da indústria (16:9 ou 3:2). Problemas secundários incluem tipografia muito pequena, sobrecarga de informação nos cards, e inconsistências de espaçamento.

---

## 1. 🔴 CRÍTICO — Aspect Ratio das Imagens dos Cursos

### Problema

O componente `LmsCourseArtwork` (lmsUi.tsx:325) usa `aspect-[16/8]` que equivale a **2:1** — uma proporção extremamente larga e achatada:

```tsx
// lmsUi.tsx:325 — ATUAL (PROBLEMÁTICO)
className={`... aspect-[16/8] w-full rounded-xl ...`}
```

Isso transforma a imagem de capa em uma faixa horizontal fina, descaracterizando a thumbnail do curso. Nenhuma plataforma de e-learning usa essa proporção.

### Agravante: Inconsistência com o Preview de Upload

No formulário de upload (dentro do `CourseDrawer` em LmsCatalogo.tsx:538), o preview usa **outra proporção**:

```tsx
// LmsCatalogo.tsx:538 — Preview de upload (DIFERENTE!)
<div className="... aspect-[16/10]">
```

| Local | Proporção | Equivalente |
|-------|-----------|-------------|
| Preview de upload (drawer) | `aspect-[16/10]` | 1.6:1 |
| Catálogo (LmsCourseArtwork) | `aspect-[16/8]` | 2:1 |
| **Inconsistência** | **Diferença de 25%** | ❌ |

O admin faz upload vendo a imagem em 16:10, mas o aluno vê em 16:8 — causando crop inesperado e diferente do que foi planejado.

### Recomendação

Alterar para **`aspect-[16/9]`** (1.78:1), que é o padrão universal para:

- Thumbnails de cursos (Udemy, Coursera, Hotmart, etc.)
- Thumbnails do YouTube (que muitos criadores de conteúdo EAD usam como referência)
- Cards de mídia em geral

**Mudança necessária em 2 arquivos:**

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `lmsUi.tsx` | 325 | `aspect-[16/8]` → `aspect-[16/9]` |
| `LmsCatalogo.tsx` | 538 | `aspect-[16/10]` → `aspect-[16/9]` |
| `LmsCatalogo.tsx` | 1852 | Skeleton `h-[420px]` → ajustar para nova altura |

**Impacto visual:**

```
ANTES (2:1):     ████████████████████████████  (muito achatado, parece banner)
DEPOIS (16:9):   ██████████████████████        (proporção natural de thumbnail)
```

---

## 2. 🔴 CRÍTICO — Escala Tipográfica Muito Pequena

### Problema

Múltiplos tamanhos de fonte abaixo do recomendado para legibilidade:

| Elemento | Tamanho atual | Local | Mínimo recomendado |
|----------|---------------|-------|-------------------|
| Chips de tipo/categoria | `text-[11px]` | LmsCatalogo.tsx:1257-1263 | 12px (WCAG) |
| Duração e metadados | `text-[11px]` | lmsUi.tsx:197,392 | 12px |
| Descrição do curso | `text-xs` (12px) | LmsCatalogo.tsx:1275 | 14px |
| Título do curso | `text-sm` (14px) | LmsCatalogo.tsx:1252 | 14px ✓ |
| Status pill | `text-xs` (12px) | lmsUi.tsx:438 | 12px ✓ |
| Progresso | `text-xs` (12px) | LmsCatalogo.tsx:1296 | 12px ✓ |
| Deadline badge | `text-[11px]` | LmsCatalogo.tsx:1289 | 12px |

### Recomendação

- Chips e badges: mínimo `text-xs` (12px), nunca `text-[11px]`
- Descrição do curso: `text-sm` (14px) em vez de `text-xs`
- Em mobile: aumentar tudo em +1 scale (Tailwind `sm:` breakpoints)

---

## 3. 🔴 CRÍTICO — Duplo Overlay de Gradiente nas Imagens

### Problema

O `LmsCourseArtwork` aplica **dois overlays simultâneos** que competem entre si (lmsUi.tsx:325-339):

```tsx
// Overlay 1: fundo gradiente (quando SEM thumbnail)
<div className="absolute inset-0 bg-[radial-gradient(...),linear-gradient(140deg,...)]" />

// Overlay 2: overlay DE SEMPRE (com OU sem thumbnail)
<div className={`absolute inset-0 ${thumbnailUrl 
  ? 'bg-gradient-to-t from-slate-950/90 via-slate-950/34 to-slate-950/10' 
  : 'bg-gradient-to-br from-white/0 via-white/0 to-sky-400/10'}`} 
/>
```

Quando há thumbnail:
- Overlay 1 fica escondido atrás da imagem (desperdiçando render)
- Overlay 2 escurece a parte de baixo com `from-slate-950/90` — muito agressivo, perdendo detalhes da imagem

Quando NÃO há thumbnail:
- Ambos os overlays se sobrepõem, criando um efeito visual confuso
- O ícone branco sobre fundo escuro com múltiplos gradientes fica "sujo"

### Recomendação

1. **Condicionar o overlay 1**: só renderizar quando `!thumbnailUrl`
2. **Suavizar o overlay 2**: reduzir opacidade de `from-slate-950/90` para `from-slate-950/60`
3. **Adicionar backdrop-blur suave** sobre thumbnail para melhorar legibilidade do texto overlay

```tsx
// Proposta
{!thumbnailUrl && (
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.42),_transparent_34%),linear-gradient(140deg,_#0f172a_0%,_#111827_46%,_#1e3a8a_100%)]" />
)}
<div className={`absolute inset-0 ${
  thumbnailUrl 
    ? 'bg-gradient-to-t from-slate-950/60 via-slate-950/20 to-transparent' 
    : 'bg-gradient-to-br from-white/0 via-white/0 to-sky-400/10'
}`} />
```

---

## 4. 🟠 ALTO — Sobrecarga de Informação nos Cards

### Problema

Cada card no catálogo exibe até **12 elementos visuais simultâneos**:

1. Imagem de capa com overlay
2. Ícone do tipo de conteúdo (sobre a imagem)
3. Badge de categoria (sobre a imagem)
4. Barra de progresso (sobre a imagem, embaixo)
5. Título do curso
6. Chip do tipo (SCORM/H5P/Video)
7. Chip da categoria
8. Chip de duração
9. Status pill (Publicado/Rascunho/Em andamento)
10. Descrição (2 linhas)
11. Badge de qualificação/compliance
12. Barra de progresso + percentual
13. Deadline badge
14. Botões de ação (1-2 principais + até 5 admin)

Para o aluno: ~10 elementos. Para admin: ~14 elementos. 

Isso cria **poluição visual** e dificulta o scan rápido do catálogo.

### Recomendação

**Hierarquia em 3 zonas visuais distintas:**

```
┌──────────────────────────────┐
│  ZONA 1: CAPA (topo)         │
│  ┌────────────────────────┐  │
│  │   Imagem do curso      │  │
│  │   + ícone do tipo      │  │
│  │   + barra de progresso │  │
│  └────────────────────────┘  │
│  ZONA 2: INFO (meio)         │
│  Título (2 linhas max)       │
│  Tipo · Categoria · Duração  │
│  ZONA 3: AÇÃO (base)         │
│  Status pill  [Botão ação]   │
└──────────────────────────────┘
```

**Remover do card:**
- Badge de compliance "Gera qualificação X" → mover para página de detalhes
- Descrição do curso → só mostrar na página de detalhes
- Deadline badge → manter mas simplificar (ícone + dias restantes)

---

## 5. 🟠 ALTO — Skeleton Loading Não Representa o Card Real

### Problema

O skeleton (LmsCatalogo.tsx:1850-1854) é um bloco genérico que não corresponde ao layout real:

```tsx
// ATUAL — retângulo genérico
<div className="h-[420px] animate-pulse rounded-2xl bg-slate-100 ..." />
```

Isso causa **layout shift** quando os cards reais carregam, pois a altura do skeleton (420px fixo) não corresponde à altura real dos cards.

### Recomendação

Criar um componente `CourseCardSkeleton` que espelhe a estrutura real:

```tsx
function CourseCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Artwork skeleton */}
      <div className="p-3 pb-0">
        <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-slate-200" />
      </div>
      {/* Content skeleton */}
      <div className="flex flex-1 flex-col p-4 pt-3 space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="flex gap-2">
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
        </div>
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-auto pt-4">
          <div className="h-9 w-full animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
```

---

## 6. 🟡 MÉDIO — Efeito Hover Muito Discreto

### Problema

O hover atual no card (LmsCatalogo.tsx:1239):

```tsx
className="... transition hover:-translate-y-0.5 hover:shadow-md ..."
```

- `translate-y-0.5` = 2px de elevação — quase imperceptível
- Sem `transition` na propriedade `transform` (só tem `transition` genérico)
- Shadow change de `shadow-sm` → `shadow-md` é sutil demais, especialmente em light mode

### Recomendação

```tsx
// Mais perceptível e polido
className="... transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ..."
```

E adicionar um efeito sutil na borda:
```
hover:border-primary/30
```

---

## 7. 🟡 MÉDIO — Filtros Sem Labels Visíveis

### Problema

A barra de filtros (LmsCatalogo.tsx:1789-1844) usa apenas `placeholder` no input de busca e `<select>` sem labels:

```tsx
<input placeholder="Buscar por título, categoria ou descrição" ... />
<select>...<option>Todos os tipos</option>...</select>
<select>...<option>Todas as categorias</option>...</select>
```

**Problemas de acessibilidade:**
- Selects sem `<label>` associado violam WCAG 3.3.2
- Placeholder não substitui label (desaparece ao digitar)
- Em mobile, 5 controles em grid apertado dificultam o toque

### Recomendação

Adicionar labels visíveis (ou `sr-only` + `aria-label`):

```tsx
<label className="block">
  <span className="sr-only">Buscar cursos</span>
  <input aria-label="Buscar cursos" placeholder="Buscar por título ou categoria..." ... />
</label>
<label className="block">
  <span className="sr-only">Tipo de conteúdo</span>
  <select aria-label="Filtrar por tipo de conteúdo" ...>
```

E em mobile, colapsar filtros avançados em um botão "Filtros" que expande.

---

## 8. 🟡 MÉDIO — Inconsistência de Espaçamento Interno

### Problema

O card tem dois sistemas de padding diferentes:

```tsx
// Artwork wrapper
<div className="p-3 pb-0">   {/* 12px padding, 0 embaixo */}
  <LmsCourseArtwork ... />
</div>

// Content area
<div className="flex flex-1 flex-col p-4 pt-3">  {/* 16px padding, 12px top */}
```

Resultado: margem direita/esquerda da artwork = 12px, do conteúdo = 16px → desalinhamento de 4px.

### Recomendação

Unificar para `p-4` em ambos:

```tsx
<div className="p-4 pb-0">       {/* Artwork wrapper */}
  <LmsCourseArtwork ... />
</div>
<div className="flex flex-1 flex-col p-4 pt-3">  {/* Content - mesmo padding horizontal */}
```

Ou, alternativamente, remover o wrapper da artwork e aplicar padding diretamente no card:

```tsx
<article className="... p-4 ...">
  <LmsCourseArtwork ... />   {/* sem wrapper extra */}
  <div className="flex flex-1 flex-col pt-3">  {/* sem padding horizontal */}
```

---

## 9. 🟢 BAIXO — Categoria Duplicada (Chip + Badge na Imagem)

### Problema

A categoria do curso aparece **duas vezes** no mesmo card:

1. Como badge sobre a imagem (canto superior direito, LmsCourseArtwork lmsUi.tsx:362-374)
2. Como chip abaixo do título (LmsCatalogo.tsx:1262-1265)

Isso é redundante e ocupa espaço visual.

### Recomendação

- **Manter** a categoria como chip abaixo do título (mais legível)
- **Na artwork**, mostrar apenas o ícone do tipo (canto superior esquerdo)
- Remover o badge de categoria do overlay da imagem

---

## 10. 🟢 BAIXO — Contador de Resultados Pouco Visível

### Problema

O contador "N cursos nesta visão" (LmsCatalogo.tsx:1888) aparece como texto pequeno antes do grid:

```tsx
<p className="mb-4 text-sm text-slate-500 ...">
  {visibleCourses.length} curso{...} nesta visão
</p>
```

### Recomendação

Integrar na barra de filtros ou usar um badge mais visível:

```tsx
<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
  <BookOpen className="h-3.5 w-3.5" />
  {visibleCourses.length} cursos
</span>
```

---

## Resumo das Ações Recomendadas

| # | Severidade | Problema | Arquivo(s) | Esforço |
|---|-----------|----------|------------|---------|
| 1 | 🔴 CRÍTICO | Aspect ratio 2:1 → 16:9 | `lmsUi.tsx:325`, `LmsCatalogo.tsx:538` | 5min |
| 2 | 🔴 CRÍTICO | Tipografia 11px → 12px min | `lmsUi.tsx`, `LmsCatalogo.tsx` | 15min |
| 3 | 🔴 CRÍTICO | Duplo overlay gradiente | `lmsUi.tsx:325-339` | 10min |
| 4 | 🟠 ALTO | Sobrecarga de info nos cards | `LmsCatalogo.tsx:1237-1405` | 1h |
| 5 | 🟠 ALTO | Skeleton genérico → específico | `LmsCatalogo.tsx:1850-1854` | 20min |
| 6 | 🟡 MÉDIO | Hover muito sutil | `LmsCatalogo.tsx:1239` | 5min |
| 7 | 🟡 MÉDIO | Filtros sem labels | `LmsCatalogo.tsx:1789-1844` | 15min |
| 8 | 🟡 MÉDIO | Padding inconsistente | `LmsCatalogo.tsx:1243,1249` | 5min |
| 9 | 🟢 BAIXO | Categoria duplicada | `lmsUi.tsx:362-374` | 10min |
| 10 | 🟢 BAIXO | Contador pouco visível | `LmsCatalogo.tsx:1888` | 5min |

**Esforço total estimado**: ~2.5 horas para todos os itens  
**Itens críticos apenas**: ~30 minutos

---

## Comparação Visual (Antes → Depois)

### Card Atual (problemas)

```
┌────────────────────────────────────┐
│ ┌─────── ARTWORK 2:1 ───────────┐  │ ← muito achatado
│ │ ⬡ SCORM           EAD       │  │ ← overlay escuro demais
│ │                               │  │
│ │ ████████████░░░░ 45%          │  │ ← barra de progresso
│ └───────────────────────────────┘  │
│ Título do Curso           PUBL. │
│ ⬡ SCORM  EAD  30min             │  ← 11px ilegível
│ Descrição do curso em 2 linhas.. │
│ Gera qualificação X ao concluir.  │  ← badge redundante
│ ⚠ Vence em 5 dias               │
│ Progresso                45%     │
│ ████████████░░░░░░░░            │
│ [▶ Continuar]  [👁]             │
│ [✏️ Editar] [👁 Rasc] [👥] [🗑] │  ← admin overload
└────────────────────────────────────┘
```

### Card Proposto (corrigido)

```
┌────────────────────────────────────┐
│ ┌─────── ARTWORK 16:9 ───────────┐ │  ← proporção natural
│ │ ⬡                               │ │  ← só ícone do tipo
│ │                                 │ │
│ │                          ██░░░ │ │  ← barra de progresso sutil
│ └─────────────────────────────────┘ │
│                                     │
│ Título do Curso          PUBLICADO │  ← mesma hierarquia
│ ⬡ SCORM · EAD · 30min             │  ← 12px legível
│                                     │
│ ⚠ Vence em 5 dias                  │  ← deadline visível
│ ████████████░░░░ 45%               │
│                                     │
│ [▶ Continuar]        [👁 Detalhes] │  ← botões claros
│                                     │
└────────────────────────────────────┘
```

---

## Notas de Implementação

1. **Migração segura**: O aspect ratio afeta imagens já em produção. Testar com cursos que têm thumbnail para garantir que o crop em 16:9 não corta elementos importantes.

2. **Dark mode**: Verificar todos os contrastes em dark mode após ajustes de tipografia e overlays.

3. **Testes**: Atualizar snapshots de teste se existirem, pois as classes Tailwind mudarão.

4. **Prefers-reduced-motion**: Já existe `transition` no card; garantir que `motionSafe` wrapper seja aplicado se necessário.

---

*Relatório gerado com UI/UX Pro Max — AirTrust LMS Audit*
