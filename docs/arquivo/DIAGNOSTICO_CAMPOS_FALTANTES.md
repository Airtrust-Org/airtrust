# Diagnóstico: Campos Faltantes nas Tabelas de Qualificações

## 🔍 Investigação Completa

### Tabelas Encontradas em Produção

1. **`qualificacoes_historico`** (1036 registros)
   - Campos: id, funcionario_id, qualificacao_id (NULL), nome, codigo, tipo, data_conclusao, data_vencimento, certificado_numero, observacoes, status, carga_horaria, nota, resultado, instrutor, checador, local, created_at, updated_at
   - Problema: qualificacao_id é NULL em todos registros
   - Dados armazenados como texto (nome da qualificação) ao invés de FK

2. **`habilitacoes`** (1036 registros - **MESMOS DADOS**)
   - Campos REAIS em produção: id, funcionario_id, qualificacao_id (NULL), data_conclusao, data_vencimento, resultado, status, observacoes, certificado_url, empresa_id, instituicao, uuid, created_at, updated_at, deleted_at
   - ❌ **NÃO TEM**: timezone, eh_renovada, habilitacao_anterior_id, renovada_em, nota_final, instrutor, local

### Schema Esperado (Backups)

Segundo o arquivo `/Users/filipedaumas/Documents/airtrust v1/_backups/worker-old-20251113_231328/dtos/habilitacoes.ts`, a tabela **DEVERIA** ter:

```typescript
interface Habilitacao {
  funcionario_id: string;
  qualificacao_id: string;
  data_conclusao: string;
  data_vencimento: string;
  resultado: 'APTO' | 'INAPTO' | 'EM_ANDAMENTO';
  nota_final?: number;
  observacoes?: string;
  instrutor?: string;
  timezone: string; // ❌ PERDIDO
  eh_renovada: boolean; // ❌ PERDIDO
  habilitacao_anterior_id?: string; // ❌ PERDIDO
  renovada_em?: string; // ❌ PERDIDO
  certificado_url?: string;
}
```

### Campos Perdidos Durante Migração

| Campo | Status | Comentário |
|-------|---------|-----------|
| `timezone` | ❌ PERDIDO | Não existe em produção |
| `eh_renovada` | ❌ PERDIDO | Não existe em produção |
| `habilitacao_anterior_id` | ❌ PERDIDO | Não existe em produção |
| `renovada_em` | ❌ PERDIDO | Não existe em produção |
| `nota_final` | ❌ PERDIDO | Existe `nota` em qualificacoes_historico mas não em habilitacoes |
| `instrutor` | ⚠️ PARCIAL | Existe em qualificacoes_historico mas não em habilitacoes |
| `local` | ⚠️ PARCIAL | Existe em qualificacoes_historico mas não em habilitacoes |

## ✅ O Que Funciona Agora

### API Endpoints Disponíveis

1. **`GET /api/qualificacoes/historico`** - Retorna 22 campos
   - Dados de `qualificacoes_historico` (schema legado)
   - Campos: id, funcionario_id, qualificacao_nome, codigo, qualificacao_tipo, data_emissao, data_validade, certificado_numero, certificado_url, observacoes, status, carga_horaria, nota, resultado, instrutor, checador, local, created_at, updated_at, funcionario_nome, funcionario_matricula, funcionario_cargo

2. **`GET /api/habilitacoes`** - Retorna 15 campos
   - Dados de `habilitacoes` (mesmo conteúdo, schema diferente)
   - Campos: id, funcionario_id, qualificacao_id (NULL), data_conclusao, data_vencimento, resultado, status, observacoes, certificado_url, empresa_id, instituicao, uuid, created_at, updated_at, deleted_at

## 💡 Próximos Passos

### Opção 1: Aceitar Perda de Dados
- Usar tabela `qualificacoes_historico` que tem mais campos (instrutor, local, nota)
- Frontend adapta para não esperar campos de renovação

### Opção 2: Reconstituir Dados Manualmente
- Se existem backups SQL antigos com INSERTs originais, fazer parse
- Criar migration para adicionar colunas: timezone, eh_renovada, habilitacao_anterior_id, renovada_em
- Popular manualmente onde possível

### Opção 3: Partir do Zero com Novo Schema
- Criar tabela `habilitacoes_v2` com schema correto
- Migrar dados atuais + preencher campos vazios com defaults
- Implementar lógica de renovação no backend

## 📊 Comparação Final

| Fonte | Registros | Campos Completos | Renovações | Recomendação |
|-------|-----------|------------------|------------|--------------|
| `qualificacoes_historico` | 1036 | 22 campos | ❌ Não | ✅ **USAR ESTE** |
| `habilitacoes` | 1036 | 15 campos | ❌ Não | ⚠️ Menos dados |
| Backup DTO | - | 12 campos | ✅ Sim | 🔴 Não existe em prod |

## Conclusão

**Os campos de renovação não existem em produção.** As tabelas foram migradas/importadas sem esses dados. A melhor opção é:

1. ✅ Usar `/api/qualificacoes/historico` (mais campos)
2. ✅ Frontend não depende de campos de renovação
3. ⚠️ Se precisar renovações, implementar do zero
