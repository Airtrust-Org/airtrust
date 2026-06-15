# Controle de Voos N1 - Dia 1 Release Readiness

Data: 2026-06-14  
Escopo: contencao pos-execucao do D1 dedicado do piloto Controle de Voos N1 antes de liberar o Dia 1.  
Veredito: **GO com ressalvas para Dia 1**.

## 1. Confirmacao de contencao

Alvo autorizado e usado nesta contencao:

- D1 dedicado: `airtrust-db-pilot-cv-n1`;
- UUID: `76ec876a-8727-44b6-aa33-b8dea53cdebb`;
- config temporario: `worker-airtrust/wrangler.pilot-cv-n1.toml`;
- diretorio temporario fora do repo: `/tmp/airtrust-pilot-cv-n1/`.

Confirmacoes:

- nenhum comando foi executado contra `airtrust-db` de producao;
- nenhum comando foi executado contra `airtrust-db-staging`;
- nenhum comando usou `--env production`;
- nenhum deploy foi executado;
- nenhuma migration foi aplicada;
- nenhuma migration `0411` foi criada ou aplicada;
- SIGVOOS, FRMS, eDB, SDRMe e Records Core nao foram integrados ao D1 do piloto;
- nenhum secret de producao foi lido, alterado ou usado;
- o D1 dedicado do piloto nao foi descartado.

## 2. Auditoria local

Estado auditado:

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `3bd48efe047e10a264e636f69f60369b1a55cc3d` |
| `origin/main` | `971f95fe8082d32d4621272c95d4468a28fcdd7f` |
| Ahead/behind | `0 22` em `origin/main...HEAD` |
| Staged files | nenhum arquivo staged no momento da auditoria |

O working tree ja estava sujo antes desta contencao, com alteracoes e arquivos untracked fora deste escopo. Essas alteracoes foram preservadas.

`worker-airtrust/wrangler.pilot-cv-n1.toml`:

- existe;
- estava untracked antes da protecao por `.gitignore`;
- nao estava staged;
- agora esta coberto por `.gitignore`;
- nao deve ser commitado.

`/tmp/airtrust-pilot-cv-n1/`:

- existe;
- contem artefatos temporarios do piloto;
- esta fora do repositorio;
- nao deve ser movido para `docs/`, `scripts/` ou qualquer pasta versionada.

Ressalva de higiene local:

- a auditoria por nomes encontrou artefatos historicos/locais de producao e backups ja presentes ou ignorados no workspace, incluindo `.env.production`, `.env.local.production`, `src/.env.production`, `artifacts/db-backups/*.sql`, `scripts/d1-prod-export.sql` e exports untracked em `scripts/export_funcionarios_airtrust_producao.*`;
- esses arquivos nao foram abertos, alterados, staged ou commitados nesta contencao;
- portanto, a afirmacao segura e: nao ha dump ou credencial do piloto dentro do repo alem do config temporario esperado, agora ignorado. A limpeza geral de artefatos historicos de producao fica como pendencia separada.

## 3. Protecao contra commit acidental

`.gitignore` foi alterado de forma minima para cobrir artefatos temporarios do piloto:

```gitignore
# AirTrust pilot CV N1 temporary containment artifacts
worker-airtrust/wrangler.pilot-cv-n1.toml
docs/snapshots/
pilot-cv-n1-*.sql
pilot-cv-n1-*.dump.sql
```

Justificativa:

- impedir commit acidental do config temporario do D1 dedicado;
- impedir snapshots ou dumps SQL de piloto dentro do repo;
- manter os arquivos canonicos `worker-airtrust/wrangler.toml` e `worker-airtrust/wrangler.dev.toml` intactos.

Nao usar `git add .`. Commit sugerido somente com selecao explicita de docs e, se aceito, `.gitignore`.

## 4. Estado dos arquivos em `/tmp`

Arquivos temporarios confirmados em `/tmp/airtrust-pilot-cv-n1/`:

| Arquivo | Tamanho |
|---|---:|
| `export-post-seed.log` | 1104 bytes |
| `functional-smoke-result.json` | 848 bytes |
| `local-verify.sqlite` | 311296 bytes |
| `pilot-cv-n1-baseline.sql` | 5255 bytes |
| `pilot-cv-n1-credentials.txt` | 308 bytes |
| `pilot-cv-n1-generated.json` | 336 bytes |
| `pilot-cv-n1-post-baseline-20260614233454.sql` | 4935 bytes |
| `pilot-cv-n1-post-seed-20260614233521.sql` | 30100 bytes |
| `pilot-cv-n1-post-smoke-20260614204320.sql` | 34123 bytes |
| `pilot-cv-n1-seed.sql` | 6390 bytes |
| `pilot-cv-n1.env` | 76 bytes |

