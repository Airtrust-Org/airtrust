# Auditoria de Proveniência de Produção (AirTrust)

**Data:** 10 de Julho de 2026  
**Status:** NO-GO  

## Resumo Executivo
A auditoria identificou que os artefatos servidos atualmente nos domínios públicos de produção (`airtrust.online` e `api.airtrust.online`) **não correspondem** ao último fluxo oficial aprovado pelo GitHub Actions (Run `28968594553`). Há indícios compatíveis com publicação fora da trilha oficial, mas a origem não foi comprovada. Devido à impossibilidade de listar os deployments da Cloudflare (falta de permissão) e ao não batimento criptográfico dos hashes dos assets web, o baseline exato do ambiente de produção encontra-se **indeterminado**. Recomenda-se um NO-GO para qualquer novo deploy de produção até a repavimentação segura do ambiente.

## Fatos Comprovados
- O repositório está síncrono (`HEAD == origin/main`) com *working tree* limpa, no SHA `907febc68f473ff4b52e5f91582bb91411fb334d`.
- O domínio público não corresponde ao último SHA oficial conhecido.
- O build-version público informa `<meta name="build-version" content="67c8ea49" />`.
- O run `28968594553` usou o SHA `b31dff65` e produziu a versão `2026-07-08T19:07:06Z-b31dff6`, disponível apenas na URL de preview da respectiva *deployment*.
- A API pública retorna `version=dev-local` e `deploymentId=dev-local`.
- O token/credencial disponível não permitiu listar os recursos Cloudflare (erro 10000).
- Nenhum deploy foi executado durante a auditoria.
- O baseline de rollback não pôde ser estabelecido.

## Hipóteses Não Comprovadas
- O deploy público no domínio root originou-se obrigatoriamente da *branch* `main`.
- O backend e frontend atuais no ar representam a mesma versão síncrona.
- A divergência indica conclusivamente um deploy efetuado manualmente por um desenvolvedor no terminal local.

## Matriz de Evidências

| Evidência Observada | Inferência Possível | Estado de Comprovação |
|---------------------|---------------------|-----------------------|
| `build-version="67c8ea49"` na URL pública | Há indícios compatíveis com publicação fora da trilha oficial, mas a origem não foi comprovada | **Não Comprovado** |
| Run `28968594553` (SHA `b31dff65`) não reflete no domínio principal | A URL pública está amarrada a outra branch ou a um deployment específico mais antigo no Cloudflare Pages | **Não Comprovado** |
| API exibe `version="dev-local"` | O valor dev-local pode resultar de metadata não injetada, deployment diferente, route conflitante ou fallback de configuração | **Não Comprovado** |
| Erro Cloudflare 10000 | Token do auditor carece de permissão de leitura | **Comprovado** |
| Hashes de JS diferentes entre produção e build local | Proveniência operacional não comprovada | **Não Comprovado** |

## Mapa Pages
- **Account ID:** Não recuperado (Erro 10000)
- **Projeto Pages:** `airtrust` (conhecido pelos workflows)
- **Production Branch:** Não averiguada (provavelmente diferente de `--branch=production` usada pelo Actions)
- **Custom Domains:** `airtrust.online`
- **Deployments / ID Atual / URL / Origem:** NÃO COMPROVADA (A origem do deployment permanece indeterminada sem metadata read-only do Cloudflare)

## Mapa Worker
- **Implementação de `/api/version`:** A função `getCanonicalVersion` filtra `managed-by-script` e cai no fallback padrão `dev-local`.
- **Último deploy:** O último CI (run 28968594553) pulou o Worker (input `deploy_worker` não fornecido).
- **Classificação:** [E] Causa não comprovada (o valor `dev-local` pode resultar de metadata não injetada, deployment diferente, route conflitante ou fallback de configuração).

## Análise do Run 28968594553
- **Inputs:** `deploy_pages=true`, `deploy_worker=false` e inputs implícitos exigidos para o disparo manual.
- **Jobs Executados:** `Release Guard`, `Prepare Release Artifacts`, `Deploy Pages`.
- **Projeto Pages Publicado:** `airtrust`.
- **URL Retornada:** `https://21e89450.airtrust.pages.dev`
- **Branch Utilizada:** `production` (conforme `--branch=production` do wrangler)
- **SHA Injetado:** `2026-07-08T19:07:06Z-b31dff6`.

## Asset Comparison
- **Arquivos Públicos:** `index-BdiA2otB.js`, `router-DMtx_Rus.js`, `query-ByXf7y1j.js`
- **Hashes Locais (67c8ea49):** `index-ZukIzxAN.js`, `router-Cp-y4_4_.js`, `query-WFsfiK7o.js`
- **Conclusão:** Não há reprodução byte-a-byte do hash do Vite. Devido a isso, não podemos inferir com exatidão que o deploy se origina matematicamente do SHA 67c8ea49 no estado atual deste repositório local. A proveniência operacional não está comprovada.

## Origem do `build-version`
Injetado originalmente na compilação do Vite (`APP_VERSION`) via regex no HTML por `scripts/stamp-build-version.sh`. Como scripts de build via CI garantem o uso do timestamp, a presença exclusiva do hash `67c8ea49` sugere uso do fallback para `$(git rev-parse --short HEAD)`, mas a origem não foi comprovada.

## Origem do `dev-local`
Localizado na função `getCanonicalVersion` em `src/routes/system.ts`. O valor `dev-local` pode resultar de metadata não injetada, deployment diferente, route conflitante ou fallback de configuração.

## Credenciais Read-Only Faltantes
A conta do Cloudflare retornou erro 10000. São necessárias permissões read-only suficientes para consultar conta, Pages, Workers e DNS/custom domains (escopos exatos dependem de validação na documentação ou no painel).

## Baseline de Rollback
- **Pages:** INDETERMINADO
- **Worker:** INDETERMINADO

## Classificação de Risco e Decisão
**Risco:** CRÍTICO. 
**Decisão Final:** NO-GO para qualquer novo deploy de produção.

A justificativa do NO-GO baseia-se em:
- proveniência atual não comprovada;
- rollback indeterminado;
- ausência de smoke autenticado;
- ausência de preview/staging Pages;
- metadata da API não confiável.

Continuam permitidas auditorias read-only, obtenção de acesso read-only, correção documental e preparação de patch de CI/CD sem deploy.
