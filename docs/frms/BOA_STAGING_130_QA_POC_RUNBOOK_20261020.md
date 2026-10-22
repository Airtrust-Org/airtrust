# BOA/CBMMG — protocolo de execução da POC e ensaio de 130 usuários sintéticos

Data: 20/10/2026. Frente única: PR #1650. Status: **pré-condições para execução**, NÃO certificado de aceitação.

## 1. Portões antes de executar qualquer chamada remota

- [x] PDF publicado no PNCP (36 páginas), incluindo o Anexo I, lido e comparado à matriz no dia 20/10/2026; edital e TR corroboram os oito requisitos e os cinco critérios mínimos da PoC.
- [ ] **Retificações, respostas vinculantes, estado atual da sessão e habilitação** ainda devem ser confirmados por responsável pela licitação no Portal de Compras MG. A versão do PDF acessada não comprova que não houve republicação.
- [ ] Parecer científico e procedimento de fadiga específico da aviação BOA aprovados por responsável técnico competente, incluindo KSS, PVT adaptado, limites operacionais, triagem, revisão humana e responsabilidade por liberação.
- [ ] Tratamento LGPD com finalidade, hipótese jurídica, categorias de dado sensível, ciclo de retenção/exclusão, necessidade de RIPD, segregação de acesso, logs, criptografia e incidente aprovado pelo controlador/operador; nenhuma conta real ou dado de saúde real em QA.
- [ ] Tenant `bombeiros` específico provisionado por fluxo governado, `empresa_id` **não 6**, `FIREFIGHTER_AVIATION` aprovado e `setores_gestores`/papéis exclusivamente de QA.
- [ ] Check de `main`, PR, SHA, todos os oito gates; snapshot staging Worker+Pages+schema e autorização atual do ambiente/artefato. Nunca inferir esquema aplicado apenas porque existe migration versionada.
- [ ] Credenciais de **130 contas fictícias e distintas** emitidas por canal seguro, armazenadas fora do Git e fora de logs, com expiração e revogação planejada.
- [ ] Autorização explícita do responsável pelo staging para carga e janela de execução; sem competir com outras frentes no ambiente.
- [ ] Backups/recuperação e evidência prévia de isolamento bidirecional BOA ↔ empresa 6.

**Não execute o ensaio em produção, nem importe 130 funcionários sem Schema V2 e autorização de escrita.**

### Distinção entre requisito do edital e teste de engenharia

O **Anexo I, itens 1.5.3.2.2–1.5.3.2.5**, estabelece que *até 130 usuários ativos* é referência estimativa de dimensionamento, **sem obrigação de utilização integral**. O script com exatamente 130 JWTs é **um ensaio de capacidade interno**, não um número de sessões simultâneas ou um procedimento específico exigido no edital. O item 8.4.2 requer demonstrar método, fatores, registros/relatórios, segurança/disponibilidade e LGPD; a Administração define data e forma da PoC após a classificação provisória em primeiro lugar (Edital 7.15; TR 8.4).

Este processo é um contrato global de assessoria técnica SGSO, não uma licitação isolada de licença de software: a empresa deverá demonstrar pessoal, experiência, vistorias, treinamento e pareceres do escopo geral. Fonte oficial: https://pncp.gov.br/app/editais/18715516000188/2026/125 .

## 2. Ensaio de leitura autenticada de 130 contas

Script: `scripts/validation/boa/staging-130-readonly.mjs`.

Ele verifica a nova rota **somente GET** `/api/bombeiros/frms/checkin/status`, que usa identidade autenticada do tripulante e retorna exclusivamente status do seu recibo e código da ocorrência vinculada. Exige a revisão `FIREFIGHTER_AVIATION` aprovada. As credenciais de usuário devem corresponder aos próprios funcionários fictícios; não configurar perfil administrador genérico para simular tripulantes.

Arquivo JSON **fora do repositório**, criado por processo autorizado, com **130 objetos** distintos do formato:

```json
[
  {"label":"BOA-QA-001","token":"ACCESS_JWT_SYNTHETIC_001"},
  {"label":"BOA-QA-002","token":"ACCESS_JWT_SYNTHETIC_002"}
]
```

O fragmento é **somente ilustrativo**; o arquivo efetivo precisa de 130 JWTs de acesso válidos, nunca de senhas, refresh tokens ou credenciais de produção. Não incluir esses tokens em issue, PR, comentários, screenshots ou artefatos.

Exemplo de invocação **após autorização do staging e provisionamento** (host substituído pelo staging verdadeiro):

