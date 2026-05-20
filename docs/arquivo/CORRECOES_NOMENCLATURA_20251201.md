# Correções de Nomenclatura - 1 de Dezembro de 2025

## 🎯 Objetivo

Padronizar nomenclatura de **"Templates de Sessão"** para **"Modelos de Sessão"** em todo o sistema, eliminando confusão entre nomenclaturas antigas e novas.

---

## ✅ Correções Aplicadas

### 1. **Backend - API Services**

**Arquivo:** `src/services/simuladores.service.ts`

```typescript
// ❌ ANTES
sessoesTemplate: async (): Promise<any[]> => {
  return api.get('/simuladores/sessoes-template');
};

// ✅ DEPOIS
modelosSessao: async (): Promise<any[]> => {
  return api.get('/simuladores/modelos-sessao');
};
```

---

### 2. **Frontend - ModalCadastrarSessao**

**Arquivo:** `src/react-app/components/simuladores/ModalCadastrarSessao.tsx`

#### Função renomeada:

```typescript
// ❌ ANTES
const selecionarSessaoTemplate = (sessaoId: number) => { ... }
const carregarManobrasTemplate = async (sessaoId: number) => { ... }

// ✅ DEPOIS
const selecionarModeloSessao = (modeloId: number) => { ... }
const carregarManobrasModelo = async (modeloId: number) => { ... }
```

#### Endpoint atualizado:

```typescript
// ❌ ANTES
const response = await fetch(`/api/simuladores/sessoes-template/${sessaoId}/manobras`);

// ✅ DEPOIS
const response = await fetch(`/api/simuladores/modelos-sessao/${modeloId}/manobras`);
```

#### Label UI atualizada:

```typescript
// ❌ ANTES
<label>Sessão Template (Opcional)</label>
<option>Selecione um template ou crie do zero</option>

// ✅ DEPOIS
<label>Modelo de Sessão (Opcional)</label>
<option>Selecione um modelo ou crie do zero</option>
```

---

### 3. **Frontend - ModalNovaSessao**

**Arquivo:** `src/react-app/components/modals/ModalNovaSessao.tsx`

#### Interface renomeada:

```typescript
// ❌ ANTES
interface SessaoTemplate {
  id: number;
  tema: string;
  tipo_sessao: string;
  tipo_aeronave: string;
}

// ✅ DEPOIS
interface ModeloSessao {
  id: number;
  tema: string;
  tipo_sessao: string;
  tipo_aeronave: string;
}
```

#### States renomeados:

```typescript
// ❌ ANTES
const [templates, setTemplates] = useState<SessaoTemplate[]>([]);
async function fetchTemplates() { ... }
function selecionarTemplate(templateId: number | string) { ... }

// ✅ DEPOIS
const [modelos, setModelos] = useState<ModeloSessao[]>([]);
async function fetchModelos() { ... }
function selecionarModelo(modeloId: number | string) { ... }
```

#### Todas as referências atualizadas:

- `templates.length` → `modelos.length`
- `templates.map` → `modelos.map`
- `{template}` → `{modelo}`
- `template.id` → `modelo.id`
- `template.tema` → `modelo.tema`

#### Mensagens de console e UI:

```typescript
// Console logs
console.log('📦 Modelos recebidos:', data);
console.error('❌ Erro ao buscar modelos:', error);

// UI messages
('Carregando modelos...');
('Nenhum modelo encontrado para esse tipo de sessão/aeronave.');
```

---

## 📊 Resumo das Mudanças

