# FRMS V3 — exposição de escala em modo experimental (15/10/2026)

**Estado:** implementação de análise descritiva `ima-v3-schedule-exposure.ts`, **não operacional, não validada, não integrada a API/UI e não publicada em staging ou produção**. Relacionado à issue #1476 e aos merges #1477/#1478.

## Motivo da terceira camada

O check-in atual reúne duração subjetiva de sono, despertar, KSS, prontidão e PVT-B. O handler `frms-fadiga-checkin-legacy.ts` **não persiste diretamente o horário de dormir na tabela do check-in**, embora aceite o campo na entrada. A duração reportada **não permite reconstruir uma cronologia observada de sono-vigília**. O IMA biomatemático 0–100 continua exclusivamente sintético, sem licença científica para decisões operacionais.

Entretanto, o FRMS já dispõe de horários planejados e realizados de apresentação, jornada e sobreaviso. É possível oferecer ao gestor uma **descrição de exposição de escala**, sem chamar essa descrição de fadiga nem usar estimativas como fatos.

## Contrato implementado

- Entrada é uma janela temporal delimitada (até 31 dias), segmentos `DUTY`, `STANDBY` ou `OFF_DUTY`, cada um com origem obrigatória `ACTUAL`, `PLANNED` ou `ESTIMATED`. Os horários contêm deslocamento UTC explícito; sobreposições e datas inválidas são rejeitadas sem escolher silenciosamente entre realizado e planejado.
- Retorna duração de serviço/sobreaviso, oportunidades fora de serviço, lacunas e períodos estimados. Oportunidade fora de serviço **não comprova** sono, repouso regulamentar nem recuperação fisiológica.
- Descreve presença de serviço na **janela ilustrativa 02:00–06:00** usando deslocamento UTC de referência fixo fornecido pelo chamador. Esse recorte é **pesquisa descritiva**, não teste da WOCL legal nem classificação de severidade. Não usar em intervalos com mudança de fuso ou horário de verão sem resolver a transição por um contrato posterior.
- Separa **real, planejado e estimado** inclusive dentro dos intervalos noturnos e das oportunidades fora de serviço, para não criar falsa evidência observada.
- Compara duas escalas na **mesma janela e no mesmo referencial horário**, devolvendo apenas diferenças em horas. Exemplo sintético: serviço de oito horas de 03:00 a 11:00 versus 09:00 a 17:00; o primeiro apresenta três horas na janela noturna de referência e o segundo nenhuma. **Não conclui que o segundo é seguro ou qual piloto está apto**.
- Saída tem `fatigueIndex: null`, `verifiedSleepHours: null`, `fitForDuty: null`, `regulatoryCompliance: NOT_ASSESSED`, `flightAuthorization: NOT_PROVIDED` e a comparação traz `riskRanking: NOT_AVAILABLE_WITHOUT_VALIDATION`.

## Isolamento de fontes e segurança

O módulo é **puro**, sem consultas, identidade, tokens, storage ou persistência. Não transforma folga em horas de sono e não gera uma prontidão verde na ausência de dados. Futuros consumidores deverão validar `empresa_id` e RBAC **no backend antes de ler eventos**, descartar registros de outro tenant, deduplicar um mesmo evento de Controle de Voos/SIGVOOS/escala, declarar corretamente a origem e a versão do dado e tratar fuso horário antes de chamar essa função.

A separação operacional recomendada para a interface futura permanece:

1. **Limites e condições impeditivas (backend regulatório e políticas aplicáveis).**
2. **Sinais observados (KSS, prontidão/PVT-B, sono informado, estado declarado).**
3. **Exposição de escala (realizada, planejada ou estimada, SEM score fisiológico).**
4. **Completude, confirmação de check-in e ação humana documentada.**

Nenhuma dessas quatro dimensões pode ser convertida automaticamente em autorização de voo ou neutralizada por um número 0–100. O modelo matemático do IMA continuará separado, e qualquer cálculo futuro de fadiga exigirá cobertura longitudinal suficiente, calibração e avaliação científica.

## Aceite para próxima etapa

- Mapear fontes canônicas tenant-scoped (jornadas reais x escala projetada, sobreaviso/reserva, eventos de descanso) sem inferir estados não documentados. Não ligar diretamente `frms_jornada.status` aos novos eventos antes de auditar a semântica operacional de `RE` e `SA`.
- Executar diagnóstico governado read-only de cobertura histórica, produzindo somente agregados sem PII e respeitando contratos de retenção/consentimento e aprovação de acesso.
- Elaborar cenários humanos que permitam à Coordenação comparar carga noturna/jornada/intervalos, conferir origem e selecionar medidas de mitigação. Homologar com gestores e FRMS/GAGEF, sem rótulos de “apto” criados pelo modelo.
- Implementar adapter e API autenticada somente depois das definições de fonte e RBAC, testes de isolamento e revisão de privacidade. Validar comportamento visual em staging com fontes sintéticas separadas da operação real.
- Produção de qualquer funcionalidade nova somente com SHA específico, oito gates, release oficial, proveniência e aprovação correspondente. **Sem migração/seed/D1/R2 write nesta PR.**

Referências metodológicas: `docs/frms/FRMS_V3_DECISAO_METODOLOGICA_ICAO_IOGP_BMM_2026-10-14.md`, issue #1476 e os testes `ima-v3-schedule-exposure.test.ts`.
