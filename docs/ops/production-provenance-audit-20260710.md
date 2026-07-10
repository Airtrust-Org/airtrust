# Auditoria de Proveniência de Produção (AirTrust)

**Data:** 10 de Julho de 2026  
**Status:** NO-GO  

## Resumo Executivo
A auditoria identificou que os artefatos servidos atualmente nos domínios públicos de produção (`airtrust.online` e `api.airtrust.online`) **não correspondem** ao último fluxo oficial aprovado pelo GitHub Actions (Run `28968594553`). Há indícios compatíveis com publicação fora da trilha oficial para o frontend (Pages), e evidência direta de deploy via CLI (fora de CI/CD) para o backend (Worker). Devido à impossibilidade de listar os deployments do Cloudflare Pages (falta de permissão), o baseline exato do ambiente de frontend encontra-se **indeterminado**, enquanto o do backend está **parcialmente determinado**. Recomenda-se um NO-GO para qualquer novo deploy de produção até a repavimentação segura do ambiente.

## Fatos Comprovados
- O repositório está síncrono (`HEAD == origin/main`) com *working tree* limpa, no SHA `e4f8f0b5842de02e61cd5563a734d52027004865`.
- O domínio público não corresponde ao último SHA oficial conhecido.
- O build-version público informa `<meta name="build-version" content="67c8ea49" />`.
- O run `28968594553` usou o SHA `b31dff65` e produziu a versão `2026-07-08T19:07:06Z-b31dff6`, disponível apenas na URL de preview da respectiva *deployment*.
- A API pública retorna `version=dev-local` e `deploymentId=dev-local`.
- O token/credencial disponível possui acesso de leitura apenas para Workers e Zones, não permitindo listar recursos do Pages (erro 10000).
- Nenhum deploy foi executado durante a auditoria.
- A rota `api.airtrust.online/*` aponta corretamente para o script `airtrust-api-production`.
- A metadata de variáveis do Worker no ar contém literalmente `APP_VERSION="managed-by-script"`, acionando o fallback `dev-local` no código.

## Hipóteses Não Comprovadas
- O deploy público no domínio root originou-se obrigatoriamente da *branch* `main`.
- O backend e frontend atuais no ar representam a mesma versão síncrona.
- A divergência do frontend indica conclusivamente um deploy efetuado manualmente por um desenvolvedor no terminal local.

## Matriz de Evidências

| Evidência Observada | Inferência Possível | Estado de Comprovação |
|---------------------|---------------------|-----------------------|
| `build-version="67c8ea49"` na URL pública | Há indícios compatíveis com publicação fora da trilha oficial, mas a origem não foi comprovada | **Não Comprovado** |
| Run `28968594553` (SHA `b31dff65`) não reflete no domínio principal | A URL pública está amarrada a outra branch ou a um deployment específico mais antigo no Cloudflare Pages | **Não Comprovado** |
| API exibe `version="dev-local"` | O valor resulta de metadata não injetada corretamente no deployment | **Comprovado** |
| Worker deployment `bab6ed51...` origin="Unknown (deployment)" | Deployment ocorreu fora do workflow oficial do Github Actions | **Comprovado** |
| Hashes de JS diferentes entre produção e build local | Proveniência operacional não comprovada | **Não Comprovado** |

## Mapa Pages
- **Account ID:** Não recuperado (Erro 10000)
- **Projeto Pages:** `airtrust` (conhecido pelos workflows, mas não verificado via API)
- **Production Branch:** Não averiguada
- **Custom Domains:** `airtrust.online` aponta via DNS para infraestrutura Cloudflare, mas o mapeamento exato do projeto não pôde ser listado. `www.airtrust.online` retorna erro 522 (possível conflito ou ausência de origem).
- **Deployments / ID Atual / URL / Origem:** NÃO COMPROVADA (A origem do deployment permanece indeterminada sem metadata read-only do Cloudflare)

## Mapa Worker
- **Script:** `airtrust-api-production`
- **Route:** `api.airtrust.online/*`
- **Deployment ID Atual:** `bab6ed51-8a4f-4b50-a566-90c6b6791e87`
- **Data do Deployment:** `2026-07-09T21:43:05.030Z`
- **Origem / Source:** `Unknown (deployment)` via CLI local
- **Variáveis Comprovadas:** `APP_VERSION` = `"managed-by-script"`
- **Implementação de `/api/version`:** A função `getCanonicalVersion` filtra `managed-by-script` e cai no fallback padrão `dev-local`.
- **Último deploy via Actions:** O último CI (run 28968594553) pulou o Worker (input `deploy_worker` não fornecido).
- **Classificação:** [E] Deployment fora do workflow oficial comprovado por metadata. O script é o correto, e a route está associada adequadamente.

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
Injetado originalmente na compilação do Vite (`APP_VERSION`) via regex no HTML por `scripts/stamp-build-version.sh`. Como scripts de build via CI garantem o uso do timestamp, a presença exclusiva do hash `67c8ea49` sugere uso do fallback para `$(git rev-parse --short HEAD)`, mas a origem exata do artefato não pôde ser comprovada via API.

## Origem do `dev-local`
Localizado na função `getCanonicalVersion` em `src/routes/system.ts`. A causa foi **comprovada**: a variável `APP_VERSION` foi carregada literalmente como `managed-by-script` no deployment local (Worker ID `bab6ed51...`), sendo filtrada pela função e assumindo o valor de fallback.

## Credenciais Read-Only Faltantes
A conta do Cloudflare permitiu acesso a `Workers` e `Zones`, mas o endpoint de Pages retornou erro 10000. São necessárias permissões read-only suficientes para consultar Pages e confirmar seu roteamento interno. Escopos sugeridos incluem `#pages:read`.

## Baseline de Rollback

**Pages:**
- **Status:** INDETERMINADO
- **Motivo:** Falta de permissões de leitura. O deployment ID, timestamp e origem associados à versão no ar (`67c8ea49`) não podem ser listados.

**Worker:**
- **Status:** PARCIALMENTE DETERMINADO
- **SHA:** Não disponível (indeterminado)
- **Script Name:** `airtrust-api-production`
- **Deployment ID:** `bab6ed51-8a4f-4b50-a566-90c6b6791e87`
- **Route / Custom Domain:** `api.airtrust.online/*`
- **Timestamp:** `2026-07-09T21:43:05.030Z`
- **Origem:** `Unknown (deployment)` via CLI local
- **Metadata de Versão:** `APP_VERSION="managed-by-script"`

## Classificação de Risco e Decisão
**Risco:** CRÍTICO. 
**Decisão Final:** NO-GO para qualquer novo deploy de produção.

A justificativa do NO-GO baseia-se em:
- proveniência atual do Pages não comprovada;
- rollback de Pages indeterminado e Worker sem vínculo a SHA;
- ausência de smoke autenticado;
- ausência de preview/staging Pages devidamente roteado;
- metadata da API não confiável.

Continuam permitidas auditorias read-only, obtenção de acesso read-only, correção documental e preparação de patch de CI/CD sem deploy.
