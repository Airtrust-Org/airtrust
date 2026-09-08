# AirTrust Release Readiness — 2026-09-08

## Baseline

- Branch avaliada: `main`
- SHA: `33a70cf0cb53db24bc46d695866de33b65dab5c0`
- Última integração: `fix(escalas): restrict integrated monthly view to crew sector (#563)`
- Produção alterada por esta consolidação: não
- Staging alterado por esta consolidação: não

## CI das integrações desta consolidação

As mudanças integradas nesta reta final foram validadas em seus HEADs atuais com PR Check + fast + heavy antes do merge:

- #560 — compatibilidade de status em notificações;
- #561 — compatibilidade de status EVD;
- #562 — `scorm-again` 3.3.2, substituindo a #462 obsoleta;
- #463 — `react-pdf` 10.5.0;
- #564 — F5-08, isolamento do runtime SCORM do bearer amplo da sessão;
- #563 — visão mensal integrada restrita ao setor Tripulação, com teste de regressão cobrindo as seis fontes.

Nenhum gate foi desabilitado, afrouxado ou allowlisted para permitir essas integrações.

A atualização Wrangler 4.129.0 (#471) **não foi integrada**: o Dependency Review detectou dois novos HIGH em `wrangler/miniflare`. A PR foi fechada sem merge. A versão 4.130.0 deve ser tratada como uma atualização nova, com lockfile novo e validação completa; o lockfile 4.129.0 não deve ser reaproveitado manualmente.

## Estado técnico de integração

No momento desta consolidação:

- não há PR corretiva aberta;
- o achado SECURITY F5-08 / #558 está fechado após #564;
- o wrapper SCORM não recebe mais bearer reutilizável do host React;
- o commit SCORM usa capability curta `lms_asset` em cookie HttpOnly, escopada à matrícula/curso/tenant e aceita pelo `auth()` apenas no path canônico exato de commit;
- a fixture de SCO controlado prova que conteúdo same-origin não obtém `Authorization: Bearer`;
- `scorm-again` 3.3.2 e `react-pdf` 10.5.0 estão na `main`;
- a visão mensal integrada filtra Tripulação em todas as fontes que reutilizam `employeeFilterSql()`;
- migration 0487 e demais operações remotas continuam sujeitas aos fluxos governados existentes;
- nenhuma migration remota, write de produção, rotação de segredo ou configuração administrativa externa foi executada nesta consolidação.

## Bloqueios externos / operacionais ainda abertos

### #500 — SECURITY P0-01: credenciais R2 / histórico

**ADMIN-BLOCKED.** Exige ação de owner/admin no provedor e decisão explícita sobre rotação/revogação e tratamento de histórico. Não rotacionar nem reescrever histórico automaticamente.

### #414 — P0 data integrity F4-03 / 0435

A recuperação das expirações originais continua bloqueada por ausência de fonte histórica autoritativa. Busca adicional no histórico do repositório encontrou apenas snapshots de importação de 2026-05-20, anteriores demais para provar quais das candidatas posteriores formam as 18 linhas do incidente. Não reparar por heurística.

### #493 — HEALTH P1-16/17/18

O repositório documenta configuração desejada de monitoramento, mas isso não prova monitor externo e canal de entrega ativos. Fechamento requer evidência provider-side/runtime de monitor independente, destino e entrega de alerta. Não criar/alterar monitor, segredo ou canal sem autorização administrativa.

### #496 — Layout/UX closeout de staging

Há provas parciais recentes de staging para MRO mobile, LMS QA administrativo e simuladores, porém ainda faltam provas autenticadas residuais N-02/N-03/N-07/N-09/LMS no mesmo SHA de release. O conector disponível não oferece `workflow_dispatch`; rerun de execução antiga validaria SHA antigo e não serve como evidência atual.

### #455 — FRMS baseline V1

RBAC 117 e ACT Costa do Sol estão rastreados. Permanecem sem fonte externa autoritativa os números exatos `CICLO_EMBARCADO_DIA_MAX=15` e `REPOUSO_PLATAFORMA=3h/6h`. Mantê-los como `UNVERIFIED_OPERATIONAL_POLICY` até fonte contratual/operator/customer ou nova aprovação interna governada.

### #265 — Política FOLGA em produção

Código e testes existem, mas a configuração efetiva do tenant Costa do Sol é write autenticado de produção. Exige autorização operacional específica, seguida de readback e pós-condições.

### #93 — Integração ANAC eDB

Permanece fail-closed até a ANAC fornecer contrato/OpenAPI vigente, homologação e credenciais/escopos atuais. Não inferir endpoints, DTOs ou semântica de aceite.

### #91 — Semântica regulatória eDB

Continuam pendentes fontes/regras aprovadas para cycles/starts, IFR real x simulado e discrepâncias do RDV. Manter campos fail-closed/null onde a semântica não está provada.

## Readiness por frente

- **Código / CI:** CODE-READY no escopo já integrado; nenhuma PR corretiva aberta.
- **Segurança de aplicação:** F5-08 fechado; atualização Wrangler 4.129 rejeitada pelo gate, sem regressão incorporada.
- **Dependências:** SCORM Again e React-PDF atualizados; Wrangler aguarda tentativa nova em 4.130+ com dependency graph seguro.
- **LMS/SCORM:** runtime endurecido contra captura de bearer; smoke e regressões cobertos no heavy CI.
- **Layout/UX:** correções de código integradas; fechamento documental ainda depende das provas autenticadas residuais de staging em #496.
- **Health/observabilidade:** instrumentação interna não substitui prova de monitor externo; #493 permanece operacionalmente bloqueada.
- **FRMS:** proveniência regulatória parcial formalizada; 15d e 3h/6h permanecem fail-closed como política não verificada.
- **MRO / Controle de Voos / Escalas:** correções conhecidas integradas; visão mensal integrada agora restringe Tripulação.
- **eDB:** dependências regulatórias/ANAC continuam externas e fail-closed.
- **Dados históricos:** #414 permanece P0 sem repair heurístico.

## Decisão técnica atual

**CODE-READY / OPERATIONALLY BLOCKED FOR UNCONDITIONAL RELEASE**

A `main` atual não possui PR corretiva aberta conhecida e as integrações desta consolidação passaram seus gates completos antes do merge. Isso não equivale a autorização para deploy irrestrito de produção.

Antes de um release real, ainda são necessários, conforme aplicabilidade:

1. staging smoke autenticado do **mesmo SHA** que será liberado;
2. confirmação de backup/recovery point e critérios de rollback;
3. resolução ou aceitação formal dos bloqueios operacionais pertinentes (#500, #414, #493, #496, #455, #265, #93, #91);
4. autorização explícita para qualquer write de produção, migration, rotação de segredo ou mudança administrativa.

Nenhum desses bloqueios deve ser transformado em PASS por inferência ou por reutilização de evidência de SHA anterior.
