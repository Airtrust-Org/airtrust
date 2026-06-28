# AirTrust LMS/SCORM PR177 Release And Canonical Map 2026-06-28

## Escopo

- Fechamento da etapa imediata de progresso LMS/SCORM em Manutenção.
- Merge e deploy do PR #177.
- Mapa read-only `curso_id -> pacote canônico -> prefixo R2`.
- Inventário local dos ZIPs canônicos de Manutenção e Tripulação.
- Sem SQL de escrita, sem upload R2 amplo, sem geração manual de qualificação.

## PR #177

- PR: `#177`
- URL: `https://github.com/airtrustsystem-alt/airtrust/pull/177`
- Branch do PR: `fix/lms-manutencao-scorm-progress`
- SHA final do merge em `main`: `233877e2b8d58c5f150fd551e879b3c9c528ab71`
- SHA incremental final do fix de cache/desmontagem: `df9116e25bc99860d04fb7cb6c1f7c14afa78207`

### Escopo confirmado

- `src/react-app/pages/lms/LmsPlayer.tsx`
- `src/__tests__/LmsPlayer.completion-flow.test.tsx`
- `worker-airtrust/src/routes/lms-assets.ts`

Nada no delta do PR tocou:

- certificados automáticos;
- `qual_4449`;
- EFB M12;
- rollback;
- SQL de produção;
- conclusão manual de matrícula fora do fluxo LMS/SCORM.

## Validação pré-merge

- `npm run lint`: `PASS`
- `npm run build`: `PASS`
- testes LMS/SCORM afetados: `34/34 PASS`
- testes worker LMS/SCORM afetados: `47/47 PASS`
- CI do PR após `df9116e`: `PASS`

Observação: o suite completo de worker segue com falhas fora do escopo do PR e não foi mascarado:

- `architecture-performance-guard.test.ts`: 2
- `dq01-controlled-backfill-gate.test.ts`: 2
- `migration-governance.test.ts`: 1
- `readiness-audit-scripts.test.ts`: 1
- `treinamentos-planejados.test.ts`: 2
- `dashboardService.repository-contract.test.ts`: 2

## Deploy

Workflow oficial executado:

- Workflow: `Deploy AirTrust`
- Run: `28336947162`
- Migrations: `false`
- Commit esperado/publicado: `233877e2b8d58c5f150fd551e879b3c9c528ab71`

### Worker

- Status: `PASS`
- APP_VERSION publicado: `2026-06-28T21:42:42Z-233877e`
- Worker Version ID observado no log do deploy: `a82d23bc-ba05-43ca-87ff-bf076da9b066`
- `/api/version`: `PASS`
- `/api/health`: `PASS`
- `/api/lms/cursos` sem token: `401 PASS`

### Pages

- Status: `FAIL`
- Erro exato: `Authentication error [code: 10000]`
- Operação que falhou: `wrangler pages deploy dist/client --project-name=airtrust --branch=production --commit-hash=233877e2b8d58c5f150fd551e879b3c9c528ab71`
- Conta/token reconhecidos pelo workflow, mas sem permissão suficiente para `pages/projects/airtrust`.
- Verificacao externa atual em `2026-06-28`: `https://airtrust.online/login` ainda responde `<meta name="build-version" content="22031113" />`.

Conclusão operacional:

- Worker em produção: `SIM`
- Frontend/Pages em produção por este deploy: `NAO CONFIRMADO`
- Não repetir tentativas de Pages sem corrigir o token/permissão no projeto Cloudflare Pages `airtrust`.
- As correções visuais/comportamentais do player nao podem ser declaradas em produção enquanto o Pages do projeto `airtrust` nao publicar com sucesso.

### Bloqueio externo necessário para destravar Pages

- Projeto afetado: Cloudflare Pages `airtrust`
- Bloqueio atual: permissão insuficiente para deploy no projeto Pages (`Authentication error [code: 10000]`)
- Ajuste externo mínimo requerido:
  - token com permissão para Cloudflare Pages;
  - acesso ao projeto `airtrust`;
  - permissão de deploy Pages.

## QA runtime controlado

### Estado

- QA runtime browser real: `BLOCKED_BY_AUTH`
- O browser embutido abriu `https://airtrust.online/login` e caiu na tela de autenticação.
- Não havia aba/sessão autenticada reaproveitável no browser da automação.
- Nenhuma credencial foi inferida ou enviada.

