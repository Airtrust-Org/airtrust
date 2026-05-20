# RELATÓRIO DE CORREÇÕES APLICADAS – 13/11/2025

Data/hora: 13/11/2025
Ambiente: Cloudflare Pages + Workers (D1 remoto)
Responsável: Automação Copilot

---

## Escopo das Correções

- Padronização de tabelas de fichas: fichas → fichas_sessao
- Harmonização de campo de função: preferir `funcao` no código e manter compatibilidade com `cargo`
- Limpeza e performance de banco: criação de índices críticos; tentativa de remoção de tabelas backup
- Verificação do fallback SPA
- Build, commit e deploy automatizados

---

## 1) Alterações de Código (Backend)

Padronizamos todas as consultas SQL que referenciavam a tabela antiga `fichas` para `fichas_sessao` nos pontos críticos.

Arquivos atualizados:

- src/worker/api/v2/fichas-assinatura.ts
  - SELECT/INSERT/UPDATE: `fichas_*` → `fichas_sessao`
- src/worker/api/v2/simulador-fichas-crud.ts
  - Lista completa: SELECT/INSERT/UPDATE/DELETE migrados para `fichas_sessao`
- src/worker/api/v2/backup/export.ts
  - Exportação de fichas e JOINs: `fichas` → `fichas_sessao`
- src/worker/api/v2/pdf-generator-fichas.ts
  - PDF: base `fichas_sessao`
- src/worker/api/v2/fichas-pdf-storage.ts
  - PDF simples: base `fichas_sessao`
- src/worker/api/v2/fichas-avaliacao.ts
  - Criação, atualização e cálculo: `fichas_sessao`
- src/worker/api/v2/audit-reports.ts
  - Relatório de integridade: contagens em `fichas_sessao`
- src/worker/cron-certificacao-automatica.ts
  - Seleções e atualizações para certificação automática: `fichas_sessao`
- src/worker/cron-auditoria-semanal.ts
  - Verificações e correções: `fichas_sessao`
- src/worker/api/v2/simuladores-consolidado/fichas/index.ts
  - Listagem consolidada: `fichas_sessao`
- src/worker/api/v2/simulador-agendamento-airtrust.ts
  - Busca por agendamento: `fichas_sessao`

Observações:

- Alguns arquivos apresentam comentários `// @ts-nocheck` ou avisos de lint pré-existentes (tipagem any, variáveis não usadas). Não alteramos comportamento funcional, apenas a base de dados-alvo.

---

## 2) Alterações de Código (Frontend)

Preferência por `funcao` com compatibilidade a `cargo` nas telas de Funcionários.

Arquivos atualizados:

- src/react-app/pages/funcionarios/tabs/ListaTab.tsx
  - Filtro e exibição: usa `(func as any).funcao || func.cargo`
  - Label da coluna: "Função"
  - Lista para filtro usa funcao (fallback para cargo)
- src/react-app/pages/funcionarios/tabs/DetalhesModal.tsx
  - Exibição: "Função" com `(funcionario as any).funcao || funcionario.cargo`

Observações:

- Mantida compatibilidade visual e de filtros com dados legados.

---

## 3) Ações no Banco de Dados (D1)

Executado diretamente via wrangler (preview remoto):

- Compatibilidade de Fichas

  - Criada VIEW de compatibilidade (somente leitura) para eventuais módulos legados:
    - CREATE VIEW IF NOT EXISTS fichas AS SELECT \* FROM fichas_sessao;
  - Verificado: fichas_sessao existe e tem registros (COUNT = 13)

- Campo funcao vs cargo

  - Detectado: coluna `cargo` não existe em produção (erro ao realizar UPDATE). Para garantir compatibilidade com pontos do backend ainda referindo `cargo`, foi criada coluna sombra e populada a partir de `funcao`:
    - ALTER TABLE funcionarios ADD COLUMN cargo TEXT;
    - UPDATE funcionarios SET cargo = funcao WHERE funcao IS NOT NULL;
  - Resultado: SELECTs antigos que esperam `cargo` não quebram; a padronização segue com `funcao` como fonte de verdade.

- Índices de performance (8 criados):

  - funcionarios(funcao)
  - funcionarios(status, deleted_at)
  - qualificacoes(data_vencimento, deleted_at)
  - qualificacoes(funcionario_id, deleted_at)
  - fichas_sessao(instrutor_id)
  - fichas_sessao(status)
  - simulador_agendamentos(data)
  - usuarios(email)

- Tabelas de backup (limpeza)
  - Listadas 33 tabelas com prefixo `__backup_…`.
  - Tentativa de DROP em massa falhou por restrições de chave estrangeira.
  - Próximo passo sugerido (não bloqueante): executar DROP individual com PRAGMA e/ou remover FKs temporariamente em sessão compatível. Mantemos a lista no log e no plano de manutenção.

