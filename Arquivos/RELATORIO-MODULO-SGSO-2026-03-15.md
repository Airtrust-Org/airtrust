# Relatório Detalhado do Módulo SGSO

Data: 15 de março de 2026  
Workspace: AirTrust  
Versão validada em produção: `51a45d64`

## 1. Resumo executivo

O módulo SGSO do AirTrust passou a cobrir, no mesmo ecossistema, o fluxo operacional de relato, triagem, análise, bowtie, matriz de risco e FRAT. A base legada de SGSO já existente foi preservada e expandida com capacidades next-gen, sem quebrar os endpoints e telas atuais.

O estado final validado nesta entrega é:

- Frontend principal publicado em `https://airtrust.online` com as novas rotas SGSO.
- Backend SGSO publicado em `https://airtrust-api-production.airtrust.workers.dev`.
- Migrations `0281` e `0282` aplicadas em produção no D1 remoto.
- Smoke test autenticado do módulo SGSO executado com sucesso em produção.
- Hardening de configuração aplicado no deploy posterior, removendo segredos do `wrangler.toml` versionado e restringindo o bypass de autenticação a desenvolvimento local explícito.
- Pipeline de deploy ajustado para não falhar desnecessariamente quando o `worker-frontend` atingir limite diário de KV, já que o domínio público principal é servido por Cloudflare Pages.
- Correção runtime aplicada na rota `GET /api/sgso/kpi/spi` para compatibilidade com schemas antigos e novos de `frms_jornada`.

## 2. Objetivo do módulo

O objetivo do módulo SGSO é suportar o ciclo completo de segurança operacional, do reporte inicial até a gestão de risco e retroalimentação do sistema:

- Recebimento de relato RELPREV/ASR com baixa fricção.
- Triagem, classificação e clusterização inicial do evento.
- Registro ou reforço de perigos operacionais.
- Estruturação de cenários bowtie com ameaças, consequências e barreiras.
- Avaliação de risco em matriz 5x5 configurável.
- Gestão de auditorias, CAPA e não conformidades.
- Execução de FRAT operacional com bloqueio e aprovação de despacho.
- Rastreabilidade completa via workflow, notificações e trilha de auditoria.

## 3. Arquitetura atual

### 3.1 Backend

Stack:

- Cloudflare Workers
- Hono
- D1
- R2

Estratégia adotada:

- O SGSO legado continua centralizado em `worker-airtrust/src/routes/sgso.ts`.
- As funcionalidades next-gen foram isoladas em `worker-airtrust/src/routes/sgso-next-gen.ts`.
- A lógica compartilhada de DTOs e heurísticas foi concentrada em `worker-airtrust/src/lib/sgso-next-gen.ts`.
- O router legado monta o router next-gen com `sgso.route('/', sgsoNextGenRoutes)`.

Benefícios dessa abordagem:

- Mantém compatibilidade com o frontend e integrações antigas.
- Evita inflar ainda mais o arquivo monolítico legado.
- Permite evolução incremental por subdomínio.

### 3.2 Frontend

Stack:

- React 19
- TypeScript
- Vite
- React Router

Estratégia adotada:

- Preservação da página SGSO principal existente.
- Criação de páginas dedicadas para os fluxos next-gen.
- Navegação expandida no cabeçalho da página SGSO.
- Reuso de autenticação já existente via hook específico de API SGSO.

Arquivos principais:

- `src/react-app/pages/Sgso.tsx`
- `src/react-app/pages/SgsoRelato.tsx`
- `src/react-app/pages/sgso/useSgsoApi.ts`
- `src/react-app/pages/sgso/SgsoRelprevPage.tsx`
- `src/react-app/pages/sgso/SgsoBowtiePage.tsx`
- `src/react-app/pages/sgso/SgsoFratPage.tsx`
- `src/react-app/App.tsx`

### 3.3 Banco de dados

O banco D1 já possuía a base SGSO das migrations `0271` a `0274`. A entrega atual expandiu esse domínio com:

- `0281_sgso_relprev_bowtie_frat.sql`
- `0282_sgso_seed_por_empresa.sql`

## 4. Modelo de dados

### 4.1 Base legada existente

As migrations anteriores já cobriam:

- `sgso_relatos`
- `sgso_avaliacao_risco`
- `sgso_acoes_mitigacao`
- fatores humanos / HFACS
- histórico de protocolo e status
- auditorias e itens de auditoria
- não conformidades
- configuração de SPI
- seed inicial ADREP e SPI

