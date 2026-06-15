# Controle de Voos N1 - Dedicated D1 Execution Report

Data da execucao: 2026-06-14  
Escopo: criacao e preparacao de D1 dedicado e descartavel para o piloto Controle de Voos N1.  
Veredito: **GO com ressalvas para Dia 1**.

## 1. D1 criado

D1 dedicado criado:

- nome: `airtrust-db-pilot-cv-n1`;
- UUID: `76ec876a-8727-44b6-aa33-b8dea53cdebb`;
- regiao reportada pelo Wrangler: `ENAM`.

Confirmacoes de alvo:

- UUID diferente de producao: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`;
- UUID diferente do staging atual: `b7f50907-c110-45f5-ad17-e97ea47f2826`;
- nenhum comando foi executado contra `airtrust-db` de producao;
- nenhum comando foi executado contra `airtrust-db-staging`;
- nenhum comando usou `--env production`.

## 2. Estado local inicial

Auditoria local:

- branch: `main`;
- HEAD: `4260bbb75958c54929600021c61b4fd31a9ac5e8`;
- `origin/main` curto: `971f95fe`;
- working tree ja estava sujo com alteracoes preexistentes fora deste escopo.

Confirmacoes:

- `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql` existe;
- nao foi encontrada migration `0411` em `worker-airtrust/migrations/`;
- `worker-airtrust/wrangler.toml` mantem:
  - staging: `airtrust-db-staging`, id `b7f50907-c110-45f5-ad17-e97ea47f2826`;
  - producao: `airtrust-db`, id `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`.

## 3. Arquivos temporarios

Arquivos temporarios usados:

- config temporario no repo, **nao comitar**:
  - `worker-airtrust/wrangler.pilot-cv-n1.toml`;
- diretorio temporario fora do repo:
  - `/tmp/airtrust-pilot-cv-n1/`;
- SQL baseline:
  - `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-baseline.sql`;
- SQL seed:
  - `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-seed.sql`;
- credenciais sinteticas e segredo JWT piloto:
  - `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-credentials.txt`;
  - `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-generated.json`;
  - `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1.env`.

Observacao de seguranca:

- `.gitignore` nao ignora explicitamente `worker-airtrust/wrangler.pilot-cv-n1.toml`;
- o arquivo esta untracked e nao deve ser commitado;
- senhas e segredo JWT piloto ficaram apenas em `/tmp`;
- nenhum secret de producao foi lido, alterado ou usado.

## 4. Comandos executados

Criacao do D1:

```bash
npx wrangler d1 create airtrust-db-pilot-cv-n1
```

Aplicacao do baseline:

```bash
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --file /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-baseline.sql
```

Snapshot pos-baseline:

```bash
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --output /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-baseline-20260614233454.sql
```

Aplicacao da `0410`:

```bash
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --file worker-airtrust/migrations/0410_controle_voos_n1_schema.sql
```

Aplicacao do seed:

```bash
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --file /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-seed.sql
```

Snapshot pos-seed:

```bash
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --output /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-seed-20260614233521.sql
```

Preview funcional sem deploy:

```bash
npx wrangler dev \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --env-file /tmp/airtrust-pilot-cv-n1/pilot-cv-n1.env \
  --port 8791 \
  --show-interactive-dev-session false