```bash
BOA_QA_READONLY_APPROVED=SIM \
BOA_QA_STAGING_BASE_URL=https://app.staging.example.test/ \
BOA_QA_EXPECTED_TENANT_ID=130 \
BOA_QA_TOKENS_FILE=/private/boa-qa-credentials.json \
BOA_QA_CONCURRENCY=20 \
node scripts/validation/boa/staging-130-readonly.mjs
```

`BOA_QA_EXPECTED_TENANT_ID=130` é **apenas exemplo fictício**, não pressupõe o ID que será atribuído aos Bombeiros. `BOA_QA_CONCURRENCY` deve ser 1–130. Começar com concorrência baixa após aceite do responsável e só elevar dentro da janela aprovada. A contagem de 130 representa contas únicas; concorrência 130 representa tentativas simultâneas de GET, **não** um teste de jornadas operacionais e escritas.

O script falha fechado se não houver confirmação, HTTPS, hostname staging/dev, 130 JWTs diferentes, tenant válido ou dados respondidos no contrato esperado. Não faz POST, PUT, DELETE, PATCH, uploads, migrações ou geração de usuários. Rejeita redirects e não imprime JWT, conteúdos de resposta, informações clínicas, nomes ou ID do funcionário. Emite somente totais de aprovação/falha e latências p50/p95/p99. Falhas de 401/403, timeout, integridade ou fonte incompleta invalidam o lote.

Testes offline de proteção, sem qualquer rede:

```bash
node --test scripts/__tests__/boa-staging-130-readonly.test.mjs
node --check scripts/validation/boa/staging-130-readonly.mjs
```

**Nota:** esse ensaio não comprova 130 escritas simultâneas, capacidade do D1 sob criação de casos, ingestão PVT ou recuperação de desastre. Essas provas exigem procedimento separado de staging com dados sintéticos, limites de escrita autorizados e restauração auditável.

## 3. Prova de conceito — sequência de aceite físico

| Cena | Responsável e prova | Critério de reprovação |
| --- | --- | --- |
| A: metodologia/triagem | Tripulante QA autentica, registra check-in BOA, recebe recibo; gestor revisa; demonstra KSS/PVT como informações declaradas, não aptidão | Qualquer score offshore, inferência de liberação, ausência tratada como normal |
| B: fatores aeronáuticos | Testa missão diurna/noturna, sobreaviso, jornada, recuperação, privação de sono e decisões humanas segundo método aprovado | Sem fonte temporal/escala, coeficientes não homologados ou avaliação clínica simulada como real |
| C: casos/relatórios | Caso BOA validado com autor, prazo, mitigação, eficácia; comparação mensal com supressão de grupo/célula e versão do método | Caso sem responsável, encerramento sem eficácia, relatório vendido como assinado sem ser |
| D: disponibilidade/integridade | Ensaios GET e write separados, ambos governados, logs sem PII; validação de isolamento, concorrência, rollback e plano de recuperação | Cross-tenant, permissões elevadas, falha silenciosa, índices sem proveniência |
| E: LGPD | Aprovações do controlador; demonstra matriz RBAC comando/gestor/tripulante/responsável clínico, direitos, retenção e auditoria | Admin recebe dados clínicos, logs/backup não segregados, ausência de base jurídica |

Para o requisito **8 — experiência da licitante**, anexar atestados/documentos de terceiros, com escopo, período, responsável e validação de autenticidade. Desenvolvimento de código não produz automaticamente essa evidência; não fabricar documentação.

## 4. Status comprovado nesta PR e limitações

- Implementação em código do fluxo check-in → caso → tratamento → eficácia, leitura do recibo pela tripulação e prévia mensal gerencial/técnica; empresa 6 bloqueada.
- Testes anteriores: oito gates oficiais do SHA `85686bb958809e1240d43d2b92e142ce77637ed3` aprovados. Alterações posteriores **exigem nova CI no HEAD**.
- Testes locais com SQLite/fixtures e consultas de 130 funcionários fictícios, não um teste real de 130 JWTs/dados do Cloudflare.
- **Não comprovado/executado**: tenant staging, aprovação científica/jurídica, QA de 130 contas reais sintéticas, deploy, migration/seed/import, banco remoto, prova de conceito, relatório oficial assinado, atestados de experiência.

**Portão de liberação:** não integrar nem publicar a PR em ambiente real antes de comprovar os oito gates atuais, proteção de branch, habilitação específica do ambiente, segurança científica e LGPD. Produção depende de autorização atual para SHA/artefato/escopo.


## 5. Autorização de escrita de dados sensíveis em staging

