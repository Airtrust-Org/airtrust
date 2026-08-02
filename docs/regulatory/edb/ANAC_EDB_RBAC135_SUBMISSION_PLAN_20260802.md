# AirTrust — Plano de Submissão ANAC do eDB para RBAC 135

> **Data:** 2026-08-02  
> **Status:** planejamento; nenhum protocolo foi realizado  
> **Objetivo:** obter orientação prévia, ateste do software e autorização de uso em EO

## 1. Estratégia

Executar o processo em três trilhas coordenadas:

1. **orientação prévia:** FOP 200 e reunião com a ANAC antes de congelar assinatura, offline e método de demonstração de segurança;
2. **ateste/verificação do software:** checklist da Resolução nº 458 e relatório independente de conformidade;
3. **autorização do operador:** FOP 219, D-144-01, FAI, manuais revisados e demonstrações requeridas.

O processo do software e a autorização do primeiro operador podem ser apresentados conjuntamente quando o software ainda não tiver sido verificado, conforme orientação publicada pela ANAC. A estratégia de protocolo deve ser confirmada na reunião prévia.

## 2. Fase 0 — Preparação interna

### Entregáveis

- baseline regulatório datado;
- matriz requisito por requisito;
- conceito de operação;
- diagrama de arquitetura;
- inventário de dados do Controle de Voos;
- gap analysis;
- modelo de assinatura proposto, com alternativas;
- modelo offline/PED proposto, com alternativas;
- política preliminar de gestão de mudanças;
- lista de operadores, aeronaves e escopo pretendido para o primeiro canário;
- responsável regulatório e responsável técnico nomeados internamente.

### Critério de saída

Nenhuma pergunta crítica sobre escopo deve depender de interpretação informal não registrada.

## 3. Fase 1 — Solicitação de reunião prévia por FOP 200

### Pacote recomendado

- FOP 200 vigente;
- carta de apresentação;
- resumo executivo de 2 a 4 páginas;
- conceito de operação do eDB;
- arquitetura de alto nível;
- lista de normas e artigos;
- matriz resumida de gaps;
- lista objetiva de perguntas;
- proposta de demonstração e shadow mode;
- indicação de que o papel continuará oficial até autorização.

### Perguntas para a reunião

1. A Portaria nº 3.220 compilada permanece a referência integral após a vigência da Resolução nº 773?
2. Qual alternativa do art. 3º, II, da Resolução nº 458 é recomendada para um SaaS multi-tenant?
3. Qual qualificação a entidade emissora do relatório de conformidade deve possuir?
4. O relatório deve cobrir ISO 27001, o produto, a infraestrutura, o SDLC e os procedimentos operacionais?
5. Quais assinaturas exigem certificado ICP-Brasil individual e quais podem usar assinatura eletrônica individual associada à assinatura digital do operador?
6. O uso de PWA instalada é aceitável como PED eDB?
7. Quais controles mínimos de MDM, bloqueio, cifragem, revogação e backup do PED serão demonstrados?
8. É aceitável assinatura offline com posterior sincronização do envelope imutável?
9. Qual mecanismo de trusted timestamp é esperado?
10. A ANAC pretende acesso direto ao sistema, usuário temporário ou exportação assinada?
11. Existe padrão vigente para compartilhamento digital previsto no art. 15 da Resolução nº 773?
12. Quais mudanças no SaaS exigem novo processo de aceitação?
13. O ateste pode ser genérico para o software e as autorizações específicas por operador?
14. Quais manuais do operador devem ser revisados: MGO, MGM e documentos complementares?
15. Quais demonstrações e inspeções devem ser programadas por FOP 216 ou FOP 217?
16. O primeiro operador pode realizar shadow mode com o papel oficial para formação de evidência?
17. Como delimitar matrículas no primeiro cutover considerando que a EO abrange a frota nela listada?
18. Como tratar manutenção terceirizada e cadastro de aprovadores para retorno ao serviço?
19. Qual procedimento deve constar para indisponibilidade, corrupção, reconstituição e descontinuidade?
20. A TFAC e o tipo de processo publicados permanecem os aplicáveis ao protocolo pretendido?

### Registro da reunião

Produzir ata interna contendo:

- data e participantes;
- perguntas e respostas;
- documentos apresentados;
- decisões;
- pendências;
- método de cumprimento aceito em princípio;
- necessidade de manifestação escrita adicional.

Orientação verbal que afete arquitetura deve ser confirmada por ofício, despacho, e-mail institucional juntado ao processo ou outro registro oficial.

## 4. Fase 2 — Construção e shadow mode

### Princípios

- o papel permanece oficial;
- o AirTrust é identificado como rascunho/evidência de teste;
- dados reais só são usados em ambiente autorizado e com proteção equivalente;
- nenhum PDF ou tela usa expressão “Diário de Bordo oficial” antes da autorização;
- divergências são registradas e resolvidas;
- evidências são conservadas para auditoria.

### Cenários mínimos

- voo de uma etapa;
- voo com múltiplas etapas;
- troca de tripulação;
- assinatura ao final da jornada;
- discrepância aberta;
- ação corretiva e retorno ao serviço;
- ação corretiva retardada;
- leitura da situação técnica pelo PIC;
- ausência de conectividade;
- troca ou falha do PED;
- sincronização duplicada;
- conflito entre SIGVOOS, RDV e dado revisado;
- correção de registro assinado;
- expiração/revogação de credencial;
- impressão e exportação para fiscal;
- restauração de backup;
- reconstituição simulada de volume.

## 5. Fase 3 — Relatório independente de conformidade

### Escopo mínimo a contratar

