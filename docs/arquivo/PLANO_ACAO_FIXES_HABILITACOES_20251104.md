# 🎯 PLANO DE AÇÃO - FIXES IMEDIATOS - HABILITAÇÕES

**Prioridade:** 🔴 **CRÍTICA**  
**Data:** 4 de Novembro de 2025  
**Tempo Estimado:** 3-4 horas  
**Status:** Pronto para Implementação

---

## ⚡ FIX #1: DELETAR DUPLICIDADE DE SERVICES (15 min)

### Problema

Dois services diferentes existem:

- `src/worker/services/habilitacoesService.ts` ✅ **USAR ESTE**
- `src/worker/services/habilitacoesServiceFixed.ts` ❌ **NÃO ESTÁ SENDO USADO - DELETAR**

### Ação

```bash
# 1. Verificar que Fixed não é importado
grep -rn "habilitacoesServiceFixed" src/worker/routes/
# (Deve retornar vazio)

# 2. Verificar que Fixed não é importado
grep -rn "HabilitacoesServiceFixed" src/
# (Deve retornar apenas testes)

# 3. DELETAR arquivo
rm src/worker/services/habilitacoesServiceFixed.ts

# 4. DELETAR testes do arquivo deletado
rm src/worker/services/__tests__/habilitacoesServiceFixed.test.ts

# 5. Compilar para verificar
npm run build
```

### Validação

```bash
npm run build  # Não deve ter erros
```

---

## ⚡ FIX #2: RENOMEAR PROP CONFUSA (30 min)

### Problema

`ModalUploadCertificado` recebe `qualificacaoId` mas na verdade é `habilitacao_id`

**Arquivo:** `src/react-app/components/modals/ModalUploadCertificado.tsx`

### Antes

```typescript
interface ModalUploadCertificadoProps {
  qualificacaoId?: number;  // ← CONFUSO
  funcionarioId?: number;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function ModalUploadCertificado({
  qualificacaoId,  // ← CONFUSO
  ...
}) {
  const habilitacaoId = qualificacaoId;  // ← HACK
  ...
  formDataWithParams.append('habilitacao_id', habilitacaoId?.toString() || '');
  formDataWithParams.append('qualificacao_id', qualificacaoId?.toString() || '');
}
```

### Depois

```typescript
interface ModalUploadCertificadoProps {
  habilitacaoId?: number;  // ✅ CLARO
  funcionarioId?: number;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function ModalUploadCertificado({
  habilitacaoId,  // ✅ CLARO
  ...
}) {
  // Sem necessidade de conversão
  ...
  formDataWithParams.append('habilitacao_id', habilitacaoId?.toString() || '');
}
```

### Atualizar Chamadas

**Arquivo:** `src/react-app/pages/Habilitacoes.tsx` linha 865

```typescript
// Antes
<ModalUploadCertificado
  isOpen={modalUploadCertificado}
  onClose={() => setModalUploadCertificado(false)}
  qualificacaoId={habilitacaoUpload?.id}  // ← ERRADO
  funcionarioId={habilitacaoUpload?.funcionario_id}
  onSave={() => {
    carregarHab(1, 50);
    success('Certificado salvo com sucesso!');
  }}
/>

// Depois
<ModalUploadCertificado
  isOpen={modalUploadCertificado}
  onClose={() => setModalUploadCertificado(false)}
  habilitacaoId={habilitacaoUpload?.id}  // ✅ CORRETO
  funcionarioId={habilitacaoUpload?.funcionario_id}
  onSave={() => {
    carregarHab(1, 50);
    success('Certificado salvo com sucesso!');
  }}
/>
```

### Validação

```bash
npm run build  # Não deve ter erros
# Buscar qualificacaoId que não foi renomeado:
grep -rn "qualificacaoId" src/react-app/components/modals/ModalUploadCertificado.tsx
# Deve retornar ZERO resultados
```

---

