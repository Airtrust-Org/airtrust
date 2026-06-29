# AirTrust LMS Tripulação Canonical Fix 2026-06-29

## Escopo e restrições

- Workspace único utilizado: `/Users/filipedaumas/SAAS/Airtrust`
- Fonte canônica de ZIPs: `/Users/filipedaumas/EADs/Tripulação/00_ATUAL_UPLOAD`
- Índice canônico atualizado: `/Users/filipedaumas/EADs/Tripulação/CANONICAL_INDEX_RevLMS2026-06-28.md`
- Backup adicional pré-patch: `/Users/filipedaumas/EADs/Tripulação/90_BACKUP_PRE_TRIP_FIX_20260629_0748`
- Sem SQL de escrita, sem alteração manual de DB, sem matrícula manual, sem qualificação manual
- Sem upload R2 nesta etapa
- `qual_4449` / EFB M12 mantido fora de escopo
- Certificados automáticos permanecem bloqueados até Tripulação passar por upload + QA pós-upload

## Causa confirmada

Doze pacotes canônicos de Tripulação exigiam correção local antes de novo upload:

- 10 ZIPs com `imsmanifest.xml` aninhado em um diretório raiz artificial, incompatível com a convenção operacional do AirTrust para SCORM canônico;
- 2 ZIPs já planos, mas com `save()` sem `Scorm.progress(...)` terminal, o que enfraquecia a persistência do `lesson_location=n/total`.

## Ferramenta local de auditoria

Script criado para esta passada:

- `/Users/filipedaumas/SAAS/Airtrust/scripts/audit-tripulacao-canonical-zips.py`

Evidências geradas:

- `/Users/filipedaumas/EADs/Tripulação/90_BACKUP_PRE_TRIP_FIX_20260629_0748/inventory_before.json`
- `/Users/filipedaumas/EADs/Tripulação/90_BACKUP_PRE_TRIP_FIX_20260629_0748/inventory_before_rebuilt.json`
- `/Users/filipedaumas/EADs/Tripulação/90_BACKUP_PRE_TRIP_FIX_20260629_0748/inventory_after.json`

## Correções aplicadas

### Reempacotamento estrutural

Os ZIPs abaixo foram reempacotados com `imsmanifest.xml` na raiz e launch efetivo em `index.html`, preservando todos os arquivos:

- `TRIP_CGA_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_Doutrinamento_Basico_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_EFB_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_FDM_HFDM_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_Instrutor_de_Voo_Solo_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_MGO_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_Operacao_Aeromedica_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_Operacoes_Offshore_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_Operacoes_Terrenos_Desabitados_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_PBN_SCORM12_RevLMS2026-06-28.zip`

### Patch funcional em `save()`

Os ZIPs abaixo receberam `try{Scorm.progress((current+1)+'/'+SLIDES.length);}catch(e){}` ao final de `save()`:

- `TRIP_Emergencias_Gerais_SCORM12_RevLMS2026-06-28.zip`
- `TRIP_Examinador_Credenciado_Solo_SCORM12_RevLMS2026-06-28.zip`

Esse patch preserva o fluxo já existente de:

- `cmi.suspend_data`
- `cmi.core.lesson_status`
- `cmi.core.score.raw`
- `LMSCommit`
- `LMSFinish`
- reprovação sem conclusão
- aprovação com conclusão correta

## Before/After dos 12 ZIPs

