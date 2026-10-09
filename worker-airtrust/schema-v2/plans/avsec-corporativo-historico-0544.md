# AVSEC corporativo — reenquadramento pontual do histórico 0544

## Decisão e evidência
A Gerência de Treinamento confirmou em 2026-10-08 que o certificado AVSEC antigo do **Gerente de Manutenção** deve ser classificado como **AVSEC Corporativo**. Consulta exclusivamente de leitura ao D1 produção: tenant 6, histórico 5276, funcionário interno 111, função Gerente de Manutenção (funcao_id 53, setor_id 11), modelo legado D1 (id 22), nome documental registrado como "AVSEC Zurich — Certificado Zurich Airport Brasil - Conscientizacao AVSEC.pdf", conclusão 2024-02-19, vencimento **2026-02-19**, status CONCLUIDO e sem perfil de competência. Modelo corporativo próprio AVSEC_CONSC id 194 é categoria Teórico, distinto de D1. O texto do documento e a decisão expressa fundamentam esta correção; não inferir equivalência geral D1→AVSEC_CONSC.

## Escopo exato e efeito esperado
- **Uma única linha**, `qualificacoes_historico.id=5276`, `empresa_id=6`, `funcionario_id=111`.
- Corrigir **somente** `qualificacao_id` de D1 para a identificação ativa e única de AVSEC_CONSC; `qualificacao_codigo` de D1 para AVSEC_CONSC; carimbar `updated_at`. O modelo original, as datas, status, observações, conteúdo documental e classificação de origem ficam explicitamente preservados no contrato SQL, histórico Git e ledger V2.
- Não duplicar certificado, curso, histórico, matrícula, conclusão, categoria, competência ou comprovação. Não alterar histórico dos outros 31 tripulantes, outros funcionários/tenants nem regras do Compliance.
- **AVSEC Corporativo permanecerá vencido** desde 2026-02-19; a reclassificação não gera conformidade.
- O histórico de classificação anterior é auditável neste plano, no diff imutável, no ledger Schema V2 e no recovery point, sem modificar o texto de certificado existente.

## Dependências e preflight fail-closed
1. SHA exato na main, oito gates aprovados, baseline ativo `production-d1-baseline-v2-20260714`, manifest/SQL/plano com hash e change_id próprios; mudança ainda não aplicada.
2. Migration 0519 e 0520 aplicadas; tabela de perfis por evidência existente, sem perfil relacionado ao histórico 5276.
3. Uma qualificação D1 ativa e uma AVSEC_CONSC ativa para tenant 6; nenhuma qualificação corporativa existente para o empregado 111. Não admitir duplicidade de modelos.
4. Um único histórico id 5276 com o tenant, pessoa, função/cargo, modelo e código legados, datas/status e descrição do certificado exatamente esperados; `perfil_competencia IS NULL`.
5. Funcionário 111 ativo, tenant 6, cargo Gerente de Manutenção (função 53), setor 11 e efetivamente elegível para a regra AVSEC_CONSC corporativa. Preservar overrides existentes.
6. Nenhum deploy/migration/schema/data write concorrente no mesmo ambiente. O workflow oficial gerencia D1 Time Travel, plano hash, ledger e aplicação atômica. Uma nova mudança no estado físico exige reprovar o preflight, nunca contornar.
7. O Worker de produção precisa estar publicado no exato SHA do workflow (guard /api/version), incluindo a correção de vencimento AVSEC_CONSC. Nunca aplicar a migração com um Worker antigo que possa mostrar CONFORME indevidamente.
8. **Aplicação em produção depende de autorização explícita, atual e específica para SHA, change_id 0544 e escopo de dados.** A autorização de classificação não elimina os gates de release.

## Dependência de Worker e precedência de release
O banco real mostra `AVSEC_CONSC` com `qualificacoes_tipos.validade=NULL` e a regra corporativa `treinamento_requisitos.id=538` com `validade_fonte='MODELO'`. Sem tratamento, a reclassificação de um histórico com vencimento explícito seria falsamente exibida como `CONFORME` por não haver duração fixa no modelo. O runtime deste mesmo PR aplica uma exceção **apenas para AVSEC_CONSC sem validade de modelo**, honrando `qualificacoes_historico.data_vencimento` de evidência concluída; o caso de histórico vencido é coberto por teste SQLite de rota. O preflight remoto de 0544 **falha fechado até que /api/version do Worker de produção confirme o SHA exato do candidato integrado**, garantindo que a correção da classificação de vencimento seja publicada **antes** da mudança histórica. Pages não é necessário.

## Pós-condições
Uma linha com histórico 5276 passa a referenciar AVSEC_CONSC; `qualificacao_codigo='AVSEC_CONSC'` e datas (2024-02-19, 2026-02-19), status, anotação documental, tenant e funcionário permanecem idênticos; sem perfis ou evidências duplicados. Ledger 0544 presente uma única vez. O Compliance deve tratá-lo como **VENCIDO**, nunca CONFORME. A verificação é de leitura somente, sem reclassificar registros adicionais.

## Rota governada, coordenação e recuperação
Usar exclusivamente `.github/workflows/apply-schema-change-v2.yml`, `change_id=avsec-corporativo-historico-0544`, SHA/candidato exato, pre/postflights dedicados e o namespace de concorrência de D1. Coordenar previamente com workflows de deploy Worker/Pages e demais migrations/writes em produção. Nenhum SQL remoto improvisado, nenhuma migration legada.

No caso de necessidade de desfazer, preservar evidências/auditoria e criar nova mudança compensatória Schema V2 revisada; usar D1 Time Travel apenas com recovery point aprovado e análise de writes de outras frentes, sem restauração cega de todo o banco.
