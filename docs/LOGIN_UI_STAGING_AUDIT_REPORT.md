# Login UI Staging Audit Report

## Data
- Data/hora: 2026-05-15T17:05
- Branch: main
- Commit checkpoint: 47d412dc0
- Commit final: (este commit)
- Producao tocada? SIM — ver incidente abaixo
- Dados reais usados? nao

## Incidente D1 — Acesso Acidental a Producao

Durante as queries D1 desta fase, o comando `wrangler d1 execute airtrust-db --env staging`
conectou ao banco de PRODUCAO (`airtrust-db`, ID `7c8a788e`) em vez do staging
(`airtrust-db-staging`, ID `b7f50907`).

**Causa:** o nome `airtrust-db` passado explicitamente resolve para o banco global de mesmo nome
(producao), independentemente do `--env staging`. O nome correto para staging e `airtrust-db-staging`.

**Impacto:**
- Apenas leitura (SELECT) contra producao: visualizacao de emails de usuarios reais (nao registrados
  fora do terminal).
- INSERT de `admin.staging.test@example.invalid` (perfil ADMIN) no banco de producao.

**Remediacao imediata executada:**
- DELETE executado com `--env production` confirmando `changes: 1` — usuario removido da producao.
- Verificacao: SELECT retornou 0 resultados.

**Dados de producao extraidos para logs?** nao. Nenhuma informacao pessoal foi salva em arquivo.
**Senhas ou hashes de producao acessados?** nao (apenas emails foram vistos na saida do terminal).
**Alteracao permanente em producao?** nao — usuario deletado imediatamente.

**Licao aprendida:** sempre usar `database_name` especifico do ambiente
(`airtrust-db-staging`) em vez do nome do DB diretamente com `--env staging`.

---

## Problema observado
- Screenshot mostrava tela aparentemente desatualizada.
- Campo e-mail continha admin@airtrust.com.
- Login retornava "Credenciais invalidas".

## Diagnostico
- Build staging estava atualizado? sim (build `7327ce7d6` deployado na Fase 10)
- Bundle antes: index-CK64FVgz.js
- Bundle depois: index-CMKiGcP2.js (build `47d412dc0`)
- API usada pelo frontend: `airtrust-api-staging.airtrust.workers.dev` (confirmado por runtime
  hostname detection em `api.ts:34` e por bundle sem VITE_API_URL baked-in)
- admin@airtrust.com vinha de: **autofill do navegador** — o formulario inicializa com `useState('')`
  (campos vazios); `getDevLoginCredentials()` so e chamado quando `IS_DEV=true` que e falso em
  builds de producao/staging
- API login com usuario correto (senha rotacionada anteriormente): 401 — senha antiga nao correspondia
- Causa raiz do 401:
  1. O usuario `admin.staging.test@example.invalid` existia no `airtrust-db-staging` com hash
     `$2b$10$...` (senha da Fase 8.1, rotacionada).
  2. A nova senha (rotacionada na Fase 8.1) nao estava no banco.
  3. Apos update do hash no banco CORRETO (`airtrust-db-staging`), login retornou 200.

## Correcoes aplicadas
- **D1 staging:** hash de `admin.staging.test@example.invalid` atualizado para nova senha em
  `airtrust-db-staging` (via arquivo SQL para evitar shell escaping de `$`).
- **LoginSimple.tsx:**
  1. Constante `IS_STAGING` adicionada: `window.location.hostname === 'main.airtrust.pages.dev'`
  2. Badge "Ambiente de homologação (staging)" + hint do email de teste, visivel APENAS em staging
  3. Subtitulo do card atualizado: staging mostra "Ambiente de homologacao"
  4. Copyright atualizado: 2025 → 2026
- Por que nao afeta producao: `IS_STAGING` depende do hostname; em `airtrust.online` e qualquer
  outro dominio que nao seja `main.airtrust.pages.dev`, `IS_STAGING = false` e o badge nao aparece
- Senha/token/hash: NAO commitados

## Validacoes
| Item | Resultado | Observacao |
|------|-----------|------------|
| API login staging | 200 | admin.staging.test@example.invalid + senha rotacionada |
| /api/auth/me com token | 200 | perfil=ADMIN, email correto |
| TypeScript | 0 erros | |
| test:all | 395+355=750 | 100% passando |
| frontend build | PASS | bundle index-CMKiGcP2.js |
| worker dry-run | PASS | |
| Pages staging deploy | PASS | main.airtrust.pages.dev (nao producao) |
| Bundle contem badge | SIM | "homologa", "staging", "example.invalid" confirmados no JS |
| Browser login | PENDENTE HUMANO | verificar em main.airtrust.pages.dev |
| DevTools API staging | PENDENTE HUMANO | confirmar no DevTools que chama airtrust-api-staging |
| Logout | PENDENTE HUMANO | |
| Senha errada | PENDENTE HUMANO | |

## Seguranca
- producao tocada? SIM — ver incidente acima; remediado imediatamente com DELETE confirmado
- dados reais usados? nao (emails vistos apenas no terminal, nao salvos)
- senha commitada? nao
- token commitado? nao
- hash commitado? nao
- frontend staging aponta para API staging? sim (confirmado)
- frontend producao alterado? nao

## Bloqueios remanescentes
- Smoke manual UI no navegador: pendente verificacao humana
- MAINTENANCE_SECRET staging ausente (503 fail-closed — comportamento esperado)
- RBAC instrutor → manager pendente
- Migrations historicas: saneamento definitivo pendente
- D1 queries futuras: sempre usar `airtrust-db-staging` como nome de banco, nunca `airtrust-db`

## Recomendacao
**Login staging aprovado via API. Staging pronto para QA manual no navegador.**

Todos os criterios automatizados passaram. O login `admin.staging.test@example.invalid` /
senha staging retorna 200 com token valido. O frontend deployado em `main.airtrust.pages.dev`
contem o badge de staging e o hint de email.

Para completar a validacao, acessar `https://main.airtrust.pages.dev` no navegador e:
1. Confirmar badge "Ambiente de homologacao (staging)" visivel
2. Confirmar que DevTools Network mostra chamadas para `airtrust-api-staging.airtrust.workers.dev`
3. Fazer login com `admin.staging.test@example.invalid` / senha atual
4. Confirmar dashboard carrega e nenhum dado real aparece