## ⚡ FIX #3: UNIFICAR TIPOS HABILITAÇÃO (45 min)

### Problema

Interfaces `Habilitacao` estão definidas em 3 arquivos diferentes:

1. `src/worker/types/index.ts` linha 83
2. `src/worker/types/qualificacoes.ts` linha 21
3. `src/react-app/hooks/useHabilitacoes.ts` linha 12

### Solução: Unificar em types/index.ts

**Arquivo:** `src/worker/types/index.ts`

### Passo 1: Ler tipos atuais

```bash
grep -A 15 "export interface Habilitacao" src/worker/types/index.ts
grep -A 15 "export interface Habilitacao" src/worker/types/qualificacoes.ts
```

### Passo 2: Criar tipo unificado

```typescript
// ✅ NOVO - em src/worker/types/index.ts
export interface Habilitacao {
  // IDs e FKs
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  empresa_id?: number;

  // Datas
  data_conclusao: string;
  data_vencimento: string;

  // Status
  resultado: 'APROVADO' | 'REPROVADO' | 'PENDENTE';
  status: 'ATIVA' | 'VENCIDA' | 'SUSPENSA';

  // Dados
  nota_final?: number;
  instrutor?: string;
  observacoes?: string;
  certificado_url?: string;
  timezone?: string;

  // Renovação
  eh_renovada: boolean;
  renovada_em?: string | null;
  habilitacao_anterior_id?: number | null;

  // Auditoria
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;

  // Dados enriched (via JOINs)
  funcionario_nome?: string;
  funcionario_matricula?: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  categoria_nome?: string;
  validade_meses?: number;
  status_computado?: string; // VÁLIDO/VENCENDO/VENCIDA
  dias_para_vencimento?: number;
}
```

### Passo 3: Exportar também de types/qualificacoes.ts

```typescript
// Em src/worker/types/qualificacoes.ts - SUBSTITUIR
// export interface Habilitacao { ... }
// POR:

export { Habilitacao } from './index';
```

### Passo 4: Atualizar imports

```bash
# Buscar
grep -rn "from.*qualificacoes" src/worker/

# Encontrar imports de Habilitacao
# Verificar se devem vir de index.ts
```

### Passo 5: Compilar e verificar

```bash
npm run build
```

---

## ⚡ FIX #4: ADICIONAR CAMPOS FALTANTES AOS DTOs (1 hora)

### Problema

DTOs estão faltando campos que existem no banco:

- `timezone`
- `eh_renovada`
- `renovada_em`
- `habilitacao_anterior_id`

### Arquivo: `src/worker/dtos/habilitacoes.ts`

### Antes

```typescript
export const CreateHabilitacaoDTO = z.object({
  funcionario_id: z.number().int().positive('Funcionário é obrigatório'),
  qualificacao_id: z.number().int().positive('Qualificação é obrigatória'),
  data_conclusao: z.string().datetime().or(z.string().date()),
  data_vencimento: z.string().datetime().or(z.string().date()),
  resultado: z.enum(['APROVADO', 'REPROVADO', 'PENDENTE']).default('PENDENTE'),
  nota_final: z.number().min(0).max(100).optional(),
  observacoes: z.string().optional(),
});
```

### Depois

