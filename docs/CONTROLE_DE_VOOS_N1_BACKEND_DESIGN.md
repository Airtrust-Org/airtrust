# Controle de Voos / OCC / RDV - Backend N1 minimo

> Tipo: desenho tecnico conceitual de backend
> Data: 2026-06-14
> Versao: v1.0 - documento interno; nao submetido a ANAC; nao e parecer regulatorio
> Escopo: backend minimo N1 para Controle de Voos / OCC / RDV operacional interno
>
> Restricoes desta entrega: nao criar codigo, nao criar migrations, nao aplicar migrations,
> nao fazer deploy, nao mexer em secrets, nao fazer commit, nao integrar com MRO real,
> eDB, SDRMe ou Records Core real.

## 1. Sumario executivo

O backend N1 do Controle de Voos tem como objetivo substituir o `controleVoosMockData.ts`
por banco e API reais, preservando o modulo como sistema operacional interno. O N1 deve
persistir voos, tripulacao atribuida, status/eventos operacionais, RDV operacional,
ocorrencias, motivos, observacoes e alguns catalogos minimos, sempre com isolamento por
`empresa_id`, RBAC e auditoria operacional simples.

Este desenho nao transforma Controle de Voos em sistema regulado. O modulo N1 nao usa
Records Core, nao tem assinatura juridica, nao gera hash chain, nao tem modo fiscalizacao,
nao substitui Diario de Bordo, nao e eDB, nao e SDRMe, nao executa RAS e nao esta aprovado,
homologado, certificado ou autorizado pela ANAC. Relatorios e exports futuros devem carregar
disclaimer de uso operacional interno e nao fiscal.

Setup local seguro do worker: usar `npm run setup:local`, que deve aplicar a migration
`0410_controle_voos_n1_schema.sql` no D1 local (`wrangler.dev.toml`, `--local`) e popular
catalogos/voos minimos de demonstracao N1 sem tocar em staging ou producao.

O backend substitui os seguintes mocks atuais:

- `MOCK_VOOS` por `cv_voos`.
- `MOCK_TRIPULACAO_VOO` por `cv_voo_tripulantes`, apontando para `funcionarios.id`.
- `MOCK_RDVS` por `cv_rdv_operacional`.
- `MOCK_CANCELAMENTOS_ATRASOS` por `cv_ocorrencias_operacionais` + `cv_motivos_operacionais`.
- `MOCK_ALERTAS` por respostas derivadas de dados reais, quando houver leitura segura.
- Catalogos mockados por tabelas auxiliares `cv_*`.

Continuam fora: eDB, SDRMe, Records Core, assinatura PIC, RAS, MRO real, FRMS como SGRF,
offline/tablet, export fiscal, integracao Sigvoos/APUS e qualquer substituicao de papel.

## 2. Escopo backend N1

### Entram

- Voos e programacao operacional.
- RDV operacional, sem valor fiscal/regulatorio.
- Tripulacao atribuida com referencia a funcionarios reais.
- Status e eventos operacionais.
- Motivos de atraso, cancelamento, alternado/divergido e ajustes operacionais.
- Observacoes operacionais.
- Catalogos auxiliares minimos.
- Leitura de funcionarios reais.
- Leitura informativa de qualificacoes e alertas, se a consulta for segura e tenant-scoped.
- Multi-tenant por `empresa_id`.
- RBAC por acao.
- Auditoria operacional simples A1.

### Nao entram

- eDB ou DB Digital oficial.
- SDRMe.
- Records Core.
- Assinatura juridica ou assinatura PIC.
- RAS ou retorno ao servico.
- MRO real.
- FRMS como SGRF aprovado.
- Offline/tablet.
- Export fiscal ou pacote para fiscalizacao.
- Integracao Sigvoos/APUS.

## 3. Modelo de dados conceitual

Este modelo e conceitual. Nao e DDL aplicavel. A primeira implementacao deve criar migrations
somente apos aprovacao explicita. Todas as tabelas `cv_*` devem ter `empresa_id INTEGER NOT NULL`,
`created_at`, `updated_at`, `deleted_at`, `created_by` e `updated_by` quando houver mutacao de usuario.

### 3.1 `cv_voos` - P0

Objetivo: entidade central de programacao e acompanhamento operacional do voo.

Campos principais:

- `id`
- `empresa_id`
- `prefixo`
- `data_programacao`
- `origem_id`
- `destino_id`
- `tipo_voo_id`
- `natureza_voo_id`
- `aeronave_id`
- `horario_previsto_partida`
- `horario_previsto_chegada`
- `horario_real_partida`
- `horario_real_chegada`
- `status`
- `observacoes`
- `cancelado_motivo_id`
- `alternado_destino_id`
- `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

Chaves:

- PK: `id`.
- FK conceitual: `empresa_id -> empresas.id`.
- FK conceitual: `origem_id/destino_id/alternado_destino_id -> cv_aeroportos.id`.
- FK conceitual: `tipo_voo_id -> cv_tipos_voo.id`.
- FK conceitual: `natureza_voo_id -> cv_naturezas_voo.id`.
- FK conceitual: `aeronave_id -> aeronaves.id` se reutilizar cadastro existente.

Indices:

- `(empresa_id, data_programacao, status)`.
- `(empresa_id, aeronave_id, data_programacao)`.
- `(empresa_id, prefixo, data_programacao)`.
- `(empresa_id, deleted_at)`.

Constraints:

- `status IN ('planejado','liberado_operacionalmente','em_andamento','pousado','concluido_operacionalmente','cancelado','alternado_divergido')`.
- `horario_previsto_chegada >= horario_previsto_partida`, quando ambos existirem.
- `horario_real_chegada >= horario_real_partida`, quando ambos existirem.
- `aeronave_id`, se informado, deve pertencer a mesma `empresa_id`.

Relacao com entidades existentes: reusa `aeronaves` e dialoga com `funcionarios` via
`cv_voo_tripulantes`. Nao escreve em FRMS, Qualificacoes, MRO, Sigvoos ou APUS.

### 3.2 `cv_rdv_operacional` - P0

Objetivo: registrar preenchimento operacional interno do voo realizado. Nao e eDB, nao e
assinatura PIC, nao substitui Diario de Bordo e nao tem valor fiscal/regulatorio.

Campos principais:

- `id`
- `empresa_id`
- `voo_id`
- `numero`
- `data_voo`
- `horario_decolagem_real`
- `horario_pouso_real`
- `horas_voadas`
- `numero_pousos`
- `ciclos`
- `combustivel_decolagem`
- `combustivel_pouso`
- `combustivel_consumo`
- `pob`
- `carga_kg`
- `ocorrencias`
- `divergencias`
- `status`
- `responsavel_preenchimento_id`
- `preenchido_em`
- `finalizado_operacionalmente_por`
- `finalizado_operacionalmente_em`
- `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

Chaves:

- PK: `id`.
- FK: `voo_id -> cv_voos.id`.
- FK conceitual: `responsavel_preenchimento_id -> funcionarios.id`.
- FK conceitual: `finalizado_operacionalmente_por -> usuarios.id`.

Indices:

- Unique parcial/conceitual: um RDV ativo por `(empresa_id, voo_id)`.
- `(empresa_id, data_voo, status)`.
- `(empresa_id, responsavel_preenchimento_id, data_voo)`.
- `(empresa_id, deleted_at)`.

Constraints:

- `status IN ('rascunho','preenchimento_finalizado','cancelado')`.
- `horario_pouso_real >= horario_decolagem_real`, quando ambos existirem.
- `horas_voadas >= 0`, `numero_pousos >= 0`, `ciclos >= 0`.
- Combustivel nao negativo.
- `responsavel_preenchimento_id` deve pertencer ao mesmo tenant.
- Campos de finalizacao operacional nao representam assinatura.

Relacao com existentes: le funcionarios/usuarios para responsavel. Nao envia dados ao MRO
ou FRMS.

### 3.3 `cv_voo_tripulantes` - P0

Objetivo: associar funcionarios reais a um voo, por funcao operacional.

Campos principais:

- `id`
- `empresa_id`
- `voo_id`
- `funcionario_id`
- `funcao`
- `horario_apresentacao`
- `horario_dispensa`
- `observacoes`
- `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

Chaves:

- PK: `id`.
- FK: `voo_id -> cv_voos.id`.
- FK conceitual: `funcionario_id -> funcionarios.id`.

Indices:

- `(empresa_id, voo_id)`.
- `(empresa_id, funcionario_id, horario_apresentacao)`.
- Unique conceitual: `(empresa_id, voo_id, funcionario_id, funcao)` para registros ativos.

Constraints:

- `funcao IN ('PIC','SIC','COM','MEC','OUTRO')`.
- `funcionario_id` deve estar ativo e no mesmo tenant.
- `horario_dispensa >= horario_apresentacao`, quando ambos existirem.

Relacao com existentes: usa `funcionarios.id` como fonte de tripulantes. Qualificacoes e
FRMS podem ser lidos de modo informativo em endpoint separado.

### 3.4 `cv_voo_eventos` - P0

Objetivo: registrar trilha operacional simples de mudancas de status e eventos relevantes.
Nao e ledger imutavel e nao substitui Records Core.

Campos principais:

- `id`
- `empresa_id`
- `voo_id`
- `tipo_evento`
- `status_anterior`
- `status_novo`
- `descricao`
- `motivo_id`
- `metadata_json`
- `usuario_id`
- `created_at`

Chaves:

- PK: `id`.
- FK: `voo_id -> cv_voos.id`.
- FK conceitual: `usuario_id -> usuarios.id`.
- FK conceitual: `motivo_id -> cv_motivos_operacionais.id`.

Indices:

- `(empresa_id, voo_id, created_at)`.
- `(empresa_id, tipo_evento, created_at)`.
- `(empresa_id, usuario_id, created_at)`.

Constraints:

- `tipo_evento IN ('status','horario','tripulacao','rdv','ocorrencia','observacao','sistema')`.
- `metadata_json` deve ser sanitizado e sem secrets.

Relacao com existentes: pode duplicar parte da auditoria legada para leitura de timeline,
mas auditoria operacional continua registrada tambem em `auditoria` ou `audit_events_v2`.

### 3.5 `cv_ocorrencias_operacionais` - P1

Objetivo: registrar atraso, cancelamento, alternado/divergido e outras ocorrencias
operacionais ligadas ao voo.

Campos principais:

- `id`
- `empresa_id`
- `voo_id`
- `tipo`
- `motivo_id`
- `tempo_atraso_minutos`
- `origem_status`
- `observacao`
- `registrado_por`
- `created_at`, `updated_at`, `deleted_at`

Chaves:

- PK: `id`.
- FK: `voo_id -> cv_voos.id`.
- FK: `motivo_id -> cv_motivos_operacionais.id`.

Indices:

- `(empresa_id, voo_id)`.
- `(empresa_id, tipo, created_at)`.
- `(empresa_id, motivo_id, created_at)`.

Constraints:

- `tipo IN ('atraso','cancelamento','alternado_divergido','ocorrencia')`.
- `tempo_atraso_minutos >= 0` quando `tipo = 'atraso'`.
- `motivo_id` deve pertencer ao mesmo tenant ou ser catalogo global permitido.

Relacao com existentes: substitui `MOCK_CANCELAMENTOS_ATRASOS`.

### 3.6 `cv_motivos_operacionais` - P0 para seeds minimos, P1 para CRUD admin

Objetivo: catalogo estruturado de motivos de atraso/cancelamento/ocorrencia.

Campos principais:

- `id`
- `empresa_id`
- `codigo`
- `nome`
- `tipo`
- `descricao`
- `ativo`
- `ordem`
- `created_at`, `updated_at`, `deleted_at`

Chaves:

- PK: `id`.
- Unique: `(empresa_id, codigo)`.

Indices:

- `(empresa_id, tipo, ativo)`.
- `(empresa_id, deleted_at)`.

Constraints:

- `tipo IN ('atraso','cancelamento','alternado_divergido','indisponibilidade','geral')`.
- `ativo IN (0,1)`.

Relacao com existentes: novo catalogo proprio do Controle de Voos.

### 3.7 `cv_observacoes` - P1

Objetivo: registrar observacoes operacionais textuais com autoria e escopo.

Campos principais:

- `id`
- `empresa_id`
- `entidade_tipo`
- `entidade_id`
- `texto`
- `visibilidade`
- `usuario_id`
- `created_at`, `updated_at`, `deleted_at`

Chaves:

- PK: `id`.
- FK conceitual: `usuario_id -> usuarios.id`.

Indices:

- `(empresa_id, entidade_tipo, entidade_id, created_at)`.
- `(empresa_id, usuario_id, created_at)`.

Constraints:

- `entidade_tipo IN ('voo','rdv','aeronave','indisponibilidade')`.
- Texto com limite operacional e sanitizacao.

Relacao com existentes: complemento textual; nao e evidencia regulada.

### 3.8 `cv_indisponibilidades` - P1

Objetivo: registrar indisponibilidade operacional de aeronave para apoiar o OCC.

Campos principais:

- `id`
- `empresa_id`
- `aeronave_id`
- `grupo_id`
- `causa_id`
- `data_inicio`
- `data_fim_prevista`
- `data_fim_real`
- `status`
- `observacao`
- `os_mro_ref`
- `registrado_por`
- `encerrado_por`
- `created_at`, `updated_at`, `deleted_at`

Chaves:

- PK: `id`.
- FK conceitual: `aeronave_id -> aeronaves.id`.
- FK: `grupo_id -> cv_grupos_indisponibilidade.id`.
- FK: `causa_id -> cv_causas_indisponibilidade.id`.

Indices:

- `(empresa_id, aeronave_id, status)`.
- `(empresa_id, data_inicio, data_fim_prevista)`.
- `(empresa_id, deleted_at)`.

Constraints:

- `status IN ('ativa','encerrada','cancelada')`.
- `data_fim_prevista >= data_inicio`, quando informada.
- `data_fim_real >= data_inicio`, quando informada.
- `os_mro_ref` e texto livre; nao implica integracao MRO.

Relacao com existentes: usa aeronaves reais; nao cria OS nem escreve no MRO.

### 3.9 `cv_indisponibilidade_voos` - P1

Objetivo: associar indisponibilidades aos voos impactados.

Campos principais:

- `id`
- `empresa_id`
- `indisponibilidade_id`
- `voo_id`
- `impacto`
- `created_at`

Chaves:

- PK: `id`.
- Unique: `(empresa_id, indisponibilidade_id, voo_id)`.

Indices:

- `(empresa_id, voo_id)`.
- `(empresa_id, indisponibilidade_id)`.

Constraints:

- Todos os registros devem pertencer ao mesmo `empresa_id`.

### 3.10 `cv_hangaragens` - futuro/P1 opcional, adiada da primeira migration

Objetivo: registrar periodos de hangaragem quando a operacao exigir separar esse fluxo de
indisponibilidade. Para B1, recomenda-se nao criar tabela propria: hangaragem pode ser
representada por `cv_indisponibilidades` com grupo/causa apropriados. Se a operacao exigir
controle especifico, criar `cv_hangaragens` em fase posterior.

Campos principais futuros:

- `id`
- `empresa_id`
- `aeronave_id`
- `data_entrada`
- `data_saida_prevista`
- `data_saida_real`
- `motivo`
- `os_mro_ref`
- `status`
- `registrado_por`, `encerrado_por`
- `created_at`, `updated_at`, `deleted_at`

Prioridade: futuro/P1 opcional; fora da primeira migration recomendada.

### 3.11 Catalogos auxiliares minimos

`cv_aeroportos` - P0/P1:

- Objetivo: aeroportos, helipontos e plataformas.
- Campos: `empresa_id`, `codigo_icao`, `codigo_iata`, `nome`, `cidade`, `uf`, `tipo`, `ativo`.
- Indices: `(empresa_id, codigo_icao)`, `(empresa_id, tipo, ativo)`.
- Constraint: `tipo IN ('aeroporto','plataforma','heliponto')`.

`cv_tipos_voo` - P0:

- Objetivo: classificar tipo operacional do voo.
- Campos: `empresa_id`, `codigo`, `nome`, `descricao`, `ativo`.
- Unique: `(empresa_id, codigo)`.

`cv_naturezas_voo` - P0:

- Objetivo: classificar natureza interna da operacao.
- Campos: `empresa_id`, `codigo`, `nome`, `descricao`, `ativo`.
- Unique: `(empresa_id, codigo)`.

`cv_grupos_indisponibilidade` - P1:

- Objetivo: agrupar causas de indisponibilidade.
- Campos: `empresa_id`, `codigo`, `nome`, `ativo`.

`cv_causas_indisponibilidade` - P1:

- Objetivo: catalogar causas especificas de indisponibilidade.
- Campos: `empresa_id`, `grupo_id`, `codigo`, `nome`, `ativo`.
- FK: `grupo_id -> cv_grupos_indisponibilidade.id`.

## 4. Multi-tenant e RBAC

`empresa_id` e obrigatorio em todas as tabelas `cv_*` e em todas as queries. Toda leitura,
insert, update e soft delete deve filtrar por `empresa_id = ?`; toda FK para entidades
existentes deve verificar pertencimento ao mesmo tenant antes de gravar. Endpoints devem usar
o contexto de tenant existente (`getEmpresaId`/`getEmpresaIdSafe`) e falhar fechado se a
empresa nao puder ser resolvida.

Perfis autorizados:

- `viewer`: leitura de dashboard, voos, RDV, relatorios internos e catalogos.
- `student`: piloto/tripulante; leitura dos proprios voos e RDVs; preenchimento operacional
  de RDV dos voos em que esta atribuido, se a regra de produto permitir.
- `editor`: OCC/despacho operacional interno; cria e edita voos, tripulacao, status, RDV,
  ocorrencias e indisponibilidades.
- `manager`: gestor operacional; tudo de `editor` e fechamento/revisao operacional.
- `admin`: configuracao de catalogos, parametros e acesso.

Permissoes por acao:

| Acao | Papel minimo |
|---|---|
| Ler dashboard/listas/detalhes | `viewer` |
| Ler proprios voos/RDVs | `student` com filtro por `funcionario_id` |
| Criar/editar voo | `editor` |
| Atribuir/remover tripulante | `editor` |
| Alterar status operacional | `editor` |
| Cancelar voo | `editor`; `manager` recomendado para politicas restritivas |
| Preencher RDV operacional | `student` atribuido ou `editor` |
| Finalizar preenchimento do RDV | `student` atribuido ou `editor` |
| Revisar operacionalmente RDV/voo | `manager` |
| Fechar operacionalmente voo | `manager` ou `editor` conforme politica do tenant |
| CRUD catalogos | `admin` |
| Export interno nao fiscal | `viewer`; `manager` recomendado se incluir dados sensiveis |

O piloto pode ver seus voos, sua tripulacao operacional, horarios, status, RDV operacional
do proprio voo e alertas informativos estritamente necessarios. OCC pode editar programacao,
tripulacao, status, horarios e ocorrencias. Gestor pode revisar operacionalmente e fechar
operacionalmente sem valor juridico. Admin configura catalogos e parametros.

## 5. Estados e transicoes de voo

Status permitidos:

- `planejado`
- `liberado_operacionalmente`
- `em_andamento`
- `pousado`
- `concluido_operacionalmente`
- `cancelado`
- `alternado_divergido`

Transicoes:

| De | Para | Quem pode | Checagens minimas | Evento | Altera RDV | Reversivel |
|---|---|---|---|---|---|---|
| `planejado` | `liberado_operacionalmente` | `editor`+ | voo com origem, destino, aeronave, horarios previstos e tripulacao minima; alertas informativos calculados se disponiveis | `status` | cria/garante RDV rascunho opcional | sim, por `editor`+ com motivo |
| `liberado_operacionalmente` | `em_andamento` | `editor`+ | partida real informada ou payload com `horario_real_partida`; voo nao cancelado | `status` + `horario` | atualiza decolagem real se enviada | sim, por `manager` com motivo |
| `em_andamento` | `pousado` | `editor`+ | chegada real >= partida real | `status` + `horario` | atualiza pouso real se enviada | sim, por `manager` com motivo |
| `pousado` | `concluido_operacionalmente` | `manager` ou `editor` conforme politica | RDV com campos minimos e preenchimento finalizado; ocorrencias obrigatorias registradas | `status` | bloqueia edicoes comuns do RDV, mantendo correcao operacional controlada | sim, por `manager` com motivo |
| `planejado/liberado_operacionalmente` | `cancelado` | `editor`+ | motivo de cancelamento obrigatorio | `status` + `ocorrencia` | RDV fica cancelado ou nao criado | sim, por `manager` com motivo |
| `em_andamento/pousado` | `alternado_divergido` | `editor`+ | destino alternado/divergido e observacao obrigatorios | `status` + `ocorrencia` | registra divergencia no RDV | sim, por `manager` com motivo |
| `alternado_divergido` | `pousado` | `editor`+ | chegada real e destino final informados | `status` | atualiza RDV | sim, por `manager` |

Toda transicao gera linha em `cv_voo_eventos` e auditoria operacional. Reversao nunca apaga
o evento anterior; cria novo evento com motivo.

## 6. RDV operacional N1

Campos do RDV operacional N1:

- Horarios previstos herdados do voo.
- Horarios realizados: decolagem e pouso reais.
- Origem e destino herdados do voo, com divergencia/alternado registrada quando aplicavel.
- Pousos e ciclos.
- Combustivel decolagem, pouso e consumo.
- POB e carga, se confirmados como MVP pelo gestor; caso contrario, manter nullable.
- Ocorrencias e divergencias operacionais.
- Responsavel pelo preenchimento (`responsavel_preenchimento_id`).
- Observacoes.
- Status: `rascunho`, `preenchimento_finalizado`, `cancelado`.

Explicito para produto, API e export:

- Nao e eDB.
- Nao e assinatura PIC.
- Nao substitui Diario de Bordo.
- Nao tem valor fiscal/regulatorio.
- Finalizar preenchimento significa apenas completar um fluxo operacional interno.

## 7. Endpoints conceituais

Todos os endpoints usam prefixo `/api/controle-voos`, autenticacao JWT, tenant context,
resposta padrao `{ success, data }` ou `{ success, error }`, validacao de payload com Zod
na futura implementacao e logs operacionais sem dados sensiveis.

| Endpoint | Payload | Resposta | Permissao | Checagens minimas | Logs |
|---|---|---|---|---|---|
| `GET /api/controle-voos/voos` | query `data_inicio`, `data_fim`, `status`, `aeronave_id`, `funcionario_id`, `page`, `limit` | lista paginada de voos com resumo de tripulacao/RDV | `viewer`; `student` somente proprios voos | filtro `empresa_id`; limite maximo; filtro proprio para piloto | leitura agregada opcional em audit v2 se exportavel |
| `POST /api/controle-voos/voos` | prefixo, origem/destino, tipo/natureza, aeronave, horarios previstos, observacoes | voo criado | `editor`+ | tenant de catalogos/aeronave; horarios coerentes | `cv_voo_eventos: sistema/status`; `auditoria INSERT` |
| `GET /api/controle-voos/voos/:id` | path `id` | detalhe com tripulacao, RDV, eventos e ocorrencias | `viewer`; `student` se atribuido | ownership por `empresa_id` | nenhum log obrigatorio |
| `PATCH /api/controle-voos/voos/:id` | campos editaveis de programacao | voo atualizado | `editor`+ | ownership; status permite edicao; FKs no tenant | `cv_voo_eventos`; `auditoria UPDATE` |
| `POST /api/controle-voos/voos/:id/status` | `status_novo`, horarios reais opcionais, `motivo_id`, `observacao` | status atualizado + evento | `editor`+; algumas reversoes `manager` | transicao permitida; motivo quando necessario | `cv_voo_eventos`; `auditoria UPDATE` |
| `POST /api/controle-voos/voos/:id/tripulantes` | `funcionario_id`, `funcao`, apresentacao/dispensa | tripulante atribuido | `editor`+ | funcionario ativo no tenant; duplicidade; horarios | `cv_voo_eventos`; `auditoria INSERT` |
| `DELETE /api/controle-voos/voos/:id/tripulantes/:tripulanteId` | path ids + motivo opcional | soft delete do vinculo | `editor`+ | ownership de voo e vinculo | `cv_voo_eventos`; `auditoria DELETE` |
| `GET /api/controle-voos/voos/:id/rdv` | path `id` | RDV do voo ou `null` | `viewer`; `student` se atribuido | ownership | nenhum log obrigatorio |
| `PUT /api/controle-voos/voos/:id/rdv` | horarios reais, horas, pousos, ciclos, combustivel, POB/carga, ocorrencias, divergencias | RDV criado/atualizado | `student` atribuido ou `editor`+ | 1:1 ativo por voo; sequencia de horarios; valores nao negativos | `cv_voo_eventos`; `auditoria UPSERT` |
| `POST /api/controle-voos/voos/:id/rdv/finalizar-preenchimento` | `responsavel_preenchimento_id`, observacao opcional | RDV `preenchimento_finalizado` | `student` atribuido ou `editor`+ | campos minimos; responsavel no tenant; sem assinatura | `cv_voo_eventos`; `auditoria UPDATE` |
| `POST /api/controle-voos/voos/:id/ocorrencias` | `tipo`, `motivo_id`, `tempo_atraso_minutos`, `observacao` | ocorrencia criada | `editor`+ | motivo no tenant; atraso com minutos >= 0 | `cv_voo_eventos`; `auditoria INSERT` |
| `GET /api/controle-voos/dashboard` | query `data`, filtros opcionais | agregados OCC, alertas informativos, voos do dia | `viewer` | `empresa_id`; data obrigatoria/default hoje | nenhum log obrigatorio |
| `GET /api/controle-voos/relatorios` | `tipo`, `data_inicio`, `data_fim`, filtros | dados agregados internos | `viewer`; possivel `manager` para dados sensiveis | range maximo; `empresa_id`; disclaimer | log de relatorio/export se baixar arquivo |
| `GET /api/controle-voos/catalogos/:nome` | nome do catalogo | lista de catalogo | `viewer` | catalogo permitido | nenhum log obrigatorio |
| `POST/PATCH/DELETE /api/controle-voos/catalogos/:nome` | campos do catalogo | item criado/alterado/removido | `admin` | nome em whitelist; unique por tenant | `auditoria INSERT/UPDATE/DELETE` |
| `GET /api/controle-voos/funcionarios-disponiveis` | filtros de funcao/data/aeronave | funcionarios candidatos | `editor`+ | leitura tenant-scoped de `funcionarios`; sem expor campos sensiveis desnecessarios | nenhum log obrigatorio |
| `GET /api/controle-voos/voos/:id/alertas-informativos` | path `id` | alertas de qualificacao/FRMS quando seguro | `editor`+; leitura reduzida para piloto | somente leitura; nao bloquear por regra regulatoria | log apenas se houver erro/diagnostico |

Nao criar endpoints de assinatura, selagem, modo fiscalizacao, export fiscal, envio ao MRO,
envio ao FRMS, eDB, SDRMe ou Records Core.

## 8. Integracoes N1

| Integracao | Classificacao | Desenho |
|---|---|---|
| Funcionarios | P0 leitura | `cv_voo_tripulantes.funcionario_id` referencia `funcionarios.id`. Endpoints consultam apenas funcionarios do mesmo `empresa_id`. |
| Qualificacoes | P1 leitura informativa | Consulta qualificacoes/CMA/ASO para exibir alerta. Nao escreve e nao bloqueia como ato regulatorio. |
| Escalas | Futuro/P1 opcional | Conciliacao de voos planejados com escala. Fora da primeira migration. |
| FRMS | Informativo/futuro | Leitura de indicadores quando seguro. Controle de Voos nao calcula fadiga e nao e SGRF. |
| MRO | Futuro | `os_mro_ref` e texto livre. Sem chamada a MRO real e sem escrita. |
| SGSO | Futuro | Ocorrencias podem futuramente alimentar analises, sem N1 escrever no SGSO. |
| Records Core | Futuro | Fora do N1; somente N3 regulado poderia considerar Records Core. |
| LMS | Nao fazer agora | Sem integracao no backend N1. |

## 9. Auditoria operacional simples

O N1 usa auditoria A1: quem fez o que, quando, em qual tenant e sobre qual entidade.
Nao ha imutabilidade criptografica, hash chain, assinatura ou addendum.

Logar:

- Criacao, edicao, cancelamento e fechamento operacional de voo.
- Transicoes de status.
- Atribuicao/remocao de tripulantes.
- Criacao/edicao/finalizacao de preenchimento do RDV operacional.
- Ocorrencias operacionais.
- CRUD de catalogos.
- Exports internos, quando implementados.

Onde logar:

- `cv_voo_eventos` para timeline operacional de voo.
- `auditoria` legada via `registrarAuditoria` para mutacoes.
- `audit_events_v2`, se a fase de implementacao decidir dual-write e o padrao do projeto ja estiver consolidado.

Diferenca para Records Core regulado:

- Auditoria A1 e operacional, editavel por evolucao tecnica normal e voltada a suporte/rastreabilidade interna.
- Records Core regulado teria cadeia de hash, versoes, addenda, assinatura, retencao e export fiscal; nada disso existe neste N1.

Eventos minimos rastreaveis:

- `voo.criado`
- `voo.atualizado`
- `voo.status_alterado`
- `voo.cancelado`
- `voo.concluido_operacionalmente`
- `tripulante.atribuido`
- `tripulante.removido`
- `rdv.criado`
- `rdv.atualizado`
- `rdv.preenchimento_finalizado`
- `ocorrencia.registrada`
- `catalogo.alterado`
- `relatorio.exportado_interno`

## 10. Seeds e dados iniciais

Catalogos minimos:

- Aeroportos, helipontos e plataformas iniciais.
- Tipos de voo: regular, charter, ferry, offshore, carga, ambulancia.
- Naturezas internas: passageiro, carga, misto, ambulancia.
- Motivos de atraso/cancelamento: trafego, meteorologia, aeronave indisponivel, tripulacao,
  atendimento em solo, restricao operacional, documentacao, cliente/contrato, outros.
- Grupos e causas de indisponibilidade, se `cv_indisponibilidades` entrar na fase.
- Status de voo e RDV como constantes de aplicacao ou catalogo controlado, nao editavel por tenant.

Estrategia para migrar mock data:

- Nao importar mock para producao.
- Criar seed demonstrativo apenas local/dev, marcado como dados ficticios.
- Nunca misturar seed demonstrativo com tenant real sem aviso explicito.
- Para piloto real, comecar com catalogos reais do tenant e input manual controlado.

## 11. Testes necessarios

Rotas:

- CRUD de voo com payload valido e invalido.
- Lista/detalhe com paginacao e filtros.
- RDV criar/editar/finalizar preenchimento.
- Dashboard por data.
- Relatorios internos, quando implementados.

RBAC:

- `viewer` nao cria/edita.
- `student` ve apenas voos/RDVs proprios.
- `editor` executa operacao OCC.
- `manager` revisa/fecha operacionalmente onde aplicavel.
- `admin` gerencia catalogos.

Multi-tenant:

- Voo da empresa A nao aparece para empresa B.
- Funcionario de outro tenant nao pode ser atribuido.
- Aeronave/catalogo de outro tenant nao pode ser usado.
- IDs validos em outro tenant retornam 404/403 sem vazar existencia.

Status:

- Transicoes permitidas passam e geram evento.
- Transicoes invalidas falham.
- Cancelamento exige motivo.
- Reversao exige papel/motivo conforme politica.

RDV:

- Chegada antes de decolagem falha.
- Valores negativos falham.
- Segundo RDV ativo para mesmo voo falha.
- Finalizacao de preenchimento sem campos minimos falha.
- Ausencia de termos regulatorios em payload/resposta/export.

Dashboard:

- Agregados respeitam `empresa_id`.
- Data default e hoje quando nao informada.
- Alertas informativos nao bloqueiam fluxo.

Relatorios:

- Rodape/disclaimer "Uso operacional interno - nao fiscal".
- Sem export fiscal.
- Filtros por periodo e tenant.

## 12. Plano de implementacao backend

### Fase B1 - migration/schema N1

Entregaveis:

- Migration futura com tabelas P0: `cv_voos`, `cv_rdv_operacional`,
  `cv_voo_tripulantes`, `cv_voo_eventos`, `cv_motivos_operacionais`,
  `cv_aeroportos`, `cv_tipos_voo`, `cv_naturezas_voo`.
- Indices por `empresa_id`.
- Seeds minimos por tenant ou seed global controlado.

Riscos:

- Criar schema amplo demais.
- Duplicar `aeronaves` em vez de reutilizar cadastro existente.
- Campo de RDV parecer assinatura.

Criterios de saida:

- Migration revisada, sem aplicar sem autorizacao.
- Testes de schema em SQLite temporario.
- Nenhuma tabela `regulated_*`.

Modelo recomendado: Codex 5.5.

### Fase B2 - endpoints CRUD voos

Entregaveis:

- Rotas Hono conceituais implementadas futuramente para list/create/detail/patch.
- Filtros por `empresa_id`.
- Zod schemas.

Riscos:

- IDOR cross-tenant.
- Falta de paginacao.

Criterios de saida:

- CRUD com testes de tenant e RBAC.
- Auditoria em mutacoes.

Modelo recomendado: Codex 5.5.

### Fase B3 - RDV operacional

Entregaveis:

- Endpoints de RDV por voo.
- Finalizacao de preenchimento operacional.
- Validacoes de horario, horas, pousos, ciclos e combustivel.

Riscos:

- Usuario interpretar finalizacao como assinatura.
- Campos insuficientes para operacao real.

Criterios de saida:

- Linguagem sem termos regulatorios.
- Testes de RDV e status.

Modelo recomendado: Codex 5.5.

### Fase B4 - dashboard/relatorios

Entregaveis:

- Dashboard por data.
- Relatorios internos MVP: voos por periodo, horas por aeronave, horas por tripulante,
  RDVs pendentes, atrasos/cancelamentos.
- Export interno nao fiscal, se autorizado.

Riscos:

- Relatorio ser usado como fiscal.
- Queries lentas sem indices.

Criterios de saida:

- Disclaimer presente.
- Range de datas limitado.
- Testes de agregacao por tenant.

Modelo recomendado: Codex 5.5.

### Fase B5 - RBAC/auditoria

Entregaveis:

- Permissoes refinadas por endpoint.
- Auditoria operacional A1 consistente.
- Timeline por voo.

Riscos:

- `student` enxergar dados de outros tripulantes.
- Logs com dados sensiveis desnecessarios.

Criterios de saida:

- Matriz RBAC testada.
- Eventos minimos rastreaveis.

Modelo recomendado: Codex 5.5.

### Fase B6 - integracao frontend

Entregaveis:

- Frontend troca mocks por APIs P0/P1.
- Banner N1 somente quando tela estiver 100% real.
- Formularios de voo/RDV/status.

Riscos:

- Misturar mock e real na mesma tela.
- Habilitar export ou botoes regulados por acidente.

Criterios de saida:

- Cada tela declara fonte de dados.
- Sem botao de assinatura ou export fiscal.

Modelo recomendado: Codex 5.5.

## 13. Riscos tecnicos

| Risco | Mitigacao |
|---|---|
| Vazamento cross-tenant | `empresa_id` obrigatorio, ownership checks e testes IDOR. |
| Mock misturado com real | Banner por tela/fonte; nao importar mock em producao. |
| RDV confundido com eDB | Nomes operacionais, sem assinatura, disclaimers e ausencia de Records Core. |
| Status inconsistente | State machine explicita e eventos obrigatorios. |
| Permissoes frageis | Matriz RBAC por endpoint e testes. |
| Escopo crescer para MRO/eDB | Lista de fora de escopo como gate de PR. |
| Relatorios usados como fiscais | Rodape nao fiscal, sem endpoint fiscal, sem manifesto/hash. |
| Falta de auditoria | Mutacoes com `auditoria` + `cv_voo_eventos`. |
| Duplicacao de fonte FRMS/Qualificacoes | Apenas leitura informativa; nao persistir scores como fonte. |
| Reutilizacao incorreta de aeronaves | Confirmar schema real de `aeronaves` antes da migration. |

## 14. Decisao final

O backend N1 deve avancar, desde que avance como operacional interno nao regulado e apos
aprovacao explicita para criar migration/schema. O valor imediato e substituir mocks por
fonte operacional real, multi-tenant e auditavel em nivel A1, sem entrar no dominio eDB/SDRMe.

Primeira migration/schema recomendada:

- `cv_voos`
- `cv_rdv_operacional`
- `cv_voo_tripulantes`
- `cv_voo_eventos`
- `cv_motivos_operacionais`
- `cv_aeroportos`
- `cv_tipos_voo`
- `cv_naturezas_voo`
- possivelmente `cv_observacoes`, se o produto exigir observacoes separadas desde B1

Ficar fora da primeira implementacao:

- `cv_hangaragens` como tabela propria.
- Integracao MRO.
- Integracao Sigvoos/APUS.
- Records Core.
- eDB, SDRMe, RAS, assinatura, offline/tablet.
- Export fiscal.
- Escalas/EVD como bloqueio.

Validar antes de codar:

- Se `aeronaves` existente cobre aeronave fisica operacional por tenant.
- Campos RDV minimos com gestor/OCC.
- Mapeamento de roles reais para OCC, piloto, manutencao e gestor.
- Catalogos iniciais por tenant.
- Se POB/carga entram em B1 ou ficam nullable.
- Politica de piloto preencher apenas proprio RDV.

## 15. Proximo prompt recomendado

```text
Voce esta trabalhando no monorepo do AirTrust.