**Camada nova de segurança da implementação:** as rotas `POST /api/bombeiros/frms/checkin` e `PUT /api/bombeiros/frms/casos/:id/{tratamento,resolver}` agora exigem, **além** de `ENVIRONMENT=staging|development`, tenant `bombeiros` autenticado, perfis e setor autorizados e política BOA vigente, a vinculação explícita do runtime:

```text
BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID=<ID numérico do tenant sintético aprovado>
```

A variável é opcional e **ausente por padrão**, logo nenhuma dessas rotas de escrita opera apenas porque um perfil de test foi criado. Valores `all`, outro ID, empresa 6, vazio ou ambientes de produção falham com `BOMBEIROS_QA_WRITE_NOT_APPROVED` (staging) ou bloqueio de produção. O endpoint de simulação metodológica, que **não persiste**, não necessita dessa autorização de escrita.

**Não configure a variável nesta PR nem por console de Cloudflare.** A eventual habilitação exige aprovação científica/LGPD, revisão de tenant e guard, autorização do artefato, janela de staging e workflow governado. Retirar a autorização ao final do ensaio e guardar o comprovante em canal seguro; nunca o ID inventado do exemplo como valor real.

O teste de 130 usuários deste runbook é **somente GET** e não depende dessa variável. O teste completo com gravação precisará de procedimento adicional formalizado, volume e recuperação autorizados.


## 6. Integridade da fila de ocorrências para gestores BOA

`GET /api/bombeiros/frms/casos` só pode apresentar status `ABERTO`,
`EM_TRATAMENTO` ou `RESOLVIDO` quando o caso tem recibo BOA do
**mesmo funcionário/tenant**, esquema `BOA_CASE_OPENED_V1`, declaração
`NOT_GRANTED` e transições plausíveis. A consulta valida conteúdo
mínimo de mitigação/eficácia, duplicações e ordem cronológica. Caso
algum registro da página esteja corrompido, **toda a página falha
fechada** em vez de exibir uma resolução aparentemente válida. O
append-only de tratamento/encerramento também revalida o esquema
do caso-base no próprio SQL de gravação.

Ensaio versionado e reproduzível (somente dados fictícios, SQLite
`:memory:`, sem D1/R2 remoto):

```bash
node --test scripts/__tests__/boa-case-queue-sqlite-integrity.test.mjs
```

O teste cobre exclusão da empresa 6 e de outro setor, schema offshore
adulterado, intervenção sem substância, eficácia incompleta,
fechamento precoce e histórico coerente. **Não** valida efetividade
clínica da medida, aprovação científica, prova de conceito formal
ou autorização de voo.

## 7. Revogação de vínculo no momento da gravação BOA

A operação de check-in `POST /api/bombeiros/frms/checkin` resolve inicialmente o tripulante por `usuarios` → `usuarios_empresas` → `funcionarios`. Sua gravação condicional em `frms_fadiga_evento` **repete a conferência de usuário ativo, vínculo do tenant e funcionário ativo/status**, na mesma operação atômica de D1 que gera o recibo e abre a revisão humana.

Esse segundo controle evita que a revogação do vínculo durante o intervalo entre consulta e gravação resulte em um recibo de dados sensíveis. A leitura `GET /api/bombeiros/frms/checkin/status` também revalida o vínculo ativo em **ambas** as consultas SQL de recibo e ocorrência: revogar `usuarios_empresas` não permite consultar IDs de recibos ou casos anteriores, mesmo após a resolução preliminar de identidade. Se a revogação ocorrer entre as duas consultas, a integridade falha fechada, sem divulgar o caso. Quando a condição SQL rejeita a escrita, a API **não presume que existe duplicata**: uma leitura adicional só classificará como **409 (ALREADY_RECEIVED)** quando houver exatamente um recibo da mesma pessoa/dia **e acesso ainda ativo**. Sem vínculo, ela retorna **403** sem revelar o ID do recibo; dois recibos inconsistentes são erro de integridade.

Ensaio reproduzível, exclusivamente com SQLite `:memory:`, funcionário e usuário sintéticos:

```bash
node --test scripts/__tests__/boa-checkin-membership-sqlite-integrity.test.mjs
```

Cobre remoção da linha `usuarios_empresas` depois da validação inicial, desativação de `usuarios.deleted_at`, funcionário `INATIVO`, reativação autorizada, recebimento idempotente e empresa 6 inalterada. **Não** demonstra revogação de JWT, efeito de cache em Cloudflare ou autorização de staging; tais cenários requerem ensaio autenticado de segurança no ambiente governado.