| ZIP canônico | curso_id | SHA-256 antes | SHA-256 depois | tamanho antes | tamanho depois | arquivos | manifest antes | manifest depois | patch |
|---|---:|---|---|---:|---:|---:|---|---|---|
| `TRIP_CGA_SCORM12_RevLMS2026-06-28.zip` | 3 | `7bcb55b3057dae00eb472d46e3005331ae76427ccc88ac1a638a05380d2123f7` | `9c0da69f0befad3d0de22edb5f2e01e9db4db5b4a0d8b78dd0cd047f9da3927a` | 1489498 | 1487518 | 22 | `Conhecimentos_Gerais_Aeronaves_SCORM12_Rev02/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_Doutrinamento_Basico_SCORM12_RevLMS2026-06-28.zip` | 15 | `517b1f4e27b53445a84beae926ea1290ef77dc0b2d6f92499066a1fe699f48d9` | `29a8c7f21ac0673bad7451f9035d8649d3eb9b64f8d9ece006f49b7f18166266` | 47779 | 45959 | 26 | `Doutrinamento_Basico_SCORM12_Rev02/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_EFB_SCORM12_RevLMS2026-06-28.zip` | 4 | `ce463a5f2843cedccc42cf70d63ebf890834aac0aa863f1039eb5a5071c4086f` | `7203aa8c06a915f5f6bf94d49b9e0d8fe1bb65ba29d0ba3881da7f41cabd606e` | 1608988 | 1606734 | 23 | `EFB_Operacao_Electronic_Flight_Bag_SCORM12_Rev02/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_Emergencias_Gerais_SCORM12_RevLMS2026-06-28.zip` | 5 | `5ea06d2f5a9afa8121bcad988fb00a028d16074a71494e578309c883e778f90e` | `b463d9d80e17da160f203a4e7612d4c957f298e916e66c4d3c99845abfdcd93b` | 11392129 | 11392138 | 17 | `imsmanifest.xml` | `imsmanifest.xml` | `save()+progress` |
| `TRIP_Examinador_Credenciado_Solo_SCORM12_RevLMS2026-06-28.zip` | 17 | `a05d63b7eda934024f51b1fcfe3ff3086b62e1c0a3dbaf21599ad50147efbab7` | `36fc0f898811cc2b7abfd28255608369ab9048aaa89f2caa1dd61410670b96f6` | 37423 | 37432 | 18 | `imsmanifest.xml` | `imsmanifest.xml` | `save()+progress` |
| `TRIP_FDM_HFDM_SCORM12_RevLMS2026-06-28.zip` | 13 | `dc146bb0f23de4815adb899c981ee1d1c2a41f3b9d1c4e155a7080b694e749c7` | `bf30adaa9cea56c4eed3d36f397e6d0bee58773b02e00d8ef46824fbaea7fcbf` | 2105383 | 2104601 | 17 | `FDM_HFDM_SCORM12_Rev01/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_Instrutor_de_Voo_Solo_SCORM12_RevLMS2026-06-28.zip` | 19 | `281634b80de2907811fe07a7c236fc28b4e4e61168758c71fdc046b09bb6c5ea` | `347e9374f36f5be2f633ebb8d216bcf13935ab2580edabd95c66c60e1f692a2c` | 35530 | 34378 | 16 | `Instrutor_de_Voo_Solo_SCORM12_Rev07/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_MGO_SCORM12_RevLMS2026-06-28.zip` | 21 | `eb583e7694b5efafb682d11f5d2f29278f0ea7370e034086f28ef4bcbc4d420e` | `bdc2b3edc01d15685242a19b411f0a5548113ca2a0505b3c94a5a8668850c86d` | 321771 | 320787 | 12 | `Manual_Geral_Operacoes_MGO_SCORM12_Rev03/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_Operacao_Aeromedica_SCORM12_RevLMS2026-06-28.zip` | 6 | `d00dac5e62d5360de08aec29958cb9117f21c650739339a2c5e64ec879855b35` | `ae366b657b30887b4a67828ccf02d6f71100731ccf1ac84cf9a8c242f53c4995` | 1376135 | 1374707 | 21 | `Operacao_Aeromedica_SCORM12_Rev01/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_Operacoes_Offshore_SCORM12_RevLMS2026-06-28.zip` | 7 | `04280f602f834767fd9e4979073cc3bfbed1b795967ff23f86c6774e5495347b` | `7c38341749c340caefde473868c94051d04412816d4bc03a4dee1f5da517aa3b` | 48410890 | 48408580 | 35 | `Operacoes_Offshore_SCORM12_Rev01/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_Operacoes_Terrenos_Desabitados_SCORM12_RevLMS2026-06-28.zip` | 9 | `238e958e339123c04c19004a34a59604dafa6625b3689d849ae1c8d5b72a811e` | `0d41626b408a5c09066970a33fb070bb810150f296768627ab462ebd954410f8` | 1537692 | 1535982 | 19 | `Operacoes_Terrenos_Desabitados_SCORM12_Rev01/imsmanifest.xml` | `imsmanifest.xml` | estrutural |
| `TRIP_PBN_SCORM12_RevLMS2026-06-28.zip` | 8 | `3a08891614f8e43ac20ee878b5eed74ca50e84229a2010d6ef7b8fcac000a697` | `4736cfb0078bdd3a4c0e7e86a6dca3a7bb540dca68a7fb322f4dfaaa40606900` | 9866870 | 9864662 | 23 | `PBN_Navegacao_Baseada_Performance_SCORM12_Rev02/imsmanifest.xml` | `imsmanifest.xml` | estrutural |

## Auditoria estática pós-patch

Resultado consolidado: os 12 ZIPs passaram na validação estática local.

Checklist validado em todos os 12:

- `imsmanifest.xml` XML válido
- manifest na raiz do ZIP
- launch `index.html` presente e coerente com o manifest
- `app.js`, `scorm_api.js`, `styles.css` e `index.html` presentes
- assets essenciais preservados
- ausência de `alert()` nativo
- sinais de `cmi.suspend_data`
- sinais de `lesson_location`
- sinais de `LMSInitialize`, `LMSCommit`, `LMSFinish`
- sinais de `passed`, `completed`, `failed`
- sinais de `score.raw`
- `Scorm.progress((current+1)+'/'+SLIDES.length)` presente no runtime pós-patch auditado

Limitação desta etapa:

