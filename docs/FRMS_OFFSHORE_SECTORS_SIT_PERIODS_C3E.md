# AirTrust FRMS — C3-E Setores, Trechos e Sit Periods (Inventario Tecnico)

## 1) Objetivo
Documentar a disponibilidade tecnica atual de dados operacionais segmentados (setores/trechos/pernas e intervalos entre segmentos) para uso futuro no FRMS offshore, sem alterar comportamento de calculo e sem persistencia adicional nesta fase.

## 2) Inventario de fontes verificadas

### 2.1 FRMS jornada consolidada
- Fonte: `frms_jornada` (`worker-airtrust/migrations/0212_frms_module.sql`, `worker-airtrust/src/lib/frms/db-service-jornadas.ts`).
- Granularidade: diaria por tripulante.
- Evidencia estrutural:
  - indice unico `tripulante_id + data` em `frms_jornada`.
  - campos principais agregados do dia (`hora_apresentacao`, `hora_termino`, `duracao_jornada_minutos`, `horas_voo_minutos`).
- Conclusao: nao representa segmentos individuais.

### 2.2 Integracao SIGVOOS
- Fonte: `worker-airtrust/src/services/sigvoos-frms.ts`.
- Fluxo atual:
  - normaliza registros brutos (`normalizeSigvoosRecord`),
  - agrega por tripulante+data (`groupSigvoosRecordsByDay`),
  - importa preview mensal com linhas diarias.
- Evidencia:
  - `groupSigvoosRecordsByDay` soma horas e consolida janelas por dia.
  - `SigvoosGroupedDay.rawItems` existe, mas o fluxo FRMS persistido e reprocessado opera na visao diaria.
- Conclusao: origem SIGVOOS e preservada, mas os dados usados no FRMS operacional ficam agregados por dia.

### 2.3 EVD (escala de voo diaria)
- Fonte: `escala_voo_diaria` (`worker-airtrust/migrations/0279_create_escala_voo_diaria.sql`, `worker-airtrust/src/routes/escalas-evd.ts`).
- Granularidade: linha por voo planejado/publicado (multipla linhas por dia possivel).
- Campos relevantes:
  - tripulacao (`pic_id`, `sic_id`),
  - horarios (`hora_apresentacao`, `hora_decolagem_prevista/real`, `hora_pouso_previsto/real`, `hora_corte_motor`),
  - rota (`origem`, `destino`),
  - aeronave (`aeronave_prefixo`, `aeronave_modelo`).
- Conclusao: e a fonte mais proxima de segmentos operacionais por dia para coordenacao.

### 2.4 Caderneta de horas de voo
- Fonte: `horas_voo_lancamentos` (`worker-airtrust/migrations/0286_horas_voo_caderneta.sql`, `worker-airtrust/src/routes/horas-voo.ts`).
- Granularidade: lancamentos de voo com `data_voo`, `origem`, `destino`, `duracao_total_min`, `numero_voo`, `funcao`.
- Vinculos:
  - `funcionario_id`, `empresa_id`,
  - `frms_jornada_id` (opcional),
  - `origem_registro` (MANUAL/FIRA/APUS/SIGVOOS etc).
- Conclusao: contem elementos de segmento, mas o acoplamento com fluxo FRMS diario ainda nao e uniforme para toda janela offshore.

## 3) Conclusao sobre os dados existentes
- Existe dado segmentado em partes do sistema (principalmente EVD e horas de voo).
- O pipeline principal FRMS usado pelo snapshot/quinzena esta centrado em `frms_jornada` agregado diario.
- A integracao SIGVOOS atualmente consolida por dia antes do uso operacional no FRMS.
- Resultado: nao ha hoje uma fonte unica, consistente e historicamente completa de segmentos ponta-a-ponta para toda a leitura de quinzena FRMS.