### Matrículas QA controladas confirmadas em produção

Usuário QA identificado por leitura no D1:

- `funcionario_id=129`
- nome: `Funcionário Teste Manutenção`
- matrícula funcional: `01010`

Matrículas QA prontas para teste:

- HUMS-VXP: `548`
- MGM - Manual Geral de Manutenção: `549`
- MCQ: `550`
- SGSO para Manutenção: `551`
- MOM: `552`
- Integração / Doutrinação de Manutenção: `553`
- Inspeção IIO & APRS: `554`
- AW139 - Manutenção: `555`
- Heliwise: `556`
- PT6C-67C - Manutenção: `557`

### Resultado atual

- HUMS-VXP runtime: `NAO EXECUTADO` por bloqueio de autenticação.
- MGM runtime: `NAO EXECUTADO` por bloqueio de autenticação.
- v2.1 runtime: `NAO EXECUTADO` por bloqueio de autenticação.
- v2.5 runtime: `NAO EXECUTADO` por bloqueio de autenticação.
- v3 runtime: `NAO SE APLICA`.

## Mapa curso -> pacote canônico -> prefixo R2

Todos os cursos SCORM ativos de produção consultados nesta fase estão em `empresa_id=6`.
Todos os cursos SCORM ativos consultados nesta fase estão em `scorm_versao=1.2`.
Nao existe curso SCORM ativo `v3` neste momento.

