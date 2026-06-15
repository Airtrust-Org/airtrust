# Manutencao - usuarios de acesso seguro - plano Junho 2026

**Data:** 2026-06-15
**Escopo:** ocultacao de navegacao dos modulos em desenvolvimento + criacao segura de usuarios da manutencao
**Status operacional:** `NO-GO` para escrita em producao; `GO` apenas para `dry-run` local e preparacao controlada

## 1. Decisoes desta entrega

1. A navegacao de `Manutencao` (`/mro`) e `Controle de Voos` (`/controle-voos`) passa a ficar oculta para todos os perfis, inclusive admin comum, exceto o admin principal allowlisted.
2. O admin principal foi consolidado por allowlist centralizada no frontend como `PRIMARY_ADMIN_EMAILS`.
3. O e-mail validado na configuracao local atual do projeto e nos overrides operacionais e `filipe.daumas@icloud.com`.
4. Nenhuma rota foi removida e nenhum `ProtectedRoute` foi alterado. O link direto continua dependendo apenas das regras normais de modulo/permissao.
5. A frente de criacao de usuarios nao executa escrita real por padrao. O script novo sai em modo `dry-run` e exige lista final validada antes de qualquer `apply`.

## 2. Motivo do no-go para criacao automatica agora

O proprio relatorio base `docs/MANUTENCAO_FUNCIONARIOS_RECONCILIACAO_JUNHO26.md`, gerado em **2026-06-15**, fecha a fase atual com:

- `31` linhas da planilha
- `0` `MATCH_EXATO`
- `0` `MATCH_PROVAVEL`
- `31` `NAO_ENCONTRADO`
- veredito explicito: `NO-GO PARA UPDATE AUTOMATICO EM PRODUCAO`

Isso significa que a base local disponivel em `artifacts/local-dev-db/local-db-backup-pre-import-20260609.sqlite` nao consegue provar qual `funcionario_id` de producao corresponde a cada linha da planilha. Criar login agora correria risco direto de:

- vincular usuario ao funcionario errado;
- sobrescrever email de outra pessoa;
- criar duplicidade em `usuarios` ou `usuarios_empresas`;
- tratar ocultacao de menu como se fosse controle de seguranca.

## 3. Script entregue

Arquivo:

- `scripts/manutencao-criar-usuarios-junho26.mjs`

Caracteristicas:

- `--dry-run` por default
- `--apply` bloqueado para qualquer alvo diferente de `local-sqlite`
- tolerancia a schema drift local (`password_hash` vs `senha_hash`, `active` vs `ativo`, presenca ou ausencia de `convites_usuarios`)
- leitura do plano reconciliado por `source_row`
- exigencia de lista final validada via `--approved-file` antes de considerar qualquer linha elegivel
- idempotencia para:
  - usuario ja existente
  - vinculo `usuarios_empresas` ja existente
  - caso de usuario existente sem vinculo de tenant
- sem senha previsivel
- sem log de senha
- `--output-credentials` permitido apenas em `tmp/`

Comportamento de bootstrap:

- se `convites_usuarios` existir no banco alvo, o script cria usuario com convite pendente;
- se `convites_usuarios` nao existir, o script so permite `apply` com `--output-credentials` em `tmp/`, usando senha temporaria aleatoria local;
- nenhum segredo vai para `docs/` nem para a saida final.

## 4. Dry-run esperado neste momento

Com o plano atual e **sem** arquivo de aprovacao final, o comportamento correto do script e:

- `0` elegiveis para escrita
- `0` criados
- `31` ignorados
- motivo dominante: `SEM_APROVACAO_VALIDADA`

Mesmo que se informe o snapshot local, o resultado continua bloqueado porque o plano atual nao tem `MATCH_EXATO`/`MATCH_PROVAVEL` aprovados com `funcionario_id` final.

Exemplo seguro:

```bash
node scripts/manutencao-criar-usuarios-junho26.mjs \
  --dry-run \
  --target local-sqlite \
  --db-file artifacts/local-dev-db/local-db-backup-pre-import-20260609.sqlite
```

## 5. Preconditions para um apply futuro

Antes de qualquer `--apply`, ainda faltam:

1. exportar de producao a lista real dos funcionarios de manutencao no tenant `empresa_id = 6`;
2. fechar o match humano nome -> `funcionario_id`;
3. confirmar o setor canonico de manutencao;
4. gerar um `--approved-file` final com pelo menos:
   - `source_row`
   - `funcionario_id`
   - `approval_status=VALIDADO`
   - `email` final, se divergir da planilha
5. rodar `dry-run` limpo contra o alvo local equivalente;
6. documentar snapshot/rollback e passar `--rollback-reference`;
7. obter autorizacao explicita antes de qualquer operacao fora do ambiente local.

## 6. Riscos residuais

- O snapshot local de **2026-06-09** nao tem os funcionarios criados em producao em **2026-06-13**.
- O schema local auditado nao possui `convites_usuarios`; logo, testes de convite dependem de outro snapshot/local mais recente ou de staging controlado.
- O script nao escreve trilha de auditoria customizada por fora dos fluxos existentes do produto; ele fica restrito ao minimo necessario de `usuarios` e `usuarios_empresas`.

## 7. Resultado desta fase

- Frontend ajustado para ocultar os dois modulos de navegacao em desenvolvimento para todos, exceto admin principal allowlisted.
- Script operacional seguro criado.
- Nenhuma escrita em producao executada.
- Nenhum segredo salvo em documentacao versionada.

## 8. Status em 2026-06-15

O fluxo de criacao de usuarios para alunos continua bloqueado de forma intencional.

Ainda faltam, sem excecao:

1. export read-only dos funcionarios reais de producao para `empresa_id = 6`;
2. reconciliacao humana `nome -> funcionario_id`;
3. confirmacao do setor canonico que define a populacao alvo;
4. arquivo final de aprovacao para `--approved-file`;
5. `dry-run` limpo no snapshot local equivalente;
6. autorizacao explicita antes de qualquer `--apply`.
