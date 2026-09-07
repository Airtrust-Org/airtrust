# AirTrust Release Readiness — 2026-09-07

## Baseline

- Branch avaliada: `main`
- SHA: `0562c6e952a61dda44d049456f4fd61549a9d42d`
- Última integração: `chore(repo): stop tracking generated wrangler source map (#453)`
- Produção/staging alterados por esta auditoria: não

## CI pós-merge

No SHA acima:

- `CI (fast gates)` — **PASS**
- `CI (heavy gates)` — **PASS**

O heavy inclui a cobertura já existente para LMS smoke, worker tests, public E2E e frontend coverage. Nenhum gate foi desabilitado ou afrouxado.

## Estado de integração

No momento desta consolidação:

- não há PR corretiva pendente conhecida após o merge da #453;
- a migration 0487 está apenas preparada no fluxo governado Schema V2, sem aplicação remota nesta auditoria;
- nenhuma migration remota, deploy, write de staging/produção, rotação de segredo ou mudança administrativa do GitHub foi executada.

## Blockers externos / operacionais ainda abertos

### #414 — P0 data integrity

A recuperação das expirações originais afetadas pelo incidente F4-03/0435 permanece bloqueada por ausência de fonte histórica autoritativa. O conjunto exato das 18 linhas não pode ser reconstruído com segurança por heurística. Não executar/adaptar 0435 como repair até existir fonte autoritativa, dry-run revisável e autorização específica.

### #265 — Política FOLGA em produção

O código e os testes para a política `FOLGA` já existem, mas a mudança efetiva do tenant Costa do Sol é um write autenticado de produção. Permanece bloqueada até autorização operacional específica, seguida de readback e pós-condições funcionais.

### #93 — Integração ANAC eDB

A integração continua fail-closed até que a ANAC forneça contrato técnico/OpenAPI vigente, procedimento de homologação e credenciais/escopos atuais. Não inferir endpoints, DTOs, autenticação ou semântica de aceite.

### #91 — Semântica regulatória eDB

Continuam sem fonte/regra aprovada os campos regulatórios de ciclos e a separação IFR real x simulado. Enquanto isso, manter fail-closed/null; não promover `starts`, pousos ou `tempo_ifr` legado por inferência.

## Readiness por frente

- **Técnica / CI:** verde no SHA avaliado.
- **Segurança:** nenhuma regressão conhecida introduzida pelas integrações noturnas; gates preservados.
- **Schema/governança:** fluxo de migration preparado; nenhuma aplicação remota executada.
- **LMS/SCORM:** smoke integrado permanece coberto pelo heavy CI; nenhuma nova falha conhecida no baseline.
- **eDB:** código deve permanecer fail-closed nas dependências regulatórias externas #91/#93.
- **FRMS/SIGVOOS:** nenhuma issue corretiva adicional conhecida aberta além das dependências regulatórias já registradas.
- **MRO/Controle de Voos:** correções de auditoria anteriormente integradas permanecem no baseline; nenhuma PR corretiva adicional aberta.

## Decisão técnica atual

**CODE-READY / OPERATIONALLY BLOCKED FOR UNCONDITIONAL RELEASE**

O SHA avaliado apresenta fast + heavy CI verdes e não há PR corretiva conhecida pendente. Isso não equivale a autorização para deploy de produção: os itens #414, #265, #93 e #91 permanecem explicitamente fora do escopo de correção autônoma segura e exigem fonte externa, decisão regulatória ou autorização humana.

Antes de qualquer deploy real, executar o runbook canônico vigente, confirmar backup/recovery point atual, staging smoke do mesmo SHA, janela/responsável, critérios de abort e quaisquer migrations/configurações explicitamente autorizadas.