## 8. Gestor BOA — revogação de vínculo e fechamento no SQL

A escrita `PUT /api/bombeiros/frms/casos/:id/tratamento` e `.../resolver`
não depende apenas do RBAC/escopo consultados no preflight. O
`INSERT INTO frms_fadiga_evento ... SELECT` revalida, no instante da
gravação, a existência de `usuarios` ativo e associação
`usuarios_empresas` vigente para o **gestor autenticado** e o **mesmo
tenant do caso**; mantém a restrição de `empresa_id`, setor do
funcionário, vínculo do recibo e ausência de eventos repetidos.

No encerramento, a mesma instrução exige tratamento anterior com
schema `FRMS_CASE_TREATMENT_V1`, responsável, prazo, medida e
justificativa preenchidos, e cronologia anterior ou igual à emissão.
Um evento de tratamento apenas nominal não autoriza fechamento.
Isso protege a janela entre leitura do caso e gravação de um novo
evento. A efetividade clínica/operacional verdadeira continua sob
decisão e aprovação humana, não por comprimento de texto.

**Evidência:** `scripts/__tests__/boa-case-queue-sqlite-integrity.test.mjs`
executa SQL real em SQLite `:memory:` com usuários, vínculo de gestor
revogado, intervenção/encerramento, idempotência e tratamento
adulterado. A proteção de vínculo aqui é de **tenant**; eventuais
revogações granulares de setor e papel exigem testes autenticados do
middleware e política de acesso antes do staging oficial.

Nenhuma variável de autorização de escrita é habilitada por este
runbook, nenhuma escrita D1/R2 remota é necessária e a empresa 6
permanece separada.

### Bloqueio BOA adicional: papel e designação direta do setor

A instrução de gravação também valida `usuarios_empresas.role` como
perfil gerencial e a existência de um vínculo **direto**
`setores_gestores.usuario_id` ativo com o setor do funcionário,
no mesmo tenant BOA. O setor deve permanecer ativo; somente a
atribuição `manager` ou `backup` permite escrita, e `observer`
não autoriza o tratamento/encerramento. A revogação de setor ou
perfil entre o preflight e o INSERT resulta em zero gravações.

**Decisão de segurança BOA:** o vínculo legado
`setores_gestores.gestor_id` por correspondência de e-mail não
autoriza gravações de saúde na nova operação dos Bombeiros. O
provisionamento sintético precisa criar o vínculo moderno
`usuario_id` pelo fluxo governado, sem copiar atribuições da
Costa do Sol. Os demais tenants não mudam.

**Leituras alinhadas (etapa posterior):** `GET /api/bombeiros/frms/casos`
e `GET /api/bombeiros/frms/casos/:id` agora conferem, **dentro de
cada SELECT**, o usuário autenticado, o papel gerencial atual,
`usuarios_empresas`, a designação moderna `setores_gestores.usuario_id`
ativa com role `manager` ou `backup`, e o setor ativo do
funcionário. Atribuição `observer`, revogação, setor errado ou
vínculo legado apenas por e-mail não autorizam nem IDs de ocorrência.

A leitura do detalhe executa consultas separadas para abertura, recibo
e histórico de tratamento. Na **última consulta**, que lê as notas de
tratamento, o SQL repete o vínculo tenant/papel e a designação vigente
do setor. Um LEFT JOIN conserva o caso legitimamente aberto sem eventos;
zero linhas representa negação de acesso, e não "caso aberto" presumido.
A reprodução SQLite intercalou uma revogação real de `setores_gestores`
entre o preflight e a leitura final: antes da correção as notas eram
retornadas; depois, a função falha fechada com `null`, sem divulgar
estado ou histórico.

O teste SQLite de `boa-case-queue-sqlite-integrity.test.mjs`
cobre fila, detalhe, revogação durante a consulta, papel de observador
e mudanças de atribuição e é executado pelo gate oficial
`worker-tests-2`. **Limitação remanescente:** sessão real no Cloudflare,
verificação de cache distribuído, auditoria operacional e revisão LGPD
ainda exigem QA autenticado em staging antes de considerar a
implantação validada.



## Gate adicional de compatibilidade do Worker compartilhado — 22/10/2026

O staging usa o mesmo Worker `airtrust-api-staging` para outras frentes, incluindo Player 3.
Oito gates verdes na PR BOA **não demonstram que seu commit inclui o código
já publicado no Worker**. Antes de qualquer tentativa de disparar
`.github/workflows/deploy-staging.yml`, executar a verificação de
ancestralidade, em clone oficial atualizado, usando **SHAs completos** obtidos
do GitHub vivo:

