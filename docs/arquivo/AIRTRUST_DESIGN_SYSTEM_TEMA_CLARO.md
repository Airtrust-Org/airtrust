# AirTrust Design System – Tema Claro

**Versão:** 1.0  
**Data:** 15 de novembro de 2025  
**Objetivo:** Padronizar visualmente TODAS as páginas do frontend AirTrust v1 com um design moderno, limpo e profissional, inspirado em Apple/Linear, usando APENAS tema claro.

---

## 1. LAYOUT GERAL

### 1.1 Estrutura Padrão de Página

Todas as páginas internas seguem a mesma anatomia:

```
┌─────────────────────────────────────────────────────────┐
│ SIDEBAR (fixa à esquerda)                               │
│ - Logo AirTrust                                         │
│ - Menu de navegação                                     │
│ - Item ativo destacado                                  │
│ - Perfil do usuário (rodapé)                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ TOPBAR (fixa no topo do conteúdo)                       │
│ - Breadcrumb / Título da página                         │
│ - Barra de busca global (opcional)                      │
│ - Notificações + Avatar do usuário                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ MAIN CONTENT (área rolável)                             │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │ PAGE HEADER                                     │   │
│   │ - Título principal                              │   │
│   │ - Subtítulo/descrição                           │   │
│   │ - Botões de ação (Novo, Exportar, etc.)        │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │ SUMMARY CARDS (opcional - KPIs)                │   │
│   │ [ Card 1 ] [ Card 2 ] [ Card 3 ] [ Card 4 ]    │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │ FILTER BAR                                      │   │
│   │ Filtros + Busca + Ações rápidas                │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │ DATA TABLE / CONTENT                            │   │
│   │ Tabela principal com paginação                  │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Dimensões e Espaçamentos

- **Sidebar:** Largura fixa 280px (desktop), colapsável em mobile (<768px)
- **Topbar:** Altura 64px
- **Main Content:**
  - Padding: `px-6 py-8` (24px horizontal, 32px vertical)
  - Max-width: `max-w-7xl mx-auto` (1280px centralizado)
  - Gap entre seções: `space-y-6` (24px)

### 1.3 Responsividade

- **Desktop (≥1024px):** Sidebar visível + layout completo
- **Tablet (768px - 1023px):** Sidebar colapsável, ícones menores
- **Mobile (<768px):** Sidebar como drawer, menu hamburguer

---

## 2. TIPOGRAFIA

### 2.1 Fonte

**Família:** `Inter` (Google Fonts)  
**Fallback:** `system-ui, -apple-system, sans-serif`  
**Pesos utilizados:** 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)

### 2.2 Hierarquia de Tamanhos

| Elemento               | Classes Tailwind                        | Uso                         |
| ---------------------- | --------------------------------------- | --------------------------- |
| **H1 - Page Title**    | `text-3xl font-bold text-slate-900`     | Título principal da página  |
| **H2 - Section Title** | `text-2xl font-semibold text-slate-900` | Título de seção/card grande |
| **H3 - Card Title**    | `text-lg font-semibold text-slate-900`  | Título de card/componente   |
| **Subtitle**           | `text-sm text-slate-600`                | Descrição abaixo de títulos |
| **Body Text**          | `text-base text-slate-700`              | Texto padrão de conteúdo    |
| **Table Text**         | `text-sm text-slate-700`                | Texto dentro de tabelas     |
| **Label**              | `text-sm font-medium text-slate-700`    | Labels de formulário        |
| **Caption/Helper**     | `text-xs text-slate-500`                | Texto auxiliar, dicas       |
| **Badge Text**         | `text-xs font-medium`                   | Texto dentro de badges      |

### 2.3 Line Height

- Títulos (H1-H3): `leading-tight` (1.25)
- Corpo de texto: `leading-normal` (1.5)
- Texto de tabela: `leading-relaxed` (1.625)

---

## 3. CORES (TEMA CLARO APENAS)

### 3.1 Paleta Principal

```css
/* Primária (Azul) */
--primary-50: #eff6ff;
--primary-100: #dbeafe;
--primary-500: #3b82f6;
--primary-600: #2563eb; /* COR PRINCIPAL */
--primary-700: #1d4ed8;