| curso_id | curso | pacote canônico local | prefixo R2 | launch file | version_tag atual | qa_matricula |
| --- | --- | --- | --- | --- | --- | --- |
| 32 | AW139 - Manutenção | `AW139_Manutencao_SCORM12_AirTrust_v2_5.zip` | `lms/scorm/6/32/` | `index.html` | `2026-06-27T00:51:33.474Z` | 555 |
| 25 | HUMS-VXP | `HUMS_VXP_Manutencao_SCORM12_AirTrust_v2_2_CORRIGIDO.zip` | `lms/scorm/6/25/` | `index.html` | `2026-06-27T01:27:19.411Z` | 548 |
| 33 | Heliwise | `Heliwise_HUMS_Manutencao_SCORM12_AirTrust_v2_1.zip` | `lms/scorm/6/33/` | `index.html` | `2026-06-27T00:57:55.929Z` | 556 |
| 31 | Inspeção IIO & APRS | `Inspecao_IIO_APRS_SCORM12_AirTrust_v2_1.zip` | `lms/scorm/6/31/` | `index.html` | `2026-06-27T01:06:45.170Z` | 554 |
| 30 | Integração / Doutrinação de Manutenção | `Integracao_Manutencao_SCORM12_AirTrust_v2_1.zip` | `lms/scorm/6/30/` | `index.html` | `2026-06-27T01:05:49.850Z` | 553 |
| 27 | MCQ - Manual de Controle de Qualidade | `MCQ_Manutencao_SCORM12_AirTrust_v2_1.zip` | `lms/scorm/6/27/` | `index.html` | `2026-06-27T01:03:38.797Z` | 550 |
| 26 | MGM - Manual Geral de Manutenção | `MGM_Manutencao_SCORM12_AirTrust_v2_2_CORRIGIDO.zip` | `lms/scorm/6/26/` | `index.html` | `2026-06-27T01:25:21.928Z` | 549 |
| 29 | MOM - Manual da Organização de Manutenção | `MOM_Manutencao_SCORM12_AirTrust_v2_1.zip` | `lms/scorm/6/29/` | `index.html` | `2026-06-27T01:07:11.338Z` | 552 |
| 34 | PT6C-67C - Manutenção | `PT6C67C_Manutencao_SCORM12_AirTrust_v2_1.zip` | `lms/scorm/6/34/` | `index.html` | `2026-06-27T00:54:40.625Z` | 557 |
| 28 | SGSO para Manutenção | `SGSO_Manutencao_SCORM12_AirTrust_v2_1.zip` | `lms/scorm/6/28/` | `index.html` | `2026-06-27T01:03:14.280Z` | 551 |
| 3 | Conhecimentos Gerais da Aeronave | `Conhecimentos_Gerais_Aeronaves_SCORM12_Rev02.zip` | `lms/scorm/6/3/` | `Conhecimentos_Gerais_Aeronaves_SCORM12_Rev02/index.html` | `2026-06-27T20:33:40.756Z` |  |
| 15 | Doutrinamento Básico | `Doutrinamento_Basico_SCORM12_Rev02.zip` | `lms/scorm/6/15/` | `Doutrinamento_Basico_SCORM12_Rev02/index.html` | `2026-06-27T20:31:18.204Z` |  |
| 4 | EFB – Electronic Flight Bag | `EFB_Operacao_Electronic_Flight_Bag_SCORM12_Rev02.zip` | `lms/scorm/6/4/` | `EFB_Operacao_Electronic_Flight_Bag_SCORM12_Rev02/index.html` | `2026-06-27T20:34:13.866Z` |  |
| 5 | Emergências Gerais | `Emergencias_Gerais_SCORM12_Rev06_completo.zip` | `lms/scorm/6/5/` | `index.html` | `2026-06-27T20:29:07.337Z` |  |
| 17 | Examinador Credenciado — Solo | `Examinador_Credenciado_Solo_SCORM12_Rev02.zip` | `lms/scorm/6/17/` | `index.html` | `2026-06-27T20:30:42.352Z` |  |
| 13 | FDM - Flight Data Monitoring | `FDM_HFDM_SCORM12_Rev01.zip` | `lms/scorm/6/13/` | `FDM_HFDM_SCORM12_Rev01/index.html` | `2026-06-27T20:32:19.179Z` |  |
| 19 | Instrutor de Voo — Solo | `Instrutor_de_Voo_Solo_SCORM12_Rev07.zip` | `lms/scorm/6/19/` | `Instrutor_de_Voo_Solo_SCORM12_Rev07/index.html` | `2026-06-27T20:30:11.188Z` |  |
| 21 | MGO - Manual Geral de Operações | `Manual_Geral_Operacoes_MGO_SCORM12_Rev03.zip` | `lms/scorm/6/21/` | `Manual_Geral_Operacoes_MGO_SCORM12_Rev03/index.html` | `2026-06-27T20:29:41.412Z` |  |
| 6 | Operação Aeromédica | `Operacao_Aeromedica_SCORM12_Rev01.zip` | `lms/scorm/6/6/` | `Operacao_Aeromedica_SCORM12_Rev01/index.html` | `2026-06-27T20:33:03.905Z` |  |
| 7 | Operações Offshore | `Operacoes_Offshore_SCORM12_Rev01.zip` | `lms/scorm/6/7/` | `Operacoes_Offshore_SCORM12_Rev01/index.html` | `2026-06-28T19:19:40.054Z` |  |
| 9 | Operações em Terrenos Desabitados | `Operacoes_Terrenos_Desabitados_SCORM12_Rev01.zip` | `lms/scorm/6/9/` | `Operacoes_Terrenos_Desabitados_SCORM12_Rev01/index.html` | `2026-06-27T20:31:47.453Z` |  |
| 8 | PBN – Navegação Baseada em Performance | `PBN_Navegacao_Baseada_Performance_SCORM12_Rev02.zip` | `lms/scorm/6/8/` | `PBN_Navegacao_Baseada_Performance_SCORM12_Rev02/index.html` | `2026-06-27T20:35:04.151Z` |  |

## Inventário local dos pacotes canônicos

### Manutenção

Checagem funcional por string/estrutura em todos os 10 ZIPs de Manutenção:

- `imsmanifest.xml`: presente
- `app.js`: presente
- `scorm_api.js`: presente
- `styles.css`: presente
- `alert()`: não detectado
- `cmi.suspend_data`: detectado
- `lesson_location`: detectado
- `LMSInitialize`: detectado
- `LMSCommit`: detectado
- `LMSFinish`: detectado

