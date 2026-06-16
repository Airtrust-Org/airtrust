# SIGVOOS Runtime Refresh Trigger Report

**Veredito:** `RUNTIME SIGVOOS PREVIEW IMPLEMENTADO`

Data: 2026-06-16
Branch: `codex/sigvoos-runtime-refresh-trigger`
Base: `main` @ `0b42313eeaea7cbb2e98557dbcbaa1fca845d42d`

---

## 1. Decisao de design

Opcao escolhida: **B — refresh app + preview SIGVOOS**.

Motivo:

- o botao existente `Atualizar app` e global e ja executa hard refresh/cache refresh;
- conectar esse botao diretamente a sync real com escrita criaria risco de sincronizacao silenciosa;
- chamada real SIGVOOS exige credenciais, janela operacional e autorizacao explicita;
- preview permite validar contrato, RBAC e tenant atual sem API externa e sem escrita.

Opcoes rejeitadas nesta fase:

- **A**: segura, mas nao cria contrato runtime para o gatilho solicitado.
- **C**: bloqueada para esta janela por risco de chamada real, duplicacao/sobrescrita e ausencia de autorizacao de deploy/runtime real.

---

## 2. Comportamento final do botao Atualizar app

Com flag frontend desativada:

- o botao mantem o comportamento anterior: hard refresh da aplicacao;
- nenhuma chamada SIGVOOS e feita.

Com `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED=true`:

- Admin/Gestor com tenant atual e modulo `controle_voos` ativo chama primeiro:

```text
POST /api/controle-voos/sigvoos/sync-preview
```

- depois executa o hard refresh existente;
- exibe feedback por toast:
  - conflitos encontrados;
  - payloads pendentes no tenant atual;
  - sem novos dados materializados no tenant atual;
  - falha de preview sem bloquear a atualizacao do app.

O botao **nao** chama API real SIGVOOS e **nao** grava dados.

---

## 3. Contrato backend implementado

Endpoint:

```text
POST /api/controle-voos/sigvoos/sync-preview
```

Guardrails:

- exige autenticacao;
- exige tenant/empresa atual pelo contexto da sessao;
- exige permissao minima `manager` (Admin/Gestor);
- rejeita `empresaId`, `empresa_id`, `tenantId` ou `tenant_id` no body;
- nao aceita tenant arbitrario;
- nao chama API real SIGVOOS;
- nao usa credenciais SIGVOOS;
- nao executa inserts/updates/deletes;
- nao toca FRMS;
- nao altera `frms-source-policy.ts`;
- backend fica fechado por padrao quando `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED` nao e `true`;
- quando a flag backend esta desativada, retorna `FEATURE_DISABLED` sem consultar tabelas SIGVOOS.

Resposta segura inclui apenas contagens por tenant:

- staging total;
- staging pendente;
- staging processado;
- staging em conflito;
- conflitos abertos;
- voos SIGVOOS ja materializados;
- etapas SIGVOOS ja materializadas;
- tripulantes SIGVOOS ja materializados;
- ultimo timestamp de importacao, se existir.

---

## 4. Arquivos alterados

- `worker-airtrust/src/routes/controle-voos.ts`
  - adiciona endpoint preview controlado;
  - adiciona bloqueio de tenant arbitrario;
  - adiciona gate por permissao `manager`;
  - adiciona retorno fechado quando a feature flag backend esta desativada.
- `worker-airtrust/src/types/index.ts`
  - declara `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED`.
- `src/react-app/components/AppLayout.tsx`
  - mantem hard refresh existente;
  - chama preview antes do hard refresh somente com flag frontend ativa, Admin/Gestor, tenant atual e modulo Controle de Voos ativo.
- `worker-airtrust/src/__tests__/routes/controle-voos.test.ts`
  - cobre preview ativo, flag backend desativada, RBAC e tenant isolation.
- `src/react-app/components/__tests__/AppLayout.hard-refresh.test.tsx`
  - cobre botao sem flag e com flag frontend ativa.
- `docs/SIGVOOS_RUNTIME_REFRESH_TRIGGER_REPORT.md`
  - registra a decisao e a execucao.

---

## 5. Testes executados

Direcionados:

```bash
cd worker-airtrust && npx vitest run src/__tests__/routes/controle-voos.test.ts
npx vitest run src/react-app/components/__tests__/AppLayout.hard-refresh.test.tsx
npx tsc --noEmit --pretty false
```

Resultados:

- rotas Controle de Voos: PASS (`40 tests`);
- AppLayout hard refresh: PASS (`2 tests`);
- TypeScript: PASS.

Fechamento completo:

```bash
npx tsc --noEmit --pretty false
npm run build
git diff --check
bash scripts/check-tracked-secrets.sh
bash scripts/validation/audit-deploy-scripts.sh
bash scripts/audit-dangerous-ops.sh
```

Resultados:

- TypeScript: PASS;
- build: PASS;
- `git diff --check`: PASS;
- `scripts/check-tracked-secrets.sh`: PASS;
- `scripts/validation/audit-deploy-scripts.sh`: PASS como inventario; listou referencias historicas ja existentes a `migrations apply` e confirmou `deploy-worker-safe` sem comandos proibidos;
- `scripts/audit-dangerous-ops.sh`: PASS com aviso inventarial sobre scripts historicos de sync remoto.

---

## 6. Confirmacoes negativas

- API real SIGVOOS chamada: `NAO`
- Credenciais SIGVOOS usadas: `NAO`
- Dados reais inseridos em producao: `NAO`
- Migrations aplicadas: `NAO`
- `wrangler d1 migrations apply` executado: `NAO`
- Reexecucao de 0410/0411: `NAO`
- Deploy executado: `NAO`
- E-mails enviados: `NAO`
- FRMS alterado: `NAO`
- `worker-airtrust/src/lib/frms/frms-source-policy.ts` alterado: `NAO`
- RBAC backend/multi-tenant real alterado: `NAO`; apenas foi usado o middleware/permissao existente.

---

## 7. Riscos restantes

1. Preview nao consulta a API real SIGVOOS; portanto nao comprova disponibilidade externa, credenciais ou existencia de novos dados no provedor.
2. O hard refresh recarrega a aplicacao logo apos o preview; feedback visual pode ser breve.
3. Sync real com escrita permanece fora do escopo e requer fase separada, janela operacional, feature flag especifica, idempotencia operacional validada e decisao explicita sobre tratamento de dados manuais.
4. O ledger `d1_migrations` segue sem registrar `0410/0411`; `wrangler d1 migrations apply` continua proibido para essa cadeia sem rebaseline formal.

---

## 8. Proxima recomendacao

1. Fazer merge deste PR apenas como preview/contrato protegido.
2. Nao ativar flags em producao sem decisao operacional.
3. Planejar fase separada para sync real, com endpoint dedicado, tenant sintetico ou janela aprovada, e validacao de nao sobrescrever dados manuais.
4. Parar antes de qualquer deploy runtime real com: `BLOQUEADO — DEPLOY RUNTIME REQUER AUTORIZACAO EXPLICITA`.
