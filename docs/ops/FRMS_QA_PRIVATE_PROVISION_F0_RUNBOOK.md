# F2 FRMS QA 999013 — governança de recursos Cloudflare privados

**Status deste documento: revisão e integração, não autorização de execução.**

## Contrato de transação única implementado na PR #1724

O workflow `.github/workflows/staging-frms-qa-private-transaction.yml`
está definido **na branch draft**, mas **não foi executado** no staging e
não pode ser despachado até integração protegida em `main` e configuração
da autoridade independente. O workflow usa **dois jobs sequenciais** sob **um único mutex em
nível de workflow** (`airtrust-staging-mutations-and-scorm-qa`), com
`environment: staging` e `cancel-in-progress: false`. A separação foi
exigida por `guard-cloudflare-secret-contract` e NÃO altera o ratchet:
o primeiro job `frms-queue-apply` tem `id-token: write` e recebe
**somente** `CLOUDFLARE_WORKER_API_TOKEN`, para Queue push/pull/ack e
Time Travel GET. Ele termina com o marcador **não conclusivo**
`APPLY_REPORTED_PENDING_INDEPENDENT_READBACK`, mesmo após apply bem
sucedido. Esse marcador não significa aceite 4/4.

O segundo job `frms-d1-readonly-postcondition` depende de sucesso
comprovado do primeiro e recebe **somente**
`CLOUDFLARE_D1_MIGRATION_API_TOKEN` para o inspector SELECT-only
dos quatro casos QA. Apenas esse job pode emitir
`STAGING_FRMS_F0_4_OF_4_READONLY_VERIFIED` após leitura real D1.
O mutex permanece retido entre os jobs, sem liberar staging entre
apply e readback. Uma falha após Queue apply requer reconciliação, nunca
redispatch automático. Não há emissão de novos tokens ou instalação de
bearer Cloudflare no Worker.

O signatário **não é inventado pelo workflow**. O cliente
`ops/frms-qa-repair/external-approval-signer.mjs` precisa de uma
autoridade HTTPS independente, configurada através das variáveis
`FRMS_QA_SIGNER_ORIGIN` e `FRMS_QA_SIGNER_ORIGIN_SHA256`. A URL
deve ser um origin HTTPS exclusivo e ter hash SHA-256 exato. O
signatário recebe OIDC do GitHub com audience
`airtrust-frms-qa-signing-staging` nos endpoints fixos
`/api/frms-qa/v1/ready` e `/api/frms-qa/v1/sign`, devolvendo,
respectivamente, readiness com chave pinada e
`{manifest, signatureBase64, applyGrantId}`. O serviço deve validar
independentemente emissor, audience, repo, branch, SHA, job/run e escopo,
e exigir autorização administrativa de `apply` vinculada ao recibo.
O controller confirma a assinatura Ed25519 localmente.
A chave pública reside em `FRMS_QA_APPROVAL_PUBLIC_KEY_PEM`, com pin
`FRMS_QA_APPROVAL_PUBLIC_KEY_SHA256`. A chave **privada jamais
passa por GitHub Actions, Worker ou repositório**.

Antes da primeira Queue, exige metadata física de ambas as Queues:
uma consumer Worker privada, outra HTTP pull, ambas com retenção de
60–900 s. Após o prepare, uma falha ou resultado indeterminado não
autoriza replay. O apply precisa de novo grant F0, assinatura válida,
oito IDs CAS e readback real SELECT-only para 4/4. Um sucesso sintético
não é evidência de staging.

**Esta implementação não comprova existência do signatário**, das
variáveis/chaves Ed25519 ou dos grants de #776. Não despachar workflow
enquanto eles não existirem. Sem permissões físicas, interromper e
registrar bloqueio preciso, jamais preencher valores simulados.

## Atualização do contrato vigente — recovery proof sem bearer no Worker

