# DGR D4 / Manutenção — consolidação conservadora 0585

## Escopo e evidência de produção (14/11/2026)
Empresa 6: DGR código D4 id25, 39 históricos ativos (32 funcionários); modelo redundante MNT_ARTIGOS_PERIGOSOS id137 possui 2 históricos não excluídos #4781/#4782, ambos vencidos desde 2024 e vinculados a ex-funcionários INATIVOS, e #4649 já excluído logicamente. Existe requisito obrigatório #220 para a função Supervisor de Suprimentos (id36) ligado ao modelo 137. Não há curso LMS vinculado aos dois modelos. Preflight tem tolerância zero para variação destes números.

## Decisão
Nome canônico: **Treinamento de Artigos Perigosos para o Transporte Aéreo**. Base: RBAC 175, título “Transporte de artigos perigosos em aeronaves civis”, e IS 175-002J, “Treinamento de artigos perigosos para pessoal envolvido com processos relacionados ao transporte ... por aeronaves civis”. Código D4 não muda.

Consolidar as identidades de modelo dos dois históricos inativos no modelo D4 e preservar os certificados, ids, datas, status, qh.tipo e qh.qualificacao_codigo ORIGINAIS. Registrar proveniência em observações. A evidência PTM 20.12 não demonstra por si equivalência curricular/competência DGR de outra função, portanto os dois históricos recebem marcador **PTAP_MNT_LEGACY_NAO_HOMOLOGADO**, distinto do perfil requerido pelo Supervisor de Suprimentos **PTAP_MNT_SUPRIMENTOS**. Permanecem vencidos e NÃO satisfazem a exigência por perfil. O requisito #220 é mantido e apenas redirecionado ao modelo D4; os requisitos D4 existentes permanecem inalterados. O modelo id137 é desativado por exclusão lógica; o histórico #4649, já excluído anteriormente, não é reativado nem alterado. Não excluir evidências do quadro inativo. Reactivar ex-funcionário deve permitir encontrar seu histórico legado com status vencido.

## Guardrails
Aplicação exclusivamente pelo pipeline oficial Schema V2: SHA revisado, oito gates, contrato de schema, ambiente production, recovery D1 Time Travel, bundle+ledger atômicos, pre/post testes tenant-scoped, FK global íntegra. Sem D1 remoto por console. Preflight read-only exige 2 históricos vencidos com f.ativo=0 e f.status=INATIVO, somente 1 requisito ativo no legado, zero LMS, histórico #4649 excluído, 39 D4 originais, ausência de perfis adicionais. Pós-condições exigem 41 históricos D4 não excluídos (39 + 2), zero legados não excluídos, requisito #220 com perfil específico, modelo duplicado inativo, 0 FK violada. Não confundir integração ou CI com publicação.

## Limite de conformidade
A designação de programa DGR/competência para Supervisor de Suprimentos exige conteúdo específico aprovado. Até essa homologação, o perfil do requisito não deve aceitar certificados dos tripulantes ou legados não homologados; não fabricar conclusão. Nenhuma matrícula ou certificação nova é gerada por esta migração. O histórico está retido para auditoria e reativação.
