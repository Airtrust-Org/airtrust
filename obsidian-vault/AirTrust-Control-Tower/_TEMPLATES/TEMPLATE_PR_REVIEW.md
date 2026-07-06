---
status: rascunho | revisado | aprovado | mergeado
tipo: pr-review
fonte_canonica: repo
pr_numero: "<NNN>"
pr_url: ""
branch_origem: ""
branch_destino: "main"
data_review: "<YYYY-MM-DD>"
revisor: ""
sha_revisado: "<INSERIR SHA>"
risco: baixo | medio | alto | critico
tags:
  - pr
  - review
---

# PR #<NNN>: <TITULO>

## Resumo da mudança
<!-- 1-2 frases -->

## Arquivos tocados
| Arquivo | Tipo de mudança | Risco |
|---|---|---|
| | | |

## Checklist de review
- [ ] Multi-tenant: toda query tem `WHERE empresa_id = ?`
- [ ] RBAC: middleware `requireRole` onde necessário
- [ ] Soft delete mantido (sem `DELETE` hard)
- [ ] Auditoria registrada (`dados_anteriores` / `dados_novos`)
- [ ] Zod validation nos inputs
- [ ] Resposta segue `{ success, data/error }`
- [ ] Nenhum secret exposto
- [ ] TypeScript sem erros (`npx tsc --noEmit`)
- [ ] Lint passando (`npm run lint`)
- [ ] Migration nova não duplica número existente
- [ ] Testes passando (`npm run test:all`)

## Decisão
<!-- ✅ Aprovado | ❌ Rejeitado | 🔄 Alterações solicitadas -->

## Notas
- 