- arquitetura e inventário de ativos;
- análise da Resolução nº 458 artigo por artigo;
- criptografia e gestão de chaves;
- assinatura e não repúdio;
- identidade e acesso;
- segurança multi-tenant;
- desenvolvimento seguro e supply chain;
- infraestrutura Cloudflare e responsabilidades compartilhadas;
- PED, offline e sincronização;
- logs e auditoria;
- backup, retenção e recuperação;
- continuidade e migração;
- gestão de vulnerabilidades;
- gestão de mudanças do método de cumprimento;
- teste técnico independente;
- evidências de correção dos achados.

### Seleção da entidade

Não contratar antes de confirmar com a ANAC a competência esperada. A página oficial cita como exemplos empresas certificadoras segundo a família ISO/IEC 27000 ou instituição de ensino superior habilitada nessa área; o enquadramento concreto deve ser aceito para o processo.

## 6. Fase 4 — Pacote de ateste do software

### Documentos previstos

- carta;
- checklist de conformidade da Resolução nº 458;
- relatório independente de conformidade;
- descrição do sistema e escopo;
- arquitetura;
- política de assinatura;
- política de acesso;
- política de retenção;
- política de backup e recuperação;
- política de auditoria;
- gestão de incidentes;
- gestão de mudanças;
- manual de administração;
- manual de usuário;
- manual de fiscalização;
- plano de continuidade;
- plano de portabilidade e encerramento;
- evidências de testes e demonstrações.

O checklist deve apontar a evidência exata: documento, seção, tela, endpoint, teste, log ou relatório.

## 7. Fase 5 — Alteração de EO do operador RBAC 135

### Documentação publicada pela ANAC

- FOP 219;
- D-144-01;
- FAI;
- manuais revisados em processos separados e referenciados no FOP 219;
- checklist e relatório do software, quando ainda não atestado;
- outros documentos e demonstrações requeridos durante a análise.

### Manuais a revisar

A lista final depende do operador e da orientação da equipe de certificação. O conteúdo deve cobrir, no mínimo:

- responsabilidade pela guarda e controle;
- designação de pessoas para assinatura do operador;
- administração de usuários e dispositivos;
- preenchimento e assinatura;
- situação técnica e retorno ao serviço;
- correções;
- operação offline;
- contingência;
- disponibilidade a bordo;
- fiscalização;
- backup e recuperação;
- transferência de propriedade;
- exportação;
- treinamento;
- reporte de incidente;
- gestão de mudança do software;
- descontinuidade.

### TFAC

A página oficial consultada em 2026-08-02 informa TFAC código `11 C4` e valor de `R$ 3.000,00` para RBAC 135. Reconfirmar valor e código imediatamente antes do protocolo.

## 8. Fase 6 — Demonstração

Preparar roteiro repetível com evidências:

1. autenticação e autorização;
2. aviso de inicialização;
3. registros dos últimos 30 dias offline;
4. abertura de volume;
5. criação de voo e etapas;
6. dados importados identificados como rascunho;
7. revisão e assinatura do PIC;
8. troca de tripulação;
9. discrepância e assinatura imediata;
10. retorno ao serviço;
11. ciência pré-voo;
12. contrassinatura do operador;
13. correção preservando original;
14. pesquisa cronológica;
15. impressão conforme Anexo III;
16. exportação e validação de assinatura/hash;
17. indisponibilidade e recuperação;
18. revogação de dispositivo;
19. restauração de backup;
20. auditoria completa do caso.

## 9. Fase 7 — Autorização e cutover

### Antes do cutover

- ato autorizativo emitido;
- aeronaves e operador identificados;
- data de vigência definida;
- usuários treinados;
- dispositivos provisionados;
- dados e volumes iniciais conferidos;
- suporte e plantão definidos;
- rollback regulatório alinhado com a ANAC;
- papel mantido até a data formal.

### Migração

A Portaria estabelece até 30 dias após a autorização para migração das aeronaves abrangidas, com possibilidade de extensão justificada até 90 dias.

O plano deve definir:

- encerramento do último volume impresso;
- abertura do primeiro volume digital;
- saldos de horas, ciclos e pousos;
- reconciliação de proprietário e operador;
- matrícula e número de série;
- situação técnica;
- discrepâncias abertas;
- data e hora em que o eDB passa a ser a fonte oficial;
- evidência por aeronave.

### Após o cutover

- operação assistida;
- acompanhamento diário de assinaturas pendentes;
- monitoramento de integridade e sincronização;
- conferência dos últimos 30 dias nos PEDs;
- teste de exportação;
- relatório de estabilização;
- comunicação imediata de incidente regulatório.

## 10. Critérios de não submissão

Não protocolar como sistema pronto se existir qualquer um dos seguintes itens:

- assinatura sem método confirmado;
- registro assinado ainda editável;
- ausência de offline ou contingência aceita;
- inexistência de situação técnica e retorno ao serviço;
- ausência de retenção e restauração testada;
- exportação não verificável;
- acesso fiscal cross-tenant;
- dependência de segredo compartilhado para assinatura individual;
- impossibilidade de preservar conteúdo após mudança de cadastro;
- migration de dados sem reconciliação;
- documentação divergente do comportamento real.

## 11. Fontes oficiais

- Resolução nº 773/2025: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773
- Resolução nº 458/2017: https://antigo.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2017/resolucao-no-458-20-12-2017
- Portaria nº 3.220 compilada: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2019/portaria-no-3220-spo-sar-15-10-2019
- Registros digitais/ateste: https://www.gov.br/anac/pt-br/assuntos/regulados/programa-de-transformacao-digital/registros-de-manutencao
- Alteração de certificação/EO RBAC 135: https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario
- Formulários: https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/modelos-e-formularios/tabela-5
- IS 119-004J: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/boletim-de-pessoal/2023/bps-v-18-no-42-16-a-20-10-2023/is-119-004/visualizar_ato_normativo
