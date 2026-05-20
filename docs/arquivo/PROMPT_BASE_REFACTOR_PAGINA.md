# PROMPT-BASE: Refatorar Página com AirTrust Design System

---

## 📋 INSTRUÇÕES DE USO

Cole este prompt + o código da página que deseja refatorar. O resultado será uma versão completamente reescrita seguindo o padrão visual global do AirTrust.

---

## 🎨 CONTEXTO DO DESIGN SYSTEM

Você está refatorando uma página do **AirTrust v1** para seguir o **Design System oficial**.

### Stack Tecnológica

- **Frontend:** React 19 + TypeScript + Vite
- **Estilização:** Tailwind CSS 3.x
- **Ícones:** Material Symbols Outlined
- **Fonte:** Inter (Google Fonts)

### Tema

- **APENAS TEMA CLARO** (ignorar completamente classes `dark:` e toggles de tema)
- Sem suporte a dark mode

### Cores Principais

```
- Primária: #2563eb (blue-600)
- Background página: #f3f4f6 (gray-100)
- Background surface (cards/tabelas): #ffffff
- Texto principal: #0f172a (slate-900)
- Texto secundário: #64748b (slate-500/600)
- Bordas: #e5e7eb (gray-200)

Status:
- Success (verde): #16a34a (green-600)
- Warning (amarelo): #f59e0b (amber-500)
- Danger (vermelho): #dc2626 (red-600)
- Info (azul): #3b82f6 (blue-500)
```

### Tipografia

```
- Fonte: Inter (pesos 400, 500, 600, 700)
- H1: text-3xl font-bold text-slate-900
- H2: text-2xl font-semibold text-slate-900
- H3: text-lg font-semibold text-slate-900
- Subtitle: text-sm text-slate-600
- Body: text-base text-slate-700
- Table text: text-sm text-slate-700
- Badge: text-xs font-medium
```

---

## 🏗️ ESTRUTURA DE LAYOUT

Todas as páginas internas usam o mesmo layout:

```tsx
<AppLayout title="Nome da Página" currentPath="/rota-atual">
  <PageHeader
    title="Título Principal"
    subtitle="Descrição da página (opcional)"
    actions={[
      <Button variant="secondary" icon="download">Exportar</Button>,
      <Button variant="primary" icon="add">Novo Item</Button>
    ]}
  />

  {/* Cards de KPI (opcional) */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <KPICard label="Total" value={157} icon="person" />
    <KPICard label="Ativos" value={142} icon="check_circle" color="success" />
    <KPICard label="Vencidos" value={8} icon="warning" color="warning" />
  </div>

  {/* Barra de filtros (opcional) */}
  <div className="bg-white border border-gray-200 rounded-lg p-4">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Input placeholder="Buscar..." icon="search" />
      <Select options={[...]} />
      <Button variant="primary">Aplicar</Button>
      <Button variant="ghost">Limpar</Button>
    </div>
  </div>

  {/* Tabela de dados */}
  <DataTable
    columns={[...]}
    data={[...]}
    pagination={...}
  />
</AppLayout>
```

---

## 🧩 COMPONENTES PADRÃO

### Botões

#### Primário

```tsx
<button className="h-10 px-4 py-2 bg-primary-600 text-white font-medium rounded-lg shadow-sm hover:bg-primary-700 hover:shadow transition-all duration-200 flex items-center gap-2">
  <span className="material-symbols-outlined text-lg">add</span>
  Texto do Botão
</button>
```

#### Secundário

```tsx
<button className="h-10 px-4 py-2 bg-white border border-gray-300 text-slate-700 font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
  <span className="material-symbols-outlined text-lg">download</span>
  Exportar
</button>
```

#### Ghost

```tsx
<button className="h-10 px-3 py-2 text-primary-600 font-medium rounded-lg hover:bg-primary-50 transition-colors">
  Limpar Filtros
</button>
```

### Inputs

#### Input com Ícone

```tsx
<div className="relative">
  <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
    search
  </span>
  <input
    type="text"
    placeholder="Buscar..."
    className="w-full h-10 pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
  />
</div>
```

### Cards KPI

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

### Tabelas

```tsx
<div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
            Nome
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
            Status
          </th>
          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
            Ações
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        <tr className="hover:bg-gray-50 transition-colors">
          <td className="px-6 py-4 text-sm text-slate-700">João Silva</td>
          <td className="px-6 py-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Ativo
            </span>
          </td>
          <td className="px-6 py-4 text-right">
            <div className="flex items-center justify-end gap-2">
              <button className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-lg">edit</span>
              </button>
              <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  {/* Paginação */}
  <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
    <p className="text-sm text-slate-600">Mostrando 1-10 de 157 resultados</p>
    <div className="flex items-center gap-2">
      <button className="h-9 px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
        Anterior
      </button>
      <button className="h-9 w-9 bg-primary-600 text-white rounded-lg text-sm">1</button>
      <button className="h-9 w-9 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
        2
      </button>
      <button className="h-9 w-9 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
        3
      </button>
      <button className="h-9 px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
        Próximo
      </button>
    </div>
  </div>
</div>
```

