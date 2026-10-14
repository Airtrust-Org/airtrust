# AirTrust Player 3 — execução estrutural, estado para retomada

**Atualização:** 2026-10-14. **Autoridade:** `Airtrust-Org/airtrust` — PR [#1389](https://github.com/Airtrust-Org/airtrust/pull/1389) (DRAFT). **Prioridade:** reconstrução estrutural do LMS; não reabrir remendos do player SCORM legado.

## Decisão irrevogável até evidência nova

Recriar o player de execução e o motor de aprendizagem do zero, preservando os **HTML/CSS/JS/imagens/vídeos/interações autorais** e os dados históricos do LMS. Não converter slides para um visual genérico. Conteúdo HTML5 fica isolado, sem credenciais LMS, em origem distinta; o backend controla matrícula/ciclo/edição, progressos persistidos, tentativas, nota, conclusão atômica, qualificação, certificado e reconciliação. O próprio HTML5 e suas mensagens SCORM não certificam aluno.

**Exercícios após cada módulo:** fixação com explicação; acertar é requisito de avanço na navegação, com estado revalidado no servidor, mas sem nota e sem gastar tentativa oficial. **Avaliação certificadora:** contrato explícito por edição; modos `MODULE_CERTIFIED` (módulos avaliados, *não inventar prova final*), `FINAL_CERTIFIED` (prova final controlada pelo AirTrust) ou `ATTENDANCE_ONLY` quando pedagogicamente cabível. Não reclassificar sem aprovação módulos já certificados. O aluno segue uma matrícula única. Compatibilidade para SCORM externo fica em adaptador independente, com prova real de conclusão — não baseada em contador visual.

## Arquivos originais recebidos e materializados — 2026-10-14

- `SMS(5).zip`: **9 cursos**, **81.564.282 bytes**, SHA-256 `4ab977d88559c238bf0f1d6226f28959f241276aadd30d5e9183e7ab24dca55b`.
- `Segurança Operacional(2).zip`: **13 cursos**, **91.927.214 bytes**, SHA-256 `b1e274cd6b316ab25797b9062bfeff68b532469a96d3e26bbbe7a8063ad8ff7e`.
- No conjunto: **22 pacotes, 1.016 arquivos autorais preservados byte a byte**, incluindo um SGSO em duas versões. Não considerar todos os 22 versões atuais de produção: comparar edição/versão antes de publicar.

**Artefatos privados entregues na conversa (NÃO são para deploy):**
- `AIRTRUST_PLAYER3_SMS_9_ORIGINAIS_PRESERVADOS_REVISAO_NAO_PUBLICAR.zip` — 81.600.386 bytes, SHA-256 `a0744267ffd8b5294d4c277927f2f614a0ab6dba09dc3cc5668e1afd26c4cfa0`.
- `AIRTRUST_PLAYER3_SEGURANCA_OPERACIONAL_13_ORIGINAIS_PRESERVADOS_REVISAO_NAO_PUBLICAR.zip` — 91.985.007 bytes, SHA-256 `8d98b40182891f9ab046b3720663ac73b002966c52ce7384106b5247c7267ecf`.
- `AIRTRUST_PLAYER3_INVENTARIO_22.csv` (identidades/quantidade/política, sem gabaritos).
- No repositório: `scripts/learning-factory/convert_preserved_html5.py` (conversor determinístico) e `test_convert_preserved_html5.py`. **Não adicionar ZIPs originais, mídia ou chaves de resposta ao GitHub.**

**Atenção:** os arquivos de autoria podem ter **gabaritos embutidos no JavaScript**. As conversões são preservação **para revisão**, não são conteúdo aprovado para servir no navegador do aluno. É necessário separar a avaliação certificadora em banco privativo servidor, validar respostas por política/evidência e isolar os assets/autorização antes de publicar.

## Código novo (não alteração do player SCORM existente)

- `worker-airtrust/src/lib/lms-player3/engine.ts`: domínio independente de contratos `AIRTRUST_PLAYER3_POLICY_V1`, fixação, prova oficial calculada exclusivamente a partir de gabarito privado e `readiness` exigindo estados persistidos. Não aceita escore enviado pelo aluno, dom counters ou conclusão autoafirmada. **Não é ainda o escritor transacional D1**.
- `worker-airtrust/src/__tests__/lib/lms-player3-engine.test.ts`: **11 testes aprovados** incluindo gates modulares, prova final, edição, nota inventada, falha, idempotência.
- `src/react-app/pages/lms/player3/Player3Html5Host.tsx`: casca nova que exibe **o HTML5 original** em iframe de origem HTTPS distinta e não aceita mensagens da página como confirmação de progresso/nota/certificado. **Prévia isolada**, não registrada na árvore de rotas ou conectada a R2 definitivo.
- `src/__tests__/Player3Html5Host.test.tsx`: **4 testes aprovados** de isolamento do iframe, origem e ausência de conclusão autoafirmada.
- **3 testes do conversor** aprovados, incluindo travessia de ZIP/arquivo e integridade exata.
- **Worker TypeScript typecheck PASS** para HEAD contendo engine. Host React tests PASS. Oito gates oficiais do HEAD e build completo ainda precisam de avaliação; não declarar CI verde.

## O que NÃO está pronto

- Host ainda não integrado à rota autenticada do LMS nem a endpoint seguro de HTML5 no R2; qualquer publicação de assets exige CSP, isolamento de origem, autorização multi-tenant, SHA de edição e revisão das respostas embutidas.
- **Não existe ainda uma transação Player3 real aplicada em D1** para prova por módulo, recuperação/replay, finalização canônica e reconciliação/certificado. O engine é puro e testado, não um backend implantado.
- As políticas pedagógicas dos 22 originais precisam ser comparadas com seus manifests; Doutrinamento contém 8 avaliações modulares, NR-20 4 e SGSO 5, por isso não renomear tudo para fixação.
- O navegador headless do container bloqueou navegação com `ERR_BLOCKED_BY_ADMINISTRATOR`, impedindo o smoke visual de fidelidade nesta superfície; solicitar execução browser com origem/ambiente autorizados no Mac/staging, não afirmar validação visual.
- Nenhum conteúdo nem migration de cliente publicado em staging/produção. Nenhuma matrícula 42/42 finalizada no novo motor.
- `npm run lint` geral apresentou anteriormente falha em guard sobre scripts históricos remote-D1; nunca bypassar para obter verde.

## Próxima ação EXECUTÁVEL (não refazer auditoria)

1. Não usar mais a PR #1458 como estratégia principal, nem converter os originais ao layout genérico Native antigo. Manter a PR #1389 como frente única.
2. Implementar versão imutável, isolamento seguro e endpoint de assets HTML5 privados na Cloudflare, com origem segregada e controles exatos `empresa_id`/matrícula/edição.
3. Implementar API de avaliação e checkpoint persistidos por módulo com `moduleGate` explicitamente versionado, gabarito **somente no Worker**, tentativas e replay idempotentes no Schema V2 governado; integrar ao escritor canônico LMS de conclusão/qualificação/recibo de certificado.
4. Conectar Player3 HTML5 Host à navegação dos conteúdos preservados, sem reescrever design e exercícios, e criar prova final do AirTrust apenas se política autoral exigir.
5. Concluir E2E real em staging com matrícula teste Doutrinamento 42/42, queda/retomada, quiz errado/correto, aprovação, histórico, certificado e reabertura Safari/WebKit e Chromium; verificar **oito gates oficiais**.
6. Produção somente com autorização explícita e específica para SHA/artefatos/escopo exato; nunca migrar matrículas reais automaticamente sem governança.

## Estado compacto
OBJETIVO=Player3 real sem 99%; CASO=Doutrinamento matrícula 911, 42/42 e 100 mas 99%; MAIN=verificar ao vivo; PR=#1389 DRAFT; HEAD=consultar PR; ARQUIVOS=engine+host+factory+testes; EXECUTADO=22 candidatos fiéis e domínio independente; TESTES=11+4+3 PASS, Worker TSC PASS; BLOQUEIO=servir HTML5 segregado + schema/persistência+certificação real+smoke visual+CI; PRÓXIMO=desenvolver camada segura e ponta-a-ponta, não corrigir SCORM legado; NÃO_AUTORIZADO=bypass, fabricação de progresso, D1/R2 write improvisado, produção sem SHA/especificidade.

**Este documento prevalece sobre anotações temporárias conflitantes da PR que ainda recomendem renderizador genérico Native.**

## Nova exigência incorporada — continuidade de todos os alunos (2026-10-14)

**Solicitação:** antes do cutover, mapear TODAS as matrículas em andamento de TODAS as empresas, preservar progresso individual existente (ex.: 80%), posição e provas comprovadas, sem forçar alunos a começar do zero. Repetir o levantamento até a janela de corte para incluir novos avanços.

**Implementado na PR #1389 (não publicado, nenhum write remoto):**

- `scripts/learning-factory/player3-active-enrollments-readonly.sql`: SELECT fixo de matrículas `EM_ANDAMENTO` e `NAO_INICIADO` multi-tenant, JOIN curso/ciclo/SCORM; coleta % de matrícula e ciclo, versão, slide, bookmark, CMI e timestamps; identificar divergências. Resultado é PRIVADO.
- `scripts/learning-factory/player3-seal-active-inventory.mjs`: lê resultado D1 via stdin, cifra todos os registros e estados SCORM em AES-256-GCM autenticado e gera apenas contagens gerais sem IDs/nome no log; arquivo local 0600, não sobrescreve.
- `.github/workflows/production-player3-enrollment-inventory-readonly.yml`: execução preparada, governada, **somente workflow_dispatch na main e somente SELECT**, com SHA exato, confirmação, oito gates, proteção ambiente production, token D1 readonly, chave privada de snapshot, artefato apenas cifrado com retenção provisória de 30 dias.
- `worker-airtrust/src/lib/lms-player3/continuity.ts`: regra individual de crosswalk do andamento, separa `EXACT_RESTORE` / `UNIT_CROSSWALK` / `ADMIN_EQUIVALENCE_REVIEW` / `NO_PROGRESS` / `SOURCE_CONFLICT`. Preserva porcentagem anterior sem fabricar nota, evento ou conclusão. `compareContinuityInventories` detecta avanço novo, matrícula nova/removida, troca de ciclo, regressão e instantâneo obsoleto.
- `docs/lms/PLAYER3_CONTINUIDADE_MATRICULAS.md`: contrato T0, delta, janela de corte, crédito administrativo de retomada, auditoria, segurança, recovery e reconciliação.

**Evidência local do HEAD de 14:08:** 25 testes core Worker (11 engine + 14 continuidade) PASS; Worker `tsc --noEmit` PASS; quatro testes AES-GCM PASS; dois testes SQLite do SELECT multi-tenant PASS; YAML do workflow válido. Nada disso equivale a consultar D1 de produção.

**Bloqueio real:** ainda **não existe contagem de alunos verificada em produção nem backup real da matrícula**. A PR permanece DRAFT e o workflow não está integrado na main, não pode ser disparado para dados reais. Requer token `CLOUDFLARE_D1_READONLY_API_TOKEN` e segredo `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64` no ambiente protegido, configuração a verificar; jamais imprimir, commitar ou solicitar essas credenciais em chat. Até o fluxo ser governado e rodar, não afirmar que mapeou todos os alunos.

**Próxima ação desta frente:** validar CI aplicável e estado de PR/main, integrar de forma isolada o fluxo de captura seguro quando autorizável pelo contrato (não mergear #1389 prematuramente), executar inventário T0 e conservar cópia cifrada em cofre corporativo além do prazo temporário do artefato; depois construir o serviço governado de equivalência por módulo/ciclo com auditoria e validar em staging. Antes de produção/cutover executar T1 final, confirmar delta e nunca sobrepor progressos novos. Continua pendente a integração Player3 aos assets HTML5 privados, módulos e certificação real.
