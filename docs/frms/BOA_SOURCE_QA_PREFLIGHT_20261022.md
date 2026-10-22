# FRMS BOA — entrada de escalas: primeiro passo executável, sem persistência

**22/10/2026 · PR #1650 · Ambiente previsto:** aplicativo autenticado em staging. **Não** se refere à página estática `/qa/boa-frms-demonstracao.html`, que não chama a API.

## 1. O que foi implementado

- Área administrativa FRMS Bombeiros → **Conferência de escala e acionamentos — QA**, exibida somente na configuração de build destinada ao staging (ou desenvolvimento).
- `POST /api/bombeiros/frms/fontes-operacionais/validar-qa`. Exige login, papel `admin`, tenant `bombeiros` diferente do ID 6 e perfil `FIREFIGHTER_AVIATION` efetivo; staging/development somente.
- Aceita **somente arquivos fictícios** até 256 KiB, JSON estrito `BOA_OPERATIONAL_SOURCE_BATCH_V1`, identificador `source_system_id=BOA-QA-SYNTHETIC`, `dataset_id` e `source_document_reference` começando com `qa-`.
- Valida IDs opacos, horário com timezone, período planejado, realizado, sobreaviso e acionamentos, revisões e sobreposições. Retorna apenas quantidade, horários somados como **durações candidatas**, lacunas e SHA-256 dos bytes recebidos.
- Nunca retorna IDs de tripulantes, missão, dados clínicos, tokens ou conteúdo completo. **Não faz SQL INSERT/UPDATE, D1, R2 nem provisionamento**; não cria denominador de exposição, índice validado ou liberação de voo.

## 2. Exemplo sintético de arquivo para a pré-validação

```json
{
  "schema": "BOA_OPERATIONAL_SOURCE_BATCH_V1",
  "source": {
    "source_system_id": "BOA-QA-SYNTHETIC",
    "dataset_id": "qa-batch-001",
    "export_id": "qa-export-1",
    "export_revision": "qa-rev-1",
    "exported_at": "2026-10-22T08:00:00-03:00",
    "source_document_reference": "qa-source-document-1"
  },
  "records": [{
    "external_duty_id": "qa-duty-1",
    "external_crew_id": "qa-crew-1",
    "external_sector_id": "qa-sector-1",
    "external_base_id": "qa-base-1",
    "external_mission_id": null,
    "source_record_revision": "qa-record-1",
    "source_record_updated_at": "2026-10-22T07:30:00-03:00",
    "planned": {
      "start_at": "2026-10-21T22:00:00-03:00",
      "end_at": "2026-10-22T06:00:00-03:00"
    },
    "actual": {
      "start_at": "2026-10-21T22:30:00-03:00",
      "end_at": "2026-10-22T06:30:00-03:00"
    },
    "standby_state": "UNKNOWN",
    "standby": null,
    "activation_state": "UNKNOWN",
    "activations": []
  }]
}
```

Espera-se **um registro validado**, duração planejada e realizada de oito horas cada, sobreaviso e acionamentos `null` (não zero) e ambas as lacunas indicadas. Mesmo que a validação seja bem-sucedida, o estado retornado é `SCHEMA_VALID_SOURCE_UNVERIFIED`. O checksum é controle de reprodução, não assinatura documental.

## 3. Cadeia necessária até importar de verdade

1. Responsável BOA identifica sistema oficial de escala e registros de acionamento e autoriza a fonte; controlador/operador define LGPD, minimização, retenção e tratamento.
2. Processo governado cria tenant QA exclusivo e contas fictícias de papéis variados; mantém `empresa_id=6` totalmente isolado.
3. Uma tabela ou crosswalk **aprovado**, auditável e versionado associa `source_system_id / external_crew_id / external_sector_id` a funcionário e setor canônicos dentro da mesma empresa. **Não** confiar em `funcionario_id` enviado pelo arquivo.
4. Pipeline oficial de staging valida os campos, a proveniência, o crosswalk, a integridade e a versão de política, faz plan/snapshot/recuperação e aplica apenas a carga especificamente autorizada via Schema V2 quando cabível. Eventos da API devem manter append-only/idempotência e data/canal da fonte.
5. Sob autenticação, o tripulante envia check-in; a gestão recebe a ocorrência; caso e relatório são lidos do mesmo conjunto persistido. A análise de exposição exige numeradores/denominadores e revisão científica BOA **separada**; nunca inferi-los do pré-processamento.
6. PoC real: testar 201, 409, 403, isolamento, integridade, falha/recovery, tratamento, eficácia, relatórios e perfil humano no browser; coletar evidência do Worker/Pages/Schema aprovados.

**Bloqueio atual:** ausência de origem BOA legitimada, crosswalk oficial e evidência de aprovação científica/LGPD; sem autorização específica de carga e provisionamento. A validação de QA não é ingestão operacional. **Produção e publicação Worker não foram autorizadas por este documento.**
