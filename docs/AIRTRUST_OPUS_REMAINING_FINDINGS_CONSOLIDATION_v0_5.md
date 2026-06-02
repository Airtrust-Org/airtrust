# AirTrust Opus Remaining Findings Consolidation v0.5

Data: 2026-06-02
Branch auditada: `main`
HEAD auditado: `a8947ba8b084f536ff1c09beb8be4335d6f1c769`
Modo: read-only no runtime. Nenhuma migration, nenhum deploy, nenhum DB remoto, nenhuma criacao de empresa/usuario.

## 1. Sumario executivo

Depois dos fechamentos recentes de assets, smoke, module gating, deploy guards, error hardening e readiness, o AirTrust segue apto para piloto controlado, mas ainda nao esta pronto para escalar com seguranca para cliente externo aberto ou para 5+ empresas com baixa friccao operacional.

Os temas remanescentes se concentram em:

- RBAC de plataforma e suporte interno ainda dependente de `userId === 1`.
- Audit trail fragmentado, sem padrao consistente de `empresa_id`, `request_id` e sanitizacao de payload.
- DDL runtime residual em SIGVOOS, treinamentos planejados, documentos e alguns schemas legados de qualificacoes.
- Status magicos duplicados em PT/EN e por genero, com risco de filtro inconsistente.
- Cobertura fraca em Hospedagem, SGSO, LMS/EAD e EVD.
- SQL muito espalhado, com 2302 ocorrencias de `.prepare(` e concentracao alta em dominios sensiveis.
- Data quality documentado e validado estaticamente, mas ainda sem execucao operacional aprovada.

## 2. Estado atual apos correcoes ja feitas

Estado confirmado no HEAD atual:

- `main` alinhada com `origin/main`.
- `scripts/preflight-clean-deploy.sh`: PASS.
- `npm run ops:guard`: PASS.
- Assets estao endurecidos no codigo atual: `/api/assets/*` hoje e deny-by-default, com logos publicos explicitamente permitidos, FIRA tenant-scoped autenticado e prefixos sensiveis bloqueados.
- Module gating ja tem registro canonico em `src/react-app/lib/modules.ts` e testes cobrindo ocultacao/bloqueio.
- Request ID existe no middleware e no error handler, mas ainda nao foi propagado de forma padronizada ao audit trail.

## 3. O que ja foi mitigado

- Admin reset cross-tenant.
- FRMS fail-open.
- `escala_alocacoes` tenant-scope via JOIN com testes.
- Simulador -> qualificacao.
- Metricas criticas do dashboard.
- Dirty deploy e D1 remoto perigoso nos caminhos principais.
- Assets publicos e privados em `/api/assets/*` no HEAD atual.
- Smoke autenticado e public-only documentados.
- Module gating.
- Error hardening client-facing.
- DDL runtime classe A em hot paths.
- Endpoint temporario `/api/fix`.

## 4. O que ainda esta aberto

- `userId === 1` continua sendo atalho de platform admin em `auth.ts` e `empresas.ts`.
- Nao existe role `support` read-only por tenant.
- O writer principal `registrarAuditoria()` grava JSON completo sem `request_id` e sem passar `empresa_id`.
- `audit_logs` existe com coluna `empresa_id`, mas o helper `logAudit()` nao preenche tenant nem correlacao.
- `ensureSigvoosTables`, `ensureTreinamentosPlanejadosSchema`, `ensureSolicitacoesTreinamentoLinkSchema` e `ensureDocumentosTableExists` continuam ativos.
- `ensureHistoricoSchema` e `ensureQualificacoesTiposTrainingSchema` ainda fazem `ALTER TABLE` em caminhos legados de qualificacoes.
- Strings de status continuam espalhadas: `CONCLUIDA`, `CONCLUIDO`, `CANCELADA`, `CANCELADO`, `PENDENTE`, `PENDING`, `VALIDA`, `APROVADO`, `REPROVADO`.
- Hospedagem continua sem testes; SGSO, LMS e EVD seguem com cobertura baixa para o tamanho e o risco.
- Falta observabilidade operacional e diagnostico read-only por tenant para suporte.
- Data quality segue como capacidade documental, nao como evidencia operacional executada.

