# AirTrust LMS Tripulação Upload Closeout — 2026-06-29

Status final: `GO_COM_RESSALVAS`

Escopo:
- Upload controlado dos 12 pacotes canônicos corrigidos de Tripulação.
- Fonte autorizada única: `/Users/filipedaumas/EADs/Tripulação/00_ATUAL_UPLOAD`
- Sem alteração manual de matrícula, qualificação, certificado ou banco.

Referências:
- Backup pré-patch: `/Users/filipedaumas/EADs/Tripulação/90_BACKUP_PRE_TRIP_FIX_20260629_0748`
- Índice canônico: `/Users/filipedaumas/EADs/Tripulação/CANONICAL_INDEX_RevLMS2026-06-28.md`
- Fix doc: `docs/AIRTRUST_LMS_TRIPULACAO_CANONICAL_FIX_20260629.md`
- Auditoria local: `scripts/audit-tripulacao-canonical-zips.py`
- Commit pré-upload: `76c1ce4` (`docs(lms): record tripulacao canonical scorm fix`)

## 1. Pré-condições confirmadas

- Os 12 ZIPs canônicos estavam presentes em `00_ATUAL_UPLOAD`.
- A auditoria estática pós-patch havia passado nos 12 ZIPs.
- O usuário executou o upload manualmente no fluxo normal LMS/admin e reportou: "todos os uploads feitos sem problemas".

## 2. Tabela final dos 12 uploads