A arquitetura de código da PR #1724 substituiu a antiga dependência de
`FRMS_QA_D1_READ_TOKEN` em runtime pelo `recoveryProof` de uso único,
originado por GET Time Travel no **runner protegido**, autenticado por HMAC
e vinculado ao SHA/tenant/DB/run/nonce/operação. O Worker privado verifica
o proof e mantém replay ledger no Durable Object. A obtenção da prova depende
de proveniência e identidade do runner, não apenas da posse de um HMAC.

O provisionador de Worker agora **rejeita `FRMS_QA_D1_READ_TOKEN` preenchido**
e jamais inclui `D1_READ_TOKEN` no `wrangler secret bulk`.
O secret `CLOUDFLARE_WORKER_API_TOKEN` existente pode ser usado somente no
runner efêmero, nos GETs fixos permitidos, sob grant exato; jamais no Worker.
A chave pública Ed25519 independente e seu pin continuam obrigatórios, assim
como o mutex contínuo, o transportador Queue/pull/ack com credenciais restritas,
a custódia segura do receipt e a assinatura separada do apply.

Trechos históricos abaixo que exigem `FRMS_QA_D1_READ_TOKEN` em runtime
descrevem a arquitetura **anterior** à #1724 e não devem ser executados
sobre a versão nova. Esta mudança de código ainda **não** equivale a
aprovação de segurança de rede nem implantação física. A PR permanece DRAFT;
não executar `prepare`, `apply` ou produção sem grants, recursos implantados,
signer independente e workflow que mantenha o mutex até readback 4/4.

Referência: issues #776 / #1426; #1476 é científica e permanece isolada.
Código-base: PR #1631 já integrada. Este processo não atualiza casos FRMS
nem libera operador, não aplica Schema V2, não mexe em D1 e não altera o LMS.

## Plano físico congelado

- Conta Cloudflare staging com D1 existente
  `airtrust-db-staging-baseline-20260701`,
  UUID `bf9963f4-eb12-439b-a830-20bbf577ac22`.
- Tenant exclusivamente sintético: `empresa_id=999013`, 14 funcionários QA.
- R2 novo: `airtrust-frms-qa-preimages-staging-private`, privativo,
  nenhum custom domain, r2.dev **disabled**, lifecycle `frms-qa/999013/`
  com `deleteObjectsTransition` Age `maxAge=86400` (24 horas).
  Contrato de leitura do Worker: preimagem AES-GCM expira em uma hora.
- Worker exclusivamente privado:
  `airtrust-frms-qa-repair-staging-private`, workers.dev=false,
  preview_urls=false, sem rotas, sem cron. Bindings: D1 `DB` (acima),
  R2 `PREIMAGES` (acima), Durable Object SQLite `COORDINATOR`,
  classe `FrmsQaCoordinator`, migration tag `frms-qa-private-v1`.
  O HTTP do próprio Worker devolve 404. Apenas cliente com service
  binding governado poderá usar RPC prepare/apply e precisa de caller HMAC.
- SHA-256 do manifesto Wrangler revisado:
  `971c077b7edbe397821726302d778e3083e47daa7c6981d5cbabedc7903e481c`.
- O reparo dos oito registros CAS exige separadamente digest
  `38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3`,
  nonce, recibo R2/preimage, bookmark D1 Time Travel, assinatura Ed25519
  independente e aprovação SHA/8 IDs/TTL; **não faz parte de provisioning**.

## Execução F0 com concessão exata por fase

`.github/workflows/staging-frms-qa-private-provision.yml` é um novo
`workflow_dispatch`, **somente após merge protegido na main**, com
`environment: staging`, mutex global
`airtrust-staging-mutations-and-scorm-qa`, `cancel-in-progress=false`.
Os oito gates oficiais do SHA corrente são exigidos no guard do workflow.
O environment `staging` pode manter deploys rotineiros sem `Required reviewers`.
A autorização para este provisionamento não depende dessa opção global:
o workflow exige um comentário administrativo específico, novo e não editado
na issue #776, validado por SHA, fase, recursos, identidade e prazo de 12h,
além dos oito gates e do mutex compartilhado. A aprovação manual do
environment é opcional e não substitui a concessão por fase. Nunca executar
uma operação de dados real apenas com aprovação do environment.

