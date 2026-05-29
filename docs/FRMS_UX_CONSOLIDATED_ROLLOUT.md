# FRMS UX Consolidated Rollout

## 1. Objetivo

Consolidar em uma unica entrega as melhorias de UX do FRMS:

- check-in diario de fadiga mobile-first;
- tela de Controle Operacional FRMS reorganizada para coordenacao.

A entrega preserva contratos existentes e nao altera banco, schema, score, formula, threshold, mitigacao, decisao automatica, escala operacional ou SGSO.

## 2. Resumo check-in UX

O formulario de check-in diario foi simplificado para uso por tripulante em celular:

- blocos curtos para sono, sonolencia agora, aptidao operacional e fatores relevantes;
- KSS apresentada com pergunta clara: "Quao sonolento ou alerta voce esta agora?";
- descritores de KSS de 1 a 9 visiveis no proprio controle;
- qualidade do sono com numero + titulo claro (`1 - Muito ruim` ate `5 - Muito boa`) e descricao curta;
- hora em que acordou com entrada numerica continua e mascara automatica (`0630` vira `06:30`);
- aptidao operacional com opcoes "Sim", "Nao" e "Preciso falar com a coordenacao";
- observacao obrigatoria quando o tripulante informa que nao esta em condicao segura ou precisa falar com a coordenacao;
- medicacao e alcool como tri-state: "Nao", "Sim" e "Prefiro nao informar";
- CTA unico e grande para confirmar check-in.

## 3. Resumo Controle Operacional UX

A tela `/frms/controle-operacional` foi reorganizada para leitura de coordenacao:

- topo reduzido para seis sinais operacionais;
- busca principal por nome, nome de guerra, funcao, aeronave ou ID como texto;
- `funcionario_id` mantido apenas como filtro tecnico recolhido;
- base e aeronave/modelo como dropdowns derivados do snapshot carregado;
- tabela com hierarquia por escala, check-in, sono/KSS, efetividade/quinzena, status, alertas e fonte;
- linhas escaladas aparecem como foco primario;
- check-in sem escala e jornada sem escala aparecem como excecoes operacionais;
- ciencia operacional permanece como registro de leitura, nao como mitigacao.

## 4. Campos removidos ou reduzidos

No check-in:

- sintomas soltos foram removidos da UI por redundancia com KSS e baixa utilidade operacional no envio minimo diario;
- sono de 48h saiu da UI;
- nivel subjetivo generico de fadiga saiu da UI e continua derivado de KSS para compatibilidade de payload;
- textos tecnicos longos foram substituidos por labels operacionais.

No Controle Operacional:

- cards redundantes de quinzena e alertas fragmentados sairam do topo;
- quinzena permanece na tabela como indicador descritivo contextual;
- busca por ID deixou de ser o filtro principal.

## 5. Filtros melhorados

Controle Operacional:

- Data inicio.
- Data fim.
- Tripulante por nome, nome de guerra, funcao, aeronave ou ID.
- Base por dropdown.
- Aeronave/modelo por dropdown.
- Status por dropdown.
- Toggle para mostrar inconsistencias.
- Funcionario ID como filtro tecnico.

Os dropdowns usam os dados reais presentes no snapshot carregado. Nao foi criado endpoint novo nesta fase.

## 6. Dados do check-in para snapshot e coordenacao

O check-in continua enviando payload compativel com o backend atual:

- `horas_sono_24h`;
- `wake_time` / `hora_acordou`;
- `qualidade_sono`;
- `kss_score`;
- `subjective_fatigue_level` derivado de KSS para compatibilidade;
- `sleepiness_level` derivado de KSS para compatibilidade;
- `fit_for_duty`;
- `motivo_inaptidao` quando ha necessidade de coordenacao;
- `free_text_notes` quando ha observacao opcional;
- `meds_ult_12h`;
- `alcool_ult_12h`;
- aceites obrigatorios.

O Controle Operacional exibe o resultado consolidado via snapshot:

- check-in recebido, pendente ou ausente;
- sono;
- KSS;
- qualidade do sono;
- fonte de sono/despertar/jornada como `REAL`, `ESTIMADO`, `AUSENTE` ou `INCONSISTENTE`;
- alertas operacionais;
- efetividade e quinzena como indicadores descritivos;
- eventos de ciencia operacional.

No check-in, a validacao de hora continua exigindo formato final `HH:mm` e faixa `00:00` a `23:59`, sem mudanca de contrato.

## 7. Limitacoes preservadas

- O banco legado normaliza alguns campos opcionais para compatibilidade; esta fase nao muda schema.
- Base e aeronave/modelo ainda dependem do snapshot carregado, sem endpoint dedicado de dimensoes.
- A busca por nome no Controle Operacional e aplicada no frontend.
- A EVD ainda consome rotas de fadiga diaria e nao o snapshot operacional completo.
- Ciencia operacional nao cria mitigacao, nao altera escala e nao executa decisao automatica.
- Links/fluxos SGSO existentes nao foram expandidos nesta fase.

## 8. Confirmacao de escopo

Nao houve alteracao de:

- banco de dados;
- migration;
- schema DB;
- formula de fadiga;
- threshold;
- mitigacao;
- decisao automatica;
- escala operacional;
- SGSO;
- contrato de payload obrigatorio.

## 9. Quando chamar Opus no futuro

Opus deve ser chamado apenas para auditoria cientifica ou decisoria, por exemplo:

- avaliar se KSS deve acionar alerta ou threshold especifico;
- revisar pesos de sono, vigilia, ritmo circadiano, carga offshore e quinzena;
- definir se efetividade deve entrar em regra de decisao;
- transformar alerta em mitigacao formal sem confundir FRMS com compliance de jornada.