```typescript
export const CreateHabilitacaoDTO = z.object({
  // Obrigatórios
  funcionario_id: z.number().int().positive('Funcionário é obrigatório'),
  qualificacao_id: z.number().int().positive('Qualificação é obrigatória'),
  data_conclusao: z.string().datetime().or(z.string().date()),
  data_vencimento: z.string().datetime().or(z.string().date()),

  // Opcionais
  resultado: z.enum(['APROVADO', 'REPROVADO', 'PENDENTE']).default('PENDENTE'),
  nota_final: z.number().min(0).max(100).optional(),
  observacoes: z.string().optional(),
  instrutor: z.string().optional(),
  timezone: z.string().default('UTC').optional(),

  // Renovação (auto-preenchidos pelo service, mas permitir override)
  eh_renovada: z.boolean().default(false).optional(),
  habilitacao_anterior_id: z.number().int().optional(),
});

export type CreateHabilitacaoInput = z.infer<typeof CreateHabilitacaoDTO>;

export const UpdateHabilitacaoDTO = z.object({
  data_conclusao: z.string().datetime().or(z.string().date()).optional(),
  data_vencimento: z.string().datetime().or(z.string().date()).optional(),
  resultado: z.enum(['APROVADO', 'REPROVADO', 'PENDENTE']).optional(),
  nota_final: z.number().min(0).max(100).optional(),
  observacoes: z.string().optional(),
  instrutor: z.string().optional(),
  timezone: z.string().optional(), // ✅ NOVO
  certificado_url: z.string().url().optional(), // ✅ NOVO
});

export type UpdateHabilitacaoInput = z.infer<typeof UpdateHabilitacaoDTO>;

export const HabilitacaoResponseDTO = z.object({
  id: z.number(),
  funcionario_id: z.number(),
  qualificacao_id: z.number(),
  data_conclusao: z.string(),
  data_vencimento: z.string(),
  resultado: z.string().optional(),
  observacoes: z.string().optional(),
  certificado_url: z.string().optional(),
  instrutor: z.string().optional(),
  timezone: z.string().optional(), // ✅ NOVO
  status: z.enum(['VÁLIDO', 'VENCENDO', 'VENCIDA']),
  dias_para_vencimento: z.number().optional(),
  nota_final: z.number().optional(),
  eh_renovada: z.boolean().default(false), // ✅ NOVO
  renovada_em: z.string().optional(), // ✅ NOVO
  habilitacao_anterior_id: z.number().optional(), // ✅ NOVO
  qualificacao_nome: z.string().optional(),
  qualificacao_codigo: z.string().optional(),
  funcionario_nome: z.string().optional(),
  funcionario_matricula: z.string().optional(),
  categoria_nome: z.string().optional(),
  validade_meses: z.number().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  deleted_at: z.string().optional(),
});
```

### Validação

```bash
npm run build
```

---

## ⚡ FIX #5: REORDENAR ROTAS PARA EVITAR CONFLITO (15 min)

### Problema

GET `/habilitacoes/stats` pode ser interpretado como ID=stats

**Arquivo:** `src/worker/routes/index.ts` linha 257

### Estratégia 1: Usar middleware de subrouta (RECOMENDADO)

```typescript
// ❌ ANTES
app.route('/api/v2/habilitacoes', habilitacoesRoutes());

// ✅ DEPOIS
const habilitacoesRouter = new Hono();

// Rotas específicas ANTES de catch-all :id
habilitacoesRouter.get('/stats', ...);
habilitacoesRouter.get('/qualificacoes', ...);
habilitacoesRouter.get('/funcionarios', ...);

// Rotas dinâmicas DEPOIS
habilitacoesRouter.get('/:funcionarioId/:qualificacaoId/renovacoes', ...);
habilitacoesRouter.get('/:id', ...);
habilitacoesRouter.post('/', ...);
habilitacoesRouter.put('/:id', ...);
habilitacoesRouter.delete('/:id', ...);

app.route('/api/v2/habilitacoes', habilitacoesRouter);
```

**Ou Estratégia 2:** Usar prefixo

```typescript
// GET /api/v2/habilitacoes/stats
// GET /api/v2/habilitacoes/meta/qualificacoes
// GET /api/v2/habilitacoes/meta/funcionarios
```

### Validação

```bash
npm run build
# Testar GET /api/v2/habilitacoes/stats
# Testar GET /api/v2/habilitacoes/1
# Ambos devem funcionar
```

---

## ⚡ FIX #6: DELETAR ARQUIVO MORTO (5 min)

### Problema

