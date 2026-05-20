# 🚀 Sistema de Auditoria Cascade - AirTrust

## 📋 Visão Geral

Sistema de auditoria e validação para rastrear execuções, métricas e eficiência do desenvolvimento no AirTrust.

## 🎯 O Que Foi Criado

### 1. **Migration do Banco** (`migrations/2003_audit_cascade.sql`)
- Tabela `audit_cascade` para registrar todas as execuções
- Views para métricas agregadas e execuções recentes
- Índices para performance

### 2. **Sistema de Auditoria** (`cascade/scripts/audit-log.ts`)
- Funções para registrar execuções no D1
- Cálculo de checksum SHA-256
- Cálculo de score de eficiência
- Busca de métricas e histórico

### 3. **Validação de Workflow** (`cascade/scripts/validate-workflow.ts`)
- Execução automática de lint, build e test
- Registro de resultados no D1
- Validação pré-commit

### 4. **Template de Prompt** (`cascade/prompts/airtrust-template.yaml`)
- Contexto completo do projeto
- Stack técnica
- Padrões e regras
- Módulos principais
- Workflow de desenvolvimento

## 🚀 Como Usar

### 1. Executar Migration

```bash
# Desenvolvimento
wrangler d1 execute DB --local --file=migrations/2003_audit_cascade.sql

# Produção
wrangler d1 execute DB --remote --file=migrations/2003_audit_cascade.sql
```

### 2. Validar Workflow

```typescript
import { validarWorkflow } from './cascade/scripts/validate-workflow';

// Em um endpoint ou script
app.post('/api/v2/cascade/validate', async (c) => {
  const db = c.env.DB;
  const ok = await validarWorkflow(db);
  return c.json({ success: ok });
});
```

### 3. Registrar Auditoria Manual

```typescript
import { registrarAuditoria, calcularChecksum } from './cascade/scripts/audit-log';

const inicio = Date.now();

// Executar tarefa...

await registrarAuditoria(db, {
  modelo: 'sonnet-4.5',
  arquivo: 'src/worker/api/v2/qualificacoes.ts',
  comando: 'build',
  tempo_ms: Date.now() - inicio,
  sucesso: true,
  checksum: calcularChecksum('src/worker/api/v2/qualificacoes.ts'),
  erros: 0,
  warnings: 2
});
```

### 4. Consultar Métricas

```sql
-- Métricas por modelo
SELECT * FROM vw_cascade_metrics;

-- Últimas execuções
SELECT * FROM vw_cascade_recentes;

-- Score médio da última hora
SELECT AVG(score) as score_medio
FROM audit_cascade
WHERE created_at > datetime('now', '-1 hour');
```

## 📊 Fórmula do Score

```
Score = (100 - (erros + warnings * 10)) / (tempo_ms / 1000)
```

**Interpretação:**
- Score > 85: Excelente ✅
- Score 70-85: Bom ⚠️
- Score < 70: Precisa melhorar ❌

## 🎯 Métricas Rastreadas

- **modelo**: Qual IA foi usada (sonnet-4.5, gpt-4-turbo, haiku)
- **arquivo**: Arquivo modificado
- **comando**: Comando executado (build, test, lint)
- **tempo_ms**: Tempo de execução
- **sucesso**: Se a execução foi bem-sucedida
- **checksum**: SHA-256 do arquivo
- **erros**: Número de erros
- **warnings**: Número de warnings
- **score**: Métrica de eficiência (0-100)

## ⚠️ Limitações do Cascade

**O que NÃO é possível fazer:**
- ❌ Reconfigurar o Cascade internamente
- ❌ Escolher qual modelo de IA usar
- ❌ Implementar fallback automático entre modelos
- ❌ Modificar temperature ou max_tokens
- ❌ Criar cache interno do Cascade

**O Cascade é controlado pela Codeium, não pelo código do projeto.**

## ✅ O Que Este Sistema Faz

- ✅ Registra todas as execuções no D1
- ✅ Calcula métricas de eficiência
- ✅ Valida builds e testes
- ✅ Gera relatórios de performance
- ✅ Identifica gargalos
- ✅ Rastreia histórico de mudanças

## 📈 Próximos Passos

1. Executar a migration no D1
2. Integrar auditoria nos endpoints principais
3. Configurar validação pré-commit
4. Criar dashboard de métricas
5. Implementar alertas para score baixo

## 🔗 Arquivos Relacionados

- `migrations/2003_audit_cascade.sql` - Schema do banco
- `cascade/scripts/audit-log.ts` - Sistema de auditoria
- `cascade/scripts/validate-workflow.ts` - Validação automática
- `cascade/prompts/airtrust-template.yaml` - Template de contexto

## 📝 Exemplo de Uso Completo

```typescript
// 1. Registrar início
const inicio = Date.now();

// 2. Executar tarefa
try {
  await minhaFuncao();
  
  // 3. Registrar sucesso
  await registrarAuditoria(db, {
    modelo: 'sonnet-4.5',
    arquivo: 'meu-arquivo.ts',
    comando: 'refactor',
    tempo_ms: Date.now() - inicio,
    sucesso: true,
    erros: 0,
    warnings: 0
  });
} catch (error) {
  // 4. Registrar falha
  await registrarAuditoria(db, {
    modelo: 'sonnet-4.5',
    arquivo: 'meu-arquivo.ts',
    comando: 'refactor',
    tempo_ms: Date.now() - inicio,
    sucesso: false,
    erros: 1,
    warnings: 0,
    detalhes: { error: error.message }
  });
}
```

---

**Status:** ✅ Sistema de auditoria criado e pronto para uso