## 5. Achados por categoria

| ID | Categoria | Achado | Status | Severidade | Bloqueia cliente externo | Bloqueia piloto interno | Bloqueia 5+ empresas | Exige migration | Proxima acao | Modelo recomendado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RBAC-01 | RBAC | `userId === 1` segue como platform admin implicito em `auth.ts` e `empresas.ts` | ABERTO | S1 | sim | nao | sim | sim | Desenhar `platform_admin` e remover fallback implicito | GPT-5.5 Alta |
| SUPPORT-01 | SUPPORT | Nao existe role `support` read-only por tenant nem trilha dedicada de acesso de suporte | ABERTO | S1 | sim | nao | sim | sim | Definir role de suporte, escopo read-only e eventos auditados | GPT-5.5 Alta |
| LGPD-01 | LGPD | `registrarAuditoria()` escreve em `auditoria` sem passar `empresa_id`, sem `request_id` e sem sanitizacao de `dados_antes/depois` | ABERTO | S1 | sim | nao | sim | nao | Mapear eventos criticos e padronizar writer antes de migration unificada | GPT-5.5 Alta |
| LGPD-02 | SECURITY | `logAudit()` usa `audit_logs`, mas sem preencher `empresa_id`, `usuario_id` canonico nem `request_id` | ABERTO | S2 | sim | nao | sim | nao | Unificar contrato minimo de auditoria entre helpers existentes | GPT-5.5 Alta |
| DDL-01 | DDL | `ensureSigvoosTables()` ainda cria tabelas e indices em runtime em SIGVOOS/FRMS | ABERTO | S2 | nao | nao | sim | sim | Preparar migrations explicitas e remover ensures do dominio | GPT-5.5 Altissimo |
| DDL-02 | DDL | `treinamentos-planejados-integration.ts` ainda faz `CREATE TABLE` e `ALTER TABLE` em runtime | ABERTO | S2 | nao | nao | sim | sim | Separar tabelas base do link em `solicitacoes_treinamento` e migrar depois | GPT-5.5 Altissimo |
| DDL-03 | DDL | `ensureDocumentosTableExists()` segue no bootstrap da API | ABERTO | S2 | nao | nao | sim | sim | Canonicalizar schema de documentos e remover auto-bootstrap | GPT-5.5 Altissimo |
| DDL-04 | ARCHITECTURE | `ensureHistoricoSchema` e `ensureQualificacoesTiposTrainingSchema` ainda fazem `ALTER TABLE` em caminhos legados de qualificacoes | PARCIAL | S2 | nao | nao | sim | sim | Inventariar o schema legado e encerrar DDL residual fora de hot paths | GPT-5.5 Alta |
| STATUS-01 | STATUS_ENUM | Status magicos seguem duplicados em PT/EN e por genero | ABERTO | S2 | nao | nao | sim | nao | Criar enum central e migrar primeiro as queries de metrica e contagem | GPT-5.4 Alta |
| TEST-01 | TESTING | Hospedagem tem 0 testes; SGSO, LMS, EVD e treinamentos planejados seguem com cobertura baixa | ABERTO | S2 | sim | nao | sim | nao | Priorizar testes de contrato e tenant-scope nesses dominios | GPT-5.4 Alta |
| BETA-01 | BETA_MODULES | Modulos beta continuam existindo por design; SGSO e configuracoes ainda exibem textos de produto incompleto quando ativados | PARCIAL | S2 | sim | nao | nao | nao | Manter ocultos para cliente e revisar superficie demo | GPT-5.4 Alta |
| OPER-01 | OPERATIONS | Falta diagnostico read-only por tenant, trilha operacional de suporte e observabilidade orientada a tenant | ABERTO | S2 | sim | nao | sim | nao | Definir endpoints/runbooks de suporte e sinais por tenant | GPT-5.5 Alta |
| DATA-01 | DATA_QUALITY | SQL de data quality esta valido e read-only, mas sem execucao operacional aprovada | ABERTO | S1 | sim | sim | sim | nao | Rodar em ambiente aprovado por operador autorizado e registrar sumario sem PII | GPT-5.4 Alta |
| ARCH-01 | ARCHITECTURE | SQL segue espalhado: 2302 `.prepare(` com concentracao alta em `sigvoos-frms`, `dashboardService`, `scheduled-handler`, SGSO e FRMS | ABERTO | S3 | nao | nao | sim | nao | Escolher um dominio piloto para camada de repository | GPT-5.4 Alta |
| SUPABASE-01 | SUPABASE_FUTURE | Migracao para Supabase continua fora de hora: schema heterogeneo, DDL residual e contrato de tenant ainda instavel | ABERTO | S3 | nao | nao | nao | sim | Fazer apenas feasibility audit e ordem futura de migracao | GPT-5.5 Altissimo |
| PRODUCT-01 | PRODUCT | Piloto interno e liberacao externa ainda se confundem se o gate nao explicitar as dependencias operacionais | PARCIAL | S2 | sim | nao | nao | nao | Manter `CONDITIONAL GO` e separar readiness de onboarding real | GPT-5.4 Alta |

