# AirTrust — Contrato único de fábrica SCORM e certificação LMS (P0)

**Status:** contrato de implantação progressiva; ainda não afirma que os cursos existentes estão certificados.  
**Coordenador:** [issue #1325](https://github.com/Airtrust-Org/airtrust/issues/1325).  
**Base:** SCORM 1.2 / Single SCO, AirTrust Completion Manifest V1, Diagnostics V1, código canônico atual.

## Regra de arquitetura — o conteúdo não implementa o player

Todo treinamento novo deve ser produzido por **uma única engine versionada de autoria**, com saída determinística:
- O autor fornece **conteúdo estruturado** (capítulos, slides com IDs estáveis, imagens, questões, respostas, feedback, fontes e revisão), não HTML/JS livre.
- A engine mantém os **mesmos** HTML, CSS, JavaScript, API SCORM, estado, navegação, avaliação e eventos em todos os treinamentos. Variam somente conteúdo, imagens e parâmetros declarados. Nenhuma ramificação por ID de curso para alterar execução.
- O pacote final contém `imsmanifest.xml` na raiz, uma organização/SCO, `airtrust-completion-manifest.json` e recursos locais. Não usar fontes remotas em que a falta de rede possa impedir avaliação/conclusão.
- `courseId`, `packageVersion`, digest da engine e SHA-256 do ZIP final devem identificar precisamente cada entrega; produzir duas vezes as mesmas entradas deve resultar em artefatos reproduzíveis, salvo metadados voláteis explicitamente normalizados.

**A fábrica Aircraft Learning Factory ainda precisa adotar este contrato na sua própria fonte de geração.** Não afirmar que a padronização visual está implantada enquanto essa integração não existir.

## Contrato visual imutável da engine

- Design responsivo 16:9 no desktop e ajustável ao tablet; não cortar controles, textos ou avaliações.
- Tipografia principal de conteúdo e questões >=20 px; textos auxiliares legíveis e contrastantes; navegação anterior/próximo, índice, progresso, referências e feedback nos mesmos lugares.
- Tema corporativo coerente, imagens operacionais pertinentes e distintas; não colocar 'AirTrust Learning'. Conteúdo técnico e regulatório de fonte controlada, revisão identificada.
- Questões com 5 alternativas quando aplicável, feedback útil, sem expor gabarito ao LMS nem depender apenas de clique automático.
- Capturas visuais de referência (golden screenshots) e comparação em Chromium e WebKit em larguras desktop/tablet antes de aceitar uma nova versão da engine.

## Contrato técnico do estado

- Estado SCORM real: `cmi.core.lesson_status`, `cmi.core.lesson_location`, `cmi.suspend_data`, nota `cmi.core.score.raw`, `LMSInitialize/Commit/Finish`. Avaliação deve ser persistida antes de finalizar.
- Estado local isolado por tenant, curso, matrícula e **ciclo ativo**. Uma matrícula nova não recebe progresso herdado.
- Bookmark e questões persistidos por **IDs estáveis**, não apenas por índice percentual. Troca de pacote exige declaração e teste de equivalência de IDs/avaliações. Caso incompatível, bloquear migração automática e oferecer nova edição administrativa auditável.
- Nunca marcar `passed/completed` com base em posição final ou percentual isolados. Reabertura de aprovado é revisão read-only: não diminuir status, nota, `lesson_location` ou `suspend_data` histórico.
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