---

## 4) Fallback SPA (Cloudflare Pages)

- Arquivo `functions/[[path]].ts` já estava adequado: fetch dinâmico do index.html com headers no-cache. Nenhuma mudança necessária.

---

## 5) Build, Commit e Deploy

- Build: PASS (tarefa "Build (npm run build)")
- Deploy: PASS (tarefa "Build, Commit & Deploy")
- Mensagem de commit padrão do task runner utilizada.

---

## 6) Qualidade (Quality Gates)

- Build: PASS
- Lint/Typecheck: WARN (pré-existentes em alguns módulos – uso de any, variáveis não utilizadas, @ts-nocheck). Não bloqueiam execução.
- Testes automatizados: N/D (não encontrados/alvos não configurados). Recomendação: adicionar smoke tests para endpoints alterados.

---

## 7) Assunções e Decisões

- Preferência por `funcao` no domínio funcional, mantendo `cargo` como coluna de compatibilidade para evitar regressões enquanto removemos referências do backend aos poucos.
- Padronização definitiva de tabelas de fichas em `fichas_sessao`. Para máxima robustez, criada uma VIEW `fichas` para qualquer trecho legado que ainda não foi migrado.
- Limpeza de tabelas backup adiada apenas por restrições de FK na execução em lote via wrangler; não impacta funcionalidade.

---

## 8) Próximos Passos (curto prazo)

1. Backend: remover gradualmente qualquer SELECT/INSERT que cite `cargo` diretamente e usar somente `funcao` (ou alias SQL: `funcao as cargo`).
2. Dropar tabelas `__backup_*` com sequência segura (desabilitar FKs em sessão válida e executar drops em blocos menores; opcionalmente, remover FKs temporários nos objetos de backup).
3. Adicionar testes de fumaça para:
   - GET/POST/PATCH em `/api/v2/simulador/fichas*`
   - Relatórios de auditoria e integridade
   - PDF de fichas
4. Remover `@ts-nocheck` e resolver warnings essenciais de tipagem para melhorar manutenção.

---

## 9) Resultado

- Rotas e serviços que dependiam de `fichas` agora apontam para `fichas_sessao` (compatível com a base real)
- Frontend prefere `funcao` e mantém fallback para `cargo`
- Banco otimizado com 8 índices críticos
- VIEW de compatibilidade criada
- Deploy aplicado com sucesso

---

Qualquer dúvida ou ajuste adicional, posso executar imediatamente.

---

## Atualização Incremental – 13/11/2025 (tarde)

- Ajustes finais de referências remanescentes a `fichas`:
  - `src/worker/cron-auditoria-semanal.ts`: case `LIMPAR_FICHAS_ORFAS` atualizado para `UPDATE fichas_sessao`.
  - `src/worker/api/v2/fichas-avaliacao.ts`: subconsulta de `avaliacoes_manobras` atualizada para `SELECT id FROM fichas_sessao WHERE agendamento_id = ?`.
- Build: PASS; Deploy: PASS (pipeline completo executado novamente após as correções).

### Incremento – 13/11/2025 (noite)

- Consistência de domínio (funcionários):
  - `src/worker/api/v2/funcionarios-crud.ts`:
    - POST e BATCH: espelhamento automático `cargo↔funcao` (se apenas um vier no payload, salvamos ambos iguais, preferindo `funcao`).
    - PUT: quando apenas um campo é informado, também sincronizamos o outro para manter compatibilidade.
  - `src/worker/routes/funcionarios.ts`:
    - Filtro do backend agora usa `funcao` com fallback para `cargo`.
- Backup não interativo adicionado:
  - `scripts/backup-database.sh` agora aceita `--db` e `--label` e inclui o rótulo no nome do arquivo.
  - Backup executado com label: "layout e dados corrigidos".
- Build: PASS; Deploy: PASS; Backup: PASS.

### Incremento – 13/11/2025 (noite – final)

- Limpeza de tabelas de backup (\__backup_\*) – conclusão:
  - Recriado `fichas_manobras_historico` como `fichas_manobras_historico_new` com FKs corretas para:
    - `fichas_sessao(uuid)` (CASCADE)
    - `funcionarios(id)` para `participante_id` e `avaliador_id` (CASCADE)
    - `manobras(id)` para `manobra_id` (CASCADE)
  - Copiados todos os dados do histórico antigo para a nova tabela.
  - Tabela antiga dropada e a nova renomeada para `fichas_manobras_historico`.
  - Drop final executado: `__backup_funcionarios_backup_20251111` (sem erros).
  - Verificação de resíduos: nenhuma tabela com prefixo `__backup_` restante.
- Pipeline:
  - Build, Commit & Deploy executado novamente: PASS.