```

## 5. Comandos nao executados

Nao foram executados:

- `wrangler deploy`;
- `npm run deploy`;
- `wrangler d1 migrations apply`;
- qualquer comando com `--env production`;
- qualquer comando contra `airtrust-db`;
- qualquer comando contra `airtrust-db-staging`;
- qualquer comando que aplique cadeia completa de migrations;
- qualquer comando que aplique ou crie `0411`;
- qualquer alteracao de secrets de producao;
- qualquer integracao SIGVOOS/FRMS;
- qualquer commit.

## 6. Resultado do baseline

Baseline aplicado com sucesso no D1 dedicado:

- `25` queries processadas;
- `45` linhas escritas;
- tabelas minimas criadas para auth/RBAC/auditoria:
  - `empresas`;
  - `usuarios`;
  - `usuarios_empresas`;
  - `usuario_permissoes`;
  - `user_platform_roles`;
  - `refresh_tokens`;
  - `token_blocklist`;
  - `auditoria`;
  - `d1_migrations`.

O baseline foi validado localmente antes da aplicacao remota.

## 7. Resultado da 0410

Migration aplicada por `wrangler d1 execute --file`, nao por `migrations apply`.

Resultado:

- `37` queries processadas;
- D1 passou a ter as 8 tabelas `cv_%` esperadas;
- nenhuma tabela `regulated_%`;
- nenhuma tabela de `0411`.

## 8. Resultado do seed

Seed aplicado com sucesso:

- `12` queries processadas;
- `36` mudancas reportadas;
- dados sinteticos criados:
  - 1 empresa ficticia;
  - 3 usuarios ficticios (`admin`, `editor`, `viewer`);
  - 5 aeroportos;
  - 3 tipos de voo;
  - 3 naturezas;
  - 3 motivos operacionais;
  - 8 voos sinteticos;
  - 4 vinculos sinteticos de tripulacao.

Nao foram usados dados reais, dados de producao, dados do staging atual ou dados reais de SIGVOOS.

## 9. Snapshots

Snapshots gerados fora do repositorio:

- pos-baseline:
  - `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-baseline-20260614233454.sql`;
  - tamanho aproximado: `4.8K`;
- pos-seed:
  - `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-seed-20260614233521.sql`;
  - tamanho aproximado: `29K`.

Confirmacao:

- ambos existem;
- ambos tem tamanho maior que zero;
- ambos ficam fora do repositorio.

Observacao: o smoke funcional posterior criou/finalizou um RDV no D1 dedicado. O snapshot pos-seed representa o estado antes desse smoke funcional.

## 10. Validacoes estruturais

Tabelas `cv_%` confirmadas:

```text
cv_aeroportos
cv_motivos_operacionais
cv_naturezas_voo
cv_rdv_operacional
cv_tipos_voo
cv_voo_eventos
cv_voo_tripulantes
cv_voos
```

Ausencias confirmadas:

- `regulated_count = 0`;
- `schema_0411_count = 0`;
- nao existem:
  - `cv_voo_etapas`;
  - `cv_sigvoos_staging`;
  - `cv_conflitos_integracao`.

Ledger minimo:

```text
pilot-cv-n1-baseline.sql
0410_controle_voos_n1_schema.sql
```

Dados sinteticos confirmados:

- empresa: `pilot-cv-n1`;
- usuarios: 3;
- roles vinculadas: `admin`, `editor`, `viewer`;
- voos: 8, datas entre `2026-06-10` e `2026-06-13`;
- aeroportos: 5;
- tipos: 3;
- naturezas: 3;
- motivos: 3;
- tripulantes sinteticos: 4.

## 11. Validacao funcional

Worker de preview remoto foi iniciado sem deploy de producao, apontando para:

- config: `worker-airtrust/wrangler.pilot-cv-n1.toml`;
- D1: `airtrust-db-pilot-cv-n1`;
- env-file temporario: `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1.env`.

Resultado do smoke funcional:

- login admin sintetico: `200`, `success: true`, token presente;
- login editor sintetico: `200`, `success: true`, token presente;
- login viewer sintetico: `200`, `success: true`, token presente;
- `GET /api/controle-voos/dashboard?data_inicio=2026-06-10&data_fim=2026-06-13`:
  - `200`;
  - `success: true`;
  - `nao_regulado: true`;
  - `voos: 8`;
- `GET /api/controle-voos/voos?data_inicio=2026-06-10&data_fim=2026-06-13`:
  - `200`;
  - `success: true`;
  - `count: 8`;
- tentativa de escrita do viewer em `POST /api/controle-voos/voos`:
  - `403`;
  - erro esperado: `Permissao insuficiente`;
- editor criou RDV em `PUT /api/controle-voos/voos/1/rdv`:
  - `201`;
  - `success: true`;
  - status `rascunho`;
- editor finalizou RDV em `POST /api/controle-voos/voos/1/rdv/finalizar-preenchimento`:
  - `200`;
  - `success: true`;
  - status `preenchimento_finalizado`.

O Worker de preview foi encerrado ao final do smoke.

## 12. Pendencias

Pendencias antes de liberar usuarios do Dia 1:

1. Decidir se `worker-airtrust/wrangler.pilot-cv-n1.toml` sera destruido apos o piloto ou se deve ser adicionado ao `.gitignore` em fase separada.
2. Preservar as credenciais sinteticas de `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-credentials.txt` em local operacional seguro, se usuarios reais de teste forem acessar o piloto.
3. Gerar novo snapshot se o estado pos-smoke funcional, com RDV finalizado, for o baseline desejado do Dia 1.
4. Definir canal e janela de acesso para usuarios do piloto.
5. Definir procedimento de descarte do D1 ao final do piloto, com autorizacao explicita.

## 13. Veredito

**GO com ressalvas para Dia 1.**

Motivos do GO:

- D1 dedicado criado e isolado;
- production nao foi tocada;
- staging atual nao foi tocado;
- `0410` aplicada somente no D1 dedicado;
- `0411` nao foi aplicada nem criada;
- seed sintetico aplicado;
- snapshots foram gerados fora do repo;
- validacao estrutural passou;
- validacao funcional minima passou.

Ressalvas:

- config temporario esta untracked e nao e ignorado explicitamente;
- credenciais sinteticas estao em `/tmp` e precisam de manuseio operacional controlado;
- smoke funcional alterou o D1 apos o snapshot pos-seed, criando/finalizando 1 RDV.

## 14. Confirmacoes finais

- Producao nao foi tocada.
- Staging atual nao foi tocado.
- Nenhum comando usou `--env production`.
- Nenhum comando foi executado contra `airtrust-db`.
- Nenhum comando foi executado contra `airtrust-db-staging`.
- Nenhum deploy foi executado.
- Nenhuma secret de producao foi lida, listada ou alterada.
- SIGVOOS nao foi integrado.
- FRMS nao foi alterado.
- eDB, SDRMe, MRO real e Records Core nao foram criados.
- `0411` nao foi aplicada nem criada.
- Nenhum commit foi feito.

## 15. Sugestao de commit

Nao fazer commit sem autorizacao explicita.

Se autorizado, commit escopado apenas do relatorio:

```bash
git add docs/CONTROLE_DE_VOOS_N1_DEDICATED_D1_EXECUTION_REPORT.md
git commit -m "docs: registra execucao d1 dedicado controle voos n1"
```