Objetivo:
Implementar somente a migration/schema N1 minimo do backend Controle de Voos,
com base em docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md, sem endpoints e sem frontend.

Importante:
- Nao aplicar migrations.
- Nao fazer deploy.
- Nao mexer em secrets.
- Nao fazer commit.
- Nao criar eDB, SDRMe, Records Core, RAS, assinatura juridica, modo fiscalizacao
  ou export fiscal.
- Nao integrar com MRO real, Sigvoos/APUS, FRMS como SGRF ou LMS.
- O modulo continua operacional interno, nao regulado e nao autorizado pela ANAC.

Referencias obrigatorias:
- docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md
- docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md
- docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md
- AUTH_RBAC_MULTITENANCY.md
- DATABASE_SCHEMA.md
- worker-airtrust/migrations/
- worker-airtrust/src/middleware/

Tarefa:
1. Criar uma migration nova em worker-airtrust/migrations/ com schema conceitual B1:
   cv_voos, cv_rdv_operacional, cv_voo_tripulantes, cv_voo_eventos,
   cv_motivos_operacionais, cv_aeroportos, cv_tipos_voo, cv_naturezas_voo
   e cv_observacoes somente se necessario.
2. Todas as tabelas devem ter empresa_id, timestamps, deleted_at e indices tenant-scoped.
3. Reutilizar aeronaves e funcionarios reais por FK conceitual/colunas *_id; nao criar MRO.
4. Nao incluir campos de assinatura, hash, ledger, fiscalizacao, RAS, eDB ou SDRMe.
5. Criar testes de migration em SQLite temporario para constraints, indices e isolamento basico.