| arquivo | bytes | arquivos internos | sha256 |
| --- | ---: | ---: | --- |
| AW139_Manutencao_SCORM12_AirTrust_v2_5.zip | 108857295 | 371 | `1c9ad431392350008f7704cefa4446c38164fe0daa8df218783dc1f2da7a4b6d` |
| HUMS_VXP_Manutencao_SCORM12_AirTrust_v2_2_CORRIGIDO.zip | 13819805 | 150 | `7703ec4a22471336e11b87a9d2e965195e3ec22f3e5f45104ce14bf94a34cd89` |
| Heliwise_HUMS_Manutencao_SCORM12_AirTrust_v2_1.zip | 7830649 | 82 | `46bfbb8a91282880bb1e9375024e3e827dd88e0e43e1e8768d681d2ee9a93fe7` |
| Inspecao_IIO_APRS_SCORM12_AirTrust_v2_1.zip | 29291 | 10 | `8406423180095e8ccc59906ec38ae903e034c6eea27fe845f063c880bd801745` |
| Integracao_Manutencao_SCORM12_AirTrust_v2_1.zip | 34975 | 10 | `d7f1fcc16c05544adb6cf520e0020ac532337dbe6f9ceb96fc0c30afdd09af6d` |
| MCQ_Manutencao_SCORM12_AirTrust_v2_1.zip | 30482 | 10 | `1ed5f3b902468d79b32eb8751ca23100662ac7eb48f01e4a12df6d56620c0e80` |
| MGM_Manutencao_SCORM12_AirTrust_v2_2_CORRIGIDO.zip | 390757 | 17 | `e385945aa5ac017f4a5220a1bfad5afe3681f61cf25ededbabbc529302e2aae9` |
| MOM_Manutencao_SCORM12_AirTrust_v2_1.zip | 25798 | 10 | `ca65bc8e26b32dc7521f722efedbb06e0a2f4f6029e00b1750be1ffbe8b5689c` |
| PT6C67C_Manutencao_SCORM12_AirTrust_v2_1.zip | 66784321 | 138 | `07cef22b0a526bd5ebeed997a576961a935eb00efffb1367cbb8652b93581212` |
| SGSO_Manutencao_SCORM12_AirTrust_v2_1.zip | 37773 | 10 | `1e71b3d3f02c339acbb7b21986a35b0d40e45a99dc28613f391b0a4cdf62e30c` |

### Tripulação

Inventário confirmado dos 12 ZIPs fonte. A auditoria funcional forte continua pendente para parte dos cursos porque vários pacotes exigem confirmação por engine real/minificação, não só grep simples.

Pacotes que já mostraram sinais fortes suficientes nesta passada:

- `Emergencias_Gerais_SCORM12_Rev06_completo.zip`
- `Examinador_Credenciado_Solo_SCORM12_Rev02.zip`

Pacotes restantes de Tripulação ainda exigem auditoria funcional por engine:

- `Conhecimentos_Gerais_Aeronaves_SCORM12_Rev02.zip`
- `Doutrinamento_Basico_SCORM12_Rev02.zip`
- `EFB_Operacao_Electronic_Flight_Bag_SCORM12_Rev02.zip`
- `FDM_HFDM_SCORM12_Rev01.zip`
- `Instrutor_de_Voo_Solo_SCORM12_Rev07.zip`
- `Manual_Geral_Operacoes_MGO_SCORM12_Rev03.zip`
- `Operacao_Aeromedica_SCORM12_Rev01.zip`
- `Operacoes_Offshore_SCORM12_Rev01.zip`
- `Operacoes_Terrenos_Desabitados_SCORM12_Rev01.zip`
- `PBN_Navegacao_Baseada_Performance_SCORM12_Rev02.zip`

