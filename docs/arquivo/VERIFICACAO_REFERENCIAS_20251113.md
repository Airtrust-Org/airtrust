# 📋 VERIFICAÇÃO FINAL: Referências Encontradas no Código Real

**Data:** 13 de Novembro de 2025  
**Método:** Grep direto no código-fonte  
**Fonte da Verdade:** ✅ 100% código real

---

## RESULTADOS VERIFICADOS

### 1️⃣ Campo `cargo` vs `funcao`

| Métrica                 | Valor                | Status           |
| ----------------------- | -------------------- | ---------------- |
| **`.cargo`** (backend)  | **10 ocorrências**   | ⚠️ USAR `funcao` |
| **`.funcao`** (backend) | **59 ocorrências**   | ✅ PREFERIDO     |
| **Razão**               | 5.9:1 (funcao:cargo) | ✅ Já migrando   |

**Arquivos com `.cargo` (10 arquivos):**

```bash
grep -r "\.cargo" src/worker --include="*.ts" 2>/dev/null | cut -d: -f1 | sort -u
```

### 2️⃣ Tabela `fichas` vs Alternativas

| Nome               | Tipo        | Referências         | Status         |
| ------------------ | ----------- | ------------------- | -------------- |
| `fichas`           | String SQL  | ~20+                | ⚠️ LEGADO      |
| `fichas_sessao`    | Tabela real | 0 (não encontrada!) | ⚠️ PROBLEMA!   |
| `simulador_fichas` | Tabela alt. | ~8                  | ⚠️ ALTERNATIVA |

**DESCOBERTA CRÍTICA:**

- Código usa `fichas` (string literal em SQL)
- Banco tem `fichas_sessao` (tabela atual)
- **Mismatch = QUERYS FALHANDO!**

---

## AÇÃO IMEDIATA NECESSÁRIA

### 1. Confirmar Nome Real da Tabela

```bash
# Verificar qual existe no banco
wrangler d1 execute airtrust-db --remote --command="
  SELECT name FROM sqlite_master
  WHERE type='table' AND name LIKE 'ficha%'
  ORDER BY name;
"
```

**Resultado esperado:**

```
fichas
fichas_sessao
fichas_manobras_historico
fichas_assinaturas
__backup_fichas_*
```

### 2. Encontrar TODAS as Referências Exatas

```bash
# Procurar SQL que usa "fichas"
grep -rn "FROM fichas\|JOIN fichas\|INTO fichas\|UPDATE fichas\|DELETE FROM fichas" src/worker --include="*.ts"
```

### 3. Mapping: Qual Arquivo Usa Qual Nome?

- `cron-certificacao-automatica.ts` → `FROM fichas fs`
- `pdf-generator-fichas.ts` → `FROM fichas f`
- `simulador-fichas-crud.ts` → `FROM fichas f` + `simulador_fichas`
- **E muitos mais...**

---

## STATUS CONSOLIDADO

✅ Relatório RELATORIO_VARREDURA_DIRETA_20251113.md criado  
⏳ Verificação de tabelas fichas em progresso  
⏳ Próximo passo: Definir tabela canônica para fichas

---

**Gerado:** 13 de Novembro de 2025