## 6. Matriz de severidade

| Severidade | Significado | Itens |
| --- | --- | --- |
| S1 | Bloqueia cliente externo ou cria risco imediato de governanca/compliance | RBAC-01, SUPPORT-01, LGPD-01, DATA-01 |
| S2 | Nao derruba o piloto atual, mas impede escala segura ou aumenta risco operacional relevante | LGPD-02, DDL-01, DDL-02, DDL-03, DDL-04, STATUS-01, TEST-01, BETA-01, OPER-01, PRODUCT-01 |
| S3 | Divida estrutural importante para 5+ empresas, sem urgencia de deploy imediato | ARCH-01, SUPABASE-01 |

## 7. Bloqueia cliente externo?

Sim.

Bloqueadores principais:

- RBAC/suporte de plataforma ainda depende de atalho implicito.
- Audit trail ainda nao esta padronizado para tenant, request correlation e sanitizacao.
- Data quality ainda nao foi executado operacionalmente.
- Modulos beta sem cobertura adequada precisam continuar ocultos.

## 8. Bloqueia segunda empresa interna?

Parcialmente.

Nao bloqueia um piloto interno/controlado por si so, mas bloqueia qualquer leitura de "GO pleno". O piloto interno ainda depende de:

- smoke autenticado com empresa esperada;
- data quality executado em ambiente aprovado;
- aceite legal/compliance minimo;
- manutencao de modulos beta como ocultos/inativos.

## 9. Bloqueia 5+ empresas?

Sim.

Bloqueadores principais:

- fallback `userId === 1`;
- ausencia de role `support`;
- DDL runtime residual;
- status magicos espalhados;
- baixa cobertura em modulos beta;
- ausencia de observabilidade por tenant;
- SQL excessivamente distribuido sem camada de repositorio.

## 10. Exige migration?

Sim, para parte do backlog.

Itens que claramente exigem migration:

- DDL-01 SIGVOOS.
- DDL-02 treinamentos planejados / link em solicitacoes.
- DDL-03 documentos bootstrap.
- DDL-04 schemas legados de qualificacoes.
- RBAC-01 e SUPPORT-01 se a solucao final exigir persistencia explicita de roles/plataforma.
- SUPABASE-01 por definicao futura de cutover.

Itens que podem comecar sem migration:

- LGPD-01, LGPD-02, STATUS-01, TEST-01, DATA-01, ARCH-01, PRODUCT-01.

## 11. Exige GPT-5.5?

Sim, nos temas sensiveis de auth, suporte, audit trail e migration.

Reservar GPT-5.5 para:

- RBAC-01.
- SUPPORT-01.
- LGPD-01.
- LGPD-02.
- DDL-01, DDL-02, DDL-03, DDL-04.
- SUPABASE-01.

Pode seguir com GPT-5.4:

- STATUS-01.
- TEST-01.
- BETA-01.
- DATA-01.
- ARCH-01.
- PRODUCT-01.

## 12. Proxima acao recomendada

Proxima acao recomendada: **Sprint A - RBAC/Suporte**, seguida de **Sprint B - Audit Trail/LGPD**.

Motivo:

- remove a dependencia operacional mais fragil (`userId === 1`);
- cria base segura para suporte em multiempresa;
- prepara o caminho para auditoria com tenant e request correlation antes de escalar qualquer onboarding.
