# Lote 2 — Dry-Run: Reconciliação de Tenant em Documentos e Pasta Virtual

**Data:** 2026-06-07  
**Branch:** main  
**HEAD:** `76bfd5c`  
**Produção auditada:** D1 `airtrust-db` (somente SELECT)  
**Escrita executada:** Nenhuma  
**Status:** LOTE 2 DRY-RUN CONCLUÍDO — PRONTO PARA REVISÃO

---

## 1. Contagens atuais

### documentos

| Métrica | Valor |
|---|---:|
| Total físico | 473 |
| Ativos | 237 |
| Soft-deleted | 236 |
| empresa_id=1 ativos | **45** |
| empresa_id=1 soft-deleted | 25 |
| empresa_id=6 ativos | 192 |

### pasta_virtual

| Métrica | Valor |
|---|---:|
| Total físico | 245 |
| Ativos | 178 |
| Soft-deleted | 67 |
| empresa_id=1 ativos | **60** |
| empresa_id=1 soft-deleted | 10 |
| empresa_id=NULL ativos | 0 |
| empresa_id=6 ativos | 118 |

---

## 2. Schema confirmado

```
documentos: id, uuid, funcionario_id, nome_arquivo, tipo, tamanho,
            r2_key, descricao, empresa_id, created_at, updated_at, deleted_at

pasta_virtual: id, funcionario_id, tipo_documento, categoria, caminho_arquivo,
               arquivourl, nome_arquivo, nomeoriginal, arquivo_tamanho, tamanho,
               dataupload, created_at, updated_at, uploadedby, certificacao_id,
               descricao, empresa_id, deleted_at
```

**Nota importante:** `pasta_virtual` NÃO tem coluna `documento_id`. O vínculo
com qualificacoes_historico é via `certificacao_id`. A correlação com `documentos`
é via `nome_arquivo + funcionario_id` (não via FK direta).

---

## 3. Candidatos automáticos (confiança ALTA)

### 3A. documentos — 45 ativos

Critérios satisfeitos:
- `empresa_id = 1` e `funcionario.empresa_id = 6` ✓
- `deleted_at IS NULL` ✓
- Duplicatas exatas: **0** ✓
- 30 vinculados a `qualificacoes_historico` como `certificado_arquivo_id`
- 15 sem vínculo com historico (arquivos avulsos)

### 3B. pasta_virtual — 60 ativos

Critérios satisfeitos:
- `empresa_id = 1` (NENHUM com NULL — todos têm empresa_id=1 explícito) ✓
- `funcionario.empresa_id = 6` ✓
- `deleted_at IS NULL` ✓
- 32 com `certificacao_id` não nulo (link para historico)
- 28 sem `certificacao_id`

---

## 4. Candidatos revisão manual

Nenhum registro requer revisão manual:
- Todos os 45+60 têm funcionário inequivocamente na empresa_id=6
- Não há mistura de funcionários de tenants diferentes
- Não há arquivos apontando para tenant diferente do esperado

---

## 5. Excluídos do Lote 2 (avaliação posterior)

| Item | Quantidade | Motivo |
|---|---:|---|
| documentos soft-deleted (func e6) | 25 | Decisão pendente — não incluído no apply |
| pasta_virtual soft-deleted (func e6) | 10 | Decisão pendente — não incluído no apply |

---

## 6. Duplicidades

| Verificação | Resultado |
|---|---|
| Documentos com mesmo nome+funcionário já em empresa_id=6 | **0** |
| Sem conflito | ✓ |

---

## 7. Correlação documentos ↔ pasta_virtual

Os documentos e pastas virtuais são **criados em par** pelo sistema:
- O mesmo `nome_arquivo` e `funcionario_id` aparece em ambas as tabelas
- Os 45 documentos candidatos têm correspondentes em pasta_virtual (não FK direta, mas correlacionáveis por nome)
- O apply deve mover AMBAS as tabelas em conjunto para consistência

---

## 8. Órfãos

Nenhum órfão detectado:
- Todos os candidatos têm `funcionario_id` válido em empresa_id=6
- `pasta_virtual.certificacao_id` → `qualificacoes_historico` (já movidos no Lote 1)

---

## 9. SQL de aplicação proposto

**Arquivo:** `scripts/sanitization/apply-documentos-lote2.sql`

Passo 1 — documentos:
```sql
UPDATE documentos SET empresa_id=6, updated_at=datetime('now')
WHERE empresa_id=1 AND deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM funcionarios WHERE id=documentos.funcionario_id AND empresa_id=6 AND deleted_at IS NULL);
```
Esperado: **45 linhas**

Passo 2 — pasta_virtual:
```sql
UPDATE pasta_virtual SET empresa_id=6, updated_at=datetime('now')
WHERE (empresa_id IS NULL OR empresa_id=1) AND deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM funcionarios WHERE id=pasta_virtual.funcionario_id AND empresa_id=6 AND deleted_at IS NULL);
```
Esperado: **60 linhas**

---

## 10. SQL de rollback

**Arquivo:** `scripts/sanitization/rollback-documentos-lote2.sql`

Restaura empresa_id=1 para documentos e pasta_virtual movidos.
Preferencialmente usar lista explícita de IDs capturada no dry-run pré-apply.

---

## 11. Impacto previsto nas telas

| Tela / Métrica | Antes | Depois |
|---|---:|---:|
| Documentos ativos empresa_id=6 | 192 | **237** (+45) |
| Pasta virtual ativos empresa_id=6 | 118 | **178** (+60) |
| Documentos empresa_id=1 ativos | 45 | **0** |
| Pasta virtual empresa_id=1 ativos | 60 | **0** |

---

## 12. Pré-condições para aplicação

1. ✅ Lote 1 aplicado (qualificações + tipos movidos)
2. ✅ 0 duplicatas exatas
3. ✅ Schema confirmado (sem `documento_id` em pasta_virtual)
4. ⏳ Backup do D1 antes do apply
5. ⏳ Autorização explícita para executar UPDATEs em produção
6. ⏳ Decisão sobre soft-deleted (35 registros)

---

## 13. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Correlação documentos↔pasta_virtual quebrada | Baixa | Mover ambas em conjunto; sem FK direta |
| `certificacao_id` em pasta_virtual apontando para historico em tenant errado | Zero (historico já em e6 pós-Lote 1) | Verificado |
| Arquivo R2 inacessível após move | Zero (R2 key não muda) | r2_key não tem empresa_id no caminho |

---

## 14. Confirmações desta sessão

- ✅ Nenhuma escrita no D1 de produção
- ✅ Nenhum UPDATE, DELETE, INSERT executado
- ✅ Nenhuma migration aplicada
- ✅ HEAD = origin/main = `76bfd5c`

---

## Classificação final

```
LOTE 2 DRY-RUN CONCLUÍDO — PRONTO PARA REVISÃO
```
