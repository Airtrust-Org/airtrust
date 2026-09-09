# AirTrust Release Readiness — 2026-09-09

## Baseline de código

- Branch avaliada: `main`
- **Release code SHA:** `e3ba052e2796c2ea33ccb7685334f441b897c54d`
- Última integração: **#576 — evidência read-only F4-03 de validade histórica**
- PRs abertas após a integração: **0**
- Produção alterada por esta consolidação: **não**
- Staging alterado por esta consolidação: **não**
- Migration remota executada por esta consolidação: **não**

Este documento registra o estado de release do SHA funcional acima. A eventual integração desta atualização documental não deve ser tratada como mudança funcional que invalida a baseline avaliada.

## CI final da baseline

O SHA `e3ba052e2796c2ea33ccb7685334f441b897c54d` possui os workflows oficiais pós-merge concluídos com sucesso:

- **CI (fast gates): PASS** — run `34300482192`;
- **CI (heavy gates): PASS** — run `34300482275`;
- checks associados ao SHA: `lms-smoke`, `public-e2e`, `frontend-coverage`, `worker-tests-1`, `worker-tests-2` e `airtrust-gcb` concluídos com sucesso.

Nenhum PR permanece aberto e nenhum gate conhecido está falhando no SHA atual.

## Proveniência de staging

O último deploy oficial de staging comprovado é:

- workflow: `Deploy Staging (Official)`;
- run: `34229190521`;
- conclusão: `success`;
- release servido e validado naquele ciclo: `ccbf23568327ff1cea11b39e387c1a2af5fde6dc`.

O `main` atual está **99 commits à frente** de `ccbf2356` e zero atrás. Portanto:

- os PASS runtime obtidos em staging para `ccbf2356` permanecem evidência válida daquele release;
- eles **não** constituem prova runtime do SHA atual;
- para nova promoção de staging, publicar `e3ba052e…` pelo workflow oficial e executar somente os QA governados invalidados pelo delta.

O delta contém mudanças reais em Worker/frontend, incluindo RBAC/tenant isolation, LMS, FRMS, escalas, auth/cache, hardening e guards; staging não deve ser tratado como equivalente ao `main` atual antes de nova publicação.

## Estado técnico por frente

### Código / CI

**CODE-READY.**

- nenhuma PR corretiva aberta;
- fast + heavy verdes no SHA atual;
- nenhuma regressão conhecida pendente de código no escopo das auditorias fechadas.

### Segurança de aplicação

**CODE-READY; ADMIN ACTIONS permanecem separadas.**

O HEAD atual está sanitizado e protegido por guards. A #500 continua exigindo ação administrativa fora do código: rotação/revogação das credenciais R2 expostas historicamente, validação de workloads/secrets, revisão de uso e decisão formal sobre resposta ao histórico Git. Não executar automaticamente.

### LMS / SCORM

**CODE-READY / STAGING-PROOF-STALE-FOR-CURRENT-SHA.**

O runtime SCORM e seus guards estão integrados e os smokes do SHA atual passam em CI. O workflow `staging-lms-scorm-qa` passou integralmente no release `ccbf2356`, cobrindo upload ZIP real, Quality Gate, ativação, rejeição, timeout e cleanup. Esse PASS deve ser revalidado somente após o SHA atual ser publicado em staging.

### FRMS

**CÓDIGO E RASTREABILIDADE CORRIGIDOS; fail-closed preservado.**

A lógica de interrupção de jornada fora da base, limites `>3h` e `<6h`, rastreabilidade e remoção de atribuições indevidas foram integradas. A ausência de configuração governada FRMS no tenant QA/staging produz `503/UNKNOWN` intencional, sem fallback global; isso é blocker de fixture/governança de staging, não defeito de código a ser mascarado.

### eDB / semântica regulatória

**Fail-closed com dois blockers externos específicos.**

- #91: IFR e S-76C foram resolvidos; falta fonte aprovada Costa do Sol/OEM aplicável à semântica/origem de ciclos do **AW139**. A regra do S-76C não pode ser generalizada.
- #93: falta contrato/OpenAPI oficial vigente da ANAC, ambiente de homologação e credenciais/escopos oficiais.

