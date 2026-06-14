# Backup Restore Drill Local

## Objetivo

Validar, em ambiente local/CI, que os artefatos de backup do AirTrust podem ser verificados por manifesto SHA-256 real antes de qualquer tentativa operacional de restore. Este drill existe para provar recuperabilidade criptografica basica dos artefatos, detectar corrupcao e produzir um relatorio documentavel de sucesso/falha.

## Escopo seguro

O drill atual e deliberadamente local e nao operacional:

- usa fixtures de teste ou artefatos fake;
- nao executa backup de producao;
- nao baixa dumps reais;
- nao restaura dados em D1 real;
- nao aplica migrations;
- nao exige credenciais, secrets, Cloudflare, D1 ou R2;
- nao chama `RestoreService.restaurarBackup`, que escreve em D1 via `INSERT OR REPLACE`;
- pode rodar em maquina local ou CI via Vitest.

## O que o drill valida

O verificador `verifyBackupChecksumManifest` recebe o JSON exato do `checksum-manifest.json`, um SHA-256 esperado do manifesto e um resolvedor local de artefatos por `key`.

Ele valida:

- SHA-256 do manifesto;
- formato e algoritmo do manifesto (`SHA-256`);
- `backup_uuid` presente;
- `artifact_count` igual ao numero de artefatos;
- `total_bytes` igual a soma dos tamanhos declarados;
- ausencia de chaves duplicadas;
- presenca de todos os artefatos declarados;
- tamanho real de cada artefato;
- SHA-256 real de cada artefato;
- falha quando um byte e alterado;
- falha quando um artefato esta ausente;
- falha quando o tamanho declarado diverge;
- sucesso quando manifesto e artefatos estao integros.

O resultado e um `BackupRestoreDrillReport` com `ok`, hashes, contadores e falhas por artefato.

## O que o drill nao valida

Este drill nao prova, sozinho, recuperabilidade regulatoria completa:

- nao restaura em banco temporario;
- nao reexecuta queries de consistencia de dominio;
- nao valida `record_hash`, `manifest_hash` ou chain de Records Core;
- nao valida eDB, SDRMe, assinatura, modo offline ou modo fiscalizacao;
- nao mede RPO/RTO;
- nao testa lifecycle, versioning ou object lock em R2;
- nao substitui restore drill mensal em staging;
- nao substitui evidencia auditavel assinada para processo regulatorio.

## Como rodar localmente

Execute apenas os testes locais do worker:

```bash
cd worker-airtrust
npx vitest run src/__tests__/services/backup-restore-drill.test.ts
```

Para rodar junto com o teste do orquestrador de backup:

```bash
cd worker-airtrust
npx vitest run src/__tests__/services/backup-orchestrator.test.ts src/__tests__/services/backup-restore-drill.test.ts
```

Esses comandos nao acessam producao e nao precisam de credenciais.

## Como interpretar o resultado

Resultado aprovado:

- `report.ok === true`;
- `failures` vazio;
- todos os artefatos com `ok === true`;
- `manifestSha256` igual ao SHA-256 esperado;
- `artifactCount` e `totalBytes` coerentes com o manifesto.

Resultado reprovado:

- `report.ok === false`;
- `failures` contem a causa global ou por artefato;
- falhas de manifesto indicam JSON invalido, algoritmo inesperado ou hash do manifesto divergente;
- falhas de artefato indicam ausencia, tamanho divergente ou SHA-256 divergente.

## Riscos e cuidados

- O endpoint operacional `POST /api/backup/:uuid/restore` continua sendo uma rotina real de escrita em D1. Ele nao deve ser usado neste drill local.
- Scripts legados de backup/restore podem tocar Cloudflare ou arquivos reais. Nao fazem parte deste drill.
- A verificacao depende do JSON exato do manifesto; reformatar o manifesto muda o SHA-256 do manifesto.
- O checksum do manifesto prova integridade dos bytes declarados, mas nao prova que o conteudo restaurado atende regras de negocio ou exigencias ANAC.

## Proximos passos para staging

Um restore drill real em staging deve ser uma fase separada, com autorizacao explicita e ambiente descartavel:

1. gerar ou selecionar backup nao-produtivo;
2. copiar artefatos para bucket/prefixo temporario;
3. verificar `checksum-manifest.json` antes do restore;
4. restaurar em D1 temporario criado para o drill;
5. executar checks de contagem, constraints logicas e integridade de dominio;
6. recomputar hashes pos-restore;
7. gerar relatorio com ambiente, comandos, horarios, hashes, evidencias e responsavel;
8. destruir o ambiente temporario apos aprovacao do relatorio.

Para N3/N4, esse drill ainda precisa incluir `record_hash`, `manifest_hash`, chain, export fiscal verificavel e matriz de rastreabilidade requisito -> tabela -> teste -> evidencia.
