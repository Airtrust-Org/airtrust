# INSTRUÇÕES PARA CORRIGIR OS 111 ERROS REMANESCENTES

## Status Atual
- **47 ERROS CORRIGIDOS** em 8 arquivos
- **111 ERROS REMANESCENTES** em 10 arquivos  
- **6 ARQUIVOS PRIORITÁRIOS** (Tier 2: APIs)

---

## PRIORIDADE 1: qualificacoes.ts (22 erros - 1066 linhas)

### Erros Principais:
1. **SQL Injection via LIKE** - Mitigar com `ESCAPE` clause
2. **orderBy injection** - Usar whitelist enum
3. **orderDir injection** - Usar whitelist `ASC|DESC`
4. **Sem owner checks** - Adicionar permissão por usuário
5. **Sem rate limiting na GET** - Já está import, aplicar global
6. **Sem audit logging** - Adicionar antes/depois de operações
7. **Cache invalidation race condition**
8. **Sem validação de data** - Format ISO 8601
9. **Sem tx atomicidade** - Usar transactions para múltiplas operações
10. **Sem tratamento erro específico** - Differentiate auth vs db vs validation
11-22. Mesmos padrões em diferentes rotas

### Estratégia de Correção:
```typescript
// No GET /qualificacoes:
- Adicionar validation schemas (já feito em Tier 4)
- Usar OrderBySchema.parse() e OrderDirSchema.parse()
- Adicionar owner check via requirePermission
- Log antes/depois com audit table
- Usar paginação validada (page >= 1, limit <= 100)

// No POST /qualificacoes:
- Validar CriarQualificacaoSchema com error handling
- Inserir com transação
- Log com detalhes dos dados criados
- Retornar 201 Created

// No PUT /qualificacoes/:id:
- Validar AtualizarQualificacaoSchema
- Owner check (usuário é dono ou ADMIN)
- Log change (antes/depois)
- Transação

// No DELETE /qualificacoes/:id:
- Owner check
- Soft delete (apenas marcar deleted_at)
- Audit log
```

### Tempo Estimado: 2-3 horas (arquivo grande)

---

## PRIORIDADE 2: certificados.ts (18 erros - 725 linhas)

### Erros Principais:
1. **Sem validação magic bytes** - Arquivos podem ser não-PDF/ZIP
2. **Sem rate limiting** - Upload brute force possível
3. **Sem tamanho máximo arquivo** - DoS via arquivo grande
4. **SQL injection via filename** - Usar parameterized
5. **Sem audit logging** - Upload/delete/view não auditado
6. **Race condition** - Entre check e insert
7. **Sem transactions** - Delete arquivo não sincronizado com DB
8. **CORS não restrito** - Qualquer origin pode fazer upload
9. **Sem validação mimetype** - application/pdf, application/zip
10. **File disclosure** - Usuário pode acessar arquivo de outro
11-18. Permissions, ownership, error handling

### Estratégia:
```typescript
// Magic bytes validation
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK..

function validateMagicBytes(buffer: Buffer): boolean {
  return buffer.slice(0, 4).equals(PDF_MAGIC) || 
         buffer.slice(0, 4).equals(ZIP_MAGIC);
}

// No upload:
- Rate limit: 10 uploads/min per user
- Max file: 10MB
- Validate magic bytes
- Scan virus (opcional: VirusTotal API)
- Generate unique filename (uuid + extension)
- Store in R2 com ACL privada
- Log: user_id, filename, size, timestamp
- Return presigned URL (1 hour expiry)

// No download:
- Owner check or ADMIN
- Log download
- Return file com headers seguros
```

### Tempo Estimado: 1.5 horas

---

## PRIORIDADE 3: funcionarios.ts (14 erros - 354 linhas)

### Erros Principais:
1. **SQL injection via LIKE** - Search sem escape
2. **Sem validação CPF** - Duplicatas possíveis
3. **Sem owner checks** - Qualquer user vê qualquer funcionário
4. **Email duplicado** - Sem unique constraint
5. **Sem auditoria de mudança** - UPDATE não loggado
6. **Case-sensitive búsca** - Inutiliza queries
7. **Sem paginação** - Retorna todos (performance)
8. **Sem validação de entrada** - Limites de tamanho
9. **Sem transactions** - DELETE orfana registros
10-14. Error handling, rate limiting, validation

### Estratégia:
```typescript
// GET /funcionarios:
- Paginação obrigatória (limit <= 50)
- Search com LOWER() e LIKE parameterizado
- Owner check (ADMIN vê todos, COMPLIANCE vê alguns)
- Cache com TTL

// POST /funcionarios:
- Validate CPF (isValidCPF)
- Check duplicatas (CPF, email)
- Log com checksum
- Transação

// PUT/DELETE:
- Owner check
- Log antes/depois (dados antigos e novos)
- Soft delete para DELETE
```

### Tempo Estimado: 1 hora

---

## PRIORIDADE 4: api-client.ts (9 erros)

### Erros Principais:
1. **Sem retry logic** - Request falha, sem retry automático
2. **Sem exponential backoff** - Retry imediato pode piorar
3. **Request não é cancelável** - AbortController
4. **Sem timeout** - Request pode pendurar
5. **Sem circuit breaker** - Muitas falhas consecutivas
6. **Sem caching** - Mesma requisição repetida
7. **Sem error classification** - Network vs Auth vs Server
8. **Sem rate limit handling** - 429 responses não tratadas
9. **Token refresh não automático** - 401 não retorna