/* Neutros (Slate) */
--slate-50: #f8fafc;
--slate-100: #f1f5f9;
--slate-200: #e2e8f0;
--slate-300: #cbd5e1;
--slate-500: #64748b;
--slate-600: #475569;
--slate-700: #334155;
--slate-900: #0f172a; /* TEXTO PRINCIPAL */

/* Backgrounds */
--bg-page: #f3f4f6; /* Fundo da página (gray-100) */
--bg-surface: #ffffff; /* Cards, tabelas, modais */
--bg-hover: #f9fafb; /* Hover em linhas de tabela */

/* Bordas */
--border-light: #e5e7eb; /* gray-200 */
--border-dark: #d1d5db; /* gray-300 */
```

### 3.2 Paleta de Status

```css
/* Success (Verde) */
--success-50: #f0fdf4;
--success-500: #22c55e;
--success-600: #16a34a; /* VÁLIDO, ATIVO */

/* Warning (Amarelo/Laranja) */
--warning-50: #fffbeb;
--warning-500: #f59e0b;
--warning-600: #d97706; /* VENCENDO, ALERTA */

/* Danger (Vermelho) */
--danger-50: #fef2f2;
--danger-500: #ef4444;
--danger-600: #dc2626; /* VENCIDO, ERRO, INATIVO */

/* Info (Azul claro) */
--info-50: #eff6ff;
--info-500: #3b82f6;
--info-600: #2563eb; /* INFORMAÇÃO, PENDENTE */
```

### 3.3 Aplicação de Cores

- **Texto Principal:** `text-slate-900`
- **Texto Secundário:** `text-slate-600`
- **Texto Desabilitado:** `text-slate-400`
- **Background Página:** `bg-gray-100`
- **Background Card/Tabela:** `bg-white`
- **Borda Padrão:** `border-gray-200`
- **Link/Primário:** `text-primary-600 hover:text-primary-700`

---

## 4. COMPONENTES BÁSICOS

### 4.1 Botões

#### 4.1.1 Botão Primário

```
Uso: Ação principal da página (Salvar, Criar, Enviar)
Aparência:
- Background: bg-primary-600
- Texto: text-white, font-medium
- Hover: bg-primary-700
- Disabled: bg-gray-300, cursor-not-allowed
- Altura: h-10 (40px)
- Padding: px-4 py-2
- Border radius: rounded-lg
- Sombra: shadow-sm hover:shadow
```

#### 4.1.2 Botão Secundário

```
Uso: Ação secundária (Cancelar, Voltar, Limpar)
Aparência:
- Background: bg-white
- Texto: text-slate-700, font-medium
- Borda: border border-gray-300
- Hover: bg-gray-50
- Altura: h-10
- Padding: px-4 py-2
- Border radius: rounded-lg
```

#### 4.1.3 Botão Ghost

```
Uso: Ações terciárias, ícones clicáveis
Aparência:
- Background: transparent
- Texto: text-primary-600, font-medium
- Hover: bg-primary-50
- Sem borda
- Padding: px-3 py-2
- Border radius: rounded-lg
```

#### 4.1.4 Botão com Ícone

```
- Material Symbols Outlined à esquerda
- Gap: gap-2 entre ícone e texto
- Ícone: text-lg (20px)
```

### 4.2 Inputs

#### 4.2.1 Input de Texto

```
Aparência:
- Altura: h-10
- Padding: px-3 py-2
- Border: border border-gray-300
- Border radius: rounded-lg
- Background: bg-white
- Texto: text-slate-900
- Placeholder: placeholder:text-slate-400

Foco:
- border-primary-500
- ring-2 ring-primary-500/20
- outline-none