### 4.2 Expansão next-gen da migration 0281

Novas entidades criadas:

- `sgso_relato_capturas`
- `sgso_relato_privacidade`
- `sgso_relatos_midias_metadados`
- `sgso_relato_ia_triagem`
- `sgso_perigos`
- `sgso_relato_perigos`
- `sgso_bowtie_cenarios`
- `sgso_bowtie_nos`
- `sgso_bowtie_barreiras`
- `sgso_bowtie_barreira_vinculos`
- `sgso_bowtie_barreira_historico`
- `sgso_matriz_risco_perfis`
- `sgso_matriz_risco_celulas`
- `sgso_avaliacao_risco_contexto`
- `sgso_frat_modelos`
- `sgso_frat_fatores`
- `sgso_frat_avaliacoes`
- `sgso_frat_respostas`
- `sgso_frat_aprovacoes`
- `sgso_relato_workflow_eventos`
- `sgso_relato_notificacoes`
- `sgso_audit_trail`

Capacidades que essas tabelas habilitam:

- intake offline-first e reconciliação por `client_submission_id`
- confidencialidade e Just Culture com isolamento de dados sensíveis
- triagem heurística / IA assistida
- consolidação de perigo operacional além do relato individual
- bowtie persistente e auditável
- matriz 5x5 parametrizada por perfil
- FRAT com score, bloqueio e aprovação
- feedback loop rastreável ao relator
- auditoria técnica das mudanças do módulo

### 4.3 Seed multi-tenant da migration 0282

Objetivo:

- propagar templates globais para empresas ativas

O que foi clonado:

- perfis de matriz de risco por empresa
- células da matriz por empresa
- modelos FRAT por empresa
- fatores FRAT por empresa
- baseline de SPI a partir da empresa `6`

### 4.4 Observação importante de compatibilidade

Durante a validação em produção foi identificado que a tabela `frms_jornada` no ambiente remoto ainda usa um schema antigo, com colunas como:

- `data`
- `horas_voo_minutos`

e sem algumas colunas assumidas pela rota SGSO mais nova, como:

- `empresa_id`
- `data_inicio`
- `horas_voo`
- `effectiveness_pct`

Por isso, a rota de SPI foi corrigida para introspectar o schema real com `PRAGMA table_info` e calcular os dados de forma compatível com ambos os formatos.

## 5. APIs disponíveis

### 5.1 SGSO legado

Rotas legadas principais:

- `POST /api/sgso/relatos`
- `GET /api/sgso/relatos`
- `GET /api/sgso/relatos/:id`
- `PATCH /api/sgso/relatos/:id/status`
- `GET /api/sgso/relatos/:id/historico`
- `POST /api/sgso/relatos/:id/avaliacao-risco`
- `POST /api/sgso/relatos/:id/fatores-humanos`
- `GET /api/sgso/fatores-humanos/categorias`
- `POST /api/sgso/relatos/:id/acoes`
- `PATCH /api/sgso/acoes/:id`
- `POST /api/sgso/relatos/:id/comentarios`
- `GET /api/sgso/auditorias`
- `POST /api/sgso/auditorias`
- `GET /api/sgso/auditorias/:id`
- `PATCH /api/sgso/auditorias/:id/item`
- `POST /api/sgso/auditorias/:id/concluir`
- `GET /api/sgso/nao-conformidades`
- `POST /api/sgso/nao-conformidades`
- `PATCH /api/sgso/nao-conformidades/:id`
- `GET /api/sgso/kpi/spi`
- `GET /api/sgso/kpi/tendencias`
- `GET /api/sgso/categorias-adrep`

### 5.2 SGSO next-gen

RELPREV:

- `POST /api/sgso/relprev/submissoes`
- `GET /api/sgso/relprev/submissoes`
- `GET /api/sgso/relprev/submissoes/:id`
- `GET /api/sgso/relprev/submissoes/:id/workflow`

Matriz de risco:

- `GET /api/sgso/matriz-risco/perfis`
- `GET /api/sgso/matriz-risco/perfis/:id`

Bowtie:

- `GET /api/sgso/bowtie/cenarios`
- `POST /api/sgso/bowtie/cenarios`
- `GET /api/sgso/bowtie/cenarios/:id`
- `PATCH /api/sgso/bowtie/barreiras/:id/status`

FRAT:

- `GET /api/sgso/frat/modelos`
- `GET /api/sgso/frat/avaliacoes`
- `POST /api/sgso/frat/avaliacoes`
- `GET /api/sgso/frat/avaliacoes/:id`
- `POST /api/sgso/frat/avaliacoes/:id/aprovacoes`

## 6. Fluxos funcionais implementados

### 6.1 RELPREV offline-first

Fluxo:

1. O usuário abre a página dedicada de RELPREV.
2. O formulário inicial pede apenas o essencial: o que, onde e quando.
3. Se offline, o payload é salvo em fila local (`localStorage`).
4. Quando a conexão volta, o cliente tenta sincronizar a fila.
5. O backend cria o relato principal e grava espelho de captura em `sgso_relato_capturas`.
6. O backend registra privacidade, workflow, notificação inicial e triagem heurística.

Características entregues:

- fila offline local
- sincronização manual e automática
- geração de protocolo
- triagem inicial com clareza, ADREP, ECCAIRS 2 e tendência
- separação entre relato operacional e dados sensíveis

### 6.2 Bowtie dinâmico

Fluxo:

1. O usuário lista cenários já existentes.
2. Pode criar um cenário com perigo, evento central, ameaças, consequências e barreiras.
3. O frontend permite mapear barreiras a nós pelo uso de links textuais.
4. O backend persiste cenário, nós, barreiras e vínculos.
5. A saúde de barreiras pode ser alterada e fica registrada em histórico.

Características entregues:

- visão operacional por cenário
- status de barreira (`OPERANTE`, `DEGRADADA`, `INOPERANTE`, `EM_REVISAO`)
- histórico de degradação
- preparação para automações futuras por auditoria/NC/FRAT

### 6.3 FRAT operacional

Fluxo:

1. O usuário escolhe o modelo FRAT.
2. Seleciona tripulante e data operacional.
3. Responde fatores parametrizados.
4. O backend calcula score e nível de risco.
5. Se o nível exigir aprovação, o despacho fica bloqueado até decisão.
6. As decisões ficam registradas em `sgso_frat_aprovacoes`.

Características entregues:

- modelos reutilizáveis por empresa
- fatores parametrizados
- score dinâmico
- bloqueio operacional por risco alto/crítico
- workflow simples de aprovação

### 6.4 Matriz de risco contextualizada

Na rota legada de avaliação de risco foi adicionado suporte a:

- seleção de `perfil_id`
- lookup da célula da matriz configurável
- persistência de contexto em `sgso_avaliacao_risco_contexto`
- retorno de `exige_aprovacao`

Isso prepara a ponte entre o legado de relatos e o novo modelo de matriz configurável.

## 7. Frontend entregue

### 7.1 Novas rotas

Rotas adicionadas ao app:

- `/sgso/relprev`
- `/sgso/bowtie`
- `/sgso/frat`

### 7.2 Páginas novas

#### RELPREV

Entregue em `SgsoRelprevPage.tsx` com:

- status online/offline
- fila local visível
- formulário de submissão enxuto
- sincronização de fila
- painel de últimas submissões

#### Bowtie

Entregue em `SgsoBowtiePage.tsx` com:

- lista de cenários
- criação manual de cenário
- visualização de ameaças, evento central e consequências
- cartões de barreira com alteração de status
- histórico de mudança das barreiras

#### FRAT

Entregue em `SgsoFratPage.tsx` com:

- escolha de modelo e tripulante
- renderização dinâmica dos fatores
- envio da avaliação
- lista de avaliações recentes
- detalhe da avaliação e histórico de decisão

### 7.3 Hook compartilhado de API

`useSgsoApi.ts` centraliza:

- uso de `API_BASE_URL`
- injeção do token bearer
- tentativa de `refreshToken` em `401`
- logout em sessão expirada

## 8. Deploy e operação

### 8.1 Publicação efetiva

Estado validado:

- Frontend principal: Cloudflare Pages
- Backend API: Cloudflare Worker `airtrust-api-production`

### 8.2 Problema operacional encontrado

O `worker-frontend` falhou ao publicar por limite diário gratuito do KV da Cloudflare (`code 10048`).

Impacto prático:

- o domínio principal não ficou indisponível
- o Pages continuou sendo a origem pública válida
- o pipeline anterior abortava sem necessidade operacional

Correção aplicada:

- o deploy do `worker-frontend` agora é tolerado como warning quando falha por limite de KV
- a pipeline segue com Pages como origem principal
- ainda é possível tornar a falha bloqueante com `STRICT_FRONTEND_WORKER_DEPLOY=1`

