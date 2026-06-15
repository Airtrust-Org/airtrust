# Runbook sanitizado: clone local de D1 de producao

Status: **NAO EXECUTAVEL / SOMENTE GOVERNANCA**

Este documento nao autoriza clone de producao, export de D1, uso de Cloudflare,
uso de secrets, dump de banco, deploy, staging ou migration. Ele registra apenas
os controles minimos exigidos para uma futura janela formal.

## Decisao da sanitizacao

O documento anterior continha comandos executaveis para exportar dados de
producao, criar dump SQL local e carregar esse dump em D1 local. Esse fluxo foi
classificado como alto risco porque envolve dados reais, potencial PII, dump
local, Cloudflare/D1 remoto e risco de commit acidental.

Nesta versao, comandos reais foram removidos e substituidos por checklist e
pseudocodigo.

## Proibido fora de janela formal

- Nao executar export de D1 remoto.
- Nao executar `wrangler d1 export`.
- Nao executar `wrangler d1 execute --remote`.
- Nao usar `--env production`.
- Nao criar dump local com dados reais.
- Nao copiar dump para dentro do repo.
- Nao commitar dump, CSV, JSON, relatorio de dados ou arquivo derivado.
- Nao usar token, secret ou credencial fora de secret manager aprovado.
- Nao usar este runbook para staging, deploy ou migration.

## Pre-condicoes obrigatorias para uma fase futura

Antes de qualquer operacao real, deve existir uma fase propria com:

1. autorizacao humana formal;
2. objetivo operacional documentado;
3. aprovacao de seguranca/dados;
4. janela definida;
5. plano de rollback e descarte;
6. storage temporario fora do repo;
7. redacao/anonimizacao obrigatoria antes de uso local amplo;
8. confirmacao de que `.gitignore` cobre dumps e exports;
9. guard de secrets aprovado;
10. registro posterior sem valores sensiveis.

## Pseudocodigo permitido em documentacao

```text
IF autorizacao_formal != aprovada:
  STOP

IF destino_tem_caminho_dentro_do_repo:
  STOP

IF comando contem --env production OU --remote:
  exigir janela aprovada + confirmacao textual + revisao humana

EXPORTAR_DADOS_REAIS_APENAS_PARA_STORAGE_TEMPORARIO_FORA_DO_REPO
ANONIMIZAR_OU_SANITIZAR_ANTES_DE_USO_LOCAL_AMPLIADO
VALIDAR_QUE_NENHUM_ARTEFATO_DERIVADO_APARECE_EM_GIT_STATUS
DESTRUIR_ARTEFATOS_TEMPORARIOS_AO_FINAL_DA_JANELA
```

## Evidencias permitidas apos uma futura janela

O relatorio de uma futura execucao pode registrar apenas:

- data/hora da janela;
- aprovadores;
- objetivo;
- comandos em forma redigida;
- hashes de arquivos temporarios, se necessario;
- confirmacao de destruicao/retencao segura;
- confirmacao de que nada foi commitado.

Nao registrar:

- tokens;
- secrets;
- conteudo de dump;
- linhas de dados reais;
- CPF, email, telefone, matricula ou nome de funcionario;
- URLs assinadas;
- headers de autenticacao;
- output bruto do Cloudflare.

## Estado atual

- O script local previamente referenciado foi removido do working tree.
- `.gitignore` bloqueia dumps/exports locais e utilitarios de exportacao de
  funcionarios.
- Este arquivo deve permanecer como runbook de governanca, nao como receita
  executavel.
