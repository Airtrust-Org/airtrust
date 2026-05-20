# ✅ FASE 22 – PARTE 2: ARQUITETURA DO FRONTEND

**Data**: 15 de Novembro de 2025  
**Projeto**: AirTrust v1  
**Localização**: `/Users/filipedaumas/Documents/airtrust v1/src/react-app`

---

## 📋 SUMÁRIO

1. [Visão Geral](#1-visão-geral)
2. [Estrutura de Arquivos](#2-estrutura-de-arquivos)
3. [Rotas e Navegação](#3-rotas-e-navegação)
4. [Autenticação](#4-autenticação)
5. [Comunicação com API](#5-comunicação-com-api)
6. [Componentes e Layout](#6-componentes-e-layout)
7. [Páginas Principais](#7-páginas-principais)
8. [Hooks Customizados](#8-hooks-customizados)
9. [Pontos Frágeis](#9-pontos-frágeis)

---

## 1. VISÃO GERAL

### 1.1 Tecnologias

```yaml
Framework: React 19.0.0
Linguagem: TypeScript 5.8.3
Build Tool: Vite 6.2.0
Roteamento: React Router DOM 7.9.3
Estilização: Tailwind CSS 3.4.17
State Management: React Hooks (useState, useEffect)
Data Fetching: Custom useApi hook
UI Components: Custom + Headless UI + Lucide Icons
Forms: React Hook Form 7.66.0 + Zod 3.25.76
Notifications: React Hot Toast 2.6.0
```

### 1.2 URLs de Produção

```yaml
Frontend: https://production.airtrust.pages.dev
API Backend: https://airtrust.airtrust.workers.dev
Deploy: Cloudflare Pages
```

### 1.3 Estrutura de Build

```yaml
Source: src/react-app/
Output: dist/client/
Entry: src/react-app/main.tsx
Assets: dist/client/assets/
Index: dist/client/index.html

Build Command: vite build
Deploy Command: npx wrangler pages deploy dist/client --project-name=airtrust --branch=production
```

---

## 2. ESTRUTURA DE ARQUIVOS

```
src/react-app/
├── main.tsx                      # Entrypoint React
├── App.tsx                       # Rotas principais
├── index.css                     # Estilos globais Tailwind
│
├── components/                   # Componentes reutilizáveis
│   ├── layout/
│   │   ├── Header.tsx           # Header global
│   │   ├── PageLayout.tsx       # Layout wrapper
│   │   ├── PageGrid.tsx         # Grid system
│   │   └── PageSection.tsx      # Seções
│   ├── ui/
│   │   ├── Button.tsx           # Botão padrão
│   │   ├── Card.tsx             # Card container
│   │   ├── DataTable.tsx        # Tabela paginada com sort
│   │   ├── Input.tsx            # Input field
│   │   ├── Modal.tsx            # Modal dialog
│   │   ├── Form.tsx             # Form components
│   │   ├── Badge.tsx            # Status badges
│   │   ├── PageHeaderNew.tsx    # Page header
│   │   └── KPICardNew.tsx       # KPI cards
│   ├── funcionarios/            # Componentes de funcionários
│   ├── qualificacoes-historico/ # Componentes de qualificações
│   ├── simuladores/             # Componentes de simuladores
│   └── [outros módulos]/
│
├── pages/                        # Páginas da aplicação
│   ├── LoginSimple.tsx          # 🆕 Login moderno
│   ├── DashboardNew.tsx         # 🆕 Dashboard moderno
│   ├── FuncionariosNew.tsx      # 🆕 Funcionários moderno
│   ├── QualificacoesNew.tsx     # 🆕 Qualificações moderno
│   ├── SimuladoresNew.tsx       # 🆕 Simuladores moderno
│   │
│   ├── Login.tsx                # 🗑️ Login antigo
│   ├── Dashboard.tsx            # 🗑️ Dashboard antigo
│   ├── Funcionarios.tsx         # 🗑️ Funcionários antigo
│   ├── Qualificacoes.tsx        # 🗑️ Qualificações antigo
│   └── [outros módulos]/
│
├── hooks/                        # React hooks customizados
│   ├── useApi.ts                # 🔥 Hook principal para API
│   ├── useAuth.ts               # Autenticação
│   ├── useFuncionarios.ts       # Funcionários
│   ├── useQualificacoesExt.ts   # Qualificações + estatísticas
│   ├── useSimuladores.ts        # Simuladores
│   ├── useHabilitacoes.ts       # Habilitações
│   └── [outros hooks]/
│
├── services/                     # Serviços de API
│   └── index.ts                 # API client (axios)
│
├── config/                       # Configurações
│   └── api.ts                   # API_BASE_URL
│
├── types/                        # TypeScript types
│   └── index.ts                 # Types globais
│
├── utils/                        # Utilitários
│   └── [helpers]/
│
└── styles/                       # Estilos adicionais
    └── design-tokens.ts         # Design tokens
```

---

## 3. ROTAS E NAVEGAÇÃO

### 3.1 Router Principal (`App.tsx`)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route path="/login" element={<LoginSimple />} />

        {/* Páginas Principais */}
        <Route path="/" element={<DashboardNew />} />
        <Route path="/funcionarios" element={<FuncionariosNew />} />
        <Route path="/qualificacoes" element={<QualificacoesNew />} />
        <Route path="/simuladores" element={<SimuladoresNew />} />

        {/* Alias/Redirects */}
        <Route path="/habilitacoes" element={<Navigate to="/qualificacoes" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### 3.2 Rotas Implementadas

| Path             | Componente                  | Descrição                 | Status    |
| ---------------- | --------------------------- | ------------------------- | --------- |
| `/login`         | `LoginSimple.tsx`           | Login moderno             | ✅ Novo   |
| `/`              | `DashboardNew.tsx`          | Dashboard principal       | ✅ Novo   |
| `/funcionarios`  | `FuncionariosNew.tsx`       | Gestão de funcionários    | ✅ Novo   |
| `/qualificacoes` | `QualificacoesNew.tsx`      | Qualificações e histórico | ✅ Novo   |
| `/simuladores`   | `SimuladoresNew.tsx`        | Simuladores e sessões     | ✅ Novo   |
| `/habilitacoes`  | Redirect → `/qualificacoes` | Alias                     | ✅ Compat |

### 3.3 Rotas Legacy (Ainda no Código)

```yaml
⚠️ Duplicadas (Versões Antigas):
  - Login.tsx
  - Dashboard.tsx
  - Funcionarios.tsx
  - Qualificacoes.tsx
  - Simuladores.tsx

Status: 🗑️ PODEM SER REMOVIDAS
Motivo: Substituídas por versões *New.tsx
Ação: Limpar código após validação
```

### 3.4 Navegação

```yaml
Tipo: SPA (Single Page Application)
Modo: Browser Router (history API)
Scroll: Automático para topo em mudança de rota
Links: Via <a href="/path"> (react-router intercepta)

❌ PROBLEMA: NÃO HÁ ProtectedRoute
- Rotas acessíveis sem login
- Sem verificação de token
- Sem redirecionamento automático
```

---

## 4. AUTENTICAÇÃO

### 4.1 Estado Atual

```yaml
Status: ⚠️ IMPLEMENTAÇÃO PARCIAL
Hook: useAuth.ts (existe mas não usado)
Storage: localStorage
Token Key: 'auth_token' ou 'token'
Context: ❌ NÃO EXISTE AuthContext
Protected Routes: ❌ NÃO IMPLEMENTADAS
```

### 4.2 Fluxo de Login (LoginSimple.tsx)

```tsx
// 1. Usuário preenche email/senha
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');

// 2. Submit form
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // ⚠️ PROBLEMA: Apenas console.log, sem integração real
  console.log('Login:', { email, password });

  // ❌ FALTA: Chamar API /api/auth/login
  // ❌ FALTA: Salvar token em localStorage
  // ❌ FALTA: Redirecionar para dashboard
};
```

### 4.3 Hook useAuth (Existe mas Não Usado)

```typescript
// src/react-app/hooks/useAuth.ts
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Login
  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (data.success) {
      localStorage.setItem('auth_token', data.data.accessToken);
      localStorage.setItem('refresh_token', data.data.refreshToken);
      setUser(data.data.user);
      return true;
    }

    return false;
  };

  // Logout
  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  return { user, loading, login, logout };
}
```

**Status**: ✅ Implementado, ❌ Não usado nas páginas

### 4.4 Componente ProtectedRoute (Existe mas Não Usado)

```yaml
Localização: src/react-app/components/ProtectedRoute.tsx
Função: Verificar token antes de renderizar rota
Status: ✅ Existe, ❌ Não usado em App.tsx
```

### 4.5 Problema de Autenticação

```yaml
CRÍTICO: 1. Login não integrado com backend
  2. Todas as rotas públicas (sem proteção)
  3. Token não validado no frontend
  4. Sem refresh automático de token
  5. Sem tratamento de sessão expirada

IMPACTO:
  - Qualquer um acessa o sistema
  - Não há controle de acesso
  - Experiência de usuário quebrada

SOLUÇÃO: 1. Integrar LoginSimple com /api/auth/login
  2. Criar AuthContext global
  3. Aplicar ProtectedRoute em App.tsx
  4. Implementar refresh token automático
```

---

## 5. COMUNICAÇÃO COM API

### 5.1 Hook Principal: useApi

```typescript
// src/react-app/hooks/useApi.ts
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';

export function useApi<T>(url: string, options = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Construir URL completa
      const fullUrl = buildFullUrl(url);

      // Headers com token
      const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      };

      // Fetch
      const response = await fetch(fullUrl, { headers });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
      }

      const result = await response.json();

      // Tratar envelope de resposta
      if (result.success !== undefined) {
        if (result.success) {
          setData(result.data);
        } else {
          throw new Error(result.error);
        }
      } else {
        setData(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [url]);

  return { data, loading, error, refetch: fetchData };
}
```

### 5.2 Configuração de API

```typescript
// src/react-app/config/api.ts
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'https://airtrust.airtrust.workers.dev/api';
```

### 5.3 Padrão de Uso

```tsx
// Exemplo: Listar funcionários
function FuncionariosNew() {
  const { data, loading, error } = useApi('/api/funcionarios');

  // Extrair dados do envelope
  const funcionarios = Array.isArray(data) ? data : data?.data || [];

  if (loading) return <div>Carregando...</div>;
  if (error) return <div>Erro: {error}</div>;

  return (
    <div>
      {funcionarios.map((f) => (
        <div key={f.id}>{f.nome}</div>
      ))}
    </div>
  );
}
```

### 5.4 Problema de URL

```yaml
PROBLEMA: Duplicação de /api/ em URLs
Causa: buildFullUrl() não remove /api/ duplo corretamente
Impacto: Algumas chamadas podem falhar (404)

Exemplo:
  url: '/api/funcionarios'
  API_BASE_URL: 'https://...workers.dev/api'
  Resultado: 'https://...workers.dev/api/api/funcionarios' ❌

Solução Implementada:
  // Remove duplicate /api prefix
  const finalUrl = cleanUrl.startsWith('api/')
    ? cleanUrl.substring(4)
    : cleanUrl;

Status: ✅ CORRIGIDO no código, mas pode ter casos edge
```

### 5.5 Outros Serviços (Não Usados)

```yaml
Localização: src/services/index.ts
Tipo: Axios client
Status: ❌ NÃO USADO (useApi é preferido)
Motivo: useApi com fetch é mais simples e direto
Ação: Remover services/ após validação
```

---

## 6. COMPONENTES E LAYOUT

### 6.1 Sistema de Layout

#### Não Existe AppLayout Centralizado

```yaml
PROBLEMA: Cada página implementa layout próprio
Resultado: INCONSISTÊNCIA VISUAL

Páginas com TopNavLayout:
  - DashboardNew.tsx ✅
  - FuncionariosNew.tsx ✅
  - QualificacoesNew.tsx ✅
  - SimuladoresNew.tsx ✅

Páginas sem layout:
  - LoginSimple.tsx (OK, página isolada)

Layout Antigo (Sidebar):
  - Dashboard.tsx (usa AppLayout antigo)
  - Funcionarios.tsx (usa AppLayout antigo)
  - Etc.
```

#### TopNavLayout (Se Existe)

```yaml
Localização: components/layout/TopNavLayout.tsx
Status: ❌ ARQUIVO NÃO ENCONTRADO

Usado em: DashboardNew, FuncionariosNew, etc.
Import: import { TopNavLayout } from '@/components/layout/TopNavLayout';

PROBLEMA: Código importa mas arquivo não existe
CAUSA: Pode estar em outro local ou ser tipo/interface
```

### 6.2 Componentes UI Principais

#### DataTable (`components/ui/DataTable.tsx`)

```typescript
interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, item: any) => React.ReactNode;
}

interface DataTableProps {
  columns: DataTableColumn[];
  data: any[];
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onView?: (id: number) => void;
  getRowStatus?: (item: any) => 'valid' | 'expiring' | 'expired';
  loading?: boolean;
  emptyMessage?: string;
  showActions?: boolean;
}

export function DataTable({ columns, data, ... }: DataTableProps) {
  // Features:
  // - Sorting (asc/desc/none)
  // - Status-based row colors
  // - Action buttons (edit, delete, view)
  // - Responsive design
  // - Empty state
}
```

**Uso**:

```tsx
<DataTable
  columns={[
    { key: 'nome', label: 'Nome', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
  ]}
  data={funcionarios}
  onEdit={(id) => console.log('Edit', id)}
  onDelete={(id) => console.log('Delete', id)}
  loading={loading}
/>
```

#### PageHeader (`components/ui/PageHeaderNew.tsx`)

```typescript
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, lastUpdated, actions }: PageHeaderProps) {
  // Renderiza:
  // - Título grande
  // - Subtítulo (opcional)
  // - Última atualização (opcional)
  // - Botões de ação (opcional)
}
```

#### KPICard (`components/ui/KPICardNew.tsx`)

```typescript
interface KPICardProps {
  label: string;
  value: string | number;
  change?: string;
  variant?: 'success' | 'warning' | 'danger' | 'info';
}

export function KPICardNew({ label, value, change, variant }: KPICardProps) {
  // Renderiza card de métrica:
  // - Label (ex: "Funcionários Ativos")
  // - Value (ex: 150)
  // - Change (ex: "+10 este mês")
  // - Cor baseada em variant
}
```

#### Button (`components/ui/Button.tsx`)

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: string; // Material icon name
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Button({ variant, size, icon, loading, children, ...props }: ButtonProps) {
  // Renderiza botão estilizado
  // - Variantes de cor
  // - Tamanhos
  // - Ícone opcional (Material Symbols)
  // - Estado de loading
}
```

#### Modal (`components/ui/Modal.tsx`)

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, footer, size }: ModalProps) {
  // Modal dialog com:
  // - Overlay backdrop
  // - Fechar com ESC
  // - Fechar clicando fora
  // - Header com título e botão X
  // - Body scrollável
  // - Footer opcional
}
```

### 6.3 Componentes de Formulário

```typescript
// FormField: Wrapper com label + error
<FormField label="Nome" required error={errors.nome}>
  <TextInput {...} />
</FormField>

// TextInput: Input text padrão
<TextInput
  placeholder="Digite o nome"
  value={nome}
  onChange={(e) => setNome(e.target.value)}
/>

// Select: Dropdown
<Select
  options={[
    { value: 'ATIVO', label: 'Ativo' },
    { value: 'INATIVO', label: 'Inativo' },
  ]}
  value={status}
  onChange={(e) => setStatus(e.target.value)}
/>

// FormActions: Botões de ação
<FormActions
  onCancel={() => setShowModal(false)}
  onSubmit={handleSubmit}
  submitLabel="Salvar"
  loading={loading}
/>
```

### 6.4 Ícones

```yaml
Biblioteca: Material Symbols Outlined
CDN: Google Fonts
Uso: <span className="material-symbols-outlined text-primary-600">
  search
  </span>

Ícones comuns:
  - person_add (Adicionar funcionário)
  - badge (Qualificações)
  - calendar_today (Agendar sessão)
  - edit (Editar)
  - delete (Deletar)
  - visibility (Visualizar)
  - search (Buscar)
  - filter_alt (Filtrar)
```

---

## 7. PÁGINAS PRINCIPAIS

### 7.1 Dashboard (`DashboardNew.tsx`)

```yaml
Rota: /
Propósito: Visão geral do sistema
Layout: TopNavLayout

Seções:
  1. PageHeader
     - Título: "Planejador de Conformidade Proativo"
     - Subtítulo: "Visão geral do sistema..."

  2. KPI Cards (4 colunas)
     - Funcionários Ativos
     - Qualificações Válidas
     - Qualificações Vencendo (próx. 30 dias)
     - Qualificações Vencidas

  3. Ações Rápidas (3 cards)
     - Cadastrar Funcionário → /funcionarios
     - Gerenciar Qualificações → /qualificacoes
     - Agendar Sessão → /simuladores

  4. Alertas de Conformidade (condicional)
     - Se vencidas > 0: Alert vermelho
     - Se vencendo > 0 e vencidas = 0: Alert amarelo

APIs Chamadas:
  - GET /api/funcionarios (useApi)
  - GET /api/qualificacoes/historico (useQualificacoesHistorico)

Estatísticas:
  - Total funcionários: funcionarios.length
  - Ativos: filter(f => f.status === 'ATIVO')
  - Qualificações: hook useQualificacoesHistorico retorna stats
```

### 7.2 Funcionários (`FuncionariosNew.tsx`)

```yaml
Rota: /funcionarios
Propósito: Gestão de funcionários
Layout: TopNavLayout

Seções:
  1. PageHeader
     - Título: "Funcionários"
     - Subtítulo: "Visualize e gerencie todos os funcionários..."
     - Ação: Botão "Novo Funcionário"

  2. KPI Cards (3 cards)
     - Total
     - Ativos
     - Inativos

  3. Barra de Busca
     - Input com ícone search
     - Filtra por: nome, função, matrícula

  4. DataTable
     - Colunas: Nome (avatar), Matrícula, Função, Base, Email, Telefone, Status
     - Colunas visíveis: Email e Telefone ocultas por padrão
     - Ações: Editar, Visualizar, Deletar
     - Ordenação: Todas as colunas sortable
     - Empty state: "Nenhum funcionário cadastrado"

  5. Modal de Formulário (Novo/Editar)
     - Nome Completo
     - Matrícula
     - Função (select: PILOTO, COPILOTO, INSTRUTOR, CHECADOR)
     - Base
     - Email
     - Telefone
     - Status (select: ATIVO, INATIVO)

APIs Chamadas:
  - GET /api/funcionarios (useApi)
  - POST /api/funcionarios (ao salvar novo)
  - PUT /api/funcionarios/:id (ao editar)
  - DELETE /api/funcionarios/:id (ao deletar)

Estado:
  - searchTerm: string
  - showModal: boolean
  - editingFuncionario: Funcionario | null

⚠️ PROBLEMA: Modal implementado mas POST/PUT/DELETE não funcionam
- Apenas console.log('Salvar:', data)
- Falta integração real com API
```

### 7.3 Qualificações (`QualificacoesNew.tsx`)

```yaml
Rota: /qualificacoes
Propósito: Gestão de qualificações e histórico
Layout: TopNavLayout

Seções:
  1. PageHeader
     - Título: "Qualificações e Certificações"
     - Subtítulo: "Gerencie qualificações, certificações..."
     - Ação: Botão "Nova Qualificação"

  2. KPI Cards (5 cards)
     - Total
     - Válidas
     - Vencendo (30 dias)
     - Vencidas
     - Renovadas

  3. Tabs (2 abas)
     - Histórico: Lista de qualificações por funcionário
     - Tipos: Catálogo de tipos de qualificações

  4. Tab "Histórico"
     - Filtro: Funcionário (select)
     - DataTable:
       - Colunas: Funcionário, Qualificação, Código, Tipo, Status, Vencimento, Realizado
       - Status badge: VALIDA (verde), VENCENDO (amarelo), VENCIDA (vermelho)
       - Ações: Editar, Visualizar, Renovar
     - Drag-and-drop: Reordenar colunas (feature avançada)

  5. Tab "Tipos"
     - DataTable:
       - Colunas: Nome, Código, Categoria, Validade (meses), Obrigatória
       - Ações: Editar, Deletar

APIs Chamadas:
  - GET /api/qualificacoes/historico (useQualificacoesHistorico)
    - Retorna: historico[], stats, pagination
  - GET /api/qualificacoes/tipos (useApi)
  - POST /api/qualificacoes/historico (ao adicionar)
  - PUT /api/qualificacoes/historico/:id (ao editar)

Hook useQualificacoesHistorico:
  - Endpoint: /api/qualificacoes/historico?limit=2000
  - Extrai pagination.total para stats
  - Calcula estatísticas:
    - total: pagination.total (1036 em prod)
    - validas: filter(q => q.status === 'VALIDA')
    - vencendo: filter(q => q.status === 'PROXIMA_VENCIMENTO')
    - vencidas: filter(q => q.status === 'VENCIDA')

⚠️ PROBLEMA CORRIGIDO:
  - Antes: stats.total = historico.length (100-200)
  - Agora: stats.total = pagination.total (1036)
  - Dashboard mostra contagem correta
```

### 7.4 Simuladores (`SimuladoresNew.tsx`)

```yaml
Rota: /simuladores
Propósito: Gestão de simuladores e sessões
Layout: TopNavLayout

Seções:
  1. PageHeader
     - Título: "Simuladores"
     - Subtítulo: "Gerencie equipamentos e sessões..."
     - Ação: Botão "Agendar Sessão"

  2. KPI Cards (4 cards)
     - Total Simuladores
     - Sessões Hoje
     - Sessões Mês
     - Horas Voadas

  3. Tabs (2 abas)
     - Sessões: Lista de sessões agendadas
     - Equipamentos: Lista de simuladores

  4. Tab "Sessões"
     - Filtros:
       - Simulador (select)
       - Instrutor (select)
       - Status (select)
       - Data início / fim (date pickers)
     - DataTable:
       - Colunas: Data, Simulador, Instrutor, Duração, Tipo, Status
       - Status badge: AGENDADA, EM_ANDAMENTO, CONCLUIDA, CANCELADA
       - Ações: Editar, Visualizar, Cancelar

  5. Tab "Equipamentos"
     - DataTable:
       - Colunas: Modelo, Fabricante, Tipo, Código, Status
       - Ações: Editar, Visualizar

APIs Chamadas:
  - GET /api/simuladores (useApi)
  - GET /api/simuladores/sessoes (useApi)
  - POST /api/simuladores/sessoes (ao agendar)
  - PUT /api/simuladores/sessoes/:id (ao editar)
  - DELETE /api/simuladores/sessoes/:id (ao cancelar)

Estado:
  - activeTab: 'sessoes' | 'equipamentos'
  - showModal: boolean
  - filters: { simulador, instrutor, status, dataInicio, dataFim }

⚠️ STATUS: Página básica, funcionalidades parciais
- Listar sessões: ✅ OK
- Listar equipamentos: ✅ OK
- Agendar sessão: ⚠️ Modal não implementado
- Editar/Cancelar: ⚠️ Não implementado
```

### 7.5 Login (`LoginSimple.tsx`)

```yaml
Rota: /login
Propósito: Autenticação de usuário
Layout: Próprio (sem TopNavLayout)

Seções:
  1. Logo e Título
     - Ícone: flight_takeoff (azul)
     - Título: "AirTrust"
     - Subtítulo: "Sistema de Gestão Aeronáutica"

  2. Card de Login
     - Título: "Entrar"
     - Input: E-mail (com ícone mail)
     - Input: Senha (com ícone lock, type=password)
     - Botão: "Entrar" (variant=primary, full width)
     - Link: "Esqueceu sua senha?"

  3. Footer
     - "© 2025 AirTrust. Todos os direitos reservados."

Design:
  - Centralizado vertical e horizontal
  - Background: gray-100
  - Card: bg-white com border e shadow
  - Logo: Círculo azul com ícone branco

⚠️ PROBLEMA CRÍTICO:
  - handleSubmit apenas faz console.log
  - NÃO chama /api/auth/login
  - NÃO salva token
  - NÃO redireciona
  - Página decorativa, sem funcionalidade real

Solução:
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('auth_token', data.data.accessToken);
        localStorage.setItem('refresh_token', data.data.refreshToken);
        window.location.href = '/';
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Erro ao fazer login');
    }
  };
```

---

## 8. HOOKS CUSTOMIZADOS

### 8.1 useApi (Principal)

```yaml
Localização: hooks/useApi.ts
Propósito: Fetch data from API com retry e loading state
Retorna: { data, loading, error, refetch }

Características:
  - Automatic fetch on mount
  - Retry on failure (default: 3 tentativas)
  - Delay entre retries (default: 1000ms)
  - Token automático do localStorage
  - Tratamento de envelope { success, data, error }

Uso: const { data, loading, error } = useApi('/api/funcionarios');
```

### 8.2 useQualificacoesExt

```yaml
Localização: hooks/useQualificacoesExt.ts
Propósito: Hook específico para qualificações + estatísticas

Funções:
  - useQualificacoesHistorico(funcionarioId?, limit?)
    - Retorna: { historico, stats, loading, error, refetch }
    - Stats calculadas: total, validas, vencendo, vencidas, renovadas

  - useHabilitacoes(limit?)
    - Retorna: { habilitacoes, loading, error, refetch }

Características:
  - Extrai pagination.total para contagem correta
  - Calcula estatísticas de status
  - Função renovarQualificacao() para renovações
```

### 8.3 useFuncionarios

```yaml
Localização: hooks/useFuncionarios.ts
Propósito: CRUD de funcionários
Status: ⚠️ Existe mas não usado (useApi direto é preferido)
```

### 8.4 useAuth

```yaml
Localização: hooks/useAuth.ts
Propósito: Autenticação
Status: ⚠️ Existe mas não usado

Funções:
  - login(email, password): Promise<boolean>
  - logout(): void
  - refreshToken(): Promise<void>
  - user: User | null
  - loading: boolean
```

### 8.5 Outros Hooks

```yaml
useSimuladores: CRUD de simuladores
useSessoes: CRUD de sessões
useHabilitacoes: Lista habilitações
useDebounce: Debounce para inputs
useConfirm: Confirmação de ações
useToast: Notificações (react-hot-toast)
```

---

## 9. PONTOS FRÁGEIS

### 9.1 Críticos (Quebram UX)

#### 🔴 1. Login Não Funcional

```yaml
Problema: LoginSimple.tsx não integra com /api/auth/login
Impacto: Usuário não consegue fazer login real
Resultado: Sistema acessível sem autenticação
Solução: Implementar handleSubmit correto
Status: ⚠️ URGENTE
```

#### 🔴 2. Rotas Desprotegidas

```yaml
Problema: Nenhuma rota usa ProtectedRoute
Impacto: Qualquer um acessa sem login
Risco: Dados expostos publicamente
Solução: <Route
  path="/"
  element={
  <ProtectedRoute>
  <DashboardNew />
  </ProtectedRoute>
  }
  />
Status: ⚠️ URGENTE
```

#### 🔴 3. Sem AuthContext

```yaml
Problema: Sem contexto global de autenticação
Impacto:
  - Cada hook chama API separadamente
  - Estado de user não compartilhado
  - Logout não propaga para todas as páginas
Solução: Criar AuthProvider
Status: ⚠️ URGENTE
```

#### 🔴 4. TopNavLayout Não Encontrado

```yaml
Problema: Páginas *New.tsx importam mas arquivo não existe
Impacto: Build pode quebrar ou componente é mock
Solução: Criar TopNavLayout ou verificar path correto
Status: ⚠️ INVESTIGAR
```

### 9.2 Médios (Funciona Parcialmente)

#### 🟡 1. Formulários Sem Integração

```yaml
Problema: Modais de criar/editar apenas fazem console.log
Impacto: CRUD não funciona no frontend
Afeta:
  - Criar funcionário
  - Editar funcionário
  - Criar qualificação
  - Agendar sessão
Solução: Implementar POST/PUT/DELETE em cada modal
Status: ⚠️ PENDENTE
```

#### 🟡 2. Páginas Legacy Duplicadas

```yaml
Problema: Código tem versões antigas e novas
Arquivos duplicados:
  - Login vs LoginSimple
  - Dashboard vs DashboardNew
  - Funcionarios vs FuncionariosNew
  - Qualificacoes vs QualificacoesNew
  - Simuladores vs SimuladoresNew

Impacto: Confusão, código inchado, manutenção difícil
Solução: Remover versões antigas após validação
Status: ⚠️ LIMPAR DEPOIS
```

#### 🟡 3. Upload de Certificados

```yaml
Problema: Frontend tem código de upload mas backend não
Localização: CertificadoUpload.tsx, UploadDocumentosPastaVirtual.tsx
Impacto: Botão "Upload" não funciona
Depende: R2 integration no worker
Status: ⚠️ BACKEND PENDENTE
```

#### 🟡 4. Inconsistência de Layout

```yaml
Problema: Páginas com estilos diferentes
Causa: Migração gradual para versões *New.tsx
Resultado:
  - Dashboard: Estilo novo
  - Algumas páginas antigas: Estilo antigo
  - Páginas não refatoradas: Sem padrão
Solução: Aplicar Design System em todas
Status: ⚠️ REFACTOR EM ANDAMENTO
```

### 9.3 Baixos (Melhorias)

#### 🟢 1. Sem Validação de Formulários

```yaml
Problema: Inputs não validam antes de enviar
Impacto: Dados inválidos podem ser enviados
Solução: React Hook Form + Zod (já instalados)
Status: ⚠️ PENDENTE
```

#### 🟢 2. Sem Loading States Globais

```yaml
Problema: Cada componente gerencia loading sozinho
Impacto: Experiência inconsistente
Solução: Context de loading global ou skeleton screens
Status: ⚠️ MELHORIA
```

#### 🟢 3. Sem Tratamento de Erros Global

```yaml
Problema: Erros aparecem como alert() ou console.log
Impacto: UX ruim
Solução: Toast notifications (react-hot-toast já instalado)
Status: ⚠️ USAR MAIS
```

#### 🟢 4. Sem Testes

```yaml
Problema: Zero testes de componentes
Impacto: Refactors arriscados
Solução: Vitest + Testing Library (já instalados)
Status: ⚠️ PENDENTE
```

---

## 10. RESUMO EXECUTIVO

### 10.1 Estado Atual

```yaml
✅ FUNCIONANDO:
  - Estrutura de rotas (react-router)
  - Páginas principais (*New.tsx)
  - Listagem de dados (GET via useApi)
  - Componentes UI (DataTable, Button, Modal, etc.)
  - Design moderno e consistente (versões new)

⚠️ FUNCIONANDO COM PROBLEMAS:
  - Login (página existe mas não funciona)
  - CRUD (modais existem mas sem integração)
  - Layout (TopNavLayout importado mas não encontrado)
  - Autenticação (hooks existem mas não usados)

❌ NÃO FUNCIONANDO:
  - Login real (não chama API)
  - Rotas protegidas (todas públicas)
  - Criar/Editar registros (POST/PUT)
  - Upload de arquivos (R2)
  - Refresh de token automático
```

### 10.2 Prioridades de Correção

```yaml
URGENTE (Fazer Agora): 1. Implementar login funcional (LoginSimple + /api/auth/login)
  2. Criar AuthContext global
  3. Aplicar ProtectedRoute em todas as rotas
  4. Verificar TopNavLayout (criar ou corrigir path)

IMPORTANTE (Próxima Sprint): 5. Implementar POST/PUT/DELETE em formulários
  6. Adicionar validação com React Hook Form + Zod
  7. Melhorar tratamento de erros (toasts)
  8. Remover páginas legacy duplicadas

MELHORIAS (Backlog): 9. Adicionar testes de componentes
  10. Implementar loading states globais
  11. Criar skeleton screens
  12. Documentar componentes (Storybook?)
```

---

**Próximo Relatório**: FASE22-PARTE3-DATABASE-D1.md

**Gerado em**: 15/11/2025  
**Autor**: GitHub Copilot - Auditor de Arquitetura
