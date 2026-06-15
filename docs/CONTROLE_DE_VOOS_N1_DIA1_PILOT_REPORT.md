# Controle de Voos N1 — Relatório do Dia 1 do Piloto

Data: 2026-06-14
Ambiente: D1 dedicado `airtrust-db-pilot-cv-n1`
Modo: guiado — smoke funcional com perfis sintéticos
Veredito: **GO com ressalvas para o Dia 2**

---

## 1. Sumário Executivo

O Dia 1 do piloto interno controlado do módulo Controle de Voos N1 foi executado em ambiente completamente isolado, usando o D1 dedicado `airtrust-db-pilot-cv-n1` (UUID `76ec876a-8727-44b6-aa33-b8dea53cdebb`). Nenhum dado de produção, staging, SIGVOOS, FRMS ou sistema regulado foi tocado.

O roteiro guiado cobriu os fluxos essenciais previstos para o Dia 1: login por três perfis (admin, editor, viewer), acesso ao dashboard, lista de voos, detalhe de voo, abertura de RDV, criação de rascunho, salvamento, finalização de preenchimento e validação do bloqueio de escrita para o perfil viewer. Todos os fluxos esperados para o Dia 1 foram concluídos com sucesso dentro do escopo sintético autorizado.

O banco de dados do piloto permanece preservado com o estado pós-Dia 1 (snapshot `pilot-cv-n1-post-smoke-20260614204320.sql`, 34 KB).

Nenhum incidente crítico foi registrado. Nenhuma confusão regulatória foi observada. O piloto permanece dentro do escopo N1 operacional interno não regulado.

---

## 2. Participantes e Perfis

O Dia 1 foi executado integralmente com perfis sintéticos gerados no seed controlado. Não houve participação de usuários reais nesta sessão inicial.

| Perfil | Usuário sintético | Role | Ação esperada |
|---|---|---|---|
| Administrador técnico | `admin-pilot@pilot.airtrust.local` | admin | gestão de ambiente e validação de logs |
| OCC / Controle | `editor-pilot@pilot.airtrust.local` | editor | preenchimento e finalização de RDV |
| Observador / leitura | `viewer-pilot@pilot.airtrust.local` | viewer | consulta e validação de bloqueio de escrita |

Os três perfis foram criados durante o seed do D1 dedicado e validados por login individual com resposta `200 success` e token JWT presente antes do roteiro guiado.

Credenciais sintéticas ficam exclusivamente em `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-credentials.txt`. Nenhuma credencial foi registrada neste documento.

---

## 3. Ambiente Utilizado

| Atributo | Valor |
|---|---|
| D1 dedicado | `airtrust-db-pilot-cv-n1` |
| UUID do D1 | `76ec876a-8727-44b6-aa33-b8dea53cdebb` |
| Região (Cloudflare) | `ENAM` |
| Config temporário | `worker-airtrust/wrangler.pilot-cv-n1.toml` (untracked, coberto por `.gitignore`) |
| Env temporário | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1.env` (fora do repo) |
| Worker de preview | `wrangler dev --remote --port 8791` (encerrado após o roteiro) |
| Migration de schema aplicada | `0410_controle_voos_n1_schema.sql` (via `d1 execute --file`, não via `migrations apply`) |
| Branch | `main` |
| HEAD no momento do piloto | `3bd48efe047e10a264e636f69f60369b1a55cc3d` |

O Worker de preview foi encerrado ao final do roteiro guiado. O D1 dedicado permanece preservado.

---

## 4. Confirmações de Segurança

Todas as confirmações abaixo foram validadas antes e depois do roteiro guiado do Dia 1.

| Confirmação | Status |
|---|---|
| Nenhum comando executado contra `airtrust-db` de produção | CONFIRMADO |
| Nenhum comando executado contra `airtrust-db-staging` | CONFIRMADO |
| Nenhum comando usou `--env production` | CONFIRMADO |
| Nenhum deploy foi executado | CONFIRMADO |
| Nenhuma migration foi aplicada via `migrations apply` | CONFIRMADO |
| Migration `0411` não foi criada nem aplicada em nenhum ambiente | CONFIRMADO |
| SIGVOOS não integrado ao D1 do piloto | CONFIRMADO |
| FRMS não alterado | CONFIRMADO |
| eDB, SDRMe, MRO real, Records Core não criados | CONFIRMADO |
| Nenhum secret de produção lido, listado ou alterado | CONFIRMADO |
| Config temporário coberto por `.gitignore` e não staged | CONFIRMADO |
| Credenciais sintéticas apenas em `/tmp` | CONFIRMADO |
| Nenhum commit realizado | CONFIRMADO |

UUIDs distintos confirmados:
- Piloto: `76ec876a-8727-44b6-aa33-b8dea53cdebb`
- Produção: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`
- Staging: `b7f50907-c110-45f5-ad17-e97ea47f2826`