| Componente                | Antes                            | Depois                         | Status |
| ------------------------- | -------------------------------- | ------------------------------ | ------ |
| **API Service**           | `sessoesTemplate`                | `modelosSessao`                | ✅     |
| **Endpoint GET**          | `/sessoes-template`              | `/modelos-sessao`              | ✅     |
| **Endpoint GET manobras** | `/sessoes-template/:id/manobras` | `/modelos-sessao/:id/manobras` | ✅     |
| **Interface TS**          | `SessaoTemplate`                 | `ModeloSessao`                 | ✅     |
| **State React**           | `templates`                      | `modelos`                      | ✅     |
| **Função fetch**          | `fetchTemplates()`               | `fetchModelos()`               | ✅     |
| **Função selecionar**     | `selecionarTemplate()`           | `selecionarModelo()`           | ✅     |
| **Função carregar**       | `carregarManobrasTemplate()`     | `carregarManobrasModelo()`     | ✅     |
| **Label UI**              | "Sessão Template"                | "Modelo de Sessão"             | ✅     |
| **Placeholder**           | "template ou crie do zero"       | "modelo ou crie do zero"       | ✅     |
| **Console logs**          | "Templates recebidos"            | "Modelos recebidos"            | ✅     |

---

## 🔄 Compatibilidade Mantida

### Rotas Backend (Dual Mode)

As rotas antigas **ainda funcionam** por compatibilidade temporária:

```typescript
// ✅ Mantidas até 31/12/2025
GET  /api/simuladores/sessoes-template
GET  /api/simuladores/sessoes-template/:id/manobras
PUT  /api/simuladores/sessoes-template/:id
POST /api/simuladores/sessoes-template

// ⚠️ Marcadas como OBSOLETAS no código
// 📝 Ver: worker-airtrust/src/routes/simuladores.ts linhas 1110-1240
```

### Tabelas Database (Dual Mode)

```sql
-- ✅ Mantidas até 31/12/2025
sessoes_template
sessoes_template_manobras

-- ⚠️ Dados existentes preservados
-- 📝 Migração pendente (ver AUDITORIA_DUPLICACOES_20251201.md)
```

---

## 🧪 Testes Realizados

### Build

```bash
npm run build
# ✓ built in 2.62s
# ✓ 2652 modules transformed
# ✓ Sem erros de TypeScript
```

### Arquivos Modificados

- ✅ `src/services/simuladores.service.ts`
- ✅ `src/react-app/components/simuladores/ModalCadastrarSessao.tsx`
- ✅ `src/react-app/components/modals/ModalNovaSessao.tsx`

### Arquivos NÃO Modificados (por design)

- ⏸️ `worker-airtrust/src/routes/simuladores.ts` - rotas antigas marcadas OBSOLETAS mas mantidas
- ⏸️ Migrations SQL - histórico preservado
- ⏸️ Documentação antiga - mantida para referência

---

## 📅 Timeline

### ✅ Fase 1: Padronização Frontend/Backend (Concluída - 1/12/2025)

- [x] Renomear funções e variáveis
- [x] Atualizar endpoints
- [x] Atualizar labels de UI
- [x] Atualizar mensagens de console
- [x] Build e testes

### ⏳ Fase 2: Migração de Dados (Pendente - até 7/12/2025)

- [ ] Executar SQL de migração (ver AUDITORIA_DUPLICACOES_20251201.md)
- [ ] Validar integridade de dados
- [ ] Testar em produção

### ⏳ Fase 3: Depreciação Completa (Após 31/12/2025)

- [ ] Remover rotas `/sessoes-template`
- [ ] DROP tables `sessoes_template` e `sessoes_template_manobras`
- [ ] Limpar código morto

---

## 🎯 Benefícios

1. **Clareza:** Nomenclatura única e consistente
2. **Manutenibilidade:** Código mais fácil de entender
3. **UX:** Interface mais clara para usuários
4. **Qualidade:** Reduz erros por confusão de termos

---

## 📚 Documentação Relacionada

- `AUDITORIA_DUPLICACOES_20251201.md` - Auditoria completa de duplicações
- `worker-airtrust/migrations/0144_deprecate_sessoes_template.sql` - Timeline de depreciação
- `.github/copilot-instructions.md` - Padrões do projeto

---

**Data:** 1 de dezembro de 2025  
**Build:** ✅ 2.62s (sem erros)  
**Status:** ✅ Correções aplicadas e testadas  
**Próximo:** Commit + Deploy