Erro:
- border-red-500
- ring-2 ring-red-500/20
- Texto de ajuda: text-xs text-red-600 mt-1
```

#### 4.2.2 Input com Ícone

```
- Ícone Material Symbols à esquerda
- Padding ajustado: pl-10 (para dar espaço ao ícone)
- Ícone posicionado: absolute left-3 text-slate-400
```

#### 4.2.3 Select/Dropdown

```
- Mesma aparência de input
- Seta dropdown à direita (chevron_down)
- Hover: cursor-pointer
```

### 4.3 Cards

#### 4.3.1 Card Métrica/KPI

```
Uso: Exibir estatísticas (Total, Ativos, Vencidos, etc.)
Aparência:
- Background: bg-white
- Borda: border border-gray-200
- Border radius: rounded-xl
- Padding: p-6
- Sombra: shadow-sm hover:shadow-md
- Transição: transition-shadow

Conteúdo:
- Label: text-xs uppercase tracking-wide text-slate-500 font-medium
- Valor: text-3xl font-bold text-slate-900 mt-2
- Ícone opcional: Material Symbols, tamanho 32px, cor primária
- Trend opcional: text-sm com seta (↑/↓) e cor (verde/vermelho)
```

#### 4.3.2 Card Conteúdo

```
Uso: Agrupar informações relacionadas
Aparência:
- Background: bg-white
- Borda: border border-gray-200
- Border radius: rounded-lg
- Padding: p-4 ou p-6
- Sombra: shadow-sm

Header do card (se houver):
- pb-3 border-b border-gray-200
- Título: text-lg font-semibold text-slate-900
- Subtítulo: text-sm text-slate-600 mt-1
```

### 4.4 Tabelas

#### 4.4.1 Estrutura

```
<div className="overflow-x-auto">
  <table className="w-full">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
          Coluna
        </th>
      </tr>
    </thead>
    <tbody className="bg-white divide-y divide-gray-200">
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4 text-sm text-slate-700">
          Conteúdo
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

#### 4.4.2 Características

- **Cabeçalho:** Fundo cinza-claro, texto pequeno em uppercase, tracking
- **Linhas:** Hover leve (bg-gray-50), divisor sutil entre linhas
- **Células:** Padding generoso (px-6 py-4), alinhamento consistente
- **Ações:** Ícones à direita (edit, delete, view), cor slate-400 hover:primary-600
- **Estado vazio:** Ilustração + mensagem centralizada

#### 4.4.3 Paginação

```
Aparência:
- Barra inferior com flex justify-between items-center
- Texto: "Mostrando 1-10 de 157 resultados" (text-sm text-slate-600)
- Botões:
  - Anterior/Próximo: botões secundários
  - Números de página: bg-white border border-gray-300 hover:bg-gray-50
  - Página ativa: bg-primary-600 text-white border-primary-600
  - Border radius: rounded-lg
  - Tamanho: h-9 w-9 (quadrados)
```

### 4.5 Badges/Status

#### 4.5.1 Badge Padrão

```
Aparência:
- Padding: px-2.5 py-0.5
- Border radius: rounded-full
- Texto: text-xs font-medium
- Display: inline-flex items-center gap-1

Variantes:
- success: bg-green-50 text-green-700 border border-green-200
- warning: bg-yellow-50 text-yellow-700 border border-yellow-200
- danger: bg-red-50 text-red-700 border border-red-200
- info: bg-blue-50 text-blue-700 border border-blue-200
- neutral: bg-gray-50 text-gray-700 border border-gray-200
```

#### 4.5.2 Dot Indicator (opcional)

```
- Bolinha colorida antes do texto
- w-1.5 h-1.5 rounded-full
- Cor match do badge (bg-green-500, bg-yellow-500, etc.)
```

### 4.6 Filtros

#### 4.6.1 Filter Bar

```
Uso: Barra acima da tabela para filtrar dados
Aparência:
- Background: bg-white
- Borda: border border-gray-200 rounded-lg
- Padding: p-4
- Layout: grid grid-cols-1 md:grid-cols-4 gap-4

Conteúdo:
- Inputs de filtro (texto, select, date)
- Botões de ação (Aplicar, Limpar) alinhados à direita
- Chips com filtros ativos (opcional) abaixo dos inputs
```

#### 4.6.2 Search Bar

```
- Input com ícone de busca (search)
- Placeholder: "Buscar por nome, matrícula, email..."
- Width: w-full md:max-w-md
```

### 4.7 Modais

#### 4.7.1 Estrutura

