# Guia de Tags e Convenções do Vault

## Sistema de tags

### Tags de tipo de documento
| Tag | Uso |
|---|---|
| `#indice` | Notas-índice e mapas de navegação |
| `#modulo` | Notas de módulo funcional |
| `#adr` | Architecture Decision Records |
| `#prompt` | Prompts mestres reutilizáveis |
| `#runbook` | Procedimentos operacionais |
| `#pr` | Revisões de Pull Request |
| `#review` | Revisões de código/arquitetura |
| `#divida-tecnica` | Dívida técnica catalogada |
| `#ead` | Conteúdo EAD/SCORM |
| `#regulatorio` | Assuntos regulatórios ANAC |
| `#contexto` | Blocos de contexto para IA |
| `#guia` | Documentos de orientação |
| `#decisao` | Decisões arquiteturais/operacionais |

### Tags de risco
| Tag | Significado |
|---|---|
| `#risco/baixo` | Impacto mínimo, sem urgência |
| `#risco/medio` | Impacto moderado, resolver no ciclo atual |
| `#risco/alto` | Impacto significativo, priorizar |
| `#risco/critico` | Pode causar incidente em produção |

### Tags de módulo
| Tag | Módulo |
|---|---|
| `#frms` | Flight & Rest Management System |
| `#lms` | Learning Management System |
| `#qualificacoes` | Qualificações & Certificados |
| `#simuladores` | Simuladores & Sessões |
| `#escalas` | Escalas Mensais |
| `#evd` | Escala de Voo Diária |
| `#sgso` | SGSO |
| `#rbac` | Autenticação, RBAC, Multi-tenant |
| `#deploy` | Deploy, CI/CD, DevOps |
| `#d1` | Banco D1, migrations, schema |
| `#frontend` | React, Vite, UI/UX |
| `#sigvoos` | Integração SIGVOOS |
| `#anac` | Regulatório ANAC |

### Tags de status de nota
| Tag | Significado |
|---|---|
| `#status/ativo` | Nota atualizada e confiável |
| `#status/desatualizado` | Precisa de revisão (SHA antigo) |
| `#status/obsoleto` | Movido para 99_ARQUIVO |
| `#status/rascunho` | Em elaboração, não usar como referência |

## Convenções de nomenclatura

### Notas de módulo
`Modulo - <Nome do Módulo>.md`

### Notas de mapa/guia
`Mapa - <Tema>.md` ou `Guia - <Tema>.md`

### ADRs
`ADR-<NNNN> - <Titulo>.md`

### Runbooks
`Runbook - <Operação>.md`

### Prompts
`Prompt - <Propósito>.md`

### Dívida técnica
`DT-<NNNN> - <Título>.md`

### Pendências regulatórias
`REG-<NNNN> - <Título>.md`

### Contextos para IA
`Contexto - <Tema>.md`

## Regras de frontmatter
Toda nota técnica DEVE ter:

```yaml
---
fonte_canonica: repo          # SEMPRE "repo" — este vault não é fonte canônica
ultimo_sha_verificado: ""     # SHA do commit em que a nota foi validada
risco: baixo | medio | alto | critico
nao_assumir_sem_verificar_codigo: true   # para notas de módulo
---
```

## O que NUNCA colocar no vault
- ❌ Secrets, tokens, API keys
- ❌ Dados de usuários reais (CPF, email, matrícula)
- ❌ Prints com dados sensíveis
- ❌ Dumps de banco
- ❌ Credenciais de qualquer tipo
- ❌ Prompts que exponham regras internas para alunos
- ❌ Documentos marcados como "aprovado pela ANAC" sem evidência formal
