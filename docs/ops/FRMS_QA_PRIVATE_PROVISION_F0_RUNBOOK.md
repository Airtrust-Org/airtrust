# F2 FRMS QA 999013 — governança de recursos Cloudflare privados

**Status deste documento: revisão e integração, não autorização de execução.**
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
A F0 precisa confirmar controle de reviewers do environment; se não
houver aprovação humana exigida, não disparar a operação até configurá-la.

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
- `phase=bucket` ou `phase=worker`.

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