```
- Overlay: bg-black/50 backdrop-blur-sm
- Container: bg-white rounded-xl shadow-2xl max-w-2xl mx-auto mt-20
- Header: px-6 py-4 border-b border-gray-200
  - Título: text-xl font-semibold text-slate-900
  - Botão fechar: ícone close, absolute top-4 right-4
- Body: px-6 py-4 max-h-[70vh] overflow-y-auto
- Footer: px-6 py-4 border-t border-gray-200 flex justify-end gap-3
  - Botões secundário + primário
```

### 4.8 Toasts/Notificações

```
Aparência:
- Posição: fixed bottom-4 right-4
- Background: bg-white
- Borda: border-l-4 (cor varia por tipo)
- Border radius: rounded-lg
- Sombra: shadow-lg
- Padding: p-4
- Width: max-w-sm

Tipos:
- success: border-green-500, ícone check_circle verde
- error: border-red-500, ícone error vermelho
- warning: border-yellow-500, ícone warning amarelo
- info: border-blue-500, ícone info azul

Conteúdo:
- Ícone + Título (font-medium) + Mensagem (text-sm text-slate-600)
- Botão fechar (x) à direita
- Auto-dismiss após 5s
```

---

## 5. ÍCONES

**Biblioteca:** Material Symbols Outlined  
**CDN:** `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined`

**Uso:**

```html
<span className="material-symbols-outlined text-xl text-slate-400"> icon_name </span>
```

**Ícones comuns:**

- `person` - Usuários
- `badge` - Qualificações
- `flight_takeoff` - Aviação/Simuladores
- `folder` - Pasta Virtual
- `dashboard` - Dashboard
- `settings` - Configurações
- `search` - Busca
- `filter_alt` - Filtros
- `add` - Adicionar
- `edit` - Editar
- `delete` - Excluir
- `visibility` - Visualizar
- `download` - Baixar/Exportar
- `notifications` - Notificações
- `check_circle` - Sucesso
- `error` - Erro
- `warning` - Alerta
- `info` - Informação

---

## 6. ANIMAÇÕES E TRANSIÇÕES

**Princípio:** Sutis e rápidas, melhorando feedback sem distrair

```
- Hover em botões/cards: transition-all duration-200
- Hover em linhas de tabela: transition-colors duration-150
- Abertura de modais: animate-fade-in (fade + scale)
- Toasts: slide-in from bottom-right
- Loading spinners: animate-spin
- Skeleton loading: animate-pulse
```

**Classes Tailwind úteis:**

- `transition-all duration-200`
- `hover:shadow-md`
- `hover:scale-105`
- `animate-pulse` (loading)
- `animate-spin` (spinners)

---

## 7. SIDEBAR

### 7.1 Estrutura

```
- Posição: fixed left-0 top-0 h-screen
- Largura: w-72 (280px)
- Background: bg-white
- Borda: border-r border-gray-200
- Padding: p-6
- Z-index: z-40

Seções:
1. Logo (topo):
   - Imagem/texto AirTrust
   - mb-8

2. Navegação:
   - Lista vertical de links
   - gap-1 entre itens

3. Perfil (rodapé):
   - Fixo no bottom
   - Avatar + nome + cargo
```

### 7.2 Item de Menu

```
Aparência padrão:
- flex items-center gap-3
- px-3 py-2
- rounded-lg
- text-slate-700
- hover:bg-gray-50
- transition-colors

Item ativo:
- bg-primary-50
- text-primary-600
- font-medium
- border-l-4 border-primary-600 (opcional)

Ícone:
- Material Symbols, text-xl
- Cor match do texto
```

---

## 8. TOPBAR

### 8.1 Estrutura

```
- Posição: sticky top-0 (ou fixed)
- Altura: h-16 (64px)
- Background: bg-white
- Borda: border-b border-gray-200
- Padding: px-6
- Z-index: z-30
- flex items-center justify-between

Lado esquerdo:
- Breadcrumb (opcional): text-sm text-slate-500
  - Exemplo: Dashboard / Funcionários / Editar
  - Separador: chevron_right ícone

Lado direito:
- Search bar (opcional)
- Notificações (ícone + badge)
- Avatar + nome do usuário
```

