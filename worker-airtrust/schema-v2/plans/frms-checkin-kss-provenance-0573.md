# Schema V2 0573 — Proveniência de KSS por check-in FRMS (FAD-003)

## Objetivo e origem
Remediar FRMS-FAD-003 da auditoria de 03/11/2026 (`docs/audits/FRMS_AUDITORIA_INTEGRAL_20261103.md` e plano `FRMS_PLANO_CORRECOES_CODEX_20261103.md`). Uma nota KSS numérica não prova que o tripulante respondeu à escala; dados históricos derivados de `sleepiness_level` ou preenchidos automaticamente não devem ser classificados como autorrelato.

## Contrato de dados e riscos
- `frms_fadiga_checkin.kss_provenance`: `CREW_REPORTED | DERIVED | DEFAULTED | NULL`. Apenas a presença explícita de `kss_score` válido em solicitação autenticada permite `CREW_REPORTED`.
- Linhas antigas permanecem `NULL`. Não copiar o KSS legado nem inferir `CREW_REPORTED` de 1–9, da presença de evento sem proveniência ou de valores padrão 5.
- Leituras de risco que dependem de KSS exigem `CREW_REPORTED`; `DERIVED`, `DEFAULTED` ou `NULL` reduzem confiança e requerem revisão, sem fabricar uma classificação NORMAL.
- Mantém o `frms_fadiga_evento` já existente como trilha append-only com versão `CHECKIN_SERVER_V1`; a nova coluna é o estado consultável sem varredura de eventos.
- Não muda limiares fisiológicos, nem atribui APTO/INAPTO, nem libera voo. O campo de prontidão foi desenhado para triagem, não decisão médica automática.
- Risco operacional: check-ins legados sem proveniência tornar-se-ão não verificáveis na tela de fadiga diária; coordenação precisa visualizar a lacuna, não corrigi-la por backfill cego.

## SQL aditivo
Arquivo: `worker-airtrust/schema-v2/changes/0573_frms_checkin_kss_provenance.sql`. Uma coluna nullable com CHECK e índice tenant-scoped; sem UPDATE histórico, sem DELETE, sem SQL remoto direto, sem reprocessamento nem presunção de origem.

## Ordem de execução (governada)
1. Revalidar `main`, unicidade do número 0573, `changeId=frms-checkin-kss-provenance-0573`, hashes do manifest e ledger canônico com consulta *somente leitura*. Precheck de `frms_fadiga_checkin`, `empresa_id`, `kss_score`, `deleted_at` e inexistência de `kss_provenance`; se já existir, investigar em vez de reaplicar.
2. Executar testes SQLite da migração e smoke de criação/atualização de check-in e leitura do painel em worktree isolado; oito gates oficiais e revisão de PR devem estar aprovados no SHA exato.
3. Criar recovery point / backup D1 segundo o contrato de release. Staging usa exclusivamente `staging-apply-schema-v2.yml`, que deve reconhecer explicitamente `frms-checkin-kss-provenance-0573` e seus hashes na `main` confiável. **Bloqueio atual:** o workflow de staging ainda não possui 0573 em sua allowlist; não usar o aplicador legado `deploy-staging.yml`, scripts D1 diretos nem o workflow de produção como atalho.
4. Publicar Worker+Pages de staging no mesmo SHA e validar duas empresas/setores com KSS explícito, ausência de KSS legado e atualização com nova origem. Confirmar `NULL` nos registros antigos por leitura; não modificar dados para simular aceite.
5. Produção usa exclusivamente `apply-schema-change-v2.yml` após integração governada na `main`, com autorização específica de SHA/escopo/componentes e gates requeridos. Verificar pós-deploy, rastreabilidade no ledger e métricas de check-in.

## Critérios de aceite
- Coluna e CHECK existem; `INSERT` novo salva `CREW_REPORTED`; atualização autenticada grava `CREW_REPORTED`; origem de cliente não é aceita sem validação.
- `NULL`, `DERIVED`, `DEFAULTED`, KSS fora de 1–9 e ausência de fit-for-duty não produzem falsa normalidade em dados de leitura.
- Histórico legado preservado sem backfill; isolamento por `empresa_id` e setor, sem gravação fora da empresa; eventos e linha transacional coerentes.
- Testar mesmo tripulante em jornadas com KSS 9, sono 0 e KSS desconhecido; revisão operacional apropriada.
- Gate `lint`, `build-content-gates`, `worker-typecheck`, `frontend-coverage`, `worker-tests-1/2`, `lms-smoke`, `public-e2e` aprovados para o SHA candidato.

## Recuperação
Rollback de release Worker/Pages governa o código; a coluna aditiva deve permanecer com dados históricos íntegros. Se necessário, fazer compensação de schema **somente por uma nova mudança Schema V2 governada** após análise de impacto e Time Travel. Jamais executar `wrangler d1 migrations apply` ou `DROP COLUMN` direto em produção.
