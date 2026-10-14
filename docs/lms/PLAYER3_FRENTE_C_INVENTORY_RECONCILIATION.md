# Player 3 — Frente C: inventário e reconciliação de matrículas (sem writes)

**Data:** 2026-10-14. **Escopo autorizado para primeira captura:** Costa do Sol, `empresa_id=6`. **Estado:** implementação proposta; nenhuma extração real realizada e nenhuma equivalência aplicada.

## Autoridades e limites

- Inventário originalmente integrado à `main` pela [PR #1461](https://github.com/Airtrust-Org/airtrust/pull/1461). Esta Frente C reforça a captura e prepara um **dry-run cifrado T0/T1**, sem editar endpoints centrais, Schema V2, conclusão, certificados ou a PR central [#1389](https://github.com/Airtrust-Org/airtrust/pull/1389).
- Toda matrícula `EM_ANDAMENTO` ou `NAO_INICIADO` não excluída do tenant 6 deve entrar, inclusive com curso ausente do catálogo. Ausência de ciclo, curso, edição verificável ou vínculo coerente é **exceção**, nunca descarte silencioso.
- O inventário inclui histórico de ciclos do **mesmo** `empresa_id` e `matricula_id` (status, %, nota/tentativas, datas e vínculo de qualificação); metadados de SCORM/CMI e bookmark continuam exclusivamente no arquivo cifrado.
- `catalog_current_scorm_sha256` e `catalog_current_scorm_version` descrevem o pacote **atualmente ativo no catálogo**; **não provam** qual edição foi consumida por matrícula/ciclo. Somente evidência verificável e crosswalk da fonte original poderão sustentar equivalência.
- Registros de aluno, IDs, histórico detalhado, CMI, `suspend_data` e plano individual **não** podem constar de comentários, PRs, artefatos plaintext, logs, Drive compartilhado ou anexos públicos.

## Pré-condições obrigatórias para T0

1. Verificar `main`/SHA exatos do workflow `.github/workflows/production-player3-enrollment-inventory-readonly.yml` e os oito gates oficiais do mesmo SHA.
2. Revisar o escopo imutável `WHERE m.empresa_id = 6`, o uso de **SELECT único**, a contagem independente `COUNT(*) OVER()`, o bloqueio cross-tenant no selador e a ausência de qualquer escrita D1/R2.
3. Confirmar, **somente por metadados**, os secrets do environment `production`: `CLOUDFLARE_D1_READONLY_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64`. Verificar fora do chat que o token restringe acesso ao D1 certo e tem somente permissão de leitura. **Nunca reutilizar** token de deploy, admin ou token com escrita; jamais expor valores.
4. Configurar no environment `production` **revisores obrigatórios humanos**, branch policy restritiva e aprovação apropriada do dispatch de leitura. Uma confirmação digitada no workflow **não substitui** a revisão humana. Se algum guard estiver ausente, **não disparar T0**.
5. Confirmar cofre corporativo autorizado, política de retenção, responsabilidade de acesso/decriptação, recuperação da chave AES-256 e destino dos artefatos cifrados antes de usar o workflow (retenção de Actions: **30 dias**).

**Estado verificado em 14/10/2026:** na consulta somente aos nomes de secrets, `CLOUDFLARE_ACCOUNT_ID` estava presente, mas o token D1 readonly e a chave AES-256 estavam **ausentes ou inacessíveis**. A configuração do environment `production` mostrou somente regra `branch_policy`, **zero revisores obrigatórios**. O workflow de inventário ainda possuía **zero runs**. Nenhuma matrícula foi extraída. Esses fatos são mutáveis e exigem nova verificação imediatamente antes da execução.

## Sequência operacional: T0, T1 e corte

1. **T0:** com todos os requisitos presentes, disparar o workflow manual governado na `main`, informando `expected_sha` exato e a confirmação do próprio workflow. Observar somente o resumo agregado, nome/hash SHA-256 do snapshot criptografado e sucesso do job. Verificar contagem; um snapshot vazio ou truncado falha fechado. Transferir cópia cifrada ao cofre corporativo antes da expiração do artefato.
2. **Entre T0 e T1:** alunos continuam estudando. O snapshot T0 **não** é teto de progresso. Não escrever crédito, resetar curso, matricular outra vez ou bloquear alunos durante preparação.
3. **T1:** imediatamente antes da troca controlada da edição, repetir coleta completa com o mesmo escopo e key-id recuperável. Capturar a versão do workflow, SHA/horário do banco e snapshot T1 sem vazar dados individuais. T1 antecede o cutover, mas não garante, sozinho, consistência de commit concorrente.
4. **Dry-run em executor aprovado e isolado:** obter **somente arquivos cifrados**, disponibilizar a chave de forma segura sem imprimi-la e executar:

   `node scripts/learning-factory/player3-reconcile-encrypted-inventories.mjs --t0 /caminho-privado/T0.enc.json --t1 /caminho-privado/T1.enc.json --out /caminho-privado/reconciliacao.enc.json`

   A saída stdout deve conter apenas contagens por classe; o arquivo de decisões individuais é novo, cifrado com AES-256-GCM e não deve ser armazenado no repositório. A execução falha quando a chave, identidade de chave, escopo ou ordem temporal diverge, e não sobrescreve arquivo existente.
5. **Reconciliação 1:1:** para cada matrícula/ciclo verificar identidade e curso, versão original e destino com hashes confiáveis, `matricula_updated_at`, `ciclo_updated_at`, `scorm_last_commit_at`, porcentagens em T0/T1, CMI e histórico. Uma matrícula que desapareceu do filtro ativo **pode ter concluído, sido cancelada ou modificada**; conferir fonte somente leitura de status terminal antes de qualquer crédito. Divergência, redução de %, edição trocada, histórico alterado e registro novo exigem análise individual protegida.
6. **Cutover por edição/tenant:** coordenar com Frente B janela curta que evite commits concorrentes da mesma matrícula; checar watermark final e, se houver mudança após T1, **recapturar e reconciliar**. Não aplicar T0/T1 por simples cronologia quando existir evidência mais recente.
7. **Aplicação futura (FRENTE B):** um eventual crédito de retomada exige decisão administrativa vinculada a matrícula/curso/ciclo/edição, revisão independente por dois responsáveis autorizados e RBAC efetivo no Worker, hash do snapshot, justificativa, idempotency key, verificação de timestamps e trilha de auditoria. Esta Frente C **não implementa writes nem certificados**.
8. **Pós-validação:** conferir contagem 1:1, nenhuma regressão de andamento, nenhuma matrícula recriada por corte, retomada real de unidades em casos 0/20/50/80/99%, comportamento sem bookmark, status de avaliações e histórico de certificados intacto. Reabrir via Safari/Chromium e preservar fallback compatível até aprovação integral.

## Semântica do plano individual cifrado

O reconciliador conserva `previous_reported_pct`, `current_reported_pct` e `historical_pct_to_preserve`, incluindo casos em que o valor T1 regrediu. Por segurança, **nenhum** deles concede automaticamente progresso no novo ciclo: é valor **histórico**, não prova de visitas, módulo, nota ou aprovação.

Cada intenção tem `decision_key` determinística para a mesma evidência, identidade de empresa/matrícula/ciclo, status de análise, referências da fonte e do pacote de catálogo, e flags `may_apply_automatically=false`, `modifies_enrollment=false`, `grants_exam_pass=false`, `grants_completion=false`, `grants_qualification=false`, `grants_certificate=false`.

Casos de mudança de ciclo, fonte ausente, conflito de catalogação, status terminal, porcentagem menor, timestamp obsoleto e mudança de edição vão sempre para revisão. Mudança do **pacote ativo no catálogo** não autentica a edição histórica de aluno. O crosswalk verdadeiro `source_edition_sha256 → target_edition_sha256` e unidade retomável dependem do mapeamento validado e do serviço de crédito auditado da PR #1389.

## Testes e garantia atual

Testes sintéticos executados: `python3 scripts/learning-factory/test_player3_readonly_inventory.py` (2/2 PASS); `node --test scripts/learning-factory/test_player3_inventory.mjs scripts/learning-factory/test_player3_reconcile_inventories.mjs` (20/20 PASS). Cobrem 20/50/80/99%, delta T0/T1, histórico de ciclos, cross-tenant, curso órfão, mudança de pacote, criptografia/integridade, adulteração, idempotência, execução CLI com arquivos cifrados, restrição de escrita 0600, rejeição de log de JSON inválido com estado privado e não certificação. Sintaxe do workflow YAML validada. A execução local **não** significa workflow aprovado, T0 coletado, migração feita ou prova real concluída.

**Próximo gate:** revisão e CI oficial desta PR; provisionamento e aprovação humana do environment, então T0 readonly pelo fluxo oficial. Integração de equivalência/cutover posterior exclusivamente com a Frente B na PR #1389, sem liberar produção sem autorização exata.