### 8.3 Validação executada

Validações executadas nesta entrega:

- build do frontend
- type check
- smoke de assets públicos (`scripts/smoke-assets-public.sh`)
- smoke core de produção (`scripts/smoke-test-core.sh`)
- validação das novas telas via compilação
- aplicação das migrations `0281` e `0282` no D1 remoto
- deploy do backend worker
- smoke test autenticado do SGSO em produção

### 8.4 Hardening operacional posterior

Após a primeira publicação funcional do módulo, foi executado um endurecimento operacional do ambiente produtivo.

Itens aplicados:

- remoção de segredos e identificadores sensíveis do `worker-airtrust/wrangler.toml`
- migração do bypass de autenticação para `ENABLE_DEV_AUTH_BYPASS`, aceito apenas em `development`
- fail-fast no worker caso o bypass seja ativado fora de desenvolvimento
- substituição de `.env` versionados por templates seguros
- sourcemaps do build alterados para `hidden`
- criação de smoke core adicional para health/login/endpoint base
- backup remoto do D1 gerado antes do deploy final

Resultado prático:

- Pages e Worker ficaram publicados com a versão `51a45d64`
- `/api/health` passou a reportar a mesma versão em produção
- o repositório deixou de carregar segredos sensíveis em configuração versionada

## 9. Smoke test SGSO

Foi criado o script `scripts/smoke-test-sgso.sh`.

Cobertura atual do script:

- shell público das rotas `/sgso`, `/sgso/relprev`, `/sgso/bowtie`, `/sgso/frat`
- `GET /api/health`
- login autenticado
- `GET /api/sgso/relatos`
- `GET /api/sgso/kpi/spi`
- `GET /api/sgso/relprev/submissoes`
- `GET /api/sgso/matriz-risco/perfis`
- `GET /api/sgso/bowtie/cenarios`
- `GET /api/sgso/frat/modelos`
- `GET /api/sgso/frat/avaliacoes`

Resultado final da execução em produção:

- todas as verificações passaram
- reexecução confirmada após o hardening e o deploy final da versão `51a45d64`

## 10. Problemas encontrados e corrigidos

### 10.1 Migration 0281 no D1 remoto

Problema:

- D1 remoto falhou com `too many terms in compound SELECT`

Causa:

- seed da matriz 5x5 e seed de fatores FRAT usavam `UNION ALL` em cadeia

Correção:

- substituição por `WITH ... VALUES (...)`

### 10.2 Pipeline abortando no worker-frontend

Problema:

- deploy abortava por limite de KV no worker-frontend

Correção:

- tratamento de falha como warning operacional quando o Pages já é a origem pública principal

### 10.3 KPI SPI quebrado em produção

Problema:

- `GET /api/sgso/kpi/spi` retornava HTTP 500

Causa:

- divergência de schema em `frms_jornada`

Correção:

- introspecção de schema em runtime
- cálculo adaptativo para colunas antigas e novas

### 10.4 Configuração sensível versionada

Problema:

- o repositório ainda continha segredos operacionais e flags de bypass em arquivos versionados

Correção:

- segredos movidos para Cloudflare secrets / arquivos locais ignorados
- bypass reduzido a `ENABLE_DEV_AUTH_BYPASS` e aceito apenas em `development`
- validação de runtime adicionada para impedir uso indevido fora do ambiente local

## 11. Lacunas atuais

Apesar do salto funcional, o módulo ainda tem várias oportunidades para amadurecimento:

- o RELPREV ainda não sobe anexos offline com sincronização binária completa
- a triagem atual é heurística; não existe pipeline robusto de embeddings ou LLM governado
- o Bowtie ainda não recebe degradação automática por NC/auditoria/FRAT
- o FRAT ainda não está acoplado diretamente ao fluxo de despacho operacional de escalas
- a UI do Bowtie ainda é tabular/cartão, não um grafo visual completo
- não há suíte automatizada dedicada de testes unitários e e2e do SGSO
- a observabilidade do módulo ainda depende de logs gerais do worker

## 12. Melhorias recomendadas

### 12.1 Produto e UX

- criar um dashboard SGSO executivo com visão unificada de relatos, barreiras degradadas, auditorias vencidas e FRAT bloqueado
- oferecer timeline única por relato, incluindo triagem, risco, comentários, ações, notificações e encerramento
- adicionar wizard de investigação para relatos críticos
- permitir filtros persistentes e deep links para listas SGSO
- introduzir visualização gráfica real de bowtie com drag-and-drop

