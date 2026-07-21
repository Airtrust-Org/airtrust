# Importação controlada — matriz final AW139 e S-76

O importador lê os pacotes privados indicados pelo operador. Não copie os ZIPs, planilhas, guias HTML ou PDFs para este repositório.

## Estado de referência levantado em 2026-07-21

O snapshot local pré-Matriz V6 tinha 25 modelos AW139 com 550 vínculos e 24 modelos SK76 com 528 vínculos. A matriz final exige, respectivamente, 30/540 e 21/378. Modelos referenciados por ficha, sessão concluída, agendamento iniciado ou qualificação devem receber versão nova; os vínculos históricos não podem ser atualizados.

## Dry-run obrigatório

```sh
task_tmp="$(cat /tmp/airtrust-simuladores-path)"
node worker-airtrust/scripts/prepare-simuladores-matriz-import.mjs \
  --aw139 "$task_tmp/AW139" --sk76 "$task_tmp/SK76" \
  --empresa-id <TENANT_ID> --out /tmp/airtrust-simuladores-plan
```

O comando falha fechado se encontrar outra contagem que não 30/540/14 para AW139, 21/378/8 para S-76, ordem fora de 1–18 em modelo novo, vínculo duplicado na mesma posição ou divergência entre CSV e XLSX do S-76. O manifesto contém SHA-256 dos bytes de cada fonte consumida, inclusive cada guia HTML. A saída `plan.json` é o plano sanitizado a revisar antes de qualquer carga.

## Aplicação local controlada

1. Aplicar somente a migration `0440_simuladores_matriz_versionada_metadata.sql` no D1 local.
2. Capturar um snapshot das linhas do tenant afetadas (`modelos_sessao`, `modelos_sessao_manobras`, `manobras`, fichas e agendamentos).
3. Executar o dry-run acima com o tenant real — nunca com um ID fixo em código.
4. O aplicador operacional deve criar nova versão para qualquer modelo com referência histórica, inativar a versão antiga somente para novas seleções e registrar `simuladores_matriz_imports` e as mudanças em `simuladores_matriz_import_changes`.
5. Reexecutar o dry-run e as validações de 18 posições/LOFT antes de promover o artefato.

Não há comando de staging ou produção nesta mudança. A migration não contém carga de dados e não deve ser executada remotamente sem revisão operacional.

## Rollback

Reverter uma aplicação de dados usando as mudanças registradas por importação em `simuladores_matriz_import_changes`, restrito ao mesmo `empresa_id`. Marque a execução como `ROLLED_BACK`; não apague fichas, sessões, qualificações ou auditoria. O rollback estrutural requer remover os índices e as tabelas de versionamento/importação em banco local validado.