---

## 9. PADRÕES DE PÁGINA

### 9.1 Página de Lista (ex: Funcionários, Qualificações)

```
<AppLayout title="Funcionários">
  <PageHeader
    title="Funcionários"
    subtitle="Gerencie todos os tripulantes e suas qualificações"
    actions={[
      <Button variant="primary" icon="add">Novo Funcionário</Button>
    ]}
  />

  <SummaryCards>
    <KPICard label="Total" value={157} icon="person" />
    <KPICard label="Ativos" value={142} icon="check_circle" color="success" />
    <KPICard label="Inativos" value={15} icon="block" color="danger" />
    <KPICard label="Qualificações Vencidas" value={8} icon="warning" color="warning" />
  </SummaryCards>

  <FilterBar>
    <Input placeholder="Buscar..." icon="search" />
    <Select label="Status" options={[...]} />
    <Select label="Cargo" options={[...]} />
    <Button variant="primary">Aplicar</Button>
    <Button variant="ghost">Limpar</Button>
  </FilterBar>

  <DataTable
    columns={[...]}
    data={[...]}
    pagination={...}
  />
</AppLayout>
```

### 9.2 Página de Formulário (ex: Editar Funcionário)

```
<AppLayout title="Editar Funcionário">
  <PageHeader
    title="Editar Funcionário"
    subtitle="Atualize as informações do tripulante"
    breadcrumb={["Funcionários", "Editar"]}
  />

  <form className="max-w-3xl space-y-6">
    <Card>
      <CardHeader title="Dados Pessoais" />
      <CardBody>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nome Completo" />
          <Input label="Matrícula" />
          <Input label="CPF" />
          <Input label="Email" />
        </div>
      </CardBody>
    </Card>

    <Card>
      <CardHeader title="Dados Profissionais" />
      <CardBody>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Cargo" options={[...]} />
          <Select label="Setor" options={[...]} />
          <DateInput label="Data de Admissão" />
          <Select label="Status" options={[...]} />
        </div>
      </CardBody>
    </Card>

    <div className="flex justify-end gap-3">
      <Button variant="secondary">Cancelar</Button>
      <Button variant="primary" icon="save">Salvar Alterações</Button>
    </div>
  </form>
</AppLayout>
```

### 9.3 Página de Dashboard

```
<AppLayout title="Dashboard">
  <PageHeader
    title="Visão Geral"
    subtitle="Acompanhe os principais indicadores do sistema"
  />

  <SummaryCards>
    <KPICard label="Total Funcionários" value={157} trend="+5% vs mês passado" />
    <KPICard label="Qualificações Ativas" value={1.234} />
    <KPICard label="Alertas Pendentes" value={12} color="warning" />
    <KPICard label="Conformidade" value="94%" color="success" />
  </SummaryCards>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <Card>
      <CardHeader title="Qualificações por Vencer" />
      <CardBody>
        <BarChart data={[...]} />
      </CardBody>
    </Card>

    <Card>
      <CardHeader title="Funcionários por Setor" />
      <CardBody>
        <PieChart data={[...]} />
      </CardBody>
    </Card>
  </div>

  <Card>
    <CardHeader title="Últimas Atividades" />
    <CardBody>
      <ActivityTimeline items={[...]} />
    </CardBody>
  </Card>
</AppLayout>
```

---

## 10. ESTADOS E FEEDBACK

### 10.1 Loading

**Lista/Tabela:**

- Skeleton loading: linhas com `animate-pulse bg-gray-200`
- Altura match das linhas reais
- Bordas arredondadas

**Botão:**

- Desabilitado + spinner à esquerda
- `<span className="animate-spin material-symbols-outlined">progress_activity</span>`

**Página:**

- Spinner centralizado
- Overlay leve (opcional)

### 10.2 Erro

**Página com erro:**

- Ilustração ou ícone grande
- Mensagem clara
- Botão "Tentar Novamente"

**Input com erro:**

- Borda vermelha
- Texto de ajuda abaixo em vermelho

**Toast de erro:**

- Border-left vermelho
- Ícone error
- Mensagem descritiva

