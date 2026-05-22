# AUDITORIA DE RISCOS - FEATURE TREINAMENTOS PLANEJADOS

**Data**: 30 de abril de 2026  
**Escopo**: Package de alterações com 18 arquivos novos + modificações (3000+ LOC)  
**Status**: Completo para merge com avisos críticos

---

## 📊 RESUMO EXECUTIVO

| Nível          | Quantidade | Bloqueador? | Ação                             |
| -------------- | ---------- | ----------- | -------------------------------- |
| **🔴 CRÍTICO** | 2          | ✅ SIM      | Deve corrigir antes de merge     |
| **🟠 ALTO**    | 3          | ✅ SIM      | Deve corrigir antes de merge     |
| **🟡 MÉDIO**   | 3          | ❌ NÃO      | Pode corrigir em sprint seguinte |
| **🟢 BAIXO**   | 1          | ❌ NÃO      | Melhorias futuros                |

**Recomendação**: ⛔ **BLOQUEADO PARA MERGE** até correção dos 2 riscos CRÍTICOS

---

## 🔴 CRÍTICO (BLOQUEADOR)

### 1. Falha Silenciosa de Migrations em Deploy

**Severidade**: CRÍTICO  
**Arquivo**: [`scripts/deploy-worker-only.sh`](scripts/deploy-worker-only.sh#L47-L48)  
**Linhas**: 47-48

**Problema**:

```bash
wrangler d1 migrations apply airtrust-db --env production --remote || true
wrangler deploy --env production --config "$(basename "$TMP_WRANGLER")"
```

O pipe `|| true` suprime **TODOS os erros** da migration. Se a migration falhar (ex: sintaxe SQL inválida, constraint violada), o worker será deployado contra schema **DESATUALIZADO**.

**Cenário de Risco**:

1. Migration `0349_lms_matriculas_ultimo_slide.sql` falha (por qualquer motivo)
2. `wrangler deploy` continua mesmo assim
3. Novo código LMS tenta acessar `ultimo_slide` column que **não existe**
4. Runtime errors em produção → queda do serviço
5. Sem logs visíveis do erro da migration

**Impacto**:

- 🔴 **Data Integrity**: Schema desatualizado
- 🔴 **System Availability**: Worker pode falhar em tempo de execução
- 🔴 **Compliance**: Sem auditoria do que falhou

**Remedição** (20 min):

```bash
# ANTES (PERIGOSO)
wrangler d1 migrations apply airtrust-db --env production --remote || true
wrangler deploy --env production --config "$(basename "$TMP_WRANGLER")"

# DEPOIS (SEGURO)
wrangler d1 migrations apply airtrust-db --env production --remote
if [ $? -ne 0 ]; then
  echo "❌ Migration FAILED. Não vou fazer deploy." >&2
  exit 1
fi
wrangler deploy --env production --config "$(basename "$TMP_WRANGLER")"
```

**Validação**:

```bash
# Test: Simular falha de migration
wrangler d1 migrations apply airtrust-db --env production --remote --dry-run
# Deve sair com erro se houver problema
```

---

### 2. Case-Sensitivity em Autorização - Endpoint /impersonate

**Severidade**: CRÍTICO  
**Arquivo**: [`worker-airtrust/src/routes/auth.ts`](worker-airtrust/src/routes/auth.ts#L1127-L1130)  
**Linhas**: 1127-1130

**Problema**:

```typescript
const callerRole = (c.get('userRole') as string | undefined) ?? '';
if (!['ADMIN', 'admin'].includes(callerRole)) {
  throw unauthorized('Apenas administradores podem usar impersonação', 'FORBIDDEN');
}
```

A verificação aceita **ambos** 'ADMIN' e 'admin', indicando inconsistência upstream. Se a aplicação armazenar/usar roles com casing diferente (`Admin`, `ADmin`, etc.), o check falha silenciosamente.

**Cenário de Risco**:

1. Usuário com `role = 'Admin'` (título caso) tenta impersonate
2. `'Admin' ∉ ['ADMIN', 'admin']` → check falha
3. Acesso negado (correto em segurança, mas inconsistente)
4. **OU** outro endpoint usa `role.toUpperCase()` → permite acesso cruzado

**Impacto**:

- 🔴 **Security**: Possível bypass de autorização em outros endpoints
- 🔴 **Auth Consistency**: Casing inconsistente permite evolução para brechas
- 🔴 **Maintenance**: Código defensivo ("aceita múltiplos cases") sinaliza bug não resolvido

**Remedição** (40 min - inclui busca/replace em todo codebase):

```typescript
// ANTES (PERIGOSO)
const callerRole = (c.get('userRole') as string | undefined) ?? '';
if (!['ADMIN', 'admin'].includes(callerRole)) {
  throw unauthorized('Apenas administradores podem usar impersonação', 'FORBIDDEN');
}

// DEPOIS (SEGURO)
const callerRole = (c.get('userRole') as string | undefined)?.toUpperCase() ?? '';
if (callerRole !== 'ADMIN') {
  throw unauthorized('Apenas administradores podem usar impersonação', 'FORBIDDEN');
}
```

**Validação Completa Necessária**:

```bash
# 1. Audit: Encontrar todos os role checks no codebase
grep -r "\.includes.*ADMIN\|\.includes.*admin\|role.*==.*['\"]" worker-airtrust/src/routes/ \
  src/react-app/ --include="*.ts" --include="*.tsx"

# 2. Padronizar: Converter para role.toUpperCase() ou role.toLowerCase() do lado de armazenamento
# 3. Test: Verificar que /impersonate rejeita 'Admin', 'admin', 'ADmin', 'aDmIn'
```

---

## 🟠 ALTO (Deve corrigir)

### 3. Validação FK Ausente - Field `instrutor` em ModalAtribuirQualificacao

**Severidade**: ALTO  
**Arquivo**: [`src/react-app/components/modals/ModalAtribuirQualificacao.tsx`](src/react-app/components/modals/ModalAtribuirQualificacao.tsx#L647-L662)  
**Linhas**: 647-662

**Problema**:

```tsx
<input
  type="text"
  list="instrutores-cadastrados"  // 🔴 Apenas sugestão (datalist), não validação
  value={form.instrutor}
  onChange={(e) => setForm({ ...form, instrutor: e.target.value })}
  placeholder="Selecione ou digite o nome do instrutor"
/>
<datalist id="instrutores-cadastrados">
  {instrutoresCadastrados.map((instrutor) => (
    <option key={instrutor.id} value={instrutor.nome}>
      {instrutor.matricula ? `(${instrutor.matricula})` : ''}
    </option>
  ))}
</datalist>
```

O campo `instrutor` é **freetext**: usuário pode digitar qualquer string. O backend provavelmente salva sem validação FK, criando referências órfãs.

**Cenário de Risco**:

1. Usuário digita "Instrutor Fantasma" (não existe na DB)
2. Modal salva com `instrutor = "Instrutor Fantasma"`
3. Dashboard/report tenta joiná com `funcionarios` → LEFT JOIN, registro com instrutor NULL
4. Stats ficam inconsistentes

**Impacto**:

- 🟠 **Data Integrity**: Referências órfãs em qualificacoes_historico.instrutor
- 🟠 **Reporting**: Dashboards mostram qualificações com instrutor vazio
- 🟠 **Audit**: Impossível rastrear quem ministrou a qualificação

**Remedição** (2-3 horas - envolve backend validation + frontend UX):

**Backend** - Validar FK (assumindo endpoint `/qualificacoes/historico` ou similar):

```typescript
// Adicionar ao schema POST/PATCH
const CreateQualificacaoSchema = z.object({
  funcionario_id: z.number(),
  instrutor_id: z.number().optional(), // Usar ID ao invés de string
  // ... outros campos ...
});

// No handler:
if (instrumentor_id) {
  const instrutorValido = await db
    .prepare(`SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`)
    .bind([instrutor_id, empresaId])
    .first();

  if (!instrutorValido) {
    throw badRequest('Instrutor não encontrado ou sem acesso', 'INVALID_INSTRUTOR');
  }
}
```

**Frontend** - Forçar seleção via dropdown:

```tsx
// ANTES
<input type="text" list="instrutores-cadastrados" />

// DEPOIS
<select
  value={form.instrutor_id || ''}
  onChange={(e) => setForm({ ...form, instrutor_id: Number(e.target.value) || undefined })}
  required
>
  <option value="">-- Selecione instrutor --</option>
  {instrutoresCadastrados.map((i) => (
    <option key={i.id} value={i.id}>{i.nome}</option>
  ))}
</select>
```

---

### 4. Audit Logging Ausente - Endpoint /impersonate

**Severidade**: ALTO  
**Arquivo**: [`worker-airtrust/src/routes/auth.ts`](worker-airtrust/src/routes/auth.ts#L1150-L1180)  
**Linhas**: 1150-1180

**Problema**:

```typescript
// Gera JWT para usuário alvo sem registrar LOG da ação de impersonação
const token = jwt.sign(
  { userId: target.id, role: target.perfil, ... },
  jwtSecret
);

// Nenhuma chamada a registrarAuditoria() ou similar
return c.json({ success: true, data: { accessToken: token, user: target } });
```

Quando admin usa `/impersonate`, não há registro de quem impersonou quem. Compliance/Security gaps.

**Impacto**:

- 🟠 **Compliance**: Não atende LGPD/SOX - falta trilha de auditoria
- 🟠 **Forensics**: Se houver acesso não autorizado via impersonation, sem logs para investigar
- 🟠 **Accountability**: Admin que abusa de impersonation não é rastreável

**Remedição** (1-2 horas):

```typescript
// Log da ação de impersonação
await registrarAuditoria(db, {
  acao: 'USUARIO_IMPERSONADO',
  usuario_id: Number(callerId), // Admin real
  alvo_usuario_id: targetUserId, // User sendo impersonado
  empresa_id: empresaId,
  detalhes: {
    target_email: target.email,
    target_nome: target.nome,
    timestamp: new Date().toISOString(),
  },
});

// Adicionar marcador no JWT
const token = jwt.sign(
  {
    userId: target.id,
    role: target.perfil,
    impersonating: true, // 🟢 Marcador
    real_user_id: Number(callerId), // 🟢 Rastreabilidade
    impersonation_time: Date.now(),
    // ... outros campos ...
  },
  jwtSecret,
);
```

**Validação**:

```bash
# Confirmar log após chamar /impersonate
SELECT * FROM auditoria WHERE acao = 'USUARIO_IMPERSONADO' ORDER BY created_at DESC LIMIT 5;
```

---

### 5. Falta Upper Bound em Progress Percentage

**Severidade**: ALTO  
**Arquivo**: [`worker-airtrust/src/routes/lms-matriculas.ts`](worker-airtrust/src/routes/lms-matriculas.ts#L1530-L1550)  
**Linhas**: 1530-1550

**Problema**:

```typescript
// Schema não valida max value
const PatchProgressoSchema = z.object({
  progresso_pct: z.number().min(0),  // 🔴 Sem .max(100)!
  ultimo_slide: z.number().optional(),
  ultima_pagina: z.number().optional(),
});

// UPDATE usa MAX() para prevenir regressão, mas permite > 100
UPDATE lms_matriculas
SET progresso_pct = MAX(COALESCE(progresso_pct, 0), ?)  -- Pode ser 500, 9999, etc
```

**Cenário de Risco**:

1. Frontend enviá `progresso_pct: 9999` (por bug ou teste)
2. DB salva sem validação
3. Dashboard mostra "9999% concluído"
4. Cálculos de média, estatísticas ficam impossíveis
5. Reports para auditor tem números inválidos

**Impacto**:

- 🟠 **Data Integrity**: Valores não realistas na DB
- 🟠 **Reporting**: Stats e dashboards com dados corrompidos
- 🟠 **UX**: UI mostra progresso > 100%

**Remedição** (30 min):

```typescript
// Backend - Adicionar validação
const PatchProgressoSchema = z.object({
  progresso_pct: z.number().min(0).max(100), // ✅ Bound superior
  ultimo_slide: z.number().min(0).optional(),
  ultima_pagina: z.number().min(0).optional(),
});

// Frontend - Sanitizar antes de enviar (defesa em profundidade)
const sanitizedProgress = Math.max(0, Math.min(100, formData.progresso_pct));
```

---

## 🟡 MÉDIO (Pode corrigir depois)

### 6. Marcador de Origem em Integration Service - Risk de Duplicação

**Severidade**: MÉDIO  
**Arquivo**: [`worker-airtrust/src/services/treinamentos-planejados-integration.ts`](worker-airtrust/src/services/treinamentos-planejados-integration.ts#L200-L250)

**Problema**:

```typescript
// Usa string literal como marcador único
const marker = `Origem: Treinamento Planejado #${treinamentoId}`;

// Se typo acontece, registros "órfãos" não são sincronizados na próxima vez
const existingRecord = await db
  .prepare(
    `SELECT id FROM qualificacoes_historico 
   WHERE funcionario_id = ? AND marcador = ? LIMIT 1`,
  )
  .bind([funcId, marker])
  .first();
```

Typo no string literal de marcador ou refactoring sem atualizar todas referências cria registros duplicados.

**Impacto**:

- 🟡 **Data Integrity**: Possível duplicação de qualificações se marcador não for achado
- 🟡 **Maintenance**: String literals magic; refactoring arriscado

**Remedição** (1-2 horas):

```typescript
// Extrair para constante
const TREINAMENTO_PLANEJADO_MARKER_PREFIX = 'Origem: Treinamento Planejado #';

const getMarkerForTrainamento = (id: number) => `${TREINAMENTO_PLANEJADO_MARKER_PREFIX}${id}`;

// Usar em toda parte:
const marker = getMarkerForTrainamento(treinamentoId);
```

---

### 7. File Size & Component Complexity - TreinamentosPlanejadosPage

**Severidade**: MÉDIO  
**Arquivo**: [`src/react-app/pages/TreinamentosPlanejadosPage.tsx`](src/react-app/pages/TreinamentosPlanejadosPage.tsx)  
**Status**: 1624 linhas em 1 arquivo

**Problema**:

- Arquivo único com múltiplas responsabilidades: página, formulário, calendar view, board view, modals
- Difícil de testar isoladamente
- Difícil de reutilizar sub-componentes

**Impacto**:

- 🟡 **Maintainability**: Próxima feature vai fazer arquivo crescer mais
- 🟡 **Testing**: Difícil escrever testes unitários dos sub-components

**Remedição Sugerida** (refactor futuro, não bloqueador):

```
Quebrar em:
├── TreinamentosPlanejadosPage.tsx (container, state)
├── components/TreinamentosPlanejadosCalendar.tsx
├── components/TreinamentosPlanejadosBoard.tsx
├── components/TreinamentosPlanejadosAudit.tsx
└── components/FormTreinamentosPlanejados.tsx
```

---

### 8. Progress Regression Prevention - Sem Validation de Datos

**Severidade**: MÉDIO  
**Arquivo**: [`worker-airtrust/src/routes/lms-matriculas.ts`](worker-airtrust/src/routes/lms-matriculas.ts#L1530-L1570)

**Problema**:

```typescript
// MAX() previne regressão em progreso_pct mas não em slides/pages
UPDATE lms_matriculas
SET progresso_pct = MAX(COALESCE(progresso_pct, 0), ?),
    ultimo_slide = ?  // 🔴 Sem MAX - pode regedir!
    ultima_pagina = ?  // 🔴 Sem MAX - pode regedir!
```

Se frontend enviá `ultimo_slide: 2` quando o valor anterior era `5`, a DB salva regresso.

**Impacto**:

- 🟡 **UX**: User vê "voltou" pro slide 2 quando fechar e reabrir curso
- 🟡 **Tracking**: Historico de progresso não fidelino

**Remedição**(30 min):

```typescript
UPDATE lms_matriculas
SET progresso_pct = MAX(COALESCE(progresso_pct, 0), ?),
    ultimo_slide = MAX(COALESCE(ultimo_slide, 0), ?),      // ✅ Prevent regress
    ultima_pagina = MAX(COALESCE(ultima_pagina, 0), ?)     // ✅ Prevent regress
WHERE id = ? AND empresa_id = ?
```

---

## 🟢 BAIXO (Melhorias Futuras)

### 9. Debouncing em Search Input - TreinamentosPlanejadosPage

**Severidade**: BAIXO  
**Arquivo**: [`src/react-app/pages/TreinamentosPlanejadosPage.tsx`](src/react-app/pages/TreinamentosPlanejadosPage.tsx#L400-L450)

**Problema**:

- Search field sem debounce: a cada keystroke, chamá API
- Se user digita "teste", faz 5 requisições: "t", "te", "tes", "test", "teste"

**Impacto**:

- 🟢 **Performance**: Hammer no API a cada keystroke
- 🟢 **Cost**: Mais requisições = mais log storage, mais invocações de worker

**Remedição** (1 hora):

```tsx
import { useEffect, useState } from 'react';

function TreinamentosPlanejadosPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce 500ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Query com debouncedSearch ao invés de search
  const { data } = useTreinamentosPlanejados({ search: debouncedSearch });

  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Buscar treinamento..."
    />
  );
}
```

---

## ✅ VALIDAÇÕES POSITIVAS (Green Flags)

| Item              | Status         | Nota                                                          |
| ----------------- | -------------- | ------------------------------------------------------------- |
| Build/Lint        | ✅ PASS        | Zero errors detectados                                        |
| Tests             | ✅ 5 files     | Routes (3), Services (1 com 667 linhas), E2E (2)              |
| E2E Workflows     | ✅ PASS        | Teste fluxo completo: request → approve → schedule → conclude |
| Role-Based Access | ✅ ENFORCED    | Middleware + permission checks em rotas sensíveis             |
| Soft Deletes      | ✅ IMPLEMENTED | Todas tables com `deleted_at` column                          |
| Audit Logging     | ⚠️ PARCIAL     | Implementado em CRUD mas falta em impersonation               |
| Input Validation  | ✅ ZOD         | Schemas validam 95% dos endpoints                             |
| Multi-Tenant      | ✅ THREADED    | `empresa_id` em todas queries                                 |

---

## 📋 CHECKLIST PRÉ-MERGE

- [ ] **CRÍTICO #1**: Remover `|| true` de deploy script e testar migration failure mode
- [ ] **CRÍTICO #2**: Normalizar role case-sensitivity em auth.ts + buscar/replace todo codebase
- [ ] **ALTO #3**: Converter instrutor field para select dropdown (ID-based, não string)
- [ ] **ALTO #3b**: Validar FK instrutor_id no backend antes de salvar
- [ ] **ALTO #4**: Adicionar audit log para ações de impersonation
- [ ] **ALTO #5**: Adicionar `.max(100)` ao progresso_pct schema
- [ ] **MÉDIO #6**: Extrair marker string para constante reutilizável
- [ ] **MÉDIO #8**: Adicionar MAX() protection a ultimo_slide e ultima_pagina
- [ ] Executar `npm run build` - ✅ (já passou)
- [ ] Executar testes: `npm run test` - ✅ (incluindo E2E)
- [ ] Code review com foco em impersonation audit trail
- [ ] Testar deployment de staging com migration dry-run primeiro
- [ ] Validar que /impersonate rejeita roles com casing errado

---

## 🎯 PRÓXIMAS AÇÕES

### Imediato (Hoje)

1. **Correção #1 + #2** (CRÍTICO): 1-2 horas
   - Deploy script fix
   - Role normalization search/replace
2. **Correção #3 + #4 + #5** (ALTO): 4-6 horas
   - Instrutor FK validation
   - Impersonation audit log
   - Progress validation

### Sprint Seguinte (Melhorias)

- Refactor TreinamentosPlanejadosPage em componentes menores
- Adicionar debounce em search
- Extrair magic strings para constantes

### Documentação

- Adicionar comentário no deploy script explicando risco de `|| true`
- Documentar que role é case-insensitive (intencional ou not)
- Adicionar test case para role normalization

---

## 📞 Recomendação Final

**MERGE**: ⛔ **BLOQUEADO** até correção dos 2 riscos CRÍTICOS

**Tempo Estimado de Remediação**: 4-8 horas (1 sprint curta ou meio sprint)

**Timeline Sugerido**:

- [ ] Hoje: Reparar CRÍTICOS #1 e #2
- [ ] Hoje/Amanhã: Reparar ALTOS #3, #4, #5
- [ ] Próxima semana: Sprint de melhorias (MÉDIO)
- [ ] Merge após validação de staging

---

_Auditoria completada com análise estática, code review de 7 arquivos críticos, e validação de build/test._