Entrega:
- Arquivo de migration criado, sem aplicar.
- Testes executados localmente em banco temporario.
- Resumo de tabelas, indices e constraints.
- Confirmacao explicita de que nada foi aplicado em producao.
```

## Entrega e sugestao de commit

Documento criado: `docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md`.

Tabelas conceituais: `cv_voos`, `cv_rdv_operacional`, `cv_voo_tripulantes`,
`cv_voo_eventos`, `cv_ocorrencias_operacionais`, `cv_motivos_operacionais`,
`cv_observacoes`, `cv_indisponibilidades`, `cv_indisponibilidade_voos`,
`cv_hangaragens` futura/adiada e catalogos auxiliares.

Endpoints conceituais: rotas Hono futuras sob `/api/controle-voos`, incluindo voos,
status, tripulantes, RDV, ocorrencias, dashboard, relatorios e catalogos.

RBAC proposto: `viewer` leitura, `student` proprio voo/RDV, `editor` OCC operacional,
`manager` revisao/fechamento operacional, `admin` catalogos/configuracao.

Integracoes: Funcionarios P0 leitura; Qualificacoes P1 informativa; FRMS informativo;
Escalas futuro/P1 opcional; MRO/SGSO/Records Core/LMS fora do N1 inicial.

Plano: B1 schema, B2 CRUD voos, B3 RDV, B4 dashboard/relatorios, B5 RBAC/auditoria,
B6 frontend.

Riscos: cross-tenant, mock misturado com real, RDV confundido com eDB, status inconsistente,
permissoes frageis, escopo inflar para MRO/eDB, relatorios usados como fiscais e falta de
auditoria.

Sugestao de commit, se autorizado posteriormente:

`docs(controle-voos): add N1 backend design`