- a validação foi estática/local; QA funcional pós-upload continua pendente por curso.

## Plano de upload R2 por curso

Tipo de upload recomendado para todos: painel normal.

| curso_id | curso | pacote canônico corrigido | SHA-256 | prefixo R2 atual | launch file atual | validação pós-upload esperada |
|---:|---|---|---|---|---|---|
| 3 | Conhecimentos Gerais da Aeronave | `TRIP_CGA_SCORM12_RevLMS2026-06-28.zip` | `9c0da69f0befad3d0de22edb5f2e01e9db4db5b4a0d8b78dd0cd047f9da3927a` | `lms/scorm/6/3/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 15 | Doutrinamento Básico | `TRIP_Doutrinamento_Basico_SCORM12_RevLMS2026-06-28.zip` | `29a8c7f21ac0673bad7451f9035d8649d3eb9b64f8d9ece006f49b7f18166266` | `lms/scorm/6/15/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 4 | EFB – Electronic Flight Bag | `TRIP_EFB_SCORM12_RevLMS2026-06-28.zip` | `7203aa8c06a915f5f6bf94d49b9e0d8fe1bb65ba29d0ba3881da7f41cabd606e` | `lms/scorm/6/4/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 5 | Emergências Gerais | `TRIP_Emergencias_Gerais_SCORM12_RevLMS2026-06-28.zip` | `b463d9d80e17da160f203a4e7612d4c957f298e916e66c4d3c99845abfdcd93b` | `lms/scorm/6/5/` | `index.html` | validar avanço, persistência de `lesson_location`, reprovação sem conclusão e aprovação com conclusão |
| 17 | Examinador Credenciado — Solo | `TRIP_Examinador_Credenciado_Solo_SCORM12_RevLMS2026-06-28.zip` | `36fc0f898811cc2b7abfd28255608369ab9048aaa89f2caa1dd61410670b96f6` | `lms/scorm/6/17/` | `index.html` | validar avanço, persistência de `lesson_location`, reprovação sem conclusão e aprovação com conclusão |
| 13 | FDM - Flight Data Monitoring | `TRIP_FDM_HFDM_SCORM12_RevLMS2026-06-28.zip` | `bf30adaa9cea56c4eed3d36f397e6d0bee58773b02e00d8ef46824fbaea7fcbf` | `lms/scorm/6/13/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 19 | Instrutor de Voo — Solo | `TRIP_Instrutor_de_Voo_Solo_SCORM12_RevLMS2026-06-28.zip` | `347e9374f36f5be2f633ebb8d216bcf13935ab2580edabd95c66c60e1f692a2c` | `lms/scorm/6/19/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 21 | MGO - Manual Geral de Operações | `TRIP_MGO_SCORM12_RevLMS2026-06-28.zip` | `bdc2b3edc01d15685242a19b411f0a5548113ca2a0505b3c94a5a8668850c86d` | `lms/scorm/6/21/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 6 | Operação Aeromédica | `TRIP_Operacao_Aeromedica_SCORM12_RevLMS2026-06-28.zip` | `ae366b657b30887b4a67828ccf02d6f71100731ccf1ac84cf9a8c242f53c4995` | `lms/scorm/6/6/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 7 | Operações Offshore | `TRIP_Operacoes_Offshore_SCORM12_RevLMS2026-06-28.zip` | `7c38341749c340caefde473868c94051d04412816d4bc03a4dee1f5da517aa3b` | `lms/scorm/6/7/` | `index.html` | abrir lançamento, conferir assets pesados, vídeo e retomada |
| 9 | Operações em Terrenos Desabitados | `TRIP_Operacoes_Terrenos_Desabitados_SCORM12_RevLMS2026-06-28.zip` | `0d41626b408a5c09066970a33fb070bb810150f296768627ab462ebd954410f8` | `lms/scorm/6/9/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |
| 8 | PBN – Navegação Baseada em Performance | `TRIP_PBN_SCORM12_RevLMS2026-06-28.zip` | `4736cfb0078bdd3a4c0e7e86a6dca3a7bb540dca68a7fb322f4dfaaa40606900` | `lms/scorm/6/8/` | `index.html` | abrir lançamento, confirmar manifest raiz e navegação/retomada |

## Autorização pendente

Nenhum upload foi executado. A próxima etapa depende de autorização explícita para um dos grupos:

1. todos os 12 ZIPs corrigidos
2. somente os 10 estruturais
3. somente Emergências Gerais + Examinador Credenciado — Solo

## Riscos remanescentes

- até o upload via painel, a correção existe apenas no canônico local;
- o QA funcional de retomada/conclusão ainda precisa ser executado após cada upload;
- certificados automáticos seguem bloqueados até Tripulação ficar limpa em produção;
- `Pages` continua fora de escopo e bloqueado por Cloudflare nesta frente.

## Decisão

`TRIPULACAO_CANONICAL_READY_FOR_UPLOAD`
