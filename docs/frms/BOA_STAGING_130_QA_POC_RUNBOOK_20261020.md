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
