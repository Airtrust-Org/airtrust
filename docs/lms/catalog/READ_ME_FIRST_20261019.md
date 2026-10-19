# EAD — inventário de custódia e decisões (Frente 6)

**Compilado em:** 19/10/2026, `main=83c821cea8f25c8a4edffec8d7cf0d20c86989aa`. **Natureza:** consolidação versionada de evidência histórica *read-only*, **não** uma leitura atual de D1/R2 nem atestado de publicação. **Escopo físico do run: tenant `empresa_id=6`**, fixado no workflow e validado no contexto autenticado pela API.

## Evidência, fronteira e classificação
- Baseline física: [workflow 39052399708](https://github.com/Airtrust-Org/airtrust/actions/runs/39052399708), runtime de produção então `c3ea9b69e7f38d379a404fa85ca13e9615253f3e`, artefatos Chromium `12109071205` e WebKit `12108709121`; **50 cursos, 25 PASS de prévia / 22 INCONCLUSIVE / 3 FAIL**, idênticos nos browsers. Não repetir a rodada inteira sem delta de ZIP/runtime/runner.
- **22 fontes originais:** 674 unidades, 63 avaliações, 570 questões e 90 cenários no relatório de autoria. **19/22 SHA idênticos ao pacote ativo auditado** (17 PASS de prévia, 2 INCONCLUSIVE: #28 e #58). **3 sem identidade exata** na amostra (#02 Gerenciamento de Resíduos RC4.1, #09 SGSO M10.4, #10 CRM Gestores). **0/22 com assinatura pedagógica** e 0 novas edições publicadas/homologadas.
- Evidência incremental NÃO reescreve a baseline: #7 Offshore e #28 SGSO M10.7 chegaram a `PASS` de prévia em ambos browsers posteriormente; #8 PBN segue inconclusivo. PASS de prévia não constitui QA de matrícula, qualificação ou PDF.
- Há 22 cursos antigos na matriz de fontes e 50 IDs de cursos no inventário de navegador: **universos diferentes**. Não fazer merge de registros por título aproximado nem inferir que um número da lista 01–22 é o ID LMS.
- O arquivo [CATALOG_READONLY_BASELINE_20261017.json](./CATALOG_READONLY_BASELINE_20261017.json) registra por ID auditado o **título e formato coletados diretamente do artefato original**, SHA, status/manifesto observado e 22 fontes, sem gabaritos, ZIP privado, CMI ou PII. `NOT_VERIFIED` é uma pendência factual deliberada (versão/edição publicada, proprietário da fonte, hash R2 atual, assinatura, crosswalk de fonte nominal). O tenant histórico **6** foi confirmado pelo workflow, mas não prova qual seja o pacote ativo em produção hoje.

Os 50 títulos de catálogo e tipos foram confrontados 1:1 por ID, status e ZIP SHA com o artefato original Chromium do workflow; a existência do `manifest.ok` nesse resultado reflete **somente a prévia**, nunca atesta a edição publicada atual.

## Delta de versão e publicação — 06/10 vs 17/10 (somente leitura)

O [inventário de catálogo de 06/10, run #37529233842](https://github.com/Airtrust-Org/airtrust/actions/runs/37529233842) identificou **45 cursos publicados e ativos** no tenant 6 e registrou `version_tag`, versão SCORM, flag de publicação, launch e ZIP ativo. No [run de prévia de 17/10](https://github.com/Airtrust-Org/airtrust/actions/runs/39052399708) foram auditados **50 cursos**. A comparação **por ID e SHA**, nunca por nomes próximos, encontrou:

- **38** com SHA ativo igual nos dois snapshots — `version_tag` de 06/10 preservado apenas como metadado **histórico**;
- **2 com ZIP alterado:** **#21 MGO** de `69dd17e3...` para `1672bfb2...` e **#41 CFIT** de `e2920a81...` para `8c15a739...`; nenhum deles herda automaticamente a identificação editorial da versão anterior;
- **3 sem SHA comparável:** #22 PPTX, #23 SCORM legado e #69 LGPD;
- **7 presentes no run de 17/10 e ausentes da lista antiga de 45:** #49, #60, #61, #64, #71, #72 e #73;
- **2 ativos/publicados no run de 06/10, mas ausentes da lista de 50 auditada em 17/10:** **#13 e #14**. **A ausência na auditoria posterior não comprova retirada, exclusão, arquivamento ou perda de ZIP**; conferir catálogo/edição live por leitura autorizada.

Os `version_tag` observados no dia 06/10 estão no JSON com data e SHA comparador. São metadados técnicos, **não comprovação de revisão editorial, edição atual publicada ou autorização de certificação**. Para #21/#41, a mudança de pacote exige recuperar decisão de versão/crosswalk antes de creditar continuidade. Nenhum mapeamento do catálogo foi modificado.

## Decisão operacional por caso
| Casos | Evidência atual | Decisão | Responsável/ação |
| --- | --- | --- | --- |
| #23 Regulação ANAC | pacote/launch legado; sem edição ativa versionada e manifesto certificável | **Fonte/aprovação necessária** | Autor pedagógico/Gerência recuperar ZIP original, syllabus/avaliação, revisão ANAC, hash e autorização |
| #49 Auditoria Comportamental — Designados | `NO_ACTIVE_SCORM_PACKAGE`; PRC-SGI-017 Rev06 é procedimento candidato, não pacote | **Fonte/aprovação necessária** | QSMS/Gerência confirmar currículo de Designados, audiência, avaliações, licença e edição |
| #69 LGPD geral | `NO_ACTIVE_SCORM_PACKAGE`; documentos DPO/Contratos não equivalem ao curso geral | **Fonte/aprovação necessária** | DPO/Gerência aprovar matriz, autoria, avaliação e ZIP legítimo |
| 22 originais | 19 identidades SHA e 3 desencontros; 22/22 sem aceite | **Fonte/aprovação necessária** | Titular/revisor autoral assinar modalidade, mínimo, retentativas, 63 avaliações/570 questões, cenário formativo vs prova; LOSA e CRM Gestores explícitos |
| 25 PASS no run inicial | somente prévia SCORM | **Prova técnica pendente** | Frente certificadora executar matrícula/ciclo, CMI Worker/D1, Chromium/WebKit, reopen, qualificação/PDF por ZIP |
| 22 INCONCLUSIVE no run inicial | causas agrupadas (quiz, checklist, vídeo, runner, conteúdo ou PPTX) | **Prova ou correção técnica pendente** | Reusar retestes focados e separar `PLAYER_FIX` de `PACKAGE_FIX` apenas após evidência |
| #15 / #41 | hashes exatos em custódia privada; QA local, **UNCERTIFIED** | **Prova e assinatura pendentes** | Encaminhamento à PR #1422, sem duplicar o emissor e sem aprovar pacote automaticamente |

**LOSA:** modalidade de 7 avaliações/70 questões ainda sem decisão certificadora. **CRM Gestores:** 4 blocos/40 questões potencialmente formativos, nota mínima indefinida. Não fixar 80% ou inserir questões como política aprovada. O teste técnico não homologa ambas.

## Contrato antes de declarar "certificado e publicável"
Para cada `(tenant, course_id, published_edition, published_package_version, ZIP_SHA256)`, exigir: autor/titular e fonte íntegra versionada; crosswalk editorial original→edição; manifesto/conclusão válida; aprovação humana assinada; teste técnico de pacote; certificação funcional **independente** por hash, Chromium+WebKit, matrícula/ciclo/CMI, avaliação legítima, retomada, reabertura, qualificação/PDF; CI, staging, autorização específica de eventual publicação e pós-validação. **Nenhuma linha deste inventário atende hoje a todos esses requisitos.**

Estados finais aceitos: `CERTIFIED_AND_PUBLISHABLE`, `TECHNICAL_EVIDENCE_OR_REPAIR_REQUIRED`, `SOURCE_OR_PEDAGOGICAL_APPROVAL_REQUIRED`, `GOVERNED_RETIREMENT`. Os dois estados de bloqueio são decisões de triagem; não implicam que um ZIP esteja defeituoso. Remoção exige decisão governada expressa; **nenhuma exclusão foi proposta**.

## Preservação de escopo e próximo gate
1. Confirmar tenant atual, edição, versão, fonte/titular e SHA do ZIP em consulta atual de catálogo/D1/R2 **somente leitura** autorizada. O run histórico não resolve essas colunas; registrar divergência por SHA, sem substituir automaticamente.
2. Receber do titular editorial os 22 pareceres, inclusive gabarito em custódia privada e decisões LOSA/CRM; obter os originais oficiais #23/#49/#69 e os 3 desencontros de SHA.
3. Para as correções de catálogo comprovadas, abrir PR técnico **separado** desta matriz, com teste focado e proteção tenant/RBAC. Nunca corrigir mapeamento baseado apenas em similaridade de nome.
4. Encaminhar **somente ZIPs aprovados e SHA dos bytes** à [Frente certificadora #1422](https://github.com/Airtrust-Org/airtrust/pull/1422). Neste snapshot são **zero aprovados**. #15 `cdc5a3cf...` é candidato *review-only*; #41 `8c15a739...` é original verificado, ambos UNCERTIFIED.
5. Não alterar Player 3 [#1389](https://github.com/Airtrust-Org/airtrust/pull/1389), emissão de certificação, Compliance, matrículas reais, progresso, nota, qualificação, certificado, D1/R2 ou produção.

**Fontes rastreáveis:** [matriz pedagógica 22](https://github.com/Airtrust-Org/airtrust/issues/1325#issuecomment-6181568566), [reconciliação 19/22](https://github.com/Airtrust-Org/airtrust/issues/1325#issuecomment-6240188780), [matriz SHA 50/50](https://github.com/Airtrust-Org/airtrust/issues/1325#issuecomment-6242874483), [reteste #7/#8](https://github.com/Airtrust-Org/airtrust/issues/1325#issuecomment-6244552887), [#1212](https://github.com/Airtrust-Org/airtrust/issues/1212).
