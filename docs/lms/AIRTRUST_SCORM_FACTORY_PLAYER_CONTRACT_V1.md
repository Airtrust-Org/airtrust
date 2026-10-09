# AirTrust — Contrato único de fábrica SCORM e certificação LMS (P0)

**Status:** contrato de implantação progressiva; ainda não afirma que os cursos existentes estão certificados.  
**Coordenador:** [issue #1325](https://github.com/Airtrust-Org/airtrust/issues/1325).  
**Fonte já aprovada — preservar, não reinventar:** [AirTrust Learning Factory — Canon 2026-09-27](https://drive.google.com/drive/folders/1EuDE_yHhbExLxrSuNj1ntsvPVqjwgBGM), Golden Master/Core V2 e Design System Aero Editorial; NR-26 RC5 como Golden Visual e PBN como benchmark editorial. A documentação do Drive referencia `10_GOLDEN_MASTER_CORE_LOCK.json` e arquivos `11_` a `14_`, mas a consulta dessa pasta não localizou todo o core: **CORE_SOURCE_INCOMPLETE** até recuperar/verificar os hashes. Não assumir que um ZIP arbitrário com nome parecido equivale ao Golden Master. Base mutável da compatibilidade: SCORM 1.2 / Single SCO, Completion Manifest V1, Diagnostics V1 e `main` atual do AirTrust.

## Regra de arquitetura — o conteúdo não implementa o player

Todo treinamento novo deve ser produzido por **uma única engine versionada de autoria**, com saída determinística:
- O autor fornece **conteúdo estruturado** (capítulos, slides com IDs estáveis, imagens, questões, respostas, feedback, fontes e revisão), não HTML/JS livre.
- A engine mantém os **mesmos** HTML, CSS, JavaScript, API SCORM, estado, navegação, avaliação e eventos em todos os treinamentos. Variam somente conteúdo, imagens e parâmetros declarados. Nenhuma ramificação por ID de curso para alterar execução.
- O pacote final contém `imsmanifest.xml` na raiz, uma organização/SCO, `airtrust-completion-manifest.json` e recursos locais. Não usar fontes remotas em que a falta de rede possa impedir avaliação/conclusão.
- `courseId`, `packageVersion`, digest da engine e SHA-256 do ZIP final devem identificar precisamente cada entrega; produzir duas vezes as mesmas entradas deve resultar em artefatos reproduzíveis, salvo metadados voláteis explicitamente normalizados.

**A fábrica Aircraft Learning Factory ainda precisa adotar este contrato na sua própria fonte de geração.** Não afirmar que a padronização visual está implantada enquanto essa integração não existir.

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