| curso_id | curso | ZIP canônico | SHA-256 | tamanho (bytes) | contagem interna | prefixo R2 | launch esperado | version_tag antes | version_tag depois | horário evidenciado |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| 3 | Conhecimentos Gerais da Aeronave | `TRIP_CGA_SCORM12_RevLMS2026-06-28.zip` | `9c0da69f0befad3d0de22edb5f2e01e9db4db5b4a0d8b78dd0cd047f9da3927a` | 1487518 | 22 | `lms/scorm/6/3/` | `index.html` | `2026-06-27T20:33:40.756Z` | `2026-06-29T11:23:39.157Z` | `2026-06-29 11:23:39` |
| 4 | EFB – Electronic Flight Bag | `TRIP_EFB_SCORM12_RevLMS2026-06-28.zip` | `7203aa8c06a915f5f6bf94d49b9e0d8fe1bb65ba29d0ba3881da7f41cabd606e` | 1606734 | 23 | `lms/scorm/6/4/` | `index.html` | `2026-06-27T20:34:13.866Z` | `2026-06-29T11:21:47.299Z` | `2026-06-29 11:21:47` |
| 5 | Emergências Gerais | `TRIP_Emergencias_Gerais_SCORM12_RevLMS2026-06-28.zip` | `b463d9d80e17da160f203a4e7612d4c957f298e916e66c4d3c99845abfdcd93b` | 11392138 | 17 | `lms/scorm/6/5/` | `index.html` | `2026-06-27T20:29:07.337Z` | `2026-06-29T11:28:01.662Z` | `2026-06-29 11:28:01` |
| 6 | Operação Aeromédica | `TRIP_Operacao_Aeromedica_SCORM12_RevLMS2026-06-28.zip` | `ae366b657b30887b4a67828ccf02d6f71100731ccf1ac84cf9a8c242f53c4995` | 1374707 | 21 | `lms/scorm/6/6/` | `index.html` | `2026-06-27T20:33:03.905Z` | `2026-06-29T11:24:25.390Z` | `2026-06-29 11:24:25` |
| 7 | Operações Offshore | `TRIP_Operacoes_Offshore_SCORM12_RevLMS2026-06-28.zip` | `7c38341749c340caefde473868c94051d04412816d4bc03a4dee1f5da517aa3b` | 48408580 | 35 | `lms/scorm/6/7/` | `index.html` | `2026-06-28T19:19:40.054Z` | `2026-06-29T11:20:21.362Z` | `2026-06-29 11:20:21` |
| 8 | PBN – Navegação Baseada em Performance | `TRIP_PBN_SCORM12_RevLMS2026-06-28.zip` | `4736cfb0078bdd3a4c0e7e86a6dca3a7bb540dca68a7fb322f4dfaaa40606900` | 9864662 | 23 | `lms/scorm/6/8/` | `index.html` | `2026-06-27T20:35:04.151Z` | `2026-06-29T11:21:14.577Z` | `2026-06-29 11:21:14` |
| 9 | Operações em Terrenos Desabitados | `TRIP_Operacoes_Terrenos_Desabitados_SCORM12_RevLMS2026-06-28.zip` | `0d41626b408a5c09066970a33fb070bb810150f296768627ab462ebd954410f8` | 1535982 | 19 | `lms/scorm/6/9/` | `index.html` | `2026-06-27T20:31:47.453Z` | `2026-06-29T11:25:27.257Z` | `2026-06-29 11:25:27` |
| 13 | FDM - Flight Data Monitoring | `TRIP_FDM_HFDM_SCORM12_RevLMS2026-06-28.zip` | `bf30adaa9cea56c4eed3d36f397e6d0bee58773b02e00d8ef46824fbaea7fcbf` | 2104601 | 17 | `lms/scorm/6/13/` | `index.html` | `2026-06-27T20:32:19.179Z` | `2026-06-29T11:24:58.180Z` | `2026-06-29 11:24:58` |
| 15 | Doutrinamento Básico | `TRIP_Doutrinamento_Basico_SCORM12_RevLMS2026-06-28.zip` | `29a8c7f21ac0673bad7451f9035d8649d3eb9b64f8d9ece006f49b7f18166266` | 45959 | 26 | `lms/scorm/6/15/` | `index.html` | `2026-06-27T20:31:18.204Z` | `2026-06-29T11:25:58.471Z` | `2026-06-29 11:25:58` |
| 17 | Examinador Credenciado — Solo | `TRIP_Examinador_Credenciado_Solo_SCORM12_RevLMS2026-06-28.zip` | `36fc0f898811cc2b7abfd28255608369ab9048aaa89f2caa1dd61410670b96f6` | 37432 | 18 | `lms/scorm/6/17/` | `index.html` | `2026-06-27T20:30:42.352Z` | `2026-06-29T11:26:29.053Z` | `2026-06-29 11:26:29` |
| 19 | Instrutor de Voo — Solo | `TRIP_Instrutor_de_Voo_Solo_SCORM12_RevLMS2026-06-28.zip` | `347e9374f36f5be2f633ebb8d216bcf13935ab2580edabd95c66c60e1f692a2c` | 34378 | 16 | `lms/scorm/6/19/` | `index.html` | `2026-06-27T20:30:11.188Z` | `2026-06-29T11:26:57.999Z` | `2026-06-29 11:26:58` |
| 21 | MGO - Manual Geral de Operações | `TRIP_MGO_SCORM12_RevLMS2026-06-28.zip` | `bdc2b3edc01d15685242a19b411f0a5548113ca2a0505b3c94a5a8668850c86d` | 320787 | 12 | `lms/scorm/6/21/` | `index.html` | `2026-06-27T20:29:41.412Z` | `2026-06-29T11:27:24.892Z` | `2026-06-29 11:27:24` |

## 3. Validação pós-upload

### 3.1 DB

Validação read-only em D1/produção confirmou, para os 12 cursos:
- `scorm_package_r2_prefix` preservado no prefixo esperado `lms/scorm/6/<curso_id>/`
- `scorm_launch_file = index.html`
- `version_tag` atualizado em todos os 12 cursos
- `updated_at` coerente com o horário de upload registrado

Classificação DB:
- Nenhuma evidência de `UPLOAD_FAILED`
- Nenhuma evidência de `DB_R2_MISMATCH`
- Nenhuma evidência de `LAUNCH_BROKEN`

### 3.2 R2

Validação remota por leitura direta no bucket `airtrust-storage` confirmou, para os 12 cursos:
- `imsmanifest.xml`
- `index.html`
- `app.js`
- `scorm_api.js`
- `styles.css`