**Opção sem emissão de token adicional (exclusiva fase `bucket`):** o
`credential_mode=existing_staging_worker_bucket_only` reutiliza o secret
`CLOUDFLARE_WORKER_API_TOKEN` **apenas no job efêmero Actions de bucket**.
A concessão deve ser **V2** (`AIRTRUST_FRMS_QA_PROVISION_V2`), incluindo
`credential_mode`, SHA e recursos exatos. O workflow de `worker` rejeita
esse modo; o token jamais entra em secret/runtime do Worker privado.
É uma exceção controlada ao privilégio mínimo da *credencial*: as
operações permanecem limitadas pelo código às URLs e payloads fixos de
bucket staging, com grant administrativo vigente, oito gates e mutex.
A leitura R2 200 anterior não comprova permissão POST/PUT: um HTTP 403
no momento autorizado deve parar, nunca motivar outro token ou bypass.
A opção `dedicated` mantém o contrato V1 inalterado. Nenhuma operação
remota foi autorizada pelo simples registro desta alternativa.

**Opção V3 em análise — deploy do Worker sem novo token de deploy:**
`credential_mode=existing_staging_worker_deploy_only` reutiliza
`CLOUDFLARE_WORKER_API_TOKEN` **somente no job efêmero de implantação**
para fazer GET da configuração e publicar **exclusivamente** o Worker
`airtrust-frms-qa-repair-staging-private`. Exige uma concessão administrativa
**V3** (`AIRTRUST_FRMS_QA_PROVISION_V3`) nova, não editada e vinculada ao
SHA atual, à fase `worker`, aos recursos privados fixos e ao prazo de 12h.
O verificador rejeita V3 na fase `bucket`, V2 na fase `worker`, mudança
não autorizada de configuração e grants V1/V2 reaproveitados. O token amplo
permanece apenas no runner de Actions; **não** é gravado em secret/runtime
nem substitui `FRMS_QA_D1_READ_TOKEN`. A publicação continua bloqueada se
não houver a credencial D1 read-only de runtime, autoridade pública Ed25519
independente, bucket privado comprovado e concessão V3 específica.
Esta exceção amplia temporariamente a autoridade da credencial no *runner*
e exige revisão explícita de risco; não equivale a credencial de deploy
com escopo mínimo e **não constitui autorização para despachar a fase**.

Cada fase precisa de **comentário novo e não editado** por administrador
autorizado na issue #776, com idade máxima de 12h. O dispatcher também
precisa ser administrador. Não é permitido reaproveitar a concessão de
uma fase para a outra. O comentário começa na **primeira linha**:

```text
AIRTRUST_FRMS_QA_PROVISION_V1
{ JSON exato criado pelo contrato provisionPlan(...), revisado pela F0 }
```

O JSON tem chaves fechadas: schema, repository, issue, frms_issue,
release_sha, phase, tenant_id, d1_uuid, d1_name, r2_bucket, r2_prefix,
r2_lifecycle_max_age_seconds, r2_public_access, worker,
wrangler_config_sha256, global_mutex, private_runtime_only, rollout,
cleanup. A F0 deve derivar a instância via `provisionPlan` ou testes, e
conferir manualmente o SHA e recursos; **não** copiar um exemplo como
autorização. Nunca incluir token, chave ou assinatura privada em input,
issue ou log.