Esses blockers afetam a integração regulatória eDB e não devem ser tratados como regressão de módulos não-eDB já code-ready.

### MRO / Controle de Voos / UX

**CODE-CLOSED / RESIDUAL-RUNTIME-QA.**

A #496 concentra somente provas runtime residuais. Evidência real em `ccbf2356` já passou para MRO mobile e LMS/SCORM; o audit transversal teve falha conhecida por ausência de configuração governada FRMS no tenant QA, com comportamento fail-closed esperado. N-07 Pasta 360 e N-09 SGSO ainda precisam de vias governadas específicas ou fixture autorizada; não executar staging writes ad-hoc.

### Health / observabilidade

**CODE-CONFIG-CLOSED / EXTERNAL-PROOF-PENDING.**

A #493 permanece restrita à comprovação provider-side de monitor independente, destino/owner e entrega real de alerta. Configuração em código não substitui prova operacional externa.

### Dados históricos / integridade — #414

**IDENTIFICAÇÃO/PROVENIÊNCIA RESOLVIDAS; WRITE PRODUTIVO NÃO AUTORIZADO.**

A investigação read-only recuperou evidência pré-incidente e reduziu deterministicamente o reparo a seis históricos ainda divergentes: `4595`, `4610`, `4628`, `4632`, `4634`, `4670`.

Os demais registros do conjunto histórico atingido já coincidem com a evidência original; candidatos amplos fora do conjunto de 18 não devem ser incluídos por heurística. Para os seis, a fonte autoritativa do before-value permanece o certificado pré-incidente. Nenhum repair deve ser executado sem autorização explícita, recovery point e plano de rollback aplicáveis ao write produtivo.

### FOLGA Costa do Sol — #265

**PRODUCTION-CONFIG-CLOSED / READONLY-FUNCTIONAL-VALIDATION-PENDING.**

O write autorizado `AMBAS -> FOLGA` no tenant 6 já foi executado e confirmado por readback autenticado. **Não repetir esse write.** O residual é exclusivamente validação funcional read-only contra escala publicada: proposta apenas em folga, rejeição de dia de trabalho e coerência de label/fluxo.

## Pendências irreduzíveis atuais

1. **#500 — ADMIN-SECURITY-BLOCKED:** rotação/revogação R2 + resposta ao histórico Git.
2. **#493 — ADMIN/PROVIDER-PROOF-BLOCKED:** monitor independente e entrega real de alerta.
3. **#496 — RESIDUAL-RUNTIME-QA:** nova publicação do SHA atual em staging e provas governadas específicas restantes.
4. **#414 — PRODUCTION-WRITE-AUTH-BLOCKED:** seis linhas identificadas; requer autorização explícita + recovery point antes de qualquer repair.
5. **#265 — READONLY-FUNCTIONAL-QA-PENDING:** configuração produtiva já aplicada; falta somente prova funcional read-only.
6. **#91 — AUTHORITATIVE-MAINTENANCE-SOURCE-PENDING:** ciclos AW139.
7. **#93 — EXTERNAL-CONTRACT-PENDING:** contrato/homologação/credenciais ANAC.

## Decisão técnica atual

**CODE-READY / CI-GREEN / CURRENT-MAIN-NOT-YET-STAGING-PROVEN.**

O SHA funcional `e3ba052e2796c2ea33ccb7685334f441b897c54d` está sem PR corretiva aberta conhecida e com CI oficial verde. O passo técnico seguinte para promover esse candidato é um deploy **somente de staging** pelo workflow oficial, seguido dos QA governados aplicáveis ao delta.

Isso não constitui autorização para deploy de produção, migration, write D1/R2 produtivo, rotação de segredo, ANAC submission ou qualquer ação administrativa/provedor. Esses itens continuam exigindo autorização específica e atual.

Nenhum blocker deve ser transformado em PASS por inferência, reutilização de evidência de SHA anterior ou relaxamento de gate.