### 12.2 Dados e regras de negócio

- vincular bowtie automaticamente a NCs abertas e ações CAPA
- criar detecção de duplicidade de relato por fingerprint semântico e janela temporal
- adicionar score de criticidade de perigo consolidado por recorrência e exposição
- permitir múltiplos perfis de matriz por tipo de operação e empresa
- versionar modelos FRAT e fatores para histórico regulatório

### 12.3 IA e analytics

- trocar heurística local por classificação híbrida com modelo externo governado
- adicionar embeddings para busca semântica real entre relatos
- detectar surtos por cluster, local, tipo de aeronave, fase de voo e janela temporal
- sugerir automaticamente CAPAs, barreiras ou perguntas de investigação
- gerar sumarização executiva mensal do SGSO

### 12.4 Segurança e compliance

- criptografar efetivamente os campos sensíveis de privacidade com gestão de chave/versionamento
- expandir trilha de auditoria para leitura de dados sensíveis
- adicionar RBAC fino por papel SGSO, GSO, gestor operacional, auditor e aprovador FRAT
- criar políticas explícitas de retenção e anonimização

### 12.5 Operação e confiabilidade

- adicionar testes automatizados de contrato para endpoints SGSO
- adicionar smoke deploy nativo do SGSO ao pipeline padrão de produção
- implementar métricas operacionais específicas do módulo
- consolidar política para o `worker-frontend`: ou manter como fallback real com quota adequada, ou removê-lo do fluxo padrão de deploy público

### 12.6 Integrações futuras

- integrar o FRAT ao módulo de escalas para bloqueio de alocação e despacho
- integrar relatórios SGSO com notificações automáticas para responsáveis
- permitir importação de eventos externos e histórico ANAC/ECCAIRS
- gerar exportações regulatórias e dossiês de auditoria automaticamente

## 13. Sugestões de próximos passos técnicos

Prioridade alta:

- acoplar o FRAT ao despacho / escalas
- automatizar degradação de barreiras por auditoria e NC
- adicionar testes de backend para o router SGSO next-gen
- adicionar testes e2e para RELPREV, Bowtie e FRAT

Prioridade média:

- grafo visual de Bowtie
- workflow de investigação guiada
- busca semântica real de relatos similares
- painel executivo SGSO

Prioridade estrutural:

- normalizar compatibilidades de schema FRMS entre local e produção
- decidir definitivamente o papel do `worker-frontend` no deploy público

## 14. Arquivos principais do módulo

Backend:

- `worker-airtrust/src/routes/sgso.ts`
- `worker-airtrust/src/routes/sgso-next-gen.ts`
- `worker-airtrust/src/lib/sgso-next-gen.ts`
- `worker-airtrust/migrations/0271_sgso_tabelas_base.sql`
- `worker-airtrust/migrations/0272_sgso_fatores_humanos_e_protocolo.sql`
- `worker-airtrust/migrations/0273_sgso_auditorias_e_kpi.sql`
- `worker-airtrust/migrations/0274_sgso_seed_dados_iniciais.sql`
- `worker-airtrust/migrations/0281_sgso_relprev_bowtie_frat.sql`
- `worker-airtrust/migrations/0282_sgso_seed_por_empresa.sql`

Frontend:

- `src/react-app/pages/Sgso.tsx`
- `src/react-app/pages/SgsoRelato.tsx`
- `src/react-app/pages/sgso/useSgsoApi.ts`
- `src/react-app/pages/sgso/SgsoRelprevPage.tsx`
- `src/react-app/pages/sgso/SgsoBowtiePage.tsx`
- `src/react-app/pages/sgso/SgsoFratPage.tsx`
- `src/react-app/App.tsx`

Operação e validação:

- `deploy-full-automated.sh`
- `scripts/smoke-test-sgso.sh`
- `INTEGRACAO.md`

## 15. Conclusão

O módulo SGSO deixou de ser apenas um conjunto de telas e CRUDs isolados e passou a ter uma espinha dorsal coerente para evolução em segurança operacional: intake, classificação, risco, bowtie, FRAT, workflow e auditoria. Ainda há bastante espaço para refinamento, principalmente em automação, análise avançada e integração operacional, mas a base estrutural necessária para essa evolução já está implementada e validada em produção.
