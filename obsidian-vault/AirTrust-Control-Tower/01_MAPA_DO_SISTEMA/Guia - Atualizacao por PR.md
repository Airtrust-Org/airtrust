---
status: ativo
tipo: guia
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: baixo
ultima_revisao: "2026-07-05"
tags:
  - guia
  - pr
  - processo
---

# Guia: Atualização do Vault por PR

## Regra de atualização

> **Toda PR que altera arquitetura, schema, regra de negócio, ou risco DEVE atualizar a nota correspondente no vault.**

## Quando atualizar

| Tipo de mudança | Atualizar |
|---|---|
| Nova rota de API | Nota do módulo: seção "Rotas principais" |
| Nova migration | Nota do módulo: seção "Tabelas envolvidas" + `ultimo_sha_verificado` |
| Mudança de regra de negócio | Nota do módulo: seção "Regras de negócio críticas" |
| Nova dívida técnica identificada | Criar nota em `07_RISCOS_E_DIVIDA_TECNICA/` |
| Dívida técnica resolvida | Atualizar status para `resolvido` + `data_resolucao` |
| Mudança de arquitetura | Atualizar `01_MAPA_DO_SISTEMA/` + possível novo ADR |
| Bug crítico encontrado | Atualizar "Riscos conhecidos" na nota do módulo |
| Nova decisão arquitetural | Criar ADR em `03_DECISOES_ADR/` |
| Deploy com mudança de comportamento | Atualizar `ultimo_sha_verificado` nas notas afetadas |
| Novo conteúdo EAD | Criar/atualizar nota em `08_EAD_SCORM_CONTEUDO/` |

## Fluxo

```
PR mergeada na main
      ↓
Identificar notas afetadas (módulo, risco, arquitetura)
      ↓
Atualizar frontmatter: ultimo_sha_verificado = HEAD da main
      ↓
Atualizar corpo da nota com as mudanças
      ↓
Se dívida resolvida: atualizar status + data_resolucao
      ↓
Comitar atualização do vault (pode ser no mesmo repo ou separado)
```

## O que NÃO precisa de atualização no vault

- Mudanças puramente de estilo/UI sem alterar comportamento
- Refatorações internas que não mudam interfaces
- Correções de typo em comentários
- Atualizações de dependências sem breaking changes
- Ajustes de configuração local (.dev.vars, wrangler.dev.toml)

## Periodicidade

Além das atualizações por PR, fazer uma auditoria leve do vault a cada 2-3 sprints:
- Verificar `ultimo_sha_verificado` vs HEAD
- Mover notas obsoletas para `99_ARQUIVO/`
- Consolidar dívidas técnicas resolvidas
- Atualizar lista de rotas e arquivos principais