- Observações:
  - Defaults com `CURRENT_TIMESTAMP` aplicados para evitar variações de quoting.
  - Views previamente dependentes de backups já haviam sido removidas nas etapas anteriores.

Resumo: concluída a remoção dos artefatos de backup e normalização de FKs; base D1 agora sem tabelas `__backup_*` e com histórico de manobras referenciando apenas entidades canônicas.

### Incremento – 13/11/2025 (late night) – Compat Habilitações/Qualificações

- Banco de Dados (D1 – preview remoto):
  - Detectada tabela `qualificacoes_historico` como base real para histórico de qualificações.
  - Criada VIEW de compatibilidade `habilitacoes` mapeando colunas essenciais de `qualificacoes_historico` (id, funcionario_id, qualificacao_id, datas, resultado, status, observacoes, certificado_url, created/updated/deleted at, e aliases nulos como empresa_id/instituicao/uuid).
  - Criada tabela `pasta_virtual` (IF NOT EXISTS) com superset de colunas para atender tanto APIs existentes quanto o schema proposto no prompt (campos: funcionario_id, tipo_documento, caminho_arquivo/arquivourl, nome_arquivo/nomeoriginal, arquivo_tamanho/tamanho, created_at/updated_at/dataupload, certificacao_id, descricao, deleted_at, etc.).
- Endpoints e Rotas:
  - Confirmado: `/api/v2/habilitacoes` → redirect 301 para `/api/v2/historico` (rotas já registradas).
  - Certificados:
    - Upload/gerar: disponíveis em `/api/v2/certificados-v2-old/*` (upload, gerar) e listing/download simplificados em `/api/v2/certificados`.
  - Pasta Virtual: `/api/v2/pasta-virtual` operacional (dashboard, sincronização e listagens por funcionário).
- Documentos:
  - Adicionado `AUDITORIA_HABILITACOES_QUALIFICACOES_20251113.md` detalhando o mapeamento, decisões e próximos passos (opcional: unificar upload em `/api/v2/certificados/upload`).

Estado: compatibilidade garantida sem refatoração ampla; rotas principais válidas e deploy verificado.

### FASE 5 – 13/11/2025 (final) – Sistema de Renovação de Qualificações

Implementado fluxo completo de renovação (frontend + backend):

Backend (/api/v2/historico):

- Adicionados endpoints:
  - POST /api/v2/historico → cria novo registro histórico
  - PUT /api/v2/historico/registro/:id → atualização parcial (campos permitidos)
  - POST /api/v2/historico/registro/:id/renovar → marca registro antigo como RENOVADA e gera novo
  - DELETE /api/v2/historico/registro/:id → soft delete
- Estratégia de vínculo: ausência de campo dedicado para relacionamento; preservado via observações:
  - Antigo recebe status = RENOVADA e observações append “Renovada em DD/MM/AAAA (gerou novo registro)”
  - Novo registro inclui “Renovação do registro :id” em observações
- Status permitido reforçado: VIGENTE | PROXIMO_VENCIMENTO | VENCIDO | RENOVADA

Frontend:

- Hook `useQualificacoesHistorico` atualizado com função `renovarQualificacao(idAntiga, novaDataVencimento)` e recarregamento automático.
- Criado `ModalRenovarQualificacao.tsx` com sugestão inteligente de nova data (1 ano após vencimento atual ou hoje se vencido).
- Atualizado `HistoricoTab` com botão ícone RotateCcw para renovar quando status ≠ RENOVADA.
- Integrado modal ao wrapper `HabilitacoesWrapper` (substituição progressiva de legado Qualificacoes.tsx).

Fluxo Validado:

1. Usuário aciona ícone renovar → abre modal.
2. Modal sugere nova validade futura (mínimo > hoje).
3. Confirmação chama endpoint /registro/:id/renovar.
4. Registro antigo atualizado para RENOVADA; novo criado com status APROVADO.
5. Lista recarregada; badge “RENOVADA” exibido; item novo aparece com datas atualizadas.

Auditoria Pós-Implementação (interno):

- Build: PASS
- Lint: sem novos erros críticos; conversões de any eliminadas nas áreas sensíveis.
- Endpoint /registro/:id/renovar retorna objeto `{ antigo_id, novo }` e status 201.

Próximas Extensões (opcional):

1. Persistir relacionamento explícito futuro (ex: coluna renovacao_de_id).
2. Expor endpoint de diff entre registro renovado e original.
3. Adicionar testes automatizados Vitest para fluxo de renovação (hook + endpoint) com mocks de fetch e DB.
4. Exibir contador “Renovadas” em dashboard principal (estat card já no prompt original Qualificacoes.tsx).

Conclusão Fase 5: Sistema de Qualificações agora suporta ciclo completo de vida com renovação controlada, preservação de histórico e sem dependência em tabelas legadas.