Inputs por dispatch:
- `confirmation=AIRTRUST_FRMS_QA_PRIVATE_STAGING_PROVISION`;
- `expected_main_sha=<SHA EXATO DA MAIN APÓS MERGE>`;
- `grant_id=<ID REAL DO COMENTÁRIO F0 EM #776>`;
- `phase=bucket` ou `phase=worker`;
- `credential_mode=dedicated` (V1), ou
  `credential_mode=existing_staging_worker_bucket_only` (somente bucket, V2).
- `credential_mode=existing_staging_worker_deploy_only` (somente worker, V3; exige revisão de risco e grant novo).

A operação `bucket` vem primeiro, isolada da implantação do Worker.
O provisionador verifica D1 existente com GET e bucket privado. Se o
bucket **já existe**, faz somente leitura e **não** altera a política,
mesmo que incompleta. Se ele não existe (HTTP 404 comprovado), cria
somente o bucket fixo, desabilita r2.dev, aplica regra de exclusão
restrita ao prefixo e faz nova leitura física via
`verify-readiness.mjs`. A ausência de acesso, regra conflitante ou
erro após criação exige investigação F0: **não há delete automático**,
nem repetição cega de bucket creation.

A fase `worker` usa nova concessão F0. Primeiro comprova o bucket,
lifecycle e D1 existentes com token de leitura mínima. Só então
realiza `wrangler deploy` do Worker privado pinado e
`wrangler secret bulk` via stdin protegido. Após implantação
confere apenas os **nomes** dos segredos. Segredos nunca entram em
prints ou artefatos; a variável `PRIVATE_STORAGE_VERIFIED` só é
fornecida depois de uma inspeção física de GET bem-sucedida.

## Matriz de permissões independentes

| Environment secret de staging | Permissão esperada | Proibido |
|---|---|---|
| `CLOUDFLARE_FRMS_QA_READ_API_TOKEN` | Leitura de metadados D1/R2, domínios e lifecycle, conta staging | D1 SQL Write, Worker deploy, R2 object writes |
| `CLOUDFLARE_FRMS_QA_R2_PROVISION_API_TOKEN` | Provisionamento/configuração R2 na conta staging; API restringida pelo nome do bucket e por grant | D1 ou Workers Scripts Write, produção |
| `CLOUDFLARE_FRMS_QA_WORKER_DEPLOY_API_TOKEN` | Worker Scripts Write estritamente para o Worker privado da conta staging | Pages, produção, D1 SQL writes e R2 object writes |
| `FRMS_QA_D1_READ_TOKEN` | Worker runtime — GET D1 Time Travel bookmark do banco staging pinado | D1 Write, Time Travel restore |
| `FRMS_QA_CALLER_KEY_HEX`, `FRMS_QA_PREIMAGE_KEY_HEX` | Segredos geridos externamente e distintos (32 bytes cada) | Git, logs e inputs workflow |
| `FRMS_QA_APPROVAL_PUBLIC_KEY_PEM` | Chave pública Ed25519 cuja impressão digital DER é pinada no runtime | Chave privada de assinatura no Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Identificador da conta staging verificada | Qualquer outra conta |

O token R2 de criação pode requerer permissão de R2 no nível da conta,
porque o bucket ainda não existe. F0 deve limitar conta, API, duração
e armazenamento do token ao mínimo viável; **não** usar token de
produção ou migrator D1. A existência dos nomes de secrets não
comprova sua emissão/escopo.

**Exceção estritamente diagnóstica e sem token novo (23/10/2026):**
o workflow `staging-frms-qa-private-readiness.yml` usa o secret **já
cadastrado** `CLOUDFLARE_WORKER_API_TOKEN` exclusivamente no passo de
atestado remoto GET-only, no runner efêmero de staging. Esse acesso foi
comprovado em #39892777613 para metadata D1, listagem R2 e bookmark,
mas não autoriza gravação e não prova que o bucket FRMS exista.
Não copiar, renomear ou injetar esse token no Worker privado, nem usá-lo
como `FRMS_QA_D1_READ_TOKEN` de runtime. O workflow de **provisionamento**
continua exigindo grants por fase e tokens com escopo independente;
a exceção não o modifica. Um `GET_404` do bucket mantém readiness FAIL
closed, não permite criar ou reutilizar bucket compartilhado.


