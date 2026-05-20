-- Fix manobra names and descriptions for AW139 periodic model
-- Ensure `nome` is short title and `descricao` holds the long text

UPDATE manobras SET nome='Cálculo de Performance (RFM Cap. 5)', descricao='Precisão na determinação do MTOW para as condições de pressão/temperatura e perfil de decolagem (Clear Area / Helideck).' WHERE codigo='A01' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Análise de Clima e NOTAM', descricao='Antecipação de restrições operacionais e escolha de alternativas baseadas nos mínimos da empresa e aeronave.' WHERE codigo='A02' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Configuração de Aviônica (FMS/EPIC)', descricao='Inicialização correta do sistema, inserção de pesos (ZFW), combustível e plano de voo sem erros de digitação.' WHERE codigo='A03' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Briefing de Partida (Departure Briefing)', descricao='Clareza na definição de quem voa (PF) e quem monitora (PM), e ações em caso de falha de motor antes/após o TDP.' WHERE codigo='A04' AND tipo_aeronave='AW139';

UPDATE manobras SET nome='Disciplina de Checklist', descricao='Execução de checklists normais de forma ritmada, garantindo que nenhum item seja "cantado" sem verificação real.' WHERE codigo='B01' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Gerenciamento do AC/DC e Hidráulico', descricao='Monitoramento correto das cargas elétricas e pressões durante o acionamento e taxi. (Ref: Manual CEL Cap. 1).' WHERE codigo='B02' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Hover Check e Margem de Potência', descricao='Verificação de parâmetros (Tq, ITT, Ng) em voo pairado para confirmar se a performance real condiz com a planejada.' WHERE codigo='B03' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Perfil de Decolagem (CAT A / PC1 / PC2)', descricao='Precisão na trajetória de subida e transição para a velocidade de subida (Vy/Voss). (Ref: RFM Seção 4).' WHERE codigo='B04' AND tipo_aeronave='AW139';

UPDATE manobras SET nome='Uso dos Níveis de Automação (AFCS)', descricao='Seleção do modo apropriado para a fase do voo (ex: IAS/ALT vs. FPA/VS) e correto anúncio no FMA. (Ref: EPIC Guide Cap. 15).' WHERE codigo='C01' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Flight Path Monitoring', descricao='Capacidade do PM em monitorar a trajetória e "avisar" desvios antes que se tornem críticos.' WHERE codigo='C02' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Gestão do FMS em Rota', descricao='Capacidade de realizar mudanças de plano de voo ("Direct-to", inserção de pontos) de forma eficiente sob carga de trabalho.' WHERE codigo='C03' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Consciência Situacional (MFD/TAWS)', descricao='Uso efetivo do mapa, radar meteorológico e HTAWS para evitar terreno e áreas de mau tempo.' WHERE codigo='C04' AND tipo_aeronave='AW139';

UPDATE manobras SET nome='Identificação e Diagnóstico (CAS/IED)', descricao='Rapidez e precisão em identificar falhas através das mensagens CAS e instrumentos de backup.' WHERE codigo='D01' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Ações de Memória (Memory Items)', descricao='Execução correta das ações imediatas sem hesitação e sem consulta ao manual (ex: fogo ou falha crítica de motor).' WHERE codigo='D02' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Uso do QRH', descricao='Localização e aplicação correta dos procedimentos de emergência e malfunções. (Ref: QRH Virtual).' WHERE codigo='D03' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Tomada de Decisão (Decision Making)', descricao='Uso de ferramentas (ex: FORDEC) para decidir entre retorno, prosseguimento ou pouso imediato.' WHERE codigo='D04' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Gestão da Potência OEI (One Engine Inoperative)', descricao='Monitoramento dos limites de 2.5 min ou 30 min para evitar danos ao motor remanescente. (Ref: RFM Seção 3).' WHERE codigo='D05' AND tipo_aeronave='AW139';

UPDATE manobras SET nome='Briefing de Aproximação', descricao='Definição da estratégia de pouso (ex: Point-in-Space ou ARA) e critérios de arremetida (Missed Approach).' WHERE codigo='E01' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Estabilização da Aproximação', descricao='Manutenção de velocidades e razão de descida dentro dos limites de segurança até o ponto de toque.' WHERE codigo='E02' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Técnica de Pouso OEI (se aplicável)', descricao='Gerenciamento da redução de velocidade e aplicação de coletivo (cushion) no toque. (Ref: QRH OEI Landing).' WHERE codigo='E03' AND tipo_aeronave='AW139';

UPDATE manobras SET nome='Comunicação e Coordenação', descricao='Clareza no uso da fraseologia padrão e assertividade na comunicação entre a tripulação.' WHERE codigo='F01' AND tipo_aeronave='AW139';
UPDATE manobras SET nome='Autocrítica e Debriefing', descricao='Capacidade da tripulação de identificar seus próprios erros e áreas de melhoria após o término da missão.' WHERE codigo='F02' AND tipo_aeronave='AW139';