Os arquivos com credenciais sinteticas e segredo JWT do piloto permanecem somente em `/tmp`. Nao commitar, copiar para o repo ou anexar em documentacao.

## 5. Snapshot pos-smoke

Como o smoke funcional criou/finalizou 1 RDV apos o snapshot pos-seed, foi gerado novo export read-only:

```bash
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --output /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-smoke-20260614204320.sql
```

Resultado:

- arquivo: `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-smoke-20260614204320.sql`;
- tamanho: `34123 bytes`;
- tamanho maior que zero confirmado;
- export salvo fora do repo;
- nenhum staging, production ou `--env production` usado.

## 6. Validacao final do D1

SELECTs read-only executados no D1 dedicado confirmaram:

| Checagem | Resultado |
|---|---:|
| Tabelas `cv_%` | 8 |
| `regulated_count` | 0 |
| Tabelas 0411 (`cv_voo_etapas`, `cv_sigvoos_staging`, `cv_conflitos_integracao`) | 0 |
| Voos sinteticos em `cv_voos` | 8 |
| RDVs em `cv_rdv_operacional` | 1 |
| RDVs finalizados | 1 |
| Escopos inesperados SIGVOOS/FRMS/eDB/SDRMe/Records Core | 0 |

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

Usuarios sinteticos confirmados:

```text
admin-pilot@pilot.airtrust.local  perfil=admin   role=admin
editor-pilot@pilot.airtrust.local perfil=editor  role=editor
viewer-pilot@pilot.airtrust.local perfil=viewer  role=viewer
```

Ledger minimo confirmado:

```text
pilot-cv-n1-baseline.sql
0410_controle_voos_n1_schema.sql
```

Tabelas totais nao-sistema observadas:

```text
_cf_KV
auditoria
cv_aeroportos
cv_motivos_operacionais
cv_naturezas_voo
cv_rdv_operacional
cv_tipos_voo
cv_voo_eventos
cv_voo_tripulantes
cv_voos
d1_migrations
empresas
refresh_tokens
token_blocklist
user_platform_roles
usuario_permissoes
usuarios
usuarios_empresas
```

## 7. Pendencias

- Manter o D1 dedicado preservado ate o fim do piloto ou ate decisao explicita de descarte.
- Nao rodar `wrangler d1 migrations apply` neste D1 dedicado.
- Nao rodar comandos com `--env production`.
- Nao tocar `airtrust-db-staging` nesta liberacao de Dia 1.
- Nao mover snapshots, dumps, `.env` ou credenciais sinteticas de `/tmp` para o repo.
- Fazer higiene separada dos artefatos historicos/locais de producao e exports ja existentes no workspace.
- Se houver commit, usar selecao explicita; nunca `git add .`.

## 8. Veredito

**GO com ressalvas para Dia 1**.

Motivo do GO:

- D1 dedicado existe e esta isolado de staging/producao;
- snapshot pos-smoke foi gerado com sucesso;
- schema e dados minimos do Controle de Voos N1 foram validados;
- ha 1 RDV finalizado para baseline pos-smoke;
- escopos proibidos nao aparecem no D1 dedicado;
- production e staging permaneceram intocados nesta contencao.

Ressalvas:

- working tree segue sujo em `main`;
- existem artefatos historicos/locais de producao e dumps ignorados/untracked no workspace;
- o config temporario do piloto deve permanecer fora do commit;
- commit deve ser seletivo e limitado a `docs/CONTROLE_DE_VOOS_N1_DIA1_RELEASE_READINESS.md` e, se aprovado, `.gitignore`.

Sugestao de commit seletivo:

```bash
git add .gitignore docs/CONTROLE_DE_VOOS_N1_DIA1_RELEASE_READINESS.md
git commit -m "docs: record controle voos n1 dia1 readiness"
```

Nao adicionar:

```text
worker-airtrust/wrangler.pilot-cv-n1.toml
/tmp/airtrust-pilot-cv-n1/*
scripts/export_funcionarios_airtrust_producao.*
qualquer dump, .env, secret ou credencial
```