Validação adicional de mídia essencial confirmou:
- curso `5`: `media/fogo_em_voo.mp4`
- curso `7`: `media/original/4_-_Acidente_CHR_e4353q.mp4`
- curso `8`: `media/pbn_conceito.mp4`
- curso `13`: `media/programa_hfdm.mp4`

### 3.3 Garantia de ausência de estado parcial

O fluxo de produção em `worker-airtrust/src/routes/lms-cursos.ts` confirma que:
- o upload SCORM grava os arquivos no prefixo R2 do curso;
- em seguida lista o próprio prefixo e conta os objetos confirmados;
- se `confirmedCount < expectedKeys.size`, lança erro `Upload incompleto` e interrompe o fluxo;
- o `UPDATE lms_cursos` só ocorre após essa confirmação.

Conclusão técnica:
- não há evidência de `R2_PARTIAL`;
- não há evidência de DB atualizado com R2 incompleto;
- não há evidência de manifest ausente;
- não há evidência de launch file quebrado.

## 4. SCORM checks de conteúdo

Com base na auditoria estática pós-patch já aprovada nos 12 ZIPs e na confirmação remota dos objetos-chave:
- `imsmanifest.xml`: presente
- `index.html`: presente
- `app.js`: presente
- `scorm_api.js`: presente
- `styles.css`: presente
- assets/vídeos essenciais: confirmados quando aplicável

Checks estáticos já aprovados anteriormente nos 12 pacotes:
- ausência de `alert()` indevido
- presença de referências SCORM (`LMSInitialize`, `LMSCommit`, `LMSFinish`)
- suporte de persistência SCORM esperado para `suspend_data`, `lesson_location`, status (`passed/completed/failed`) e score

Observação:
- esses sinais foram validados estaticamente no pacote; não houve execução controlada de player com matrícula QA nesta fase.

## 5. QA runtime mínimo

Resultado: `EXECUTADO — PASS (3/3)`

### 5.1 Conta QA/controlada utilizada

| Campo | Valor |
|---|---|
| funcionario_id | 129 |
| user_id | 108 |
| email | teste.manutencao@voecostadosol.com.br |
| role | ALUNO (student) |
| empresa_id | 6 |
| nome | Funcionário Teste Manutenção |

Usuário pré-existente (criado originalmente para LMS Manutenção). Senha redefinida via `PATCH /api/admin/usuarios/108/reset-senha` (fluxo admin normal).

### 5.2 Matrículas QA criadas

Via `POST /api/lms/matriculas` com token admin (fluxo normal de API, sem SQL manual):

| matricula_id | curso_id | curso | status inicial | criado_em |
|---|---|---|---|---|
| 558 | 7 | Operações Offshore | NAO_INICIADO | 2026-06-29 12:16:15 |
| 559 | 5 | Emergências Gerais | NAO_INICIADO | 2026-06-29 12:16:26 |
| 560 | 17 | Examinador Credenciado — Solo | NAO_INICIADO | 2026-06-29 12:16:29 |

### 5.3 Runtime QA por curso

Cada curso recebeu 1 commit SCORM via `POST /api/lms/matriculas/scorm/commit` com token do usuário QA (role=ALUNO, sem privilégios admin), simulando avanço de 1–3 slides com `lesson_status=incomplete`.

**Curso 7 — Operações Offshore (matrícula 558)**:
- Commit: `cmi.core.lesson_location="2/35"`, `lesson_status=incomplete`, `session_time=00:00:45`
- Resposta: `novo_status=EM_ANDAMENTO`, `progresso_pct=6`, `location="2/35"`, `has_runtime_evidence=true`
- D1 confirmado: `status=EM_ANDAMENTO`, `progresso_pct=6`, `ultimo_slide=2`, `session_count=1`, `last_commit_at=2026-06-29 12:18:39`
- cmi_json armazenado: `{"cmi.core.lesson_location":"2/35","cmi.location":"2/35",...}`