### 10.3 Vazio

**Tabela vazia:**

- Ícone grande (inbox, search_off)
- Texto: "Nenhum resultado encontrado"
- Subtexto: "Tente ajustar os filtros"
- Botão de ação (opcional)

### 10.4 Sucesso

**Operação bem-sucedida:**

- Toast verde com ícone check_circle
- Mensagem: "Operação realizada com sucesso"

---

## 11. GRID E ESPAÇAMENTO

### 11.1 Container Principal

```
- max-w-7xl mx-auto (centralizado, largura máxima 1280px)
- px-6 py-8 (padding interno)
- space-y-6 (gap vertical entre seções)
```

### 11.2 Cards Grid

```
- grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6
- Para KPIs: 4 colunas em desktop, 2 em tablet, 1 em mobile
```

### 11.3 Form Grid

```
- grid grid-cols-1 md:grid-cols-2 gap-4
- Inputs ocupam 1 coluna, exceto campos grandes (textarea, endereço)
```

---

## 12. ACESSIBILIDADE

- **Contraste:** Mínimo 4.5:1 para texto normal, 3:1 para texto grande
- **Focus visible:** Ring azul em todos elementos interativos
- **Labels:** Sempre presente (visível ou sr-only)
- **Alt text:** Imagens decorativas com alt=""
- **ARIA:** roles e labels onde apropriado
- **Keyboard navigation:** Tab order lógico, Enter/Space ativam botões

---

## 13. PERFORMANCE

- **Imagens:** Lazy loading, formatos modernos (WebP)
- **Ícones:** Font (Material Symbols) para carregamento rápido
- **CSS:** Tailwind purge ativo (apenas classes usadas)
- **Animações:** GPU-accelerated (transform, opacity)
- **Scroll:** Virtual scrolling para listas grandes (>100 itens)

---

## 14. CHECKLIST DE IMPLEMENTAÇÃO

Ao criar/refatorar uma página, verificar:

- [ ] Usa `<AppLayout>` com sidebar e topbar padrão
- [ ] Tem `<PageHeader>` com título, subtítulo e ações
- [ ] Filtros seguem padrão `<FilterBar>`
- [ ] Cards de métrica seguem estrutura KPI
- [ ] Tabela usa classes de thead/tbody/tr/td padronizadas
- [ ] Botões seguem variantes (primary, secondary, ghost)
- [ ] Inputs têm labels, placeholders e estados de erro
- [ ] Badges usam cores semânticas (success, warning, danger)
- [ ] Ícones são Material Symbols Outlined
- [ ] Espaçamentos seguem escala Tailwind (4, 6, 8, 12, 16, 24px)
- [ ] Cores são apenas do tema claro (sem dark:)
- [ ] Hover states em elementos interativos
- [ ] Loading states e feedback visual
- [ ] Responsivo (mobile, tablet, desktop)

---

## 15. EXEMPLOS DE CÓDIGO

### 15.1 Card KPI

```tsx
<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Total Ativos</p>
      <p className="text-3xl font-bold text-slate-900 mt-2">142</p>
      <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">trending_up</span>
        +5% vs mês anterior
      </p>
    </div>
    <span className="material-symbols-outlined text-4xl text-primary-600">person</span>
  </div>
</div>
```

### 15.2 Botão Primário com Ícone

```tsx
<button className="h-10 px-4 py-2 bg-primary-600 text-white font-medium rounded-lg shadow-sm hover:bg-primary-700 hover:shadow transition-all duration-200 flex items-center gap-2">
  <span className="material-symbols-outlined text-lg">add</span>
  Novo Funcionário
</button>
```

### 15.3 Input com Ícone

```tsx
<div className="relative">
  <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
  <input
    type="text"
    placeholder="Buscar funcionários..."
    className="w-full h-10 pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
  />
</div>
```

### 15.4 Badge de Status

```tsx
<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
  Válido
</span>
```

---

**FIM DO DESIGN SYSTEM**

Este documento serve como referência única para TODAS as decisões visuais do AirTrust v1.  
Qualquer página nova ou refatorada DEVE seguir esses padrões.