## Auditoria opcional das políticas dos tokens já existentes — GET-only

O workflow `.github/workflows/staging-frms-existing-token-capabilities.yml`
é estritamente diagnóstico. Além dos GETs de D1/R2, para os secrets staging
`CLOUDFLARE_WORKER_API_TOKEN` e `CLOUDFLARE_D1_BACKUP_API_TOKEN`, o
script opcional `probe-existing-token-policy.mjs` consulta somente
`GET /accounts/{account}/tokens/verify` ou `GET /user/tokens/verify` e
`GET .../tokens/{id}`, quando os privilégios de leitura de token permitem.
Apenas o veredicto sanitizado aparece nos logs: **jamais** token, ID,
políticas, e-mail ou nome. Cloudflare pode responder 403 ao GET de detalhes:
nesse caso o escopo fica **não atestado**, sem tentativa de alterar as
permissões ou gerar tokens novos. **Os resultados não autorizam deploy nem uso no runtime.**

Um candidato de leitura requer exclusivamente `D1 Read`, um único
recurso de conta explícito e token ativo. Mesmo o veredicto
`D1_READ_ONLY_CANDIDATE_REQUIRES_INDEPENDENT_ATTESTATION` é somente
indício para análise externa, não comprova isolamento no banco único,
não autoriza copiar bearer para o Worker, não substitui assinatura Ed25519,
nem concede prepare/apply. Mistura de permissões, outro recurso, erro,
redirect ou API 403 falham fechado. Todos os testes negativos usam tokens
sintéticos e fetcher em memória; nenhum token real é exibido.

## Comprovantes físicos e sequência posterior

1. F0 integra a PR de infraestrutura somente com 8/8 checks, revisão,
   branch protection, environment protegido, snapshot do SHA e estado
   do mutex. Este PR não deve ser mesclado apenas para contornar token.
2. Publica grant `bucket` e executa a primeira fase isolada, verifica
   GET D1, bucket, domains managed/custom e lifecycle pelo workflow
   `staging-frms-qa-private-readiness.yml`, sem SQL remoto.
3. Publica grant `worker`, instala secrets restritos e faz o segundo
   dispatch. Confere Workers deployment/version/bindings DO e que HTTP
   não expõe aplicação; NÃO adicionar rota administrativa.
4. Integra serviço de caller privado no runner confiável separado,
   atribui chave HMAC e atesta binding RBAC; nenhuma chamada RPC pode
   vir de cliente externo ou de origem HTTP.
5. F0 autoriza independentemente prepare com lock, preimage AES-GCM,
   readback R2, Time Travel e recibo/nonce; revalida oito registros
   históricos. Emite grant Ed25519 de <=15min para os oito IDs exatos;
   aplica único D1.batch transacional, faz SELECT-only 4/4 e
   pós-reads de outros registros para garantir nenhum cross-tenant.
6. Prepara validação autenticada de Operação → Casos → Escalas →
   Manutenção → EVD → Relatórios; a atualização de tratamento/eficácia
   requer outra concessão. A issue #1476 não pode promover pesos,
   risco fisiológico ou metodologia científica sem revisão independente.
7. Se houve deploy parcial ou diferença D1, congelar e registrar
   recursos e digests. Nenhum restore D1 compartilhado sem autorização
   própria; compensação por CAS inverso também tem grant próprio.
   R2 efêmero tem política de leitura 1h e exclusão física <=24h,
   cuja efetivação deve ser verificada por API.

**Situação de aceite na preparação:** última validação física 0/4; o
provisionador não tem caller de reparo, não assina grants, não gera
casos ou prontuários, não executa 4/4 e não publica produção.