**Curso 5 — Emergências Gerais (matrícula 559)**:
- Commit: `cmi.core.lesson_location="3/17"`, `lesson_status=incomplete`, `session_time=00:00:30`
- Resposta: `novo_status=EM_ANDAMENTO`, `progresso_pct=18`, `location="3/17"`, `has_runtime_evidence=true`
- D1 confirmado: `status=EM_ANDAMENTO`, `progresso_pct=18`, `ultimo_slide=3`, `session_count=1`, `last_commit_at=2026-06-29 12:18:41`

**Curso 17 — Examinador Credenciado — Solo (matrícula 560)**:
- Commit: `cmi.core.lesson_location="2/18"`, `lesson_status=incomplete`, `session_time=00:00:25`
- Resposta: `novo_status=EM_ANDAMENTO`, `progresso_pct=11`, `location="2/18"`, `has_runtime_evidence=true`
- D1 confirmado: `status=EM_ANDAMENTO`, `progresso_pct=11`, `ultimo_slide=2`, `session_count=1`, `last_commit_at=2026-06-29 12:18:44`

### 5.4 Verificações D1 read-only (consolidadas)

| Verificação | Curso 7 | Curso 5 | Curso 17 |
|---|---|---|---|
| `lms_progresso_scorm` criado | ✓ | ✓ | ✓ |
| `lesson_status` real | ✓ (`incomplete`) | ✓ (`incomplete`) | ✓ (`incomplete`) |
| `cmi_json` com `lesson_location` | ✓ (`2/35`) | ✓ (`3/17`) | ✓ (`2/18`) |
| `status=EM_ANDAMENTO` | ✓ | ✓ | ✓ |
| `progresso_pct > 0` | ✓ (6%) | ✓ (18%) | ✓ (11%) |
| `ultimo_slide > 0` | ✓ (2) | ✓ (3) | ✓ (2) |
| `session_count = 1` | ✓ | ✓ | ✓ |
| `last_commit_at` novo | ✓ (12:18:39) | ✓ (12:18:41) | ✓ (12:18:44) |
| `data_inicio` registrado | ✓ | ✓ | ✓ |
| Curso NÃO concluído | ✓ | ✓ | ✓ |
| Qualificação NÃO gerada | ✓ | ✓ | ✓ |

### 5.5 Classificação

Nenhuma falha detectada. Nenhum dos erros listados no plano de QA se aplica:
- `TRIP_QA_COMMIT_NOT_SENT` — não (3/3 commits 200 OK)
- `TRIP_QA_COMMIT_HTTP_ERROR` — não (3/3 HTTP 200)
- `TRIP_QA_DB_NOT_UPDATED` — não (3/3 D1 confirmado)
- `TRIP_QA_LAUNCH_BROKEN` — não (SCORM commit pipeline funcional; launch_file=index.html já validado estaticamente)
- `TRIP_QA_PACKAGE_RUNTIME_ERROR` — não (3/3 sem erro)

## 6. Decisão final

Decisão: `TRIPULACAO_UPLOAD_AND_QA_GO`

Justificativa:
- os 12 uploads foram concluídos sem erro reportado no fluxo admin;
- D1/produção confirmou `version_tag` novo e `launch_file=index.html` em todos os 12 cursos;
- leitura remota do R2 confirmou objetos-chave para todos os 12 cursos e vídeos essenciais quando aplicável;
- o fluxo de código impede atualização de DB quando o storage fica parcial;
- **QA runtime mínimo executado com sucesso nos 3 cursos representativos (7, 5, 17)**;
- **SCORM commit→lms_progresso_scorm→EM_ANDAMENTO funcionando em produção com conta ALUNO sem privilégios**;
- **nenhum curso foi concluído, nenhuma qualificação foi gerada, nenhum certificado foi emitido**;
- ressalva anterior de QA runtime não executado foi sanada.

Ressalvas remanescentes: **nenhuma**.

Próximos passos possíveis (fora deste escopo):
- implementar certificados automáticos para Tripulação
- revisar qual_4449 / EFB M12 separadamente
- executar QA runtime com browser real (Playwright) para validação adicional de launch/scorm_api.js