---

## 5. Fluxos Executados

### 5.1 Login por perfil

Todos os três perfis sintéticos realizaram login com sucesso antes do roteiro.

| Perfil | Endpoint | HTTP | Resultado |
|---|---|---|---|
| admin-pilot | `POST /api/auth/login` | 200 | `success: true`, token JWT presente |
| editor-pilot | `POST /api/auth/login` | 200 | `success: true`, token JWT presente |
| viewer-pilot | `POST /api/auth/login` | 200 | `success: true`, token JWT presente |

Nenhum erro de autenticação registrado. RBAC por role confirmado ativo.

### 5.2 Dashboard OCC

Executado com o perfil editor-pilot, representando o perfil OCC/controle.

| Chamada | HTTP | Resultado |
|---|---|---|
| `GET /api/controle-voos/dashboard?data_inicio=2026-06-10&data_fim=2026-06-13` | 200 | `success: true`, `nao_regulado: true`, `voos: 8` |

O campo `nao_regulado: true` foi retornado corretamente no payload do dashboard, confirmando que o módulo sinaliza o status operacional interno por API. Nenhum dado de escopo regulado foi apresentado.

### 5.3 Lista de Voos

| Chamada | HTTP | Resultado |
|---|---|---|
| `GET /api/controle-voos/voos?data_inicio=2026-06-10&data_fim=2026-06-13` | 200 | `success: true`, `count: 8` |

Os 8 voos sintéticos do seed (datas entre 2026-06-10 e 2026-06-13) foram retornados corretamente. Nenhum voo de origem externa ou de outro tenant foi apresentado.

### 5.4 Detalhe de Voo

O detalhe do voo de `id=1` foi acessado antes da abertura do RDV para validação dos dados de identificação. Retorno `200` com dados do voo sintético conforme o seed.

### 5.5 Abrir RDV

O RDV do voo `id=1` foi acessado via `GET /api/controle-voos/voos/1/rdv`. Status retornado: sem RDV existente, habilitando a criação.

### 5.6 Criar e Salvar Rascunho

| Chamada | HTTP | Resultado |
|---|---|---|
| `PUT /api/controle-voos/voos/1/rdv` | 201 | `success: true`, `status: rascunho` |

O rascunho foi criado com sucesso pelo perfil editor-pilot. O status `rascunho` foi confirmado no payload de retorno.

### 5.7 Finalizar Preenchimento

| Chamada | HTTP | Resultado |
|---|---|---|
| `POST /api/controle-voos/voos/1/rdv/finalizar-preenchimento` | 200 | `success: true`, `status: preenchimento_finalizado` |

A transição de status de `rascunho` para `preenchimento_finalizado` ocorreu sem erro. O estado pós-finalização foi persistido no D1 dedicado (confirmado no snapshot pós-smoke).

### 5.8 Viewer Bloqueado em Escrita

| Chamada | Perfil | HTTP | Resultado |
|---|---|---|---|
| `POST /api/controle-voos/voos` | viewer-pilot | 403 | `Permissao insuficiente` |

O perfil viewer foi corretamente impedido de realizar qualquer operação de escrita. O bloqueio ocorreu via RBAC de role antes de qualquer acesso ao banco de dados.

---

## 6. Feedback dos Usuários

O Dia 1 foi executado com perfis sintéticos em modo de smoke funcional. Não há feedback subjetivo de usuários reais nesta sessão.

Feedback técnico registrado:

- O campo `nao_regulado: true` no payload do dashboard é a principal salvaguarda de escopo disponível via API hoje. A camada de UI precisará exibir esse sinalizador de forma visível e persistente para usuários reais.
- O fluxo de transição de status `rascunho` → `preenchimento_finalizado` funcionou com chamadas simples e sem ambiguidade de endpoint.
- O bloqueio de escrita para viewer retornou mensagem clara `Permissao insuficiente`, sem vazar detalhes de implementação.
- O seed de 8 voos com 4 tripulantes sintéticos foi suficiente para exercitar os fluxos básicos do Dia 1.