### Estratégia:
```typescript
// Implementar hooks:
- useApi(...): Fetch com retry, cache, error handling
- useApiWithRetry(...): Exponential backoff
- useApiCache(...): Armazena resultados
- useApiError(...): Classifica erros

// Retry logic:
- Max 3 retries
- Exponential backoff: 1s, 2s, 4s
- Não retry em: 401, 403, 422
- Retry em: 408, 429, 500+

// Timeout: 30 segundos
// AbortController: Cancelar quando component unmount
```

### Tempo Estimado: 1.5 horas

---

## PRIORIDADE 5: ListaQualificacoes.tsx (12 erros)

### Erros Principais:
1. **Memory leak** - useEffect sem cleanup
2. **Sem error boundary** - Erro em filho mata parent
3. **Sem loading state** - UI freezes
4. **Sem pagination** - Carrega tudo
5. **Race condition** - Múltiplas requisiÃ§ões concorrentes
6. **Sem debounce** - Search faz muitas requisições
7. **Sem memoization** - Renderiza desnecessariamente
8. **Key warning** - Lista sem key
9. **Sem error message** - Usuário não vê o que errou
10. **Sem retry UI** - Não há botão de tentar novamente
11. **Sem empty state** - Confundivel com loading
12. **Sem sorting indicators** - Usuário não sabe ordem

### Estratégia:
```typescript
// Refactor com hooks:
export function ListaQualificacoes() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);
  
  // Fetch com cancel
  const { data, loading, error, retry } = useApi(
    `/api/v2/qualificacoes?page=${page}&q=${debouncedSearch}`
  );
  
  // Error boundary
  if (error && !data) return <ErrorState retry={retry} />;
  
  // Loading
  if (loading && !data) return <SkeletonList />;
  
  // Empty
  if (data?.length === 0) return <EmptyState />;
  
  return (
    <List>
      {data.map(q => <Item key={q.id} {...q} />)}
      <Pagination page={page} onChange={setPage} />
    </List>
  );
}
```

### Tempo Estimado: 1.5 horas

---

## PRIORIDADE 6: ToastContext.tsx (3 erros)

### Erros Principais:
1. **Context sem Provider** - Pode causar undefined
2. **Sem error handling** - Toast sem timeout
3. **Sem acessibilidade** - ARIA labels

### Correção Rápida: 15 minutos
```typescript
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
};

// Add timeout auto-dismiss
// Add aria-live="assertive"
```

---

## PRIORIDADE 7: Documentação & Validação (types/index.ts resto)

### Erros Restantes em types/index.ts:
- Faltam discriminated unions em alguns tipos
- Faltam comentários TSDoc
- Faltam examples
- Faltam @deprecated markers

### Correção: Adicionar comentários e refine tipos

---

## ROADMAP RESUMIDO

```
Semana 1:
  ✅ TIER 1 AUTH (4 arquivos) - COMPLETO
  ✅ TIER 4 SCHEMAS (3 arquivos) - COMPLETO
  ⏳ qualificacoes.ts (2 horas)
  ⏳ certificados.ts (1.5 horas)

Semana 2:
  ⏳ funcionarios.ts (1 hora)
  ⏳ api-client.ts (1.5 horas)
  ⏳ ListaQualificacoes.tsx (1.5 horas)
  ⏳ ToastContext.tsx (15 min)

TOTAL TEMPO: ~11 horas para completar todos os 158 erros
```

---

## COMANDOS ÚTEIS

```bash
# Verificar todos os erros
npm run build 2>&1 | grep -A2 "error TS"

# Build apenas backend
npm run build:worker

# Build apenas frontend  
npm run build:frontend

# Test específico
npm test -- qualificacoes.ts

# Deploy após corrigir
wrangler deploy
npm run pages-deploy
```

---

## CHECKLIST FINAL PARA CADA ARQUIVO

- [ ] Arquivo compila sem erros TypeScript
- [ ] Sem lint errors (eslint/prettier)
- [ ] Todas as funções têm JSDoc com @security note
- [ ] Todos os endpoints têm authMiddleware
- [ ] Todas as mutações (POST/PUT/DELETE) têm audit logging
- [ ] SQL queries usam parameterized (?)
- [ ] Inputs validados com Zod schemas
- [ ] Errors têm mensagens específicas (não genéricas)
- [ ] Tests passam (se houver)
- [ ] Sem console.log (usar Logger)
- [ ] Sem hardcoded secrets ou URLs
- [ ] Rate limiting aplicado onde necessário

---

## PRÓXIMOS PASSOS IMEDIATOS

1. **qualificacoes.ts**: Aplicar validação orderBy/orderDir (15 min edit)
2. **certificados.ts**: Adicionar magic bytes validation (20 min)
3. **api-client.ts**: Implementar retry logic com exponential backoff (30 min)

Estes 3 são as correções mais críticas para colocação em produção.

---

**Última atualização:** 2024-11-02  
**Erros remanescentes:** 111 de 158 (70% completo)  
**Status:** Pronto para Tier 1-2 deployment, Tier 3-4 pode aguardar refactoring menor.