## 4) Por que `frms_jornada` agregado diario nao basta
- Nao guarda lista de pernas/segmentos do dia.
- Nao guarda sequencia de decolagem/pouso por perna.
- Nao permite derivar com confianca:
  - contagem robusta de setores por dia/periodo,
  - intervalos entre segmentos no mesmo dia,
  - classificacao padronizada de sit periods intra-jornada.

## 5) Campos minimos necessarios para implementacao futura
Para habilitar C3-E com base robusta:
- identificador de segmento (`segmento_id`/`leg_id`) por registro operacional;
- `empresa_id`, `funcionario_id`, `data_operacional`;
- papel operacional no segmento (PIC/SIC/etc);
- aeronave (`prefixo`, `modelo`);
- origem/destino/plataforma padronizados;
- horarios por segmento (`off_block`, `takeoff`, `landing`, `on_block`) com timezone consistente;
- ordem sequencial do segmento no dia;
- fonte do dado por campo (REAL/DERIVADO/ESTIMADO);
- referencia de importacao e reconciliacao (SIGVOOS/FIRA/EVD/MANUAL).

## 6) Contrato futuro sugerido (conceitual)

```ts
interface FrmsSectorsSitPeriodsIndicator {
  empresa_id: number;
  funcionario_id: number;
  data_operacional: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;

  setores_dia: number | null;
  setores_periodo: number | null;
  setores_168h: number | null;

  trechos_dia: number | null;
  trechos_periodo: number | null;
  trechos_168h: number | null;

  plataformas_distintas_periodo: number | null;
  aeronaves_distintas_periodo: number | null;

  primeiro_voo_horario: string | null;
  ultimo_voo_horario: string | null;

  maior_intervalo_entre_trechos_min: number | null;
  tempo_total_estimado_espera_min: number | null;
  sit_periods_estimados: number | null;
  sit_periods_maiores_60min: number | null;
  sit_periods_maiores_120min: number | null;

  fonte_setores: 'REAL' | 'DERIVADO' | 'ESTIMADO' | 'AUSENTE' | 'INCOMPLETO';
  fonte_sit_periods: 'REAL' | 'DERIVADO' | 'ESTIMADO' | 'AUSENTE' | 'INCOMPLETO';

  status_setores_sit: 'OK' | 'ATENCAO' | 'INCOMPLETO';
  alertas_descritivos: string[];
  limitation_notes: string[];
}
```

Observacao: contrato acima e apenas referencia de desenho para fase posterior, sem ativacao nesta C3-E.

## 7) Schema futuro sugerido (conceitual, sem migration nesta fase)
Opcoes de modelagem futura:
1. Tabela normalizada de segmentos operacionais (`frms_segmento_operacional`) com 1 linha por perna.
2. Tabela de intervalos derivados (`frms_segmento_intervalo`) para auditoria de sit periods.
3. View materializada de consolidacao diaria por tripulante para consumo do snapshot.

Diretrizes:
- tenant-safe por `empresa_id` em todas as tabelas.
- chave de conciliacao com SIGVOOS/FIRA/EVD.
- coluna de source flag por campo critico.
- sem substituir `frms_jornada`; complementar.

## 8) Limitacoes tecnicas e de interpretacao
- A cobertura de segmentos hoje e heterogenea entre modulos.
- Ha dados ricos em EVD, mas nem sempre retroativos/fechados para toda serie historica FRMS.
- Sem trilha segmentada consolidada, qualquer metrica de setores/sit periods na quinzena tende a incompletude estrutural.

## 9) Recomendacao operacional para proximas fases
- Nao usar setores/sit periods para automacoes persistentes enquanto nao houver fonte segmentada robusta e reconciliada.
- Priorizar primeiro a base de dados segmentados e rastreabilidade de fonte por campo.

## 10) Quando usar Opus
Opus passa a ser necessario quando a proxima fase tentar:
- transformar setores/sit periods em peso de formula operacional;
- definir limiares numericos de classificacao para uso automatizado;
- acoplar o indicador segmentado a mecanismos persistentes de acionamento.

Nesta C3-E atual, o escopo permanece de inventario tecnico e contrato futuro.