```bash
node scripts/staging/check-boa-staging-release-lineage.mjs \
  --candidate-sha=<HEAD_EXATO_PR_1650> \
  --main-sha=<HEAD_EXATO_MAIN>
```

Ela lê `GET https://airtrust-api-staging.airtrust.workers.dev/api/version`
e exige que tanto a `main` viva quanto o commit de origem do Worker publicado
sejam ancestrais do candidato, sem mudar branches, Worker, Pages, D1 ou R2.
O resultado `BLOCK_CANDIDATE_BEHIND_MAIN`,
`BLOCK_CANDIDATE_DIVERGES_FROM_STAGING` ou evidência incompleta é um
**no-go obrigatório**: não disparar deploy de um commit que substituiria
a versão de outra frente. `NOOP_ALREADY_DEPLOYED` também não justifica
republicar. O estado `ANCESTRY_ONLY_COMPATIBLE_NOT_RELEASE_AUTHORIZED`
comprova somente ancestralidade; ainda se exigem aprovação de ambiente,
oito gates do SHA final, workflow governado, fonte BOA e LGPD/ciência.

**Registro reproduzido em 22/10/2026:** a versão staging declarava
`sourceSha=e267424c3cea7d5f21e8f3cd8e1f0f8214419444` e Worker ID
`0305cf8a-771d-4600-917b-b42042eb91fb`. A PR BOA estava atrás da
`main` em commits necessários e divergia da origem do staging.
O verificador retornou `BLOCK_CANDIDATE_BEHIND_MAIN`, com exit code 2.
**Nenhum deploy ocorreu.** Atualizar evidência antes de nova tentativa;
não promover código antigo ou substituir Player 3 para fechar a PoC BOA.

## Aprovação documental obrigatória para escritas sensíveis BOA — 22/10/2026

O status *ACTIVE* de `frms_profile_assignments`/`frms_regulatory_profiles`
e uma revisão com parâmetros completos **não comprovam** aprovação
científica, finalidade LGPD, autorização da fonte de escalas ou aptidão
operacional. O Worker recusa check-in de saúde e transições de tratamento/
eficácia com `BOMBEIROS_FRMS_POLICY_NOT_READY` (HTTP 503) se faltar
vínculo documental independente — ainda que a flag de tenant QA esteja ativa.

O controle fail-closed compara, sem registrar valores sensíveis ou fazer
escritas, os campos existentes do tenant e da revisão:
`approval_reference`, `service_category`, `policy_version`,
`source_document_hash` (SHA-256 completo), `source_reference`,
`source_type=APPROVED_OPERATIONAL_POLICY`,
`regulatory_profile_id`, versão/tenant/perfil exatos; e dois bindings
de Worker, **ausentes por padrão**:

- `BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256` — digest de documento efetivamente
  revisado e autorizado por responsável competente para a finalidade QA.
- `BOA_FRMS_QA_REVIEWED_REVISION_ID` — ID exato da revisão D1 revisada.

**Nenhum valor deve ser copiado das fixtures sintéticas de teste para o
Cloudflare.** Configuração desses bindings e da flag de escrita exige o
procedimento governado de environment grants, comprovação independente
do parecer científico, análise de base legal/retencão/LGPD, aprovação da
fonte BOA e autorização específica de staging/Schema V2, conforme
a documentação canônica. O par de bindings **não é certificado digital,
assinatura independente ou prova automática da qualidade do método**:
somente bloqueia gravações que não correspondam à revisão/documento
efetivamente selecionados pelo operador autorizado.

O painel admin `/api/bombeiros/frms/qa/prontidao` informa apenas
`documentary_review_binding_matches: true|false`. Na ausência de
correspondência, o estado permanece `QA_PRECONDITIONS_INCOMPLETE`
mesmo com 130 contas, configuração vigente e flag de escrita presentes.
A tela continua mostrando `scientific_validation: NOT_ATTESTED` e
`privacy_authorization: NOT_ATTESTED`: revisão técnica e aprovação
jurídico-operacional precisam de evidência externa. Revogar ou trocar o
documento/revisão cancela imediatamente a capacidade de criar novos
eventos na rota BOA, sem apagar registros históricos.

Prova no teste SQL local `boa-http-router-sqlite-e2e.test.mjs`:
documento ausente, digest divergente, referência faltante, revisão
desprovida do marcador aprovado e bindings de runtime omitidos retornam
503/zero novos eventos; com valores exclusivamente fictícios e
configuração coerente o circuito QA ainda passa. O teste não publica
nada e não constitui homologação humana.
