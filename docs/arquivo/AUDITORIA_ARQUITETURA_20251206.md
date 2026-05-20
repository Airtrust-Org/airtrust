# 🔍 AUDITORIA DE ARQUITETURA AIRTRUST

**Data:** 6 de Dezembro de 2025  
**Versão Worker:** d295b771-fb00-4f15-9468-61490f54ddaf

---

## 📊 RESUMO EXECUTIVO

### ✅ Commit e Deploy Realizados

- **Commit:** `e77287a5` - Dashboard redesenhado + filtro de sessão em fichas
- **Deploy:** Worker atualizado em produção

---

## 🔴 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. EXCESSO DE ARQUIVOS DE DOCUMENTAÇÃO

| Métrica              | Valor                        |
| -------------------- | ---------------------------- |
| Arquivos .md na raiz | **930**                      |
| Tamanho estimado     | ~15-20 MB                    |
| Impacto              | Git lento, difícil navegação |

**Recomendação:** Mover documentação antiga para `docs/arquivo/` ou branch separado.

---

### 2. COMPONENTES DUPLICADOS (PRIORIDADE ALTA)

#### 2.1 Badge.tsx (5 versões!)

```
src/react-app/components/Badge.tsx ← USADO (5 importações)
src/react-app/components/UI/Badge.tsx ← 1 importação
src/react-app/components/shared/Badge.tsx ← NÃO USADO
src/components/ui/Badge.tsx ← NÃO USADO
src/components/shared/Badge.tsx ← NÃO USADO
```

**Ação:** Consolidar em `src/react-app/components/Badge.tsx`

#### 2.2 Button.tsx (5 versões!)

```
src/react-app/components/Button.tsx
src/react-app/components/UI/Button.tsx
src/react-app/components/shared/Button.tsx
src/components/ui/Button.tsx
src/components/shared/Button.tsx
```

**Ação:** Auditar uso e consolidar

#### 2.3 Card.tsx (4 versões!)

```
src/react-app/components/Card.tsx
src/react-app/components/UI/Card.tsx
src/react-app/components/shared/Card.tsx
src/components/shared/Card.tsx
```

#### 2.4 LoadingSpinner.tsx (3 versões!)

```
src/react-app/components/shared/LoadingSpinner.tsx
src/react-app/components/common/LoadingSpinner.tsx
src/components/shared/LoadingSpinner.tsx
```

#### 2.5 StatCard.tsx (2 versões!)

```
src/react-app/components/StatCard.tsx
src/react-app/components/UI/StatCard.tsx
```

#### 2.6 Table.tsx (2 versões!)

```
src/react-app/components/UI/Table.tsx
src/react-app/components/common/Table.tsx
```

---

### 3. PÁGINAS POSSIVELMENTE OBSOLETAS

| Arquivo                         | Status                      | Rota Ativa? |
| ------------------------------- | --------------------------- | ----------- |
| `Dashboard.tsx`                 | Não usado no router         | ❌          |
| `DashboardNew.tsx`              | Usado como "/"              | ✅          |
| `DashboardSimple.tsx`           | Não referenciado            | ❌          |
| `DashboardTreinamentos.tsx`     | Não referenciado            | ❌          |
| `DashboardTreinamentosReal.tsx` | Não referenciado            | ❌          |
| `LoginNew.tsx`                  | Não referenciado            | ❌          |
| `Login.tsx`                     | Substituído por LoginSimple | ❌          |
| `TesteApiPuro.tsx`              | Debug apenas                | ❓          |
| `AuditoriaDatas.tsx`            | Debug/Admin                 | ❓          |

---

### 4. ESTRUTURA DE DIRETÓRIOS CONFUSA

```
src/
├── components/           ← Nova estrutura
│   ├── layout/
│   ├── qualificacoes/
│   ├── shared/
│   └── ui/
├── react-app/
│   ├── components/       ← Estrutura antiga (340 arquivos!)
│   │   ├── UI/           ← Duplicada com ui/
│   │   ├── common/       ← Duplicada com shared/
│   │   ├── shared/       ← Duplicada
│   │   ├── layout/       ← Duplicada
│   │   └── ...
│   └── pages/
└── ...
```

**Problema:** Duas hierarquias de componentes coexistindo!

---

### 5. BACKUPS E LEGACY (7MB)

| Pasta               | Tamanho | Pode Remover?   |
| ------------------- | ------- | --------------- |
| `_backups/`         | 4.8 MB  | ✅ Sim (em git) |
| `_LEGACY_ARCHIVED/` | 2.2 MB  | ✅ Sim (em git) |

---

## 🟢 O QUE ESTÁ FUNCIONANDO BEM

1. **Worker Backend**: Estrutura limpa em `worker-airtrust/src/routes/`
2. **Rotas Frontend**: `App.tsx` com rotas bem organizadas
3. **Build**: Vite compilando em ~3.5s
4. **Deploy**: Pipeline funcionando corretamente
5. **Módulos Principais**: Funcionários, Qualificações, Simuladores estáveis

---

## 📋 PLANO DE AÇÃO RECOMENDADO

### FASE 1: Limpeza de Baixo Risco (Documentação)

```bash
# Criar pasta de arquivo
mkdir -p docs/arquivo/2025

# Mover documentação antiga (manter apenas essenciais na raiz)
# Manter: README.md, GUIA_ARQUITETURAL_DEFINITIVO_V3.md,
#         _DOCUMENTACAO_INDEX.md, START_HERE.md
```

### FASE 2: Consolidação de Componentes

1. **Auditar importações reais** com grep
2. **Identificar o componente "canônico"** de cada tipo
3. **Atualizar importações** gradualmente
4. **Remover duplicatas** após confirmação

### FASE 3: Limpeza de Páginas Obsoletas

1. Verificar se são referenciadas em algum lugar
2. Mover para `_deprecated/` primeiro
3. Remover após período de observação

### FASE 4: Consolidação de Estrutura

1. Decidir entre `src/components/` vs `src/react-app/components/`
2. Migrar gradualmente para estrutura única
3. Atualizar todos os imports

---

## ⚠️ CUIDADOS IMPORTANTES

1. **NÃO QUEBRAR O QUE FUNCIONA** - Sistema está estável
2. **FAZER BACKUP ANTES** de qualquer limpeza grande
3. **TESTAR APÓS CADA MUDANÇA** - npm run build
4. **MANTER GIT LIMPO** - Commits pequenos e descritivos

---

## 📈 MÉTRICAS ATUAIS

| Métrica                      | Valor     |
| ---------------------------- | --------- |
| Arquivos TSX total           | 1310      |
| Arquivos TSX em /src         | 340       |
| Arquivos .md na raiz         | 930       |
| Tamanho \_backups + \_LEGACY | ~7 MB     |
| Componentes duplicados       | ~15 tipos |

---

## 🎯 PRÓXIMOS PASSOS IMEDIATOS

1. ✅ Deploy concluído
2. ⏳ Mover docs antigos para `docs/arquivo/`
3. ⏳ Auditar uso real de componentes duplicados
4. ⏳ Criar branch para limpeza estrutural

---

_Relatório gerado automaticamente durante auditoria de arquitetura_