### Badges de Status

```tsx
{
  /* Success */
}
<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
  Válido
</span>;

{
  /* Warning */
}
<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
  Vencendo
</span>;

{
  /* Danger */
}
<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
  Vencido
</span>;
```

---

## ✅ CHECKLIST DE REFATORAÇÃO

Ao refatorar a página, você DEVE:

### Estrutura

- [ ] Envolver tudo em `<AppLayout title="..." currentPath="...">`
- [ ] Adicionar `<PageHeader>` com título, subtítulo e ações
- [ ] Se houver métricas, usar grid de `<KPICard>` (4 colunas desktop, 2 tablet, 1 mobile)
- [ ] Se houver filtros, usar barra de filtros com inputs + botões
- [ ] Se houver listagem, usar estrutura de tabela padrão

### Estilos

- [ ] Remover TODAS classes `dark:` (não temos dark mode)
- [ ] Usar cores do design system (primary-600, slate-900, gray-100, etc.)
- [ ] Fonte Inter para todo texto
- [ ] Ícones Material Symbols Outlined
- [ ] Border radius: `rounded-lg` (8px) ou `rounded-xl` (12px) para cards grandes
- [ ] Sombras: `shadow-sm` padrão, `hover:shadow-md` em hover
- [ ] Transições: `transition-colors duration-200` ou `transition-all duration-200`

### Componentes

- [ ] Botões seguem variantes (primary, secondary, ghost)
- [ ] Inputs com altura `h-10`, padding `px-3 py-2`, border `border-gray-300`
- [ ] Ícones com tamanho `text-lg` (18px) ou `text-xl` (20px)
- [ ] Badges arredondados completos (`rounded-full`) com dot indicator
- [ ] Tabela com cabeçalho `bg-gray-50`, hover `hover:bg-gray-50` em linhas

### Espaçamentos

- [ ] Container principal: `max-w-7xl mx-auto px-6 py-8`
- [ ] Gap entre seções: `space-y-6` (24px)
- [ ] Gap entre elementos em linha: `gap-3` ou `gap-4`
- [ ] Padding de cards: `p-4` ou `p-6`

### Responsividade

- [ ] Grid responsivo: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- [ ] Ocultar elementos em mobile: `hidden md:block`
- [ ] Stacking vertical em mobile, horizontal em desktop

### Funcionalidade

- [ ] Manter TODA lógica/funcionalidade existente
- [ ] Manter mesmas chamadas de API
- [ ] Manter mesmos estados (loading, error, empty)
- [ ] Manter mesmas ações (editar, excluir, criar)
- [ ] Apenas mudar a APARÊNCIA, não o comportamento

---

## 📝 TAREFA

**REESCREVA** o código da página fornecido abaixo seguindo RIGOROSAMENTE:

1. **Design System AirTrust** (cores, tipografia, espaçamentos)
2. **Layout Global** (AppLayout + PageHeader + Cards + Filtros + Tabela)
3. **Componentes padrão** (botões, inputs, badges, etc.)
4. **Tema claro apenas** (sem dark mode)
5. **Manter funcionalidade** (mesma lógica, mesmas APIs)

### Output esperado:

- Código TSX completo e funcional
- Imports corretos
- TypeScript tipado
- Comentários explicativos quando necessário
- Código limpo e bem formatado

---

## 📄 CÓDIGO DA PÁGINA A REFATORAR

[COLE AQUI O CÓDIGO DA PÁGINA]

---

## 🎯 EXEMPLO DE TRANSFORMAÇÃO

### ANTES (página antiga):

```tsx
// Página sem padrão definido
export default function Funcionarios() {
  return (
    <div>
      <h1>Funcionários</h1>
      <button onClick={handleNew}>Novo</button>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td>{item.nome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### DEPOIS (com design system):

```tsx
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';

export default function Funcionarios() {
  return (
    <AppLayout title="Funcionários" currentPath="/funcionarios">
      <PageHeader
        title="Funcionários"
        subtitle="Gerencie todos os tripulantes e suas qualificações"
        actions={
          <button className="h-10 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">add</span>
            Novo Funcionário
          </button>
        }
      />

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Nome
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-700">{item.nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
```

---

## ⚠️ REGRAS CRÍTICAS

1. **NÃO** adicionar funcionalidades novas
2. **NÃO** remover funcionalidades existentes
3. **NÃO** mudar nomes de variáveis/funções (manter compatibilidade)
4. **NÃO** usar dark mode (classes dark:)
5. **SIM** manter mesma estrutura de dados
6. **SIM** manter mesmas chamadas de API
7. **SIM** aplicar design system visual
8. **SIM** melhorar UX com estados de loading/error/empty

---

**AGORA REESCREVA A PÁGINA SEGUINDO TODOS OS PADRÕES ACIMA.**
