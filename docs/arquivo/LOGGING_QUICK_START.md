# 🔍 Sistema de Logging - Quick Start

## 🚀 Comandos Rápidos

```bash
# Ver logs ao vivo (produção)
npm run logs:tail

# Analisar logs (últimos 60 min, todos os níveis)
npm run logs:analyze

# Ver apenas erros (últimos 60 min)
npm run logs:errors

# Customizar análise
./scripts/analyze-logs.sh WARN 120  # Warnings dos últimos 2h
./scripts/analyze-logs.sh INFO 30   # Info dos últimos 30min
```

---

## ✅ Sistema Implementado

### Backend (Worker)

- ✅ `utils/logger.ts` - Logger estruturado
- ✅ `middleware/requestId.ts` - Request ID único
- ✅ `routes/importacao.ts` - Exemplo de uso em routes
- ✅ Logs coloridos em dev, JSON em prod

### Frontend (React)

- ✅ `pages/LogsViewer.tsx` - Visualizador de logs
- ⏳ Endpoint `/api/admin/logs` (próxima etapa)

### Scripts

- ✅ `scripts/analyze-logs.sh` - Análise de logs
- ✅ Comandos npm configurados

---

## 📝 Uso Básico

### Em Routes

```typescript
import { createLogger } from '../utils/logger';

app.post('/api/qualificacoes', async (c) => {
  const logger = createLogger(c, 'QualificacoesRoute');

  logger.info('Criando qualificação', { tipo: 'Curso X' });

  try {
    // ... lógica
    logger.info('Qualificação criada', { id: 42 });
  } catch (error) {
    logger.error('Erro ao criar', error as Error);
  }
});
```

### Níveis

- `logger.debug()` - Desenvolvimento
- `logger.info()` - Operações normais
- `logger.warn()` - Atenção
- `logger.error()` - Erro tratado
- `logger.fatal()` - Erro crítico

---

## 📊 Exemplo de Output

### Development

```
================================================================================
ℹ️ [INFO] ImportacaoRoute
────────────────────────────────────────────────────────────────────────────────
📝 Mensagem: Request de importação recebida
🕒 Timestamp: 2025-11-26T15:13:42.123Z
⏱️  Duração: 0ms
🆔 Request ID: 550e8400-e29b-41d4-a716-446655440000
👤 Usuário: filipe@airtrust.com (ID: 1)
📊 Dados:
{
  "entidade": "qualificacoes_tipos",
  "total_linhas": 38
}
================================================================================
```

### Production (JSON)

```json
{
  "level": "INFO",
  "message": "Request de importação recebida",
  "context": {
    "requestId": "550e8400-...",
    "userId": 1,
    "userEmail": "filipe@airtrust.com",
    "environment": "production",
    "timestamp": "2025-11-26T15:13:42.123Z",
    "module": "ImportacaoRoute"
  },
  "data": {
    "entidade": "qualificacoes_tipos",
    "total_linhas": 38
  },
  "duration": 0
}
```

---

## 🤖 Debug com Copilot

Quando algo quebrar:

1. **Copie o log completo** (terminal ou dashboard)
2. **Cole no Copilot:**

   ```
   @workspace Copilot, veja este erro:

   [LOG COMPLETO]

   O que pode estar errado?
   ```

3. **Copilot terá:**
   - ✅ Request ID (rastrear requisição)
   - ✅ Usuário que executou
   - ✅ Dados processados
   - ✅ Stack trace completo
   - ✅ Contexto do módulo

**Diagnóstico 10x mais rápido! 🎯**

---

## 📚 Documentação Completa

Ver `SISTEMA_LOGGING_COMPLETO.md` para:

- Arquitetura detalhada
- Boas práticas
- Configuração avançada
- Integração com Cloudflare Analytics
- Exemplos completos

---

## 🔧 Próximos Passos

### Implementar em Todos os Services

- [ ] FuncionarioImportacao.ts
- [ ] QualificacaoTipoImportacao.ts
- [ ] QualificacaoHistoricoImportacao.ts
- [ ] Outros serviços críticos

### Backend

- [ ] Endpoint `/api/admin/logs` para frontend
- [ ] Filtros avançados (data, módulo, user)
- [ ] Paginação

### Frontend

- [ ] Conectar LogsViewer.tsx ao endpoint real
- [ ] Auto-refresh a cada 30s
- [ ] Export para CSV/JSON
- [ ] Integração com alertas

---

_Sistema implementado em: 26/11/2025_  
_Status: ✅ Operacional (dev + prod)_  
_Versão: 1.0.0_
