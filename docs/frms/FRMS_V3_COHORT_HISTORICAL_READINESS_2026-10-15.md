# FRMS V3 — inventário histórico de cobertura por coorte (read-only)

**Situação:** código experimental com testes. Não é modelo clínico, regra de despacho nem índice 0–100 liberado.

## Por que esta etapa existe

Os módulos IMA V3 anteriores (#1477, #1478, #1480, #1485 e #1486) construíram mecanismo experimental e acesso shadow individual em staging, mas **não mediram a disponibilidade longitudinal real**. Antes de estimar fadiga por pessoa é obrigatório saber se a origem dos dados é identificável, se há lacunas e se a amostra é apropriada para validação.

O snapshot FRMS atual recalcula período embarcado, conformidade, efetividade e contexto de até 168 horas. Usá-lo para varrer 90 dias de toda uma equipe seria custoso e misturaria cálculo legado com o inventário científico. Este lote, portanto, cria um leitor específico usando **apenas dois SELECTs parametrizados** com `empresa_id`, datas limitadas e `funcionarios` ativos — registros de check-in e presença em `frms_jornada`. Não executa SQL remoto improvisado, migration, seed ou escrita.

## Endpoint protegido (desativado por padrão)

`GET /api/frms/ima-v3/cohort-readiness-shadow?window_days=30` com opções `30`, `60`, `90`.

- Responde **404** fora de staging ou sem a allowlist **independente** `FRMS_V3_COHORT_STUDY_TENANTS` (não habilita o preview individual). A configuração não permite `all`.
- **Nova proteção contra diferenças entre janelas sobrepostas:** a allowlist isolada não basta. A pesquisa precisa ter também `FRMS_V3_COHORT_APPROVED_WINDOW_DAYS` (exatamente `30`, `60` ou `90`) e `FRMS_V3_COHORT_APPROVED_END_DATE` (dia final do último mês UTC concluído, formato `YYYY-MM-DD`). O Worker exige coincidência exata dos dois valores com a requisição e o mês resolvido, antes de ler D1; caso contrário, responde **404**. Uma autorização habilita **somente uma** janela e um mês de referência. Renovação/alteração da autorização exige revisão independente e registro, não um parâmetro de URL.
- Exige autenticação normal da API, isolamento de `empresa_id` e permissão da equipe FRMS no backend; recusa escopo individual.
- Intervalos são ancorados **ao fim do último mês UTC integralmente concluído**. Não há datas arbitrárias, nomes, funcionário, base, papel ou outro filtro na requisição; qualquer filtro extra é rejeitado.
- Consulta paginada em blocos SQL de **até 1.000 linhas** com ordenação estável; teto de **15.000 linhas por fonte** e 15.000 pares pessoa-dia no agregado (sem aumentar a baseline de consultas grandes); recusa duplicidade de check-in. Jornadas múltiplas por pessoa/dia representam a presença de uma jornada sem contagem dupla.
- Inclui apenas pessoas classificadas pelo contrato atual `isOperationalCrewRole` (`funcao`/`cargo`), excluindo manutenção, administração e papéis desconhecidos. Check-in válido em um dia sem jornada não é considerado, por si só, uma falta ou irregularidade de jornada.
- Retorna somente cobertura **aproximada** de check-in enviado, sono em horas declarado, horário de despertar informado e KSS disponível. Quantidades são arredondadas em blocos de 5/10 e porcentagens em decil. Sem dez tripulantes distintos, **todos os valores são suprimidos**, inclusive o tamanho da amostra.
- Não devolve nome, registro ANAC, ID, matrícula, dia individual, score, sintoma, medicamento, PVT individual ou dado detalhado do check-in. Os IDs são utilizados exclusivamente dentro do Worker para associar dia e pessoa, e nunca aparecem na resposta.

## Limitações que NÃO podem ser escondidas

**Denominador parcial:** as fontes contam apenas os dias que já têm check-in ou registro de jornada. *Não representam todos os dias de escala, todas as ausências ou toda a equipe ativa*. A taxa não é taxa de cumprimento do FRMS, e pode superestimar completude. A UI deve rotular como `CHECKIN_OR_JOURNEY_DAYS_NOT_FULL_ROSTER`.

**Sono:** uma duração informada e um despertar não comprovam hora de adormecer nem cronologia contínua; o resultado `verifiedSleepEpisodePct` é **`null`**, não 0% nem 100%. **PVT:** baseline validado também fica **`null`**. O leitor não recebe proveniência dos limites exatos da jornada, portanto `reconstructedDutyBoundaryPctApprox` fica `null`, não 0%.

**Tratamento das fontes:** a presença de `frms_jornada` conta apenas como evidência de existência do registro, sem afirmar hora inicial/final observada, descanso regulamentar, sono ou atividade fisiológica. Diferentes voos do mesmo tripulante/dia não são somados como dias distintos.

**Privacidade e interpretabilidade:** o limiar de 10 é uma proteção preliminar, não garantia formal contra reidentificação ou ataques por informação auxiliar. A combinação de períodos 30/60/90 e a publicação recorrente deverão passar por revisão de privacidade antes de coletar ou divulgar qualquer resultado real.

## Próximas verificações

1. Revisar índices/plano e custo das duas queries, schema vigente, limitação por banco e integridade da amostra em ambiente de testes.
2. Obter escopo autorizado para levantamento de cobertura histórica real por empresa, perfil, janela e tratamento do dado. Ativar a flag **somente em staging autorizado** pelo procedimento de runtime; não habilitar em produção.
3. Complementar o denominador com escala prevista e eventos de sobreaviso, sem custo excessivo e sem converter dias sem atividade em sono recuperador.
4. Planejar captura **opcional e inequívoca** do horário de adormecer, interrupções/cochilos e proveniência por campo; qualquer mudança de schema via Schema V2.
5. Validar a evolução IMA com histórico real autorizado, KSS/PVT e parecer científico FRMS/GAGEF antes de ativar UI de pontuação ou release de produção.

**Sem esta validação, o IMA segue `NOT_VALIDATED`, `physiologicalImaScore=null` para o inventário e não fornece aptidão operacional.**
