# 🔓 Login Desativado - Dev Mode

**Data**: 15 de Novembro de 2025  
**Status**: ✅ Implementado

---

## Resumo

O sistema de autenticação foi **desativado temporariamente** para facilitar o desenvolvimento. Um usuário mock será automaticamente autenticado ao carregar a aplicação.

---

## Mudanças Realizadas

### 1. Hook `useAuth.ts`

**Adicionado**:

- Modo de desenvolvimento (`DEV_MODE = true`)
- Usuário mock que substitui login real
- Validação de ambiente

**Usuário Mock**:

```typescript
const DEV_MOCK_USER = {
  id: 'dev-user-1',
  name: 'Usuário de Desenvolvimento',
  email: 'dev@airtrust.local',
  perfil: 'admin',
};
```

**Comportamento**:

- Se `DEV_MODE = true`: Usa usuário mock automaticamente
- Se `DEV_MODE = false`: Carrega tokens do localStorage (produção)

---

### 2. Header (`Header.tsx`)

**Mudanças**:

- Botão "Sair" substituído por "Reload"
- Aviso visual "⚠️ Login desativado (dev mode)" adicionado ao menu
- Logout agora recarrega a página (`window.location.href = '/'`)

---

### 3. API Calls (`PastaVirtualGeral.tsx`)

**Removido**:

- Headers de autorização (`Authorization: Bearer ...`)
- Chamadas agora funcionam sem token

**Endpoints Afetados**:

- `GET /pasta-virtual`
- `POST /pasta-virtual/upload`
- `DELETE /pasta-virtual/:id`

---

## Como Usar

### Acessar App

```bash
# Dev
npm run dev
# Vai estar autenticado automaticamente com usuário mock
```

### Ativar Login Novamente

Para reativar autenticação em produção, basta alterar `src/react-app/hooks/useAuth.ts`:

```typescript
// Mudar de:
const DEV_MODE = true;

// Para:
const DEV_MODE = false;
```

---

## Status das Chamadas API

| Endpoint                     | Token       | Status      |
| ---------------------------- | ----------- | ----------- |
| GET /api/funcionarios        | ❌ Removido | ✅ Funciona |
| GET /api/qualificacoes       | ❌ Removido | ✅ Funciona |
| GET /api/simuladores         | ❌ Removido | ✅ Funciona |
| POST /api/funcionarios       | ❌ Removido | ✅ Funciona |
| DELETE /api/funcionarios/:id | ❌ Removido | ✅ Funciona |

---

## Build Status

✅ **Build completo sem erros**

```
✓ 2606 modules transformed
✓ Gzip size: 291.23 kB → 291.23 kB
✓ Built in 18.09s
```

---

## ⚠️ Importante para Produção

**NÃO FAZER DEPLOY COM LOGIN DESATIVADO!**

Antes de deploy em produção:

1. Mudar `DEV_MODE = false` em `useAuth.ts`
2. Restaurar headers de autenticação nas chamadas API
3. Re-testar fluxo de login
4. Validar RBAC (admin/manager/user)

---

## Arquivos Modificados

- ✅ `src/react-app/hooks/useAuth.ts`
- ✅ `src/react-app/components/layout/Header.tsx`
- ✅ `src/react-app/pages/PastaVirtualGeral.tsx`

---

**Próximo Passo**: Continuar desenvolvimento sem interrupções de login!