Para o Dia 2 com usuários reais, os pontos a observar ativamente são:
- clareza do banner ou indicador de "uso operacional interno" na interface;
- nomenclatura dos campos do RDV (potencial confusão com terminologia do Diário de Bordo oficial);
- percepção do botão "finalizar preenchimento" (risco de ser interpretado como assinatura).

---

## 7. Incidentes

Nenhum incidente foi registrado no Dia 1.

| # | Título | Severidade | Status |
|---|---|---|---|
| — | — | — | — |

Nenhum dos critérios de parada imediata (S1 a S8, conforme checklist operacional) foi ativado.

---

## 8. Dúvidas Operacionais

Dúvidas mapeadas para endereçamento antes ou durante o Dia 2:

| # | Dúvida | Origem | Prioridade |
|---|---|---|---|
| D1 | A UI apresenta o banner "uso operacional interno" de forma suficientemente visível para usuários não técnicos? | observação do roteiro | alta |
| D2 | O rótulo "finalizar preenchimento" é claro o bastante para não ser percebido como assinatura ou registro oficial? | prevenção de risco regulatório | alta |
| D3 | Os campos do RDV sintético do seed cobrem os campos mínimos que o OCC real precisaria preencher em um voo real? | gap de dados | média |
| D4 | O fluxo de reabertura de rascunho após salvar foi coberto pelo smoke? | lacuna no roteiro | média |
| D5 | O dashboard apresenta indicadores de resumo (RDVs finalizados vs. pendentes) de forma que um gestor operacional consiga tomar decisão de turno? | cobertura funcional | baixa |

A dúvida D4 (reabertura de rascunho para validação de persistência) foi prevista no checklist mas não foi exercitada explicitamente no smoke do Dia 1. Deve ser incluída no roteiro do Dia 2.

---

## 9. Confusão Regulatória Observada

Nenhuma confusão regulatória foi observada no Dia 1.

O módulo sinalizou `nao_regulado: true` via API. Nenhuma tela, endpoint ou payload retornou linguagem de sistema regulado. A migration 0411 (que incluiria campos de rastreabilidade SIGVOOS) não foi aplicada, e as tabelas 0411 (`cv_voo_etapas`, `cv_sigvoos_staging`, `cv_conflitos_integracao`) foram confirmadas ausentes no D1 dedicado.

Alerta preventivo: a observação de confusão regulatória em usuários reais do Dia 2 deve ser tratada como critério de parada S1 imediato, conforme o checklist operacional.

---

## 10. Divergências com SIGVOOS / APUS / Papel

Nenhuma divergência com SIGVOOS, APUS ou papel foi identificada no Dia 1.

Motivo esperado: o Dia 1 usou exclusivamente dados sintéticos do seed, sem confrontação com registros reais de sistemas externos. A verificação de divergências só será possível a partir do Dia 2, quando usuários reais acessarem voos controlados e compararão os dados do AirTrust com os registros em SIGVOOS/APUS.

Ação para o Dia 2: preparar o conjunto controlado de voos com dados que permitam comparação direta com o SIGVOOS, e orientar o OCC a registrar qualquer divergência no template de divergência (Seção 5.3 do execution pack).

---

## 11. Evidências Coletadas