| arquivo | bytes | arquivos internos | sha256 |
| --- | ---: | ---: | --- |
| Conhecimentos_Gerais_Aeronaves_SCORM12_Rev02.zip | 1489498 | 22 | `7bcb55b3057dae00eb472d46e3005331ae76427ccc88ac1a638a05380d2123f7` |
| Doutrinamento_Basico_SCORM12_Rev02.zip | 47779 | 26 | `517b1f4e27b53445a84beae926ea1290ef77dc0b2d6f92499066a1fe699f48d9` |
| EFB_Operacao_Electronic_Flight_Bag_SCORM12_Rev02.zip | 1608988 | 23 | `ce463a5f2843cedccc42cf70d63ebf890834aac0aa863f1039eb5a5071c4086f` |
| Emergencias_Gerais_SCORM12_Rev06_completo.zip | 11392129 | 17 | `5ea06d2f5a9afa8121bcad988fb00a028d16074a71494e578309c883e778f90e` |
| Examinador_Credenciado_Solo_SCORM12_Rev02.zip | 37423 | 18 | `a05d63b7eda934024f51b1fcfe3ff3086b62e1c0a3dbaf21599ad50147efbab7` |
| FDM_HFDM_SCORM12_Rev01.zip | 2105383 | 17 | `dc146bb0f23de4815adb899c981ee1d1c2a41f3b9d1c4e155a7080b694e749c7` |
| Instrutor_de_Voo_Solo_SCORM12_Rev07.zip | 35530 | 16 | `281634b80de2907811fe07a7c236fc28b4e4e61168758c71fdc046b09bb6c5ea` |
| Manual_Geral_Operacoes_MGO_SCORM12_Rev03.zip | 321771 | 12 | `eb583e7694b5efafb682d11f5d2f29278f0ea7370e034086f28ef4bcbc4d420e` |
| Operacao_Aeromedica_SCORM12_Rev01.zip | 1376135 | 21 | `d00dac5e62d5360de08aec29958cb9117f21c650739339a2c5e64ec879855b35` |
| Operacoes_Offshore_SCORM12_Rev01.zip | 48410890 | 35 | `04280f602f834767fd9e4979073cc3bfbed1b795967ff23f86c6774e5495347b` |
| Operacoes_Terrenos_Desabitados_SCORM12_Rev01.zip | 1537692 | 19 | `238e958e339123c04c19004a34a59604dafa6625b3689d849ae1c8d5b72a811e` |
| PBN_Navegacao_Baseada_Performance_SCORM12_Rev02.zip | 9866870 | 23 | `3a08891614f8e43ac20ee878b5eed74ca50e84229a2010d6ef7b8fcac000a697` |

## Uploads

### Executados nesta etapa

- Nenhum upload R2 manual.
- Nenhuma substituição manual de `app.js`.
- Nenhuma escrita manual em DB.

### Necessidade atual

- `NO_BROAD_R2_UPLOAD_THIS_STAGE`
- Decisão de upload permanece pendente de QA runtime autenticado em HUMS-VXP e MGM.
- Se upload for autorizado depois, deve ser por curso/grupo específico com hash, prefixo, backup e validação pós-upload.

## Pastas canônicas locais

Padronização local concluída sem upload R2, sem SQL e sem alteração de produção:

- `/Users/filipedaumas/EADs/Tripulação`
- `/Users/filipedaumas/EADs/Manutenção`

Estrutura criada em ambas:

- `00_ATUAL_UPLOAD`
- `90_BACKUP_PRE_RevLMS2026-06-28`
- `99_OBSOLETOS`

Índices locais gerados:

- `/Users/filipedaumas/EADs/Tripulação/CANONICAL_INDEX_RevLMS2026-06-28.md`
- `/Users/filipedaumas/EADs/Manutenção/CANONICAL_INDEX_RevLMS2026-06-28.md`

Observação:

- os ZIPs em `00_ATUAL_UPLOAD` já estão renomeados no padrão `<AREA>_<CURSO>_SCORM12_RevLMS2026-06-28.zip`;
- os fontes originais foram preservados em backup interno e em backup externo pré-renomeação;
- variantes antigas rejeitadas de `HUMS_VXP` e `MGM` ficaram registradas como `OBSOLETO` no índice, embora os arquivos antigos já não estivessem mais presentes na pasta de origem no momento desta execução.

## Riscos remanescentes

1. Worker já está em produção, mas Pages não publicou por bloqueio externo de autenticação Cloudflare.
2. O QA runtime real de HUMS-VXP/MGM continua bloqueado por falta de sessão autenticada disponível na automação.
3. Tripulação ainda precisa auditoria funcional forte por engine em 10 dos 12 ZIPs fonte.
4. Sem QA runtime autenticado, não há evidência final de que o painel principal mudou de `Não iniciado` para `Em andamento` no frontend publicado.

## Decisão

`GO COM RESSALVAS`

Permite:

- seguir para QA runtime autenticado controlado;
- fechar decisão de eventual upload por curso;
- preparar a próxima etapa técnica.

Nao permite ainda:

- afirmar que Pages/frontend do player estão em produção;
- afirmar validação runtime final de HUMS-VXP/MGM;
- abrir fase de certificados automáticos.
