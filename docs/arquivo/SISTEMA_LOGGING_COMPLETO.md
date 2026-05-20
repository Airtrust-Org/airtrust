# 🔍 Sistema de Logging Estruturado - AirTrust

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Uso Básico](#uso-básico)
4. [Exemplos de Logs](#exemplos-de-logs)
5. [Análise de Logs](#análise-de-logs)
6. [Integração com GitHub Copilot](#integração-com-github-copilot)
7. [Boas Práticas](#boas-práticas)

---

## 🎯 Visão Geral

Sistema completo de logging estruturado para debug profissional e diagnóstico rápido.

### ✨ Benefícios

✅ **Debug 10x mais rápido** - Contexto completo em cada log  
✅ **Copilot entende melhor** - Logs estruturados com metadados  
✅ **Rastreamento de requests** - Request ID único em toda a cadeia  
✅ **Medição de performance** - Duração automática de operações  
✅ **Logs em produção** - JSON parseável para análise posterior  
✅ **Visual em dev** - Logs coloridos e formatados no terminal

---

## 🏗️ Arquitetura

### Componentes

```
worker-airtrust/src/
├── utils/
│   └── logger.ts              # Logger estruturado
├── middleware/
│   └── requestId.ts           # Middleware de Request ID
└── routes/
    └── importacao.ts          # Exemplo de uso em routes
```

### Fluxo de Dados

```
Request → requestIdMiddleware → Route Handler → Service → Logger
   ↓
[Request ID gerado]
   ↓
[Contexto enriquecido: user, environment, timestamp]
   ↓
[Logs estruturados com contexto completo]
```

---

## 🚀 Uso Básico

### 1. Em Routes (Hono)

```typescript
import { createLogger } from '../utils/logger';

app.post('/api/importacao/executar/:entidade', async (c) => {
  const logger = createLogger(c, 'ImportacaoRoute');

  try {
    const entidade = c.req.param('entidade');

    logger.info('Request de importação recebida', {
      entidade,
      method: 'POST /executar',
    });

    // ... lógica da rota

    logger.info('Importação concluída', {
      inserted: 42,
      updated: 10,
    });

    return c.json({ success: true });
  } catch (error) {
    logger.fatal('Erro ao executar importação', error as Error);
    return c.json({ error: 'Erro ao importar' }, 500);
  }
});
```

### 2. Em Services

```typescript
import { Logger } from '../utils/logger';

export class FuncionarioImportacao {
  private logger: Logger;

  constructor(db: D1Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  async validate(rows: any[]) {
    const timer = this.logger.startTimer('Validação de funcionários');

    this.logger.info('Iniciando validação', {
      total_linhas: rows.length,
    });

    // ... validação

    timer(); // Log automático com duração

    this.logger.info('Validação concluída', {
      total: rows.length,
      validos: validCount,
      erros: errorCount,
    });

    return { valid, errors };
  }
}
```

### 3. Níveis de Log

```typescript
logger.debug('Detalhe técnico', { cpf: '12345678901' });
// 🔍 [DEBUG] - Informações de desenvolvimento

logger.info('Operação normal', { status: 'ok' });
// ℹ️ [INFO] - Fluxo normal da aplicação

logger.warn('Situação inesperada', { value: null });
// ⚠️ [WARN] - Atenção necessária

logger.error('Erro recuperável', error, { linha: 5 });
// ❌ [ERROR] - Erro que foi tratado

logger.fatal('Erro crítico', error, { context: 'db' });
// 💀 [FATAL] - Erro que interrompe o fluxo
```

### 4. Timer de Performance

```typescript
const timer = logger.startTimer('Importação completa');

// ... operação demorada

timer(); // Log automático: "⏱️ Importação completa { duration_ms: 1523 }"
```

---

## 📊 Exemplos de Logs

### Development (Terminal)

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
  "modo": "UPSERT",
  "total_linhas": 38,
  "headers_recebidos": [
    "tipo",
    "codigo",
    "nome",
    "descricao",
    "categoria"
  ]
}
================================================================================
```

### Production (JSON)

```json
{
  "level": "INFO",
  "message": "Request de importação recebida",
  "context": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": 1,
    "userEmail": "filipe@airtrust.com",
    "environment": "production",
    "timestamp": "2025-11-26T15:13:42.123Z",
    "module": "ImportacaoRoute"
  },
  "data": {
    "entidade": "qualificacoes_tipos",
    "modo": "UPSERT",
    "total_linhas": 38
  },
  "duration": 0
}
```

### Erro com Stack Trace

```
================================================================================
❌ [ERROR] ImportacaoRoute
────────────────────────────────────────────────────────────────────────────────
📝 Mensagem: Erro ao processar CPF
🕒 Timestamp: 2025-11-26T15:13:45.456Z
⏱️  Duração: 234ms
🆔 Request ID: 550e8400-e29b-41d4-a716-446655440000
👤 Usuário: filipe@airtrust.com (ID: 1)
📊 Dados:
{
  "linha": 5,
  "cpf_original": "123.456.789-00",
  "entidade": "funcionarios"
}
💥 Erro: ValidationError: CPF inválido
📚 Stack:
ValidationError: CPF inválido
    at validateCPF (cpf.ts:42:11)
    at FuncionarioImportacao.validate (FuncionarioImportacao.ts:89:15)
    at async POST /api/importacao/validar/funcionarios (importacao.ts:123:20)
================================================================================
```

---

## 🔍 Análise de Logs

### 1. Logs em Tempo Real (Production)

```bash
# Ver todos os logs ao vivo
npx wrangler tail --env production

# Filtrar por nível
npx wrangler tail --env production --format=json | grep ERROR

# Usar script de análise
chmod +x scripts/analyze-logs.sh
./scripts/analyze-logs.sh ERROR 60   # Últimos 60 minutos
```

### 2. Script de Análise (`scripts/analyze-logs.sh`)

```bash
#!/bin/bash
FILTER=${1:-ERROR}
MINUTES=${2:-60}

echo "🔍 Analisando logs dos últimos $MINUTES minutos..."
echo "📊 Filtro: $FILTER"

wrangler tail --env production --format=json | \
  jq -r "select(.level == \"$FILTER\") |
    \"[\(.context.timestamp)] [\(.level)] \(.context.module)
    📝 \(.message)
    🆔 Request: \(.context.requestId)
    👤 User: \(.context.userEmail // \"anônimo\")
    ⏱️  Duração: \(.duration)ms
    \"" | \
  head -n 50
```

### 3. Buscar por Request ID

```bash
# Rastrear toda a execução de uma requisição
npx wrangler tail --env production --format=json | \
  jq 'select(.context.requestId == "550e8400-e29b-41d4-a716-446655440000")'
```

### 4. Análise de Performance

```bash
# Operações mais lentas
npx wrangler tail --env production --format=json | \
  jq -r 'select(.duration > 1000) | "\(.duration)ms - \(.message)"' | \
  sort -rn | \
  head -20
```

---

## 🤖 Integração com GitHub Copilot

### Workflow de Debug

#### 1. Capturar Log Completo

Quando algo quebrar, copie o log estruturado completo:

```
================================================================================
❌ [ERROR] ImportacaoRoute
────────────────────────────────────────────────────────────────────────────────
📝 Mensagem: NOT NULL constraint failed: qualificacoes_tipos.categoria
🕒 Timestamp: 2025-11-26T15:13:45.456Z
⏱️  Duração: 234ms
🆔 Request ID: 550e8400-e29b-41d4-a716-446655440000
👤 Usuário: filipe@airtrust.com (ID: 1)
📊 Dados:
{
  "linha": 2,
  "entidade": "qualificacoes_tipos",
  "modo": "UPSERT",
  "campo_problema": "categoria",
  "valor_recebido": null
}
💥 Erro: D1_ERROR: NOT NULL constraint failed: qualificacoes_tipos.categoria
📚 Stack:
Error: NOT NULL constraint failed
    at D1Database.prepare (d1.ts:123:10)
    at QualificacaoTipoImportacao.import (QualificacaoTipoImportacao.ts:164:15)
================================================================================
```

#### 2. Prompt para Copilot

```
@workspace Copilot, veja este erro:

[COLAR LOG COMPLETO AQUI]

O que pode estar errado? Como corrigir?
```

#### 3. Copilot Terá Acesso a:

✅ **Request ID** - Rastrear requisição inteira  
✅ **Usuário** - Quem executou a ação  
✅ **Headers recebidos** - Estrutura do arquivo  
✅ **Dados processados** - Valores reais  
✅ **Stack trace completo** - Onde quebrou exatamente  
✅ **Duração** - Detectar lentidão  
✅ **Contexto do módulo** - Qual serviço/rota

#### 4. Diagnóstico Instantâneo! 🎯

Copilot pode:

- Identificar o campo problemático
- Ver o valor que causou o erro
- Sugerir correção no schema ou validação
- Propor default values
- Recomendar melhorias de validação

---

## 📚 Boas Práticas

### ✅ DO

```typescript
// ✅ Contexto rico
logger.info('Importação iniciada', {
  entidade,
  total_linhas: rows.length,
  modo,
  primeira_linha: rows[0],
});

// ✅ Usar timer para operações demoradas
const timer = logger.startTimer('Validação completa');
await validate();
timer();

// ✅ Log de erro com contexto
logger.error('Falha ao processar linha', error, {
  linha: i + 2,
  cpf: row.cpf,
  valor_recebido: row.categoria,
});

// ✅ Níveis apropriados
logger.debug('CPF normalizado', { original, normalizado }); // Dev only
logger.info('Importação concluída', { inserted, updated }); // Sempre
logger.warn('Campo vazio detectado', { field }); // Atenção
logger.error('Erro recuperável', error); // Tratado
logger.fatal('Erro crítico', error); // Interrompe fluxo
```

### ❌ DON'T

```typescript
// ❌ Log sem contexto
logger.info('Erro');

// ❌ Console.log direto (usar logger)
console.log('Importando...');

// ❌ Nível errado
logger.fatal('Campo vazio'); // Use warn
logger.debug('Sistema iniciado'); // Use info

// ❌ Dados sensíveis
logger.info('Login', { password: '123456' }); // NUNCA!

// ❌ Logs em loops sem necessidade
for (const row of rows) {
  logger.info('Processando', { row }); // ❌ 1000+ logs!
}
```

### 🎯 Quando Logar

| Situação           | Nível | Exemplo                                          |
| ------------------ | ----- | ------------------------------------------------ |
| Request recebida   | INFO  | `logger.info('Request recebida', { entidade })`  |
| Validação iniciada | DEBUG | `logger.debug('Validando linha', { linha })`     |
| Operação concluída | INFO  | `logger.info('Importação concluída', { stats })` |
| Valor inesperado   | WARN  | `logger.warn('Campo vazio', { field })`          |
| Erro tratado       | ERROR | `logger.error('Falha ao processar', error)`      |
| Erro crítico       | FATAL | `logger.fatal('DB inacessível', error)`          |

---

## 🔧 Configuração Avançada

### Personalizar Logger

```typescript
// Em logger.ts, ajustar comportamento por ambiente

if (this.context.environment === 'staging') {
  // Logs mais verbosos em staging
  this.logVerbose(entry);
} else if (this.context.environment === 'production') {
  // JSON puro para parsing
  console.log(JSON.stringify(entry));
}
```

### Adicionar Campos Customizados

```typescript
export class Logger {
  constructor(
    requestId: string,
    module: string,
    environment: string,
    user?: { id: number; email: string },
    additionalContext?: Record<string, unknown>, // ← Novo
  ) {
    this.context = {
      requestId,
      userId: user?.id,
      userEmail: user?.email,
      environment,
      timestamp: new Date().toISOString(),
      module,
      ...additionalContext, // ← Espalha contexto adicional
    };
  }
}

// Uso:
const logger = new Logger(requestId, 'ImportacaoRoute', 'production', user, {
  feature_flag: 'v2_import',
  region: 'us-east',
});
```

---

## 📊 Métricas e Observabilidade

### Integração com Cloudflare Analytics

Logs estruturados JSON podem ser:

- ✅ Exportados para Cloudflare Logs
- ✅ Analisados com GraphQL API
- ✅ Visualizados no dashboard
- ✅ Integrados com alertas

### Exemplo de Query GraphQL (Cloudflare)

```graphql
query GetErrors {
  viewer {
    zones(filter: { zoneTag: "your-zone-id" }) {
      httpRequestsAdaptiveGroups(
        filter: { logLevel: "ERROR" }
        orderBy: [datetime_DESC]
        limit: 100
      ) {
        dimensions {
          datetime
          requestId
          message
        }
      }
    }
  }
}
```

---

## 🎉 Conclusão

Sistema de logging completo implementado! Agora você tem:

✅ Logs estruturados em dev e produção  
✅ Request ID rastreável  
✅ Contexto completo em cada log  
✅ Performance tracking automático  
✅ Integração com Copilot  
✅ Scripts de análise

**Debug nunca mais será o mesmo! 🚀**

---

## 📖 Referências

- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/)
- [Structured Logging Best Practices](https://www.honeycomb.io/blog/structured-logging-best-practices)
- [Hono Middleware Guide](https://hono.dev/docs/guides/middleware)

---

_Documentação atualizada em: 26/11/2025_  
_Versão do sistema: 1.0.0_  
_Autor: AirTrust Development Team_
