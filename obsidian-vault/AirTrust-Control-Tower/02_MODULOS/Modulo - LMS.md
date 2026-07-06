---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: alto
modulo: "LMS"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - lms
  - risco/alto
---

# LMS — Learning Management System Nativo

## Função do módulo
LMS multi-formato integrado ao ecossistema Cloudflare. Substituiu integração EdApp (descontinuada). Suporta SCORM 1.2/2004, H5P, PDF, PPTX, Vídeo com SSOT bidirecional com `qualificacoes_tipos` e ciclos de matrícula automáticos.

## Arquivos principais

### Backend (Worker)
| Arquivo | Função |
|---|---|
| `routes/lms-cursos.ts` | CRUD de cursos + upload para R2 |
| `routes/lms-matriculas.ts` | Matrículas + batch + emails |
| `routes/lms-progresso.ts` | SCORM + xAPI progress tracking |
| `routes/lms-assets.ts` | R2 streaming seguro (cookie JWT) |
| `routes/lms-relatorios.ts` | Relatórios de conformidade |
| `routes/lms-edapp-legado.ts` | Histórico EdApp (read-only) |

### Frontend (React)
| Página | Rota |
|---|---|
| Catálogo | `/lms` |
| Admin Cursos | `/lms/admin` |
| Player SCORM/Vídeo | `/lms/player/:id` |
| Player H5P | `/lms/player/h5p/:id` |
| Player PDF | `/lms/player/pdf/:id` |
| Player PPTX | `/lms/player/pptx/:id` |
| Relatórios | `/lms/relatorios` |
| Matrículas | `/lms/matriculas` |

## Rotas principais da API
| Método | Path | Descrição |
|---|---|---|
| GET | `/api/lms/cursos` | Listar cursos |
| POST | `/api/lms/cursos` | Criar curso + upload |
| GET | `/api/lms/assets/*` | Servir asset (cookie JWT) |
| POST | `/api/lms/progresso` | Salvar progresso SCORM/xAPI |
| GET | `/api/lms/matriculas` | Listar matrículas |
| POST | `/api/lms/matriculas` | Matricular aluno |
| GET | `/api/lms/relatorios` | Relatório de conformidade |

## Tabelas envolvidas
| Tabela | Função |
|---|---|
| `lms_cursos` | Catálogo de cursos |
| `lms_matriculas` | Matrículas de alunos |
| `lms_progresso` | Progresso SCORM/xAPI |
| `lms_ciclos` | Ciclos de renovação |
| `qualificacoes_tipos` | SSOT link |

## Tipos de conteúdo suportados
| Formato | Player | Storage |
|---|---|---|
| SCORM 1.2/2004 | `scorm-again` | R2 (zip) |
| H5P | `h5p-standalone` | R2 |
| PDF | `pdfjs-dist` | R2 |
| PPTX | `@jvmr/pptx-to-html` | R2 |
| Vídeo | HTML5 `<video>` | R2 |

## Regras de negócio críticas
1. **SSOT**: Sincronização bidirecional com `qualificacoes_tipos` — nunca quebrar
2. **Segurança de assets**: Servidos via cookie JWT com TTL de 15 minutos — nunca expor URLs públicas
3. **Ciclos de matrícula**: Renovação automática com janela de 30 dias
4. **SCORM**: Progresso persiste via `scorm-again` + endpoint dedicado
5. **EdApp legado**: Dados históricos somente leitura, não alterar

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| Bug TS: `dataExpiracao` vs `data_expiracao` em emails de matrícula | 🟡 MÉDIO | Aberto |
| Progresso SCORM pode resetar em edge cases | 🟠 ALTO | Investigando |
| Cookie JWT de assets: TTL curto pode falhar em cursos longos | 🟡 MÉDIO | Monitorar |

## O que agentes de IA NÃO podem fazer sem validação
- [ ] Alterar formato de resposta do endpoint de progresso SCORM
- [ ] Modificar lógica de SSOT com `qualificacoes_tipos`
- [ ] Expor assets sem cookie JWT
- [ ] Alterar templates de email de matrícula sem testar
- [ ] Modificar parser SCORM sem testar com pacotes reais
- [ ] Descontinuar suporte a EdApp legado sem migração de dados

## Prompts úteis
- [[PROMPT_BASE_AIRTRUST]]
- [[Prompt - Auditoria LMS SCORM]]

## PRs relacionados
- 

## Pendências
- [ ] Corrigir 6 erros TS2552 em `lms-matriculas.ts` (dataExpiracao → data_expiracao)
- [ ] Investigar reset de progresso SCORM em AW139
