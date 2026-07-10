# Auditoria de Proveniência de Produção (AirTrust)

**Data:** 10 de Julho de 2026  
**Status:** NO-GO Absoluto  

## Resumo Executivo
A auditoria identificou que os artefatos servidos atualmente nos domínios públicos de produção (`airtrust.online` e `api.airtrust.online`) **não correspondem** ao último fluxo oficial aprovado pelo GitHub Actions (Run `28968594553`). A divergência confirma que operações manuais e locais de implantação foram realizadas por fora do pipeline de CI/CD. Devido à impossibilidade de listar os deployments da Cloudflare (falta de permissão) e ao não batimento criptográfico dos hashes dos assets web, o baseline exato do ambiente de produção encontra-se **indeterminado**. Recomenda-se um NO-GO para qualquer novo release até a repavimentação segura do ambiente.

## Fatos Comprovados
- O repositório está síncrono (`HEAD == origin/main`) com *working tree* limpa, no SHA `907febc68f473ff4b52e5f91582bb91411fb334d`.
- O domínio público exibe `<meta name="build-version" content="67c8ea49" />`, que é diferente do formato gerado pelo CI (`{timestamp}-{sha}`).
- O último workflow de deploy executado no GitHub Actions (`28968594553`) produziu a versão `2026-07-08T19:07:06Z-b31dff6`, disponível apenas na URL de preview da respectiva *deployment*.
- A API pública retorna `{"version":"dev-local"}` e o último run do workflow **ignorou/pulou** a etapa de deploy do Worker.
- Os identificadores de chunks de JavaScript na produção (`index-BdiA2otB.js`) não coincidem com builds locais de SHAs recentes, como `67c8ea49` e `b31dff65`.
- A CLI do Cloudflare não possui as permissões necessárias para auditoria programática do projeto Pages.

## Hipóteses Não Comprovadas
- O deploy público no domínio root originou-se obrigatoriamente da *branch* `main` (não provado devido à incompatibilidade de hashes).
- O backend e frontend atuais no ar representam a mesma versão síncrona.

## Matriz de Evidências

| Evidência Observada | Inferência Possível | Estado de Comprovação |
|---------------------|---------------------|-----------------------|
| `build-version="67c8ea49"` na URL pública | Deploy foi disparado via script local (fallback sem APP_VERSION customizado) | **Comprovado** (O CI sempre insere timestamp) |
| Run `28968594553` (SHA `b31dff65`) não reflete no domínio principal | A URL pública está amarrada a outra branch ou a um deployment específico mais antigo no Cloudflare Pages | **Comprovado** |
| API exibe `version="dev-local"` | Placeholder do `wrangler.production.toml` não foi substituído durante o último deploy (que foi manual) | **Comprovado** |
| Erro Cloudflare 10000 | Token do auditor carece de permissão de leitura | **Comprovado** |
| Hashes de JS diferentes entre produção e build local | Artefato em produção provém de outra base de código/branch ou sofre de não determinismo de build | **Parcialmente Comprovado** (Incompatibilidade exata detectada) |

## Mapa Pages
- **Account ID:** Não recuperado (Erro 10000)
- **Projeto Pages:** `airtrust` (conhecido pelos workflows)
- **Production Branch:** Não averiguada (provavelmente diferente de `--branch=production` usada pelo Actions)
- **Custom Domains:** `airtrust.online`
- **Deployments / ID Atual / URL / Origem:** NÃO COMPROVADA (Falta de permissão de leitura)

## Mapa Worker
- **Implementação de `/api/version`:** A função `getCanonicalVersion` filtra `managed-by-script` e cai no fallback padrão `dev-local`.
- **Último deploy:** O último CI (run 28968594553) pulou o Worker (input `deploy_worker` não fornecido).
- **Classificação:** [D] Deployment manual comprovado (bypassing the script variable injections).

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
- **Conclusão:** Não há reprodução byte-a-byte do hash do Vite. Devido a isso, não podemos inferir com exatidão que o deploy se origina matematicamente do SHA 67c8ea49 no estado atual deste repositório local.

## Origem do `build-version`
Injetado originalmente na compilação do Vite (`APP_VERSION`) via regex no HTML por `scripts/stamp-build-version.sh`. Como scripts de build via CI garantem o uso do timestamp, a presença exclusiva do hash `67c8ea49` significa que ocorreu fallback para `$(git rev-parse --short HEAD)`, usual em execuções de desenvolvedores no terminal local.

## Origem do `dev-local`
Localizado na função `getCanonicalVersion` em `src/routes/system.ts`. A string placeholder no repositório para o Cloudflare (`managed-by-script`) nunca foi devidamente atualizada com a variável de ambiente verdadeira durante o empacotamento, indicando que a CLI local `wrangler deploy` foi usada para a API sem passar pelo script wrapper correto (`deploy-worker-only.sh`).

## Credenciais Read-Only Faltantes
A conta do Cloudflare exige no mínimo escopos de:
- `User -> Memberships -> Read`
- `Account -> Pages -> Read`
- `Account -> Workers Scripts -> Read`

## Baseline de Rollback
- **Pages:** INDETERMINADO
- **Worker:** INDETERMINADO

## Classificação de Risco e Decisão
**Risco:** CRÍTICO. Devido aos ambientes estarem rodando códigos não identificados positivamente e builds manuais locais, um deploy convencional poderia sobrescrever um estado de negócio do qual não há registro em *branch* oficial ou rastreabilidade garantida.
**Decisão Final:** NO-GO. Nenhuma tentativa de sobrescrita de infraestrutura deverá ocorrer sem o consentimento administrativo pleno e reestabilização da proveniência real.
