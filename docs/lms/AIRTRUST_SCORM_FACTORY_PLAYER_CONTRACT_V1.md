# AirTrust — Contrato único de fábrica SCORM e certificação LMS (P0)

**Status:** contrato de implantação progressiva; ainda não afirma que os cursos existentes estão certificados.  
**Coordenador:** [issue #1325](https://github.com/Airtrust-Org/airtrust/issues/1325).  
**Fonte já aprovada — preservar, não reinventar:** [AirTrust Learning Factory — Canon 2026-09-27](https://drive.google.com/drive/folders/1EuDE_yHhbExLxrSuNj1ntsvPVqjwgBGM), Golden Master/Core V2 e Design System Aero Editorial; NR-26 RC5 como Golden Visual e PBN como benchmark editorial. A pasta canônica do Drive ainda não contém o core completo. Uma **cópia histórica** foi localizada no Mac autorizado em `Downloads - old/AIRTRUST_LEARNING_FACTORY_CANON_2026-09-27`, com 18/18 hashes do `MANIFEST_SHA256.json` e os três hashes de `10_GOLDEN_MASTER_CORE_LOCK.json` correspondendo aos bytes atuais: `11_GOLDEN_MASTER_APP.js` = `e2000b5acb09eb1fb380e7c88998869d1ba32d5d983a775a119f9527a05a53f0`, `12_GOLDEN_MASTER_STYLES.css` = `44c87afba940ecc0ee5c7ffeac66dad9bca6f69c1567d4f9469dcccee3613719`, `13_GOLDEN_MASTER_SCORM_API.js` = `a64806dc8fe9e9c422b69a01f66e2145f28883cdb8f76b7c27f26f244c219bfb`. **CORE_HASH_VERIFIED_HISTORICAL_COPY**, mas não assumir implantação na Factory enquanto não houver sincronização governada da fonte e teste de saída por SHA. Não publicar o núcleo proprietário nem ZIPs privados no repositório público. Base mutável da compatibilidade: SCORM 1.2 / Single SCO, Completion Manifest V1, Diagnostics V1 e `main` atual do AirTrust.

## Regra de arquitetura — o conteúdo não implementa o player

Todo treinamento novo deve ser produzido por **uma única engine versionada de autoria**, com saída determinística:
- O autor fornece **conteúdo estruturado** (capítulos, slides com IDs estáveis, imagens, questões, respostas, feedback, fontes e revisão), não HTML/JS livre.
- A engine mantém os **mesmos** HTML, CSS, JavaScript, API SCORM, estado, navegação, avaliação e eventos em todos os treinamentos. Variam somente conteúdo, imagens e parâmetros declarados. Nenhuma ramificação por ID de curso para alterar execução.
- O pacote final contém `imsmanifest.xml` na raiz, uma organização/SCO, `airtrust-completion-manifest.json` e recursos locais. Não usar fontes remotas em que a falta de rede possa impedir avaliação/conclusão.
- `courseId`, `packageVersion`, digest da engine e SHA-256 do ZIP final devem identificar precisamente cada entrega; produzir duas vezes as mesmas entradas deve resultar em artefatos reproduzíveis, salvo metadados voláteis explicitamente normalizados.

**A fábrica Aircraft Learning Factory ainda precisa adotar este contrato na sua própria fonte de geração.** Não afirmar que a padronização visual está implantada enquanto essa integração não existir.

## Verificação automática do núcleo antes de cada ZIP

O núcleo bloqueado recuperado em cópia histórica no Mac teve 18/18 hashes do manifesto corretos, mas o gerador ainda **não está comprovadamente sincronizado** com essa cópia. Para testar um ZIP já construído sem extrair nem publicar o conteúdo:

```bash
python3 scripts/learning-factory/verify_golden_core.py /caminho/curso.zip
```

O comando retorna exit 0 apenas quando `app.js`, `styles.css` e `scorm_api.js` são idênticos ao núcleo V2 e os manifests existem exatamente uma vez. Qualquer drift retorna exit 1 com erros legíveis em JSON. Sua própria lógica é testada no gate `build-content-gates` com cinco cenários.

Em 09/10, os candidatos locais **MGO RC5** e **CFIT RC4** falharam nessa comparação; o verificador não declara defeito de conclusão, mas demonstra que seus engines não são idênticos ao Golden Master. **Não substituir um pacote ativo automaticamente apenas porque o hash não coincide**: primeiro reproduzir a versão, avaliar equivalência de estado, corrigir factory e validar nova edição governada.

Esta ferramenta ainda é um gate de pré-publicação a ser ligado ao pipeline de autoria; ela não representa por si só upload bloqueado pelo Worker nem certificação funcional.

## Contrato visual imutável da engine

- Design responsivo, sem impor slides rígidos 16:9: referência desktop 1468×836 com scroll vertical natural e mobile 390×844 sem overflow; não cortar controles, textos ou avaliações.
- **Usar tokens reais do Golden Master**, sem inventar nova escala: desktop hero 64, H1 52, H2 36, H3 27, lead 21, body 18, caption 14px; mobile hero 44, H1 38, H2 30, H3 24, lead 19, body 17, caption 14px. O gate M8 não permite CSS abaixo de 14px. Legibilidade da matéria e das avaliações deve ser auditada em seis viewports; alterações tipográficas exigem mudança governada do core. Navegação anterior/próximo, índice/drawer (fechamento só por ação explícita), progresso, referências e feedback ficam nos mesmos lugares.
- Tema corporativo coerente, imagens operacionais pertinentes e distintas; não colocar 'AirTrust Learning'. Conteúdo técnico e regulatório de fonte controlada, revisão identificada.
- Avaliações com alternativas adequadas ao objetivo pedagógico e feedback útil, sem expor gabarito ao LMS nem depender apenas de clique automático. Mastery parametrizado por curso, com baseline típico de 80% quando aprovado.
- Capturas de referência e comparação em Chromium e WebKit nos **seis viewports canônicos**: 1468×836, 1366×768, 1024×768, 768×1024, 390×844 e 360×800. Nenhum overflow lateral ou scroll aninhado. Falha ou diferença injustificada do core = `CORE_DRIFT` e bloqueio.

## Contrato técnico do estado

- Estado SCORM real: `cmi.core.lesson_status`, `cmi.core.lesson_location`, `cmi.suspend_data` (orçamento recomendado <=3500 caracteres), nota `cmi.core.score.raw`, `LMSInitialize/Commit/Finish` (Commit/Finish únicos e zero chamadas posteriores). Avaliação deve ser persistida antes de finalizar.
- Estado local isolado por tenant, curso, matrícula e **ciclo ativo**. Uma matrícula nova não recebe progresso herdado.
- Bookmark e questões persistidos por **IDs estáveis**, não apenas por índice percentual. Troca de pacote exige declaração e teste de equivalência de IDs/avaliações. Caso incompatível, bloquear migração automática e oferecer nova edição administrativa auditável.
- Nunca marcar `passed/completed` com base em posição final ou percentual isolados. Passar na avaliação **apenas habilita o botão "Concluir curso/treinamento"**; somente o clique explícito efetua o fechamento certificador. Reabertura de aprovado é revisão read-only: não diminuir status, nota, `lesson_location` ou `suspend_data` histórico.
- O player AirTrust usa a mesma API de lançamento para todos os pacotes. Evitar correções por nome/ID/DOM; diagnóstico deve distinguir progresso salvo, slide efetivamente renderizado, edição ativa e evidência de avaliação.

## Matriz obrigatória de certificação, por hash exato

| Fase | Evidência mínima |
| --- | --- |
| Arquivo | SCORM 1.2, Single SCO, manifest/diagnostics válidos, assets e engine conhecidos |
| Primeiro acesso | abre em 1, não aprova automaticamente, inicia sessão válida |
| Interrupção | estado parcial salvo, `Commit`/`Finish` coerentes |
| Retomada | slide **efetivamente visível** corresponde ao bookmark autorizado; respostas preservadas |
| Avaliação parcial/insuficiente | não conclui, feedback funciona, não cria certificado |
| Avaliação suficiente | nota real >= mínimo, `passed`, todos os slides/interações exigidos |
| Fechamento | backend aceita evidências, conclusão/qualificação idempotentes |
| Reabertura | status e nota não regridem; revisão não sobrescreve registro aprovado |
| Evolução do pacote | compatível mantém IDs+respostas válidas; incompatível não inventa conclusão |
| Isolamento | outras matrículas, ciclos e tenants não herdam estado |
| UX | desktop/tablet, feedback e acessibilidade verificáveis |

O teste técnico `runScormBrowserConformance` atualmente executa apenas lançamento e encerramento de sessão. **Seu PASS não é o PASS funcional da tabela**. Um ZIP só será declarado `FUNCTIONALLY_CERTIFIED` com bateria completa e evidência de navegadores, instrumento/runner e SHA. Resultado sem evidência suficiente é `UNCERTIFIED`, jamais PASS.

## Inventário e lote de publicação

A auditoria read-only já iniciada em [run #37986805929](https://github.com/Airtrust-Org/airtrust/actions/runs/37986805929) deve gerar inventário por ID/tenant/hash, tipo, manifest, protocolo, conclusão, nota, retomada, reabertura e erros. Conservar relatórios sem credenciais nem PII.

Classificar por **causa compartilhada**, não criar um player diferente por curso:
- `ENGINE_OR_PLAYER_FIX` (defeito central, corrigir uma vez);
- `PACKAGE_REBUILD` (conteúdo/estado não conforme com a engine);
- `COMPATIBILITY_MIGRATION` (evidência de IDs/questões compatíveis);
- `INCOMPATIBLE_NEW_CYCLE` (nova edição auditável);
- `UNCERTIFIED` (evidência insuficiente, inclusive runner/infra).

Não iniciar matrícula em massa para os até 40 cursos / 150 alunos até que cada versão destinada ao grupo esteja certificada no ambiente final e em staging. Usar lançamento piloto controlado, monitorar fechamento e ampliar só sem falhas relevantes. **Risco absoluto zero não é tecnicamente demonstrável**; a obrigação é reduzir a exposição e impedir aprovação sem evidências.

## Separação de entregas

1. Contrato único e factory com teste de build reproduzível.
2. Gate funcional independente do protocolo, com fixtures de curso curto e curso avaliativo.
3. Auditoria real dos pacotes publicados, agrupamento por causa, remediação e recertificação somente de hashes alterados.
4. Staging, release autorizado por SHA/artefato, smoke real e acompanhamento da turma.
5. Fechar #1325 e issues de cursos somente com provas completas, não com PR ou validação estática.

Controles imutáveis: `main` GitHub, oito gates, RBAC, tenant, Schema V2, no writes D1/R2 de produção sem autorização específica e proveniência da release.
