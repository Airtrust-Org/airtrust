# AirTrust — CI/CD e operação de releases

**Status:** documento operacional vigente  
**Repositório oficial:** `airtrustsystem-alt/airtrust`  
**Branch oficial:** `main`  
**Atualizado em:** 2026-08-01

> O código e os workflows versionados no SHA executado, as proteções da branch, os GitHub Environments e o `CLAUDE.md` prevalecem sobre este resumo. Esta página não autoriza merge, migration, escrita em D1/R2 ou deploy.

## 1. Fonte de verdade e fluxo de mudança

- `origin/main` é a fonte oficial do sistema.
- Toda alteração deve ser preparada em branch própria e integrada por pull request.
- Não editar nem publicar diretamente a partir de uma cópia local desatualizada.
- Depois que a `main` avançar, atualizar a branch, revisar semanticamente o delta recebido e repetir os testes proporcionais.
- O HEAD revisado deve ser o mesmo HEAD validado pela CI.
- Um check verde isolado, uma PR aprovada ou um merge não equivalem a release concluída.

## 2. Validação de pull request

Os checks efetivos são definidos por `.github/workflows/` e pelas regras de proteção da `main`. Antes do merge:

1. todos os checks obrigatórios devem estar concluídos e verdes;
2. nenhuma thread bloqueante pode permanecer aberta;
3. o delta deve ter sido revisado no HEAD atual;
4. conflitos devem ser resolvidos semanticamente, sem restaurar código antigo;
5. testes focados e suítes afetadas devem ser repetidos após rebase ou correção;
6. mudanças de alto risco devem comprovar isolamento tenant, RBAC, integridade de dados e rollback aplicável.

Comandos locais usuais, conforme o escopo:

```bash
npm ci
npm run typecheck
npm run typecheck:worker
npm run lint
npm run test:run
npm run test:worker
npm run build
```

A existência desses comandos não substitui os checks exigidos pelo GitHub.

## 3. Staging

O caminho oficial de publicação controlada é o workflow:

- `.github/workflows/deploy-staging.yml` — **Deploy Staging (Official)**.

O contrato exato de inputs, permissões, targets e validações é o arquivo versionado no SHA executado. Em especial:

- a execução deve apontar para uma PR aberta e para o SHA exato revisado;
- Worker, frontend, migrations e smokes são alvos explícitos e independentes;
- o workflow deve permanecer fail-closed para banco e host de produção;
- migrations de staging só podem usar arquivos allowlisted e revisados;
- qualquer escrita exige preflight, ponto de recuperação aplicável, ledger e pós-condições;
- o resultado deve registrar run ID, SHA, versão publicada e evidência funcional.

Não repetir migration já aplicada. Uma reexecução deve confirmar ledger e pós-condições sem criar nova escrita indevida.

## 4. Produção

Os caminhos oficiais de produção são separados:

- `.github/workflows/apply-schema-change-v2.yml` — **Apply Schema Change V2**, para mudanças governadas de schema;
- `.github/workflows/deploy-airtrust.yml` — **Deploy AirTrust**, para Worker e Pages.

Nunca tratar `git push main` como deploy de produção. A publicação depende de dispatch explícito, SHA esperado, confirmação, GitHub Environment e demais gates do workflow.

Antes de qualquer ação de produção, confirmar:

- SHA exato autorizado e CI verde;
- branch e repositório oficiais;
- backup ou ponto D1 Time Travel quando aplicável;
- baseline, change ID, hashes, plano e ledger para Schema V2;
- rollback ou neutralização documentada;
- ausência de migration legada não governada;
- Worker, API e UI publicados no SHA esperado;
- health, version, provenance e smoke funcional;
- validação do caso real, dos artefatos e dos dados relacionados;
- ausência de regressão relevante.

Não executar SQL manual em produção quando houver workflow, endpoint ou executor governado para a operação.

## 5. Dados, migrations e credenciais

- Produção contém dados reais e deve ser tratada como ambiente regulado.
- Nunca incluir tokens, secrets, IDs internos sensíveis ou instruções de obtenção de credenciais em documentação pública.
- Credenciais devem permanecer nos GitHub Environments ou secrets exigidos pelos workflows.
- Falta de secret, divergência de SHA, falha de backup ou target incorreto deve interromper a execução de forma fail-closed.
- Migration não autorizada deve permanecer não executada; não criar atalho manual para contornar o gate.
- Um arquivo marcado como não aplicável à produção não pode ser liberado por flag de runtime.

## 6. Falhas, rollback e recuperação

Diante de falha:

1. identificar o workflow, job e step exatos;
2. confirmar se houve escrita em banco, publicação ou alteração de artefato;
3. não repetir a execução com os mesmos inputs incorretos;
4. corrigir a causa mínima no repositório;
5. executar primeiro o teste que reproduz a falha e depois a suíte afetada;
6. executar uma nova CI completa somente quando necessário;
7. usar o caminho oficial de rollback ou recuperação;
8. registrar SHA, run ID, impacto, restauração e validação final.

Para código, o rollback deve usar o mecanismo oficial de release ou um novo commit revisado. Para D1, usar o ponto de recuperação e o procedimento aprovado do change correspondente. `npm run deploy` não é um atalho autorizado de rollback de produção.

## 7. Ordem de precedência operacional

Use, nesta ordem:

1. workflow versionado no SHA que será executado;
2. branch protections e GitHub Environment aplicáveis;
3. `CLAUDE.md` e contratos de release/schema do repositório;
4. issue ou PR operacional ativo;
5. esta página.

Links e instruções referentes ao antigo repositório `fp-daumas/airtrust-v1`, ao workflow inexistente `.github/workflows/deploy.yml`, a deploy automático por push, a endpoints antigos ou a desativação informal da CI são obsoletos e não devem ser usados.

## 8. Critério de encerramento

Uma frente operacional só termina quando:

- a causa foi corrigida;
- o código foi integrado na `main` correta;
- migrations necessárias foram aplicadas pelo mecanismo oficial;
- o ambiente correto foi publicado;
- versão e proveniência foram confirmadas;
- o caso real foi validado;
- artefatos e dados relacionados foram verificados;
- não houve regressão relevante.

PR verde, merge isolado, deploy isolado ou health check isolado não encerram um incidente.
