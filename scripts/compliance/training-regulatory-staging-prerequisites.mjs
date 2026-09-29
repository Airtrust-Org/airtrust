// Non-PII qualification reference catalog used only to make staging capable of
// exercising the reviewed Training Compliance regulatory reconciliation.
// source_reference: production tenant 6 read-only catalog reconciliation on 2026-09-29.
// No employee, qualification-history, enrollment, or assignment data is copied.
export const STAGING_PREREQUISITE_MODELS = Object.freeze([
  { code: 'D1', name: 'AVSEC', category: 'Teórico', validity: 24, hours: 4, areaCode: 'OPERACOES' },
  { code: 'D2', name: 'SGSO — Segurança Operacional e Gestão de Riscos', category: 'EAD', validity: 36, hours: 4, areaCode: 'SEGURANCA_OPERACIONAL' },
  { code: 'D4', name: 'DGR — Transporte de Artigos Perigosos', category: 'Teórico', validity: 24, hours: 4, areaCode: 'OPERACOES' },
  { code: 'FDM-EAD', name: 'FDM - Flight Data Monitoring', category: 'EAD', validity: 24, hours: 2, areaCode: 'OPERACOES' },
  { code: 'FOD', name: 'FOD — Prevenção de Danos por Objetos Estranhos', category: 'EAD', validity: 24, hours: 2, areaCode: 'SEGURANCA_OPERACIONAL' },
  { code: 'GATEKEEPER', name: 'Gatekeeper', category: 'EAD', validity: 12, hours: 2, areaCode: 'OPERACOES' },
  { code: 'JUST_CULTURE', name: 'Cultura Justa — Reporte, Erros e Responsabilização', category: 'EAD', validity: 24, hours: 2, areaCode: 'SEGURANCA_OPERACIONAL' },
  { code: 'LOSA', name: 'LOSA — Line Operations Safety Audit', category: 'EAD', validity: 48, hours: 2, areaCode: 'SEGURANCA_OPERACIONAL' },
  { code: 'NR-11', name: 'NR-11 - Transporte, Movimentação, Armazenagem e Manuseio de Materiais', category: 'EAD', validity: 24, hours: 2, areaCode: 'QSMS' },
  { code: 'NR-20', name: 'NR-20 - Iniciação sobre Inflamáveis e Combustíveis', category: 'EAD', validity: 24, hours: 2, areaCode: 'QSMS' },
  { code: 'NR-26', name: 'NR-26 - Produtos Químicos, Rotulagem e FDS', category: 'EAD', validity: 24, hours: 2, areaCode: 'QSMS' },
  { code: 'NR-35', name: 'NR-35 - Trabalho em Altura', category: 'EAD', validity: 24, hours: 8, areaCode: 'QSMS' },
  { code: 'NR06', name: 'NR-06 - Equipamento de Proteção Individual', category: 'EAD', validity: 24, hours: 2, areaCode: 'QSMS' },
  { code: 'PPSP', name: 'PPSP — Prevenção do Risco Associado ao Uso Indevido de Substâncias Psicoativas', category: 'EAD', validity: 60, hours: 2, areaCode: 'SEGURANCA_OPERACIONAL' },
  { code: 'PPSP_SUP', name: 'PPSP para Supervisores ARSO', category: 'EAD', validity: 60, hours: 2, areaCode: 'SEGURANCA_OPERACIONAL' },
  { code: 'PRE', name: 'PRE - Plano de Resposta à Emergências', category: 'EAD', validity: 24, hours: 2, areaCode: 'SEGURANCA_OPERACIONAL' },
  { code: 'STOP_WORK', name: 'Stop Work — Autoridade para Interromper Atividades Inseguras', category: 'EAD', validity: 24, hours: 2, areaCode: 'SEGURANCA_OPERACIONAL' },
]);