`src/worker/routes/habilitacoesFilters.ts` não é importado

```bash
rm src/worker/routes/habilitacoesFilters.ts
npm run build
```

---

## ⚡ FIX #7: PADRONIZAR STATUS (30 min)

### Problema

Status em 3 formatos diferentes

### Solução

**Arquivo:** `src/worker/dtos/habilitacoes.ts`

```typescript
// Padronizar em um único enum:
// Status calculado dinamicamente: VÁLIDO | VENCENDO | VENCIDA
// Resultado da avaliação: APROVADO | REPROVADO | PENDENTE
// Status de ativação: ATIVA | VENCIDA | SUSPENSA (removido - usar apenas status calculado)

// Remover confusão:
export enum HabilitacaoStatus {
  VALID = 'VÁLIDO',
  EXPIRING = 'VENCENDO',
  EXPIRED = 'VENCIDA',
}

export enum HabilitacaoResultado {
  APPROVED = 'APROVADO',
  REJECTED = 'REPROVADO',
  PENDING = 'PENDENTE',
}
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] **FIX #1:** Deletar habilitacoesServiceFixed.ts (15 min)
  - [ ] Deletar arquivo
  - [ ] Deletar testes
  - [ ] npm run build
- [ ] **FIX #2:** Renomear qualificacaoId → habilitacaoId (30 min)
  - [ ] Atualizar ModalUploadCertificado.tsx
  - [ ] Atualizar Habilitacoes.tsx
  - [ ] npm run build
- [ ] **FIX #3:** Unificar tipos Habilitacao (45 min)
  - [ ] Consolidar em types/index.ts
  - [ ] Remover duplicatas
  - [ ] Atualizar imports
  - [ ] npm run build
- [ ] **FIX #4:** Adicionar campos aos DTOs (1 hora)
  - [ ] Atualizar habilitacoes.ts DTOs
  - [ ] Adicionar timezone, eh_renovada, renovada_em
  - [ ] npm run build
- [ ] **FIX #5:** Reordenar rotas (15 min)
  - [ ] Reorganizar habilitacoesRoutes
  - [ ] Mover /stats antes de /:id
  - [ ] npm run build
  - [ ] Testar GET /stats e GET /:id
- [ ] **FIX #6:** Deletar habilitacoesFilters.ts (5 min)
  - [ ] rm arquivo
  - [ ] npm run build
- [ ] **FIX #7:** Padronizar status (30 min)
  - [ ] Remover enum duplicado
  - [ ] Usar VÁLIDO/VENCENDO/VENCIDA em queries
  - [ ] npm run build

---

## 🚀 PRÓXIMOS PASSOS APÓS FIXES

### Prioridade 2 (Esta Semana)

1. **Adicionar Índices ao Banco**

   ```sql
   CREATE INDEX IF NOT EXISTS idx_habilitacoes_deleted_at
     ON habilitacoes(deleted_at);
   CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario_id
     ON habilitacoes(funcionario_id);
   CREATE INDEX IF NOT EXISTS idx_habilitacoes_qualificacao_id
     ON habilitacoes(qualificacao_id);
   ```

2. **Melhorar Tratamento de Erros (400/404/500)**

   - Diferenciar 404 vs 500 em PUT
   - Retornar detalhes de 400 (qual campo faltou)

3. **Unificar Upload de Certificado**

   - Escolher 1 componente
   - Deletar outros 2

4. **Testes E2E**
   - Testar flow completo: CREATE → READ → UPDATE → DELETE
   - Testar renovações
   - Testar upload certificado

### Prioridade 3 (Próximo Sprint)

1. Eager load renovações
2. Adicionar campo status MUTÁVEL
3. Sincronizar certificado_url
4. Adicionar empresa_id

---

**Estimativa Total:** 3-4 horas  
**Risco:** Baixo (changes são isoladas e testáveis)  
**QA Necessário:** Sim (testar fluxo completo)
