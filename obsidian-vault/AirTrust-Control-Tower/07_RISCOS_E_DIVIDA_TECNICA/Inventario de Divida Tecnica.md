---
status: ativo
tipo: inventario
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
ultima_revisao: "2026-07-05"
tags:
  - divida-tecnica
  - inventario
---

# Inventário de Dívida Técnica

> Fonte canônica: `TECHNICAL_DEBT.md` (HEAD: `5be104893`)
> Última atualização completa: 2026-06-12

## Resumo

| Categoria | Count | Severidade Máxima |
|---|---|---|
| Erros TypeScript | 20 | 🟡 MÉDIO |
| Migrations duplicadas | 30 números | 🟡 MÉDIO |
| Código morto | 2 | 🟢 BAIXO |
| Problemas de config | 2 | 🔴 CRÍTICO |
| Problemas de build | 2 | 🟢 BAIXO |
| Problemas de RBAC | 1 | 🟡 MÉDIO |
| Problemas de auditoria | 2 | 🟡 MÉDIO |
| Bugs latentes | 2 | 🔴 CRÍTICO |
| Arquivos não comitados | 37 | 🟡 MÉDIO |

## Itens críticos

### 🔴 DT-0002: Args incorretos qualificacoes-historico-ficha.ts:416
Chamada com 5 argumentos onde espera 6. **Risco de runtime CRÍTICO.**

### 🔴 Problemas de configuração
- Proxy dev pode apontar para produção via `.env.local`
- Configuração incorreta pode causar vazamento de dados

### 🔴 Bugs latentes
- 2 bugs latentes catalogados com risco de runtime crítico

## Itens médios

### 🟡 DT-0001: 6 erros TS2552 em lms-matriculas.ts
`dataExpiracao` vs `data_expiracao` — emails sem data de expiração.

### 🟡 30 migrations com números duplicados
Números repetidos na sequência de migrations. Risco de confusão em apply.

### 🟡 37 arquivos não comitados
Arquivos locais não rastreados que podem conter dados sensíveis ou configurações.

## Itens baixos
- 2 arquivos de código morto
- Convenção de auditoria inconsistente (`dados_antigos` vs `dados_anteriores`)
- 2 problemas de build

## Notas detalhadas
- [[DT-0001 - Erros TS lms-matriculas]]
- [[DT-0002 - Args incorretos qualificacoes-historico-ficha]]
