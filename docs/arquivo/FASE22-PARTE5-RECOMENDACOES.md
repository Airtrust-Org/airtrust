# ✅ FASE 22 – PARTE 5: RECOMENDAÇÕES E PLANO DE AÇÃO

**Data**: 15 de Novembro de 2025  
**Projeto**: AirTrust v1  
**Escopo**: Conclusões, Prioridades e Roadmap

---

## 📋 SUMÁRIO

1. [Sumário Executivo](#1-sumário-executivo)
2. [Problemas Críticos](#2-problemas-críticos)
3. [Plano de Ação Imediato](#3-plano-de-ação-imediato)
4. [Roadmap de Correções](#4-roadmap-de-correções)
5. [Refatorações Arquiteturais](#5-refatorações-arquiteturais)
6. [Melhorias de Performance](#6-melhorias-de-performance)
7. [Segurança e Auditoria](#7-segurança-e-auditoria)
8. [Documentação Técnica](#8-documentação-técnica)

---

## 1. SUMÁRIO EXECUTIVO

### 1.1 Estado Atual do Projeto

```yaml
Backend (Cloudflare Worker):
  Implementação: 75% completo
  Funcionalidade: ✅ GET endpoints funcionando (exceto funcionarios)
    ⚠️ POST/PUT/DELETE implementados mas não testados
    ❌ Pasta Virtual (R2) não implementado
  Qualidade: Código limpo, padrões OK, middlewares OK
  Bloqueador: Coluna 'setor' faltando em produção

Frontend (React + Vite):
  Implementação: 70% completo
  Funcionalidade: ✅ UI moderna completa (DataTable, modais, forms)
    ✅ useApi hook funcional
    ❌ Autenticação não integrada
    ❌ Formulários não enviam dados para API
  Qualidade: Componentização boa, design limpo
  Bloqueador: Login não funciona

Database (D1):
  Schema: 90% completo
  Dados: ~1200 registros em produção
  Problemas: 🔴 Coluna 'setor' faltando (funcionarios)
    🔴 Tabela 'usuarios' vazia
    🟡 FK quebradas (qualificacoes_historico)
    🟢 Schema legado (workaround funciona)
  Bloqueador: Migration 0006 não aplicada

Storage (R2):
  Configuração: ✅ Binding OK
  Implementação: ❌ 0% (sem endpoints)
  Bloqueador: Endpoints não criados

Autenticação:
  Backend: ✅ Endpoints implementados
  Frontend: ❌ Não integrado
  Database: 🔴 Sem usuários
  Bloqueador: Login não chama API, tabela vazia
```

### 1.2 Classificação de Problemas

```yaml
🔴 CRÍTICOS (Bloqueiam uso): 1. Coluna 'setor' faltando → GET /api/funcionarios retorna 500
  2. Tabela 'usuarios' vazia → Login impossível
  3. LoginSimple não chama API → Autenticação não funciona
  4. Rotas desprotegidas → Qualquer um acessa sistema
  5. useApi sem Authorization → Rotas protegidas falham

🟡 IMPORTANTES (Funcionalidade limitada): 6. POST/PUT/DELETE não testados → Não sabemos se funcionam
  7. Formulários não integrados → Não consegue criar/editar
  8. FK quebradas qualificações → Performance ruim
  9. Pasta Virtual não existe → Upload impossível
  10. Sem refresh token automático → Session expira sem aviso

🟢 MELHORIAS (Qualidade/Performance): 11. Índices compostos faltando → Queries lentas
  12. Schema legado em qualificações → Manutenção difícil
  13. Campos renomeados (data_*) → Confusão
  14. Sem validação de conflitos → Duplo agendamento
  15. Logs de auditoria não populados → Sem rastreabilidade
```

### 1.3 Métricas de Completude

```yaml
Módulos por Funcionalidade:

Funcionários:
  - READ: 🔴 0% (coluna setor)
  - CREATE: ❓ 50% (endpoint OK, frontend não integrado)
  - UPDATE: ❓ 50% (endpoint OK, frontend não integrado)
  - DELETE: ❓ 50% (endpoint OK, frontend não integrado)
  ⚫ GERAL: 25%

Qualificações:
  - READ: ✅ 100%
  - CREATE: ⚠️ 70% (endpoint OK, FK quebrado)
  - UPDATE: ❓ 50% (endpoint OK, frontend não integrado)
  - DELETE: ❓ 50% (endpoint OK, frontend não integrado)
  ⚫ GERAL: 68%

Simuladores:
  - READ: ✅ 100%
  - CREATE: ❓ 60% (endpoint OK, sem validação)
  - UPDATE: ❓ 50% (endpoint OK, frontend não integrado)
  - DELETE: ❓ 50% (endpoint OK, frontend não integrado)
  ⚫ GERAL: 65%

Pasta Virtual:
  - READ: 🔴 0%
  - CREATE: 🔴 0%
  - DELETE: 🔴 0%
  - DOWNLOAD: 🔴 0%
  ⚫ GERAL: 0%

Autenticação:
  - Login: 🔴 0% (não integrado)
  - Logout: 🔴 0%
  - Refresh: 🔴 0%
  - Proteção Rotas: 🔴 0%
  ⚫ GERAL: 0%

Dashboard:
  - KPIs: ⚠️ 70% (UI OK, dados mock)
  - Gráficos: ⚠️ 70% (UI OK, dados mock)
  ⚫ GERAL: 70%

COMPLETUDE GERAL DO PROJETO: 47%
```

---

## 2. PROBLEMAS CRÍTICOS

### 2.1 🔴 Problema 1: Coluna 'setor' Faltando

```yaml
Descrição:
  Schema define 'setor TEXT NOT NULL' em funcionarios
  Migration 0001 cria coluna
  MAS coluna não existe em produção

Causa Raiz:
  Migration 0001 pode ter sido aplicada SEM coluna setor
  OU coluna foi dropada manualmente
  OU versão antiga da migration foi aplicada

Evidências:
  - Erro: D1_ERROR: no such column: setor
  - Query: SELECT ... setor FROM funcionarios
  - Status: HTTP 500 em GET /api/funcionarios

Impacto:
  🔴 CRÍTICO - Módulo Funcionários completamente quebrado
  - Frontend: Erro ao carregar página /funcionarios
  - Backend: Todas queries com 'setor' falham
  - Dashboard: KPIs não carregam (dependem de funcionários)

Solução:
  Aplicar migration 0006_add_missing_columns.sql

Comandos:
  cd worker-airtrust
  wrangler d1 execute airtrust-db --env=production \
    --file=./migrations/0006_add_missing_columns.sql

Validação:
  # Verificar coluna existe
  wrangler d1 execute airtrust-db --env=production \
    --command="PRAGMA table_info(funcionarios);"

  # Testar query
  wrangler d1 execute airtrust-db --env=production \
    --command="SELECT id, matricula, nome, setor FROM funcionarios LIMIT 5;"

  # Testar endpoint
  curl https://airtrust.airtrust.workers.dev/api/funcionarios

Tempo Estimado: 5 minutos
Prioridade: 🔥 URGENTE
```

---

### 2.2 🔴 Problema 2: Tabela 'usuarios' Vazia

```yaml
Descrição:
  Tabela 'usuarios' criada (migration 0003)
  Mas sem registros (seed não aplicado)
  Login impossível (sem credenciais)

Causa Raiz:
  Migration 0004_seed_usuarios.sql não aplicada em produção

Evidências:
  - POST /api/auth/login retorna 401 (usuário não encontrado)
  - Query: SELECT * FROM usuarios WHERE email = '...'
  - Resultado: 0 rows

Impacto:
  🔴 CRÍTICO - Sistema inacessível
  - Login falha para qualquer credencial
  - Mesmo com frontend integrado, não consegue logar
  - Sem usuário admin, não consegue criar outros

Solução Opção 1 (Seed file):
  wrangler d1 execute airtrust-db --env=production \
    --file=./migrations/0004_seed_usuarios.sql

Solução Opção 2 (Manual):
  # Gerar senha hash primeiro
  node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('Admin@2025', 10));"

  # Resultado exemplo: $2a$10$abcd1234...

  # Inserir usuário
  wrangler d1 execute airtrust-db --env=production \
    --command="INSERT INTO usuarios (email, senha_hash, nome, role, ativo)
               VALUES ('admin@airtrust.com', '\$2a\$10$abcd1234...', 'Administrador', 'admin', 1);"

Validação:
  # Verificar usuário criado
  wrangler d1 execute airtrust-db --env=production \
    --command="SELECT id, email, nome, role FROM usuarios;"

  # Testar login
  curl -X POST https://airtrust.airtrust.workers.dev/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@airtrust.com","senha":"Admin@2025"}'

Credenciais Sugeridas:
  Email: admin@airtrust.com
  Senha: Admin@2025
  Role: admin

Tempo Estimado: 10 minutos
Prioridade: 🔥 URGENTE
```

---

### 2.3 🔴 Problema 3: Login Não Integrado

```yaml
Descrição:
  LoginSimple.tsx usa console.log() ao invés de chamar API
  Formulário não envia dados para backend

Causa Raiz:
  Código placeholder não foi substituído por integração real

Evidências:
  Arquivo: src/react-app/pages/LoginSimple.tsx
  Código:
    const handleSubmit = (e) => {
      e.preventDefault();
      console.log('Login attempt:', { email, password }); // ❌
    };

Impacto:
  🔴 CRÍTICO - Login não funciona
  - Usuário digita credenciais
  - Clica "Entrar"
  - Nada acontece (só console.log)

Solução:
  Arquivo: src/react-app/pages/LoginSimple.tsx

Código Novo:
  import { useNavigate } from 'react-router-dom';
  import { useState } from 'react';

  const LoginSimple: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const response = await fetch(
          'https://airtrust.airtrust.workers.dev/api/auth/login',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha: password })
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erro ao fazer login');
        }

        const { data } = await response.json();

        // Salvar tokens
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        // Redirecionar
        navigate('/');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    return (
      <form onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    );
  };

Validação:
  1. Abrir http://localhost:5173/login
  2. Digitar admin@airtrust.com / Admin@2025
  3. Clicar "Entrar"
  4. Verificar:
     - Sem console.log
     - Redirecionamento para /
     - localStorage com accessToken

Tempo Estimado: 20 minutos
Prioridade: 🔥 URGENTE
Dependência: Problema 2 (usuários)
```

---

### 2.4 🔴 Problema 4: Rotas Desprotegidas

```yaml
Descrição:
  App.tsx não usa ProtectedRoute
  Todas rotas acessíveis sem login

Causa Raiz:
  Autenticação não foi implementada no roteamento

Evidências:
  Arquivo: src/react-app/App.tsx
  Código:
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginSimple />} />
        <Route path="/" element={<DashboardNew />} />  ❌ Público
        <Route path="/funcionarios" element={<FuncionariosNew />} />  ❌ Público
      </Routes>
    </BrowserRouter>

Impacto:
  🔴 CRÍTICO - Segurança zero
  - Qualquer um acessa dados sem login
  - URL direto funciona sem autenticação

Solução Passo 1: Criar AuthContext

  Arquivo: src/react-app/contexts/AuthContext.tsx

  import React, { createContext, useContext, useState, useEffect } from 'react';
  import { useNavigate } from 'react-router-dom';

  interface AuthContextType {
    isAuthenticated: boolean;
    user: { email: string; nome: string; role: string } | null;
    login: (email: string, senha: string) => Promise<void>;
    logout: () => void;
  }

  const AuthContext = createContext<AuthContextType | undefined>(undefined);

  export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
      // Verificar token ao carregar
      const token = localStorage.getItem('accessToken');
      if (token) {
        // TODO: Validar token no backend
        setIsAuthenticated(true);
      }
    }, []);

    const login = async (email: string, senha: string) => {
      const response = await fetch(
        'https://airtrust.airtrust.workers.dev/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha })
        }
      );

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const { data } = await response.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      setUser(data.user);
      setIsAuthenticated(true);
    };

    const logout = () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setIsAuthenticated(false);
      navigate('/login');
    };

    return (
      <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
        {children}
      </AuthContext.Provider>
    );
  };

  export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
      throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
  };

Solução Passo 2: Criar ProtectedRoute

  Arquivo: src/react-app/components/ProtectedRoute.tsx

  import React from 'react';
  import { Navigate } from 'react-router-dom';
  import { useAuth } from '../contexts/AuthContext';

  interface ProtectedRouteProps {
    children: React.ReactNode;
  }

  export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated } = useAuth();

    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
  };

Solução Passo 3: Atualizar App.tsx

  Arquivo: src/react-app/App.tsx

  import { BrowserRouter, Routes, Route } from 'react-router-dom';
  import { AuthProvider } from './contexts/AuthContext';
  import { ProtectedRoute } from './components/ProtectedRoute';
  import LoginSimple from './pages/LoginSimple';
  import DashboardNew from './pages/DashboardNew';
  import FuncionariosNew from './pages/FuncionariosNew';
  import QualificacoesNew from './pages/QualificacoesNew';
  import SimuladoresNew from './pages/SimuladoresNew';

  const App: React.FC = () => {
    return (
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginSimple />} />

            <Route path="/" element={
              <ProtectedRoute>
                <DashboardNew />
              </ProtectedRoute>
            } />

            <Route path="/funcionarios" element={
              <ProtectedRoute>
                <FuncionariosNew />
              </ProtectedRoute>
            } />

            <Route path="/qualificacoes" element={
              <ProtectedRoute>
                <QualificacoesNew />
              </ProtectedRoute>
            } />

            <Route path="/simuladores" element={
              <ProtectedRoute>
                <SimuladoresNew />
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    );
  };

  export default App;

Validação:
  1. Abrir http://localhost:5173/
  2. Verificar redirecionamento para /login
  3. Fazer login
  4. Verificar acesso liberado
  5. Remover token: localStorage.removeItem('accessToken')
  6. Refresh → Verificar redirecionamento para /login

Tempo Estimado: 45 minutos
Prioridade: 🔥 URGENTE
Dependência: Problema 3 (login integrado)
```

---

### 2.5 🔴 Problema 5: useApi sem Authorization

```yaml
Descrição:
  Hook useApi não envia Authorization header
  Rotas protegidas no backend retornam 401

Causa Raiz:
  Código não implementa JWT em requests

Evidências:
  Arquivo: src/react-app/hooks/useApi.ts
  Código:
    headers: {
      'Content-Type': 'application/json',
      // ❌ Falta: 'Authorization': 'Bearer ...'
    }

Impacto:
  🔴 CRÍTICO quando auth for aplicada no backend
  - Middleware auth ativo → todas requests falham
  - Usuário logado mas não consegue acessar dados

Solução:
  Arquivo: src/react-app/hooks/useApi.ts

Código Atualizado:
  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = 'https://airtrust.airtrust.workers.dev/api';
      const url = `${baseUrl}${options.endpoint}`;

      // ✅ Construir headers com Authorization
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      const token = localStorage.getItem('accessToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      // ✅ Interceptar 401 e tentar refresh
      if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          // Retentar request com novo token
          return execute();
        } else {
          // Logout se refresh falhar
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();

      if (json.success && json.data) {
        setData(json.data);
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

Código Refresh Token:
  const refreshAccessToken = async (): Promise<boolean> => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return false;

      const response = await fetch(
        'https://airtrust.airtrust.workers.dev/api/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        }
      );

      if (!response.ok) return false;

      const { data } = await response.json();
      localStorage.setItem('accessToken', data.accessToken);
      return true;
    } catch {
      return false;
    }
  };

Validação:
  1. Fazer login
  2. useApi fetch qualquer endpoint
  3. Verificar network tab:
     - Header: Authorization: Bearer eyJhbGc...
  4. Expirar token manualmente (localStorage)
  5. Fazer request → Verificar auto-refresh

Tempo Estimado: 30 minutos
Prioridade: 🔥 URGENTE
Dependência: Problema 4 (AuthContext)
```

---

## 3. PLANO DE AÇÃO IMEDIATO

### 3.1 Checklist Crítico (4 horas)

```yaml
FASE 1: Correção Database (30 min)
  ☐ 1.1 Aplicar migration 0006 (coluna setor)
      Comando: wrangler d1 execute airtrust-db --env=production --file=./migrations/0006_add_missing_columns.sql
      Validação: SELECT setor FROM funcionarios LIMIT 1

  ☐ 1.2 Popular tabela usuarios
      Comando: wrangler d1 execute airtrust-db --env=production --file=./migrations/0004_seed_usuarios.sql
      OU: INSERT manual com bcrypt
      Validação: SELECT * FROM usuarios

  ☐ 1.3 Testar GET /api/funcionarios
      Comando: curl https://airtrust.airtrust.workers.dev/api/funcionarios
      Expectativa: HTTP 200 com lista de funcionários

FASE 2: Autenticação Frontend (1h 30min)
  ☐ 2.1 Criar AuthContext
      Arquivo: src/react-app/contexts/AuthContext.tsx
      Funcionalidades: login, logout, isAuthenticated

  ☐ 2.2 Criar ProtectedRoute
      Arquivo: src/react-app/components/ProtectedRoute.tsx
      Lógica: Redirecionar para /login se não autenticado

  ☐ 2.3 Atualizar App.tsx
      Envolver rotas com <ProtectedRoute>
      Adicionar <AuthProvider>

  ☐ 2.4 Integrar LoginSimple
      Substituir console.log por fetch POST /api/auth/login
      Salvar tokens em localStorage
      Redirecionar para / após login

  ☐ 2.5 Testar fluxo completo
      Login → Dashboard → Logout → Redireciona para /login

FASE 3: useApi com Authorization (45 min)
  ☐ 3.1 Adicionar Authorization header
      Arquivo: src/react-app/hooks/useApi.ts
      Header: 'Authorization': `Bearer ${token}`

  ☐ 3.2 Implementar refresh token automático
      Interceptar 401
      Chamar POST /api/auth/refresh
      Retentar request original

  ☐ 3.3 Testar com auth ativo
      Aplicar middleware auth no backend
      Verificar requests com JWT

FASE 4: Validação Final (1h 15min)
  ☐ 4.1 Testar funcionários
      GET: Lista carrega
      Filtro por setor: Funciona

  ☐ 4.2 Testar qualificações
      GET: 1036 registros
      Status: Cores corretas

  ☐ 4.3 Testar simuladores
      GET: Lista com sessões
      JOIN funcionando

  ☐ 4.4 Testar dashboard
      KPIs: Dados reais (não mock)
      Gráficos: Renderizando

  ☐ 4.5 Smoke test completo
      Login → Navegar entre páginas → Logout
      Tentar acessar rota protegida sem login
      Refresh page → Mantém sessão

TOTAL: 4 horas
```

---

### 3.2 Scripts de Automação

#### Script 1: Corrigir Database

```bash
#!/bin/bash
# Arquivo: scripts/fix-database.sh

set -e

echo "🔧 Corrigindo Database..."

# 1. Aplicar migration coluna setor
echo "📝 Aplicando migration 0006..."
cd worker-airtrust
wrangler d1 execute airtrust-db --env=production \
  --file=./migrations/0006_add_missing_columns.sql

# 2. Popular usuarios
echo "👤 Criando usuário admin..."
wrangler d1 execute airtrust-db --env=production \
  --file=./migrations/0004_seed_usuarios.sql

# 3. Validar
echo "✅ Validando..."
wrangler d1 execute airtrust-db --env=production \
  --command="SELECT id, matricula, nome, setor FROM funcionarios LIMIT 3;"

wrangler d1 execute airtrust-db --env=production \
  --command="SELECT id, email, nome, role FROM usuarios;"

echo "🎉 Database corrigido!"
```

#### Script 2: Build e Deploy

```bash
#!/bin/bash
# Arquivo: scripts/deploy-all.sh

set -e

echo "🚀 Build e Deploy Completo..."

# 1. Backend
echo "📦 Building worker..."
cd worker-airtrust
npm run build
wrangler deploy --env=production

# 2. Frontend
echo "⚛️  Building React app..."
cd ../src/react-app
npm run build
wrangler pages deploy dist --project-name=airtrust

echo "🎉 Deploy completo!"
```

---

## 4. ROADMAP DE CORREÇÕES

### 4.1 Sprint 1: Fundação (1 semana)

```yaml
Objetivo: Sistema funcional básico

Dia 1-2: Database
  ✅ Migration 0006 (setor)
  ✅ Seed usuarios
  ✅ Validar schema

Dia 3-4: Autenticação
  ✅ AuthContext
  ✅ ProtectedRoute
  ✅ LoginSimple integrado
  ✅ useApi com JWT

Dia 5: Testes
  ✅ Login flow
  ✅ Funcionários READ
  ✅ Qualificações READ
  ✅ Simuladores READ

Entregáveis:
  - Sistema acessível via login
  - Listagens funcionando
  - Rotas protegidas

Status Esperado: 60% → 75%
```

### 4.2 Sprint 2: Operações de Escrita (1 semana)

```yaml
Objetivo: CRUD completo

Dia 1: Funcionários
  ✅ Integrar form CREATE
  ✅ Integrar form UPDATE
  ✅ Testar DELETE (soft)
  ✅ Validações Zod

Dia 2: Qualificações
  ✅ Integrar form CREATE histórico
  ✅ Integrar form UPDATE
  ✅ Testar DELETE
  ✅ Upload certificado (preparação)

Dia 3: Simuladores
  ✅ Integrar form CREATE sessão
  ✅ Validar conflitos (horário)
  ✅ Validar instrutor/checador
  ✅ Adicionar participantes

Dia 4-5: Testes E2E
  ✅ Criar funcionário → Adicionar qualificação
  ✅ Agendar sessão → Adicionar participantes
  ✅ Editar → Validar auditoria

Entregáveis:
  - CRUD completo funcionando
  - Validações no frontend + backend
  - Auditoria populando

Status Esperado: 75% → 85%
```

### 4.3 Sprint 3: Pasta Virtual (1 semana)

```yaml
Objetivo: Upload e download de arquivos

Dia 1-2: Backend R2
  ✅ Criar rota /api/pasta-virtual
  ✅ POST /upload (multipart/form-data)
  ✅ GET /:funcionarioId (listar)
  ✅ GET /download/:id (signed URL)
  ✅ DELETE /:id (remover arquivo)

Dia 3: Database
  ✅ Migration 0007 (tabela pasta_virtual)
  ✅ FK funcionario_id
  ✅ Índices

Dia 4-5: Frontend
  ✅ Integrar UploadDocumentosPastaVirtual
  ✅ Listagem de documentos
  ✅ Preview PDF
  ✅ Download

Entregáveis:
  - Upload funcional
  - Listagem de documentos por funcionário
  - Preview e download

Status Esperado: 85% → 92%
```

### 4.4 Sprint 4: Performance e Refatoração (1 semana)

```yaml
Objetivo: Otimizar e limpar código

Dia 1-2: Database
  ✅ Adicionar índices compostos
  ✅ Analisar queries lentas
  ✅ Normalizar qualificacoes_historico (opcional)

Dia 3: Backend
  ✅ Implementar cache (Cloudflare KV?)
  ✅ Otimizar queries N+1
  ✅ Adicionar rate limiting

Dia 4-5: Frontend
  ✅ Lazy loading componentes
  ✅ Code splitting rotas
  ✅ Otimizar DataTable (virtualização)
  ✅ Remover páginas legacy

Entregáveis:
  - Performance melhorada
  - Código limpo
  - Sem legacy code

Status Esperado: 92% → 98%
```

### 4.5 Sprint 5: Finalização (1 semana)

```yaml
Objetivo: Produção ready

Dia 1-2: Segurança
  ✅ Rate limiting rotas
  ✅ Sanitização inputs
  ✅ CSRF protection
  ✅ Auditoria completa

Dia 3: Dashboard
  ✅ KPIs reais (não mock)
  ✅ Gráficos com dados D1
  ✅ Filtros funcionando

Dia 4: Documentação
  ✅ README completo
  ✅ API docs (Swagger?)
  ✅ Guia de deploy
  ✅ Troubleshooting

Dia 5: Testes Finais
  ✅ Smoke test completo
  ✅ Load test (Artillery?)
  ✅ Security scan
  ✅ Validar backups D1

Entregáveis:
  - Sistema em produção
  - Documentação completa
  - Monitoramento ativo

Status Esperado: 98% → 100%
```

---

## 5. REFATORAÇÕES ARQUITETURAIS

### 5.1 Normalizar qualificacoes_historico

```yaml
Problema Atual:
  - funcionario_id TEXT (matrícula)
  - qualificacao_id NULL
  - Relação via nome textual

Refatoração:
  - Criar migration 0008_normalize_qualificacoes.sql
  - Mapear matriculas → funcionarios.id
  - Mapear nomes → qualificacoes_tipos.id
  - Atualizar FK reais

Steps:
  1. Backup D1: wrangler d1 backup create airtrust-db --env=production

  2. Criar tabela temporária: CREATE TABLE qualificacoes_historico_new (
    id INTEGER PRIMARY KEY,
    funcionario_id INTEGER NOT NULL,
    qualificacao_id INTEGER NOT NULL,
    data_conclusao TEXT NOT NULL,
    data_vencimento TEXT NOT NULL,
    status TEXT,
    certificado_url TEXT,
    observacoes TEXT,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
    FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
    );

  3. Migrar dados: INSERT INTO qualificacoes_historico_new
    SELECT
    qh.id,
    f.id as funcionario_id,
    qt.id as qualificacao_id,
    COALESCE(qh.data_obtencao, qh.data_conclusao) as data_conclusao,
    COALESCE(qh.data_validade, qh.data_vencimento) as data_vencimento,
    qh.status,
    qh.certificado_url,
    qh.observacoes,
    qh.created_at,
    qh.updated_at,
    qh.deleted_at
    FROM qualificacoes_historico qh
    LEFT JOIN funcionarios f ON qh.funcionario_id = f.matricula
    LEFT JOIN qualificacoes_tipos qt ON qh.nome = qt.nome
    WHERE f.id IS NOT NULL AND qt.id IS NOT NULL;

  4. Drop old table: DROP TABLE qualificacoes_historico;

  5. Rename new table: ALTER TABLE qualificacoes_historico_new RENAME TO qualificacoes_historico;

  6. Recreate índices: CREATE INDEX idx_qualificacoes_historico_func
    ON qualificacoes_historico(funcionario_id);
    CREATE INDEX idx_qualificacoes_historico_qual
    ON qualificacoes_historico(qualificacao_id);

Benefícios:
  - FK reais funcionando
  - Performance muito melhor (JOIN em INTEGER, não TEXT)
  - Integridade referencial
  - Cascading deletes funcionam
  - Queries simplificadas (sem subquery)

Riscos:
  - Dados órfãos (funcionario_id sem match)
  - Downtime durante migração
  - Queries antigas quebram

Mitigação:
  - Fazer em horário de baixo uso
  - Testar em staging primeiro
  - Atualizar queries backend simultaneamente
  - Rollback plan (restore backup)

Tempo Estimado: 3 horas
Prioridade: 🟡 IMPORTANTE (não urgente)
```

---

### 5.2 Middleware Auth Ativo

```yaml
Problema Atual:
  Middleware auth implementado mas não aplicado

Refatoração:
  worker-airtrust/src/index.ts

Código Atual:
  import { auth } from './middlewares/auth';
  // ❌ Nunca usado

Código Novo:
  import { auth } from './middlewares/auth';
  import { rbac } from './middlewares/rbac';

  // Aplicar auth globalmente (exceto rotas públicas)
  app.use('/api/*', async (c, next) => {
    const publicRoutes = ['/api/health', '/api/auth/login', '/api/auth/refresh'];

    if (publicRoutes.includes(c.req.path)) {
      return next();
    }

    // Aplicar auth
    return auth(c, next);
  });

  // RBAC específico por rota
  app.use('/api/funcionarios/*', rbac(['admin', 'manager']));
  app.use('/api/qualificacoes/*', rbac(['admin', 'manager', 'user']));
  app.use('/api/simuladores/*', rbac(['admin', 'manager']));

Benefícios:
  - Segurança real
  - Controle de acesso por role
  - Auditoria automática

Riscos:
  - Frontend precisa estar pronto (useApi com JWT)
  - Todas requests falham sem token

Validação:
  # Sem token
  curl https://airtrust.airtrust.workers.dev/api/funcionarios
  # Expectativa: 401 Unauthorized

  # Com token
  curl -H "Authorization: Bearer eyJhbGc..." \
    https://airtrust.airtrust.workers.dev/api/funcionarios
  # Expectativa: 200 OK

Tempo Estimado: 30 minutos
Prioridade: 🟡 IMPORTANTE
Dependência: Frontend com JWT (Sprint 1)
```

---

## 6. MELHORIAS DE PERFORMANCE

### 6.1 Índices Compostos

```sql
-- Migration 0009: Performance indexes

-- Funcionários: Queries comuns
CREATE INDEX idx_funcionarios_setor_status
  ON funcionarios(setor, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_funcionarios_cargo_setor
  ON funcionarios(cargo, setor)
  WHERE deleted_at IS NULL;

-- Qualificações: Status + vencimento
CREATE INDEX idx_qualificacoes_status_venc
  ON qualificacoes_historico(status, data_vencimento)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_func_status
  ON qualificacoes_historico(funcionario_id, status)
  WHERE deleted_at IS NULL;

-- Sessões: Simulador + data
CREATE INDEX idx_sessoes_sim_data
  ON sessoes_simulador(simulador_id, data_sessao)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sessoes_status_data
  ON sessoes_simulador(status, data_sessao)
  WHERE deleted_at IS NULL;

-- Histórico: nome (para subquery legado)
CREATE INDEX idx_qualificacoes_historico_nome
  ON qualificacoes_historico(nome)
  WHERE deleted_at IS NULL;

-- Audit logs: Busca por resource
CREATE INDEX idx_audit_resource_timestamp
  ON audit_logs(resource, resource_id, timestamp);
```

**Impacto Esperado**:

- Queries 2-5x mais rápidas
- Dashboard carrega mais rápido
- Filtros instantâneos

---

### 6.2 Query Optimization

```yaml
Antes (N+1 query): // Buscar sessões
  const sessoes = await db.query('SELECT * FROM sessoes_simulador');

  // Para cada sessão, buscar participantes (N queries)
  for (const sessao of sessoes) {
  sessao.participantes = await db.query(
  'SELECT * FROM participantes_sessao WHERE sessao_id = ?',
  [sessao.id]
  );
  }

Depois (1 query + GROUP BY): SELECT
  s.id,
  s.data_sessao,
  s.tipo_sessao,
  GROUP_CONCAT(f.nome) as participantes_nomes
  FROM sessoes_simulador s
  LEFT JOIN participantes_sessao p ON s.id = p.sessao_id
  LEFT JOIN funcionarios f ON p.funcionario_id = f.id
  GROUP BY s.id
  ORDER BY s.data_sessao DESC;

Performance:
  Antes: 50 queries (1 + 49 participantes)
  Depois: 1 query
  Ganho: 50x mais rápido
```

---

### 6.3 Frontend: Code Splitting

```typescript
// src/react-app/App.tsx

// ❌ Antes: Imports síncronos
import DashboardNew from './pages/DashboardNew';
import FuncionariosNew from './pages/FuncionariosNew';
import QualificacoesNew from './pages/QualificacoesNew';
import SimuladoresNew from './pages/SimuladoresNew';

// ✅ Depois: Lazy loading
const DashboardNew = lazy(() => import('./pages/DashboardNew'));
const FuncionariosNew = lazy(() => import('./pages/FuncionariosNew'));
const QualificacoesNew = lazy(() => import('./pages/QualificacoesNew'));
const SimuladoresNew = lazy(() => import('./pages/SimuladoresNew'));

// Wrapper com Suspense
<Routes>
  <Route
    path="/"
    element={
      <Suspense fallback={<div>Carregando...</div>}>
        <ProtectedRoute>
          <DashboardNew />
        </ProtectedRoute>
      </Suspense>
    }
  />
</Routes>;

// Benefícios:
// - Bundle inicial: 500KB → 150KB
// - Carrega páginas sob demanda
// - Navegação mais rápida
```

---

## 7. SEGURANÇA E AUDITORIA

### 7.1 Rate Limiting

```typescript
// worker-airtrust/src/middlewares/rate-limit.ts

import { Context, Next } from 'hono';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = (maxRequests: number, windowMs: number) => {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `${ip}:${c.req.path}`;

    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (record && record.resetAt > now) {
      if (record.count >= maxRequests) {
        return c.json(
          {
            success: false,
            error: 'Too many requests',
          },
          429,
        );
      }
      record.count++;
    } else {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
    }

    return next();
  };
};

// Uso:
app.post('/api/auth/login', rateLimit(5, 60000), async (c) => {
  // Máximo 5 tentativas por minuto
});
```

---

### 7.2 Auditoria Automática

```typescript
// worker-airtrust/src/middlewares/audit.ts

export const audit = async (c: Context, next: Next) => {
  const start = Date.now();

  // Capturar request
  const method = c.req.method;
  const path = c.req.path;
  const userId = c.get('userId'); // Do middleware auth
  const ip = c.req.header('CF-Connecting-IP');
  const userAgent = c.req.header('User-Agent');

  let body: any = null;
  if (['POST', 'PUT'].includes(method)) {
    body = await c.req.json();
  }

  // Executar request
  await next();

  // Logar após response
  const duration = Date.now() - start;
  const status = c.res.status;

  // Inserir em audit_logs
  if (userId && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const resource = path.split('/')[2]; // /api/funcionarios → funcionarios
    const resourceId = path.split('/')[3]; // /api/funcionarios/123 → 123

    await c.env.DB.prepare(
      `
      INSERT INTO audit_logs (
        user_id, action, resource, resource_id, 
        details, ip_address, user_agent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
      .bind(
        userId,
        method,
        resource,
        resourceId || null,
        JSON.stringify({ body, status, duration }),
        ip,
        userAgent,
      )
      .run();
  }
};

// Aplicar globalmente
app.use('/api/*', auth, audit);
```

---

## 8. DOCUMENTAÇÃO TÉCNICA

### 8.1 README Principal

````markdown
# AirTrust - Sistema de Gestão de Qualificações Aeronáuticas

## 🚀 Quick Start

### Pré-requisitos

- Node.js 20+
- Wrangler CLI
- Cloudflare account

### Setup Local

```bash
# 1. Clone
git clone <repo>
cd airtrust-v1

# 2. Install dependencies
npm install
cd worker-airtrust && npm install
cd ../src/react-app && npm install

# 3. Setup D1 local
cd ../../worker-airtrust
wrangler d1 execute airtrust-db --local --file=./migrations/0001_initial_schema.sql
wrangler d1 execute airtrust-db --local --file=./migrations/0003_create_usuarios.sql
wrangler d1 execute airtrust-db --local --file=./migrations/0004_seed_usuarios.sql

# 4. Run dev
npm run dev  # Worker on :8787
cd ../src/react-app && npm run dev  # React on :5173

# 5. Login
http://localhost:5173/login
Email: admin@airtrust.com
Senha: Admin@2025
```
````

## 🏗️ Arquitetura

- **Backend**: Cloudflare Workers (Hono)
- **Frontend**: React 19 + Vite
- **Database**: D1 (SQLite)
- **Storage**: R2 (Object Storage)
- **Auth**: JWT (bcrypt + refresh tokens)

## 📚 Documentação

- [Backend API](./FASE22-PARTE1-BACKEND-WORKER.md)
- [Frontend](./FASE22-PARTE2-FRONTEND.md)
- [Database Schema](./FASE22-PARTE3-DATABASE-D1.md)
- [Fluxos](./FASE22-PARTE4-FLUXOS-E-INTEGRACAO.md)
- [Recomendações](./FASE22-PARTE5-RECOMENDACOES.md)

## 🔧 Deploy

```bash
# Production
./scripts/deploy-all.sh

# Or manual:
cd worker-airtrust && wrangler deploy --env=production
cd ../src/react-app && wrangler pages deploy dist
```

## 📊 Status do Projeto

- Backend: 75% ✅
- Frontend: 70% ⚠️
- Database: 90% ✅
- Auth: 0% 🔴
- R2 Storage: 0% 🔴

Ver [FASE22-PARTE5-RECOMENDACOES.md](./FASE22-PARTE5-RECOMENDACOES.md) para detalhes.

## 🐛 Troubleshooting

### Erro: "no such column: setor"

```bash
wrangler d1 execute airtrust-db --env=production \
  --file=./migrations/0006_add_missing_columns.sql
```

### Login não funciona

```bash
# Verificar usuarios
wrangler d1 execute airtrust-db --env=production \
  --command="SELECT * FROM usuarios;"

# Criar se necessário
wrangler d1 execute airtrust-db --env=production \
  --file=./migrations/0004_seed_usuarios.sql
```

## 📝 License

MIT

````

---

### 8.2 API Documentation

```yaml
Sugestão: Usar Swagger/OpenAPI

Arquivo: worker-airtrust/openapi.yaml

openapi: 3.0.0
info:
  title: AirTrust API
  version: 1.0.0
  description: Sistema de gestão de qualificações aeronáuticas

servers:
  - url: https://airtrust.airtrust.workers.dev/api
    description: Produção
  - url: http://localhost:8787/api
    description: Development

paths:
  /auth/login:
    post:
      summary: Login
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                senha:
                  type: string
                  format: password
      responses:
        200:
          description: Login successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    properties:
                      accessToken:
                        type: string
                      refreshToken:
                        type: string
        401:
          description: Credenciais inválidas

  /funcionarios:
    get:
      summary: Listar funcionários
      tags: [Funcionários]
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: setor
          in: query
          schema:
            type: string
      responses:
        200:
          description: Lista de funcionários
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Funcionario'
                  pagination:
                    $ref: '#/components/schemas/Pagination'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    Funcionario:
      type: object
      properties:
        id:
          type: integer
        matricula:
          type: string
        nome:
          type: string
        cpf:
          type: string
        email:
          type: string
        cargo:
          type: string
        setor:
          type: string
        ativo:
          type: integer

    Pagination:
      type: object
      properties:
        page:
          type: integer
        limit:
          type: integer
        total:
          type: integer
        totalPages:
          type: integer
````

**Visualizar**: Usar [Swagger UI](https://swagger.io/tools/swagger-ui/) ou [Redoc](https://redocly.com/)

---

## 9. CONCLUSÃO

### 9.1 Resumo Executivo

```yaml
Estado Atual:
  - Projeto: 47% completo
  - Backend: 75% funcional
  - Frontend: 70% funcional
  - Database: 90% OK
  - Auth: 0% integrado
  - R2: 0% usado

Problemas Críticos: 1. 🔴 Coluna 'setor' faltando
  2. 🔴 Tabela 'usuarios' vazia
  3. 🔴 Login não integrado
  4. 🔴 Rotas desprotegidas
  5. 🔴 useApi sem JWT

Tempo para Funcional:
  - Correções críticas: 4 horas
  - CRUD completo: +1 semana
  - Pasta Virtual: +1 semana
  - Performance: +1 semana
  - Produção ready: +1 semana

Total: ~1 mês de trabalho focado
```

### 9.2 Prioridades Imediatas

```yaml
HOJE: 1. ✅ Aplicar migration 0006
  2. ✅ Popular usuarios
  3. ✅ Integrar login

ESTA SEMANA: 4. ✅ AuthContext + ProtectedRoute
  5. ✅ useApi com JWT
  6. ✅ Testar funcionários/qualificações/simuladores

PRÓXIMA SEMANA: 7. ✅ CRUD completo (POST/PUT/DELETE)
  8. ✅ Pasta Virtual (R2)
  9. ✅ Dashboard com dados reais
```

### 9.3 Contato e Suporte

```yaml
Documentação:
  - README.md (overview)
  - FASE22-PARTE*.md (auditoria completa)
  - openapi.yaml (API docs)

Scripts:
  - scripts/fix-database.sh
  - scripts/deploy-all.sh
  - scripts/backup-database.sh

Monitoramento:
  - Cloudflare Dashboard: Workers Analytics
  - D1 Metrics: Query performance
  - Pages Analytics: Frontend traffic

Logs:
  - wrangler tail (real-time)
  - Cloudflare Logs (histórico)
  - audit_logs table (aplicação)
```

---

**FIM DO RELATÓRIO FASE 22**

**Gerado em**: 15/11/2025  
**Autor**: GitHub Copilot - Auditor de Arquitetura  
**Projeto**: AirTrust v1  
**Status**: Auditoria Completa - Pronto para Ação 🚀