| Evidência | Localização | Tamanho | Status |
|---|---|---|---|
| Snapshot pós-baseline | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-baseline-20260614233454.sql` | 4.8 KB | coletado |
| Snapshot pós-seed | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-seed-20260614233521.sql` | 29 KB | coletado |
| Snapshot pós-smoke (Dia 1) | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-smoke-20260614204320.sql` | 34 KB | coletado |
| Log de export pós-seed | `/tmp/airtrust-pilot-cv-n1/export-post-seed.log` | 1.1 KB | coletado |
| Resultado do smoke funcional | `/tmp/airtrust-pilot-cv-n1/functional-smoke-result.json` | 848 bytes | coletado |
| SQLite de verificação local | `/tmp/airtrust-pilot-cv-n1/local-verify.sqlite` | 304 KB | coletado |

Todas as evidências permanecem fora do repositório, em `/tmp/airtrust-pilot-cv-n1/`. Nenhuma foi movida para `docs/`, `scripts/` ou qualquer pasta versionada.

Confirmações estruturais registradas:
- 8 tabelas `cv_%` presentes no D1 dedicado;
- `regulated_count = 0`;
- `schema_0411_count = 0`;
- 8 voos sintéticos em `cv_voos`;
- 1 RDV em `cv_rdv_operacional`, status `preenchimento_finalizado`;
- 0 escopos inesperados de SIGVOOS/FRMS/eDB/SDRMe/Records Core.

---

## 12. Pendências para o Dia 2

| # | Pendência | Responsável | Prioridade |
|---|---|---|---|
| P1 | Confirmar se o Worker de preview do D1 dedicado pode ser iniciado novamente para o Dia 2 com o mesmo config temporário | Admin técnico | alta |
| P2 | Preparar conjunto controlado de voos para o Dia 2 com dados que permitam comparação com SIGVOOS/APUS | Admin técnico + Responsável produto | alta |
| P3 | Definir canal de comunicação para usuários reais (se o Dia 2 envolver pessoas fora do time técnico) | Responsável produto | alta |
| P4 | Exercitar explicitamente o fluxo de reabertura de rascunho (D4 das dúvidas operacionais) | OCC / Admin técnico | média |
| P5 | Confirmar que o banner de "uso operacional interno" está visível nas telas de dashboard, lista, detalhe e RDV antes de liberar usuários reais | Admin técnico | média |
| P6 | Verificar se o D1 dedicado mantém o estado do Dia 1 (1 RDV finalizado) como baseline correto para o Dia 2 ou se deve ser resetado | Responsável produto | média |
| P7 | Coletar confirmação formal de aceite do escopo não regulado pelos participantes do Dia 2, se forem usuários reais | Responsável produto | média |
| P8 | Higiene de artefatos históricos de produção e exports no workspace (pendência herdada, não bloqueia o piloto) | Admin técnico | baixa |

---

## 13. Veredito

**GO com ressalvas para o Dia 2.**

### Motivos do GO

- D1 dedicado permanece isolado e com integridade confirmada pós-Dia 1.
- Produção e staging não foram tocados.
- Todos os fluxos do roteiro guiado do Dia 1 foram concluídos sem erro.
- Login por todos os três perfis funcionou corretamente.
- Dashboard retornou `nao_regulado: true` e dados sintéticos corretos.
- Lista de voos retornou 8 registros do seed.
- Criação de rascunho e finalização de RDV funcionaram com transição de status correta.
- Bloqueio de escrita para viewer retornou 403 com mensagem clara.
- Nenhuma confusão regulatória registrada.
- Nenhum incidente criado.
- Nenhuma divergência com SIGVOOS/APUS (esperado, dado o uso de dados sintéticos).

### Ressalvas

| # | Ressalva | Critério de fechamento |
|---|---|---|
| R1 | Dia 1 foi executado exclusivamente com perfis sintéticos e dados de seed, sem usuários reais | Dia 2 inclui pelo menos 1 usuário real (OCC ou observador) executando o fluxo |
| R2 | Fluxo de reabertura de rascunho (validação de persistência) não foi exercitado explicitamente no smoke | Exercitado e registrado no Dia 2 |
| R3 | Verificação da UI (banner de uso interno, rótulo de finalização, clareza de nomenclatura) não foi feita — apenas a API foi testada | Administrador confirma UI revisada antes de liberar usuários do Dia 2 |
| R4 | Worker de preview foi encerrado após o roteiro; precisa ser reiniciado para o Dia 2 | Config temporário e env-file confirmados antes do início do Dia 2 |
| R5 | Aceite formal do escopo não regulado ainda não foi coletado de participantes externos (se houver no Dia 2) | Aceite coletado antes do início da sessão do Dia 2 |

---

## 14. Sugestão de Commit

Não fazer commit sem autorização explícita.

Se autorizado, commit escopado apenas neste relatório:

```bash
git add docs/CONTROLE_DE_VOOS_N1_DIA1_PILOT_REPORT.md
git commit -m "docs: record controle voos n1 dia1 pilot report"
```

Não adicionar:

```text
worker-airtrust/wrangler.pilot-cv-n1.toml
/tmp/airtrust-pilot-cv-n1/*
scripts/export_funcionarios_airtrust_producao.*
qualquer dump, .env, secret ou credencial
```
