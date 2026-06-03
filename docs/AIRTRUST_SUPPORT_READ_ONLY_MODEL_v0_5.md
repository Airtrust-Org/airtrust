# AirTrust - Support Read-Only Model v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Design/documentacao. Sem ativacao de permissao.

## 1. Objetivo

Definir o comportamento conservador de `support_read_only` para suporte multiempresa.

## 2. Escopo permitido

- visualizar estado de tenant e configuracao necessaria para diagnostico.
- consultar metadados de documentos e assets quando suficiente para troubleshooting.
- visualizar trilha auditavel sanitizada.
- validar autenticacao, vinculo de tenant, modulos ativos e status operacional.

## 3. Escopo proibido

- criar, editar ou apagar dados.
- alterar qualificacoes, escalas, FRMS ou EVD.
- redefinir acesso de usuario sem fluxo separado.
- baixar documentos sensiveis por padrao.
- ler dados medicos brutos.

## 4. support_reason

Obrigatorio para:

- entrada em tenant.
- leitura sensivel.
- qualquer tentativa de operacao cross-tenant.

Formato sugerido:

- ticket ou incidente controlado.
- motivo curto e verificavel.

## 5. tenant access

Regras:

- acesso sempre tenant-scoped.
- acesso sempre temporario ou explicitamente aprovado.
- sem tenant definido, negar.
- sem `support_reason`, negar.

## 6. eventos auditaveis

Minimos:

- `SUPPORT_SESSION_STARTED`
- `SUPPORT_SESSION_ENDED`
- `SUPPORT_TENANT_VIEW`
- `SUPPORT_SENSITIVE_VIEW_DENIED`
- `SUPPORT_MUTATION_DENIED`

## 7. dados sensiveis

Regras conservadoras:

- suporte nao acessa dados medicos brutos.
- suporte nao baixa documentos sensiveis por padrao.
- suporte nao ve payload completo de FRMS, apenas metadados e contexto minimo quando estritamente necessario.

## 8. break-glass

`support_read_only` nao cobre break-glass.

Qualquer break-glass futuro deve:

- usar papel/fluxo separado.
- exigir aprovacao adicional.
- gerar evento especifico.
- ter expiracao curta.

## 9. fluxo operacional

1. operador solicita acesso.
2. informa `support_reason`.
3. sessao tenant-scoped e iniciada.
4. consultas de diagnostico ocorrem em modo read-only.
5. toda leitura sensivel gera audit.
6. sessao e encerrada e auditada.

## 10. testes necessarios

- negar suporte sem `support_reason`.
- negar suporte fora do tenant aprovado.
- negar mutacao em todas as rotas write.
- provar geracao de audit para sessao iniciada, negada e encerrada.
- provar fail-closed para papel desconhecido ou escopo ausente.
