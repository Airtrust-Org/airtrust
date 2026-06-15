PRAGMA defer_foreign_keys = ON;

INSERT OR IGNORE INTO cv_aeroportos (
  id,
  empresa_id,
  codigo,
  codigo_icao,
  codigo_iata,
  nome,
  cidade,
  uf,
  tipo,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (61001, 1, 'SBRJ', 'SBRJ', 'SDU', 'Santos Dumont', 'Rio de Janeiro', 'RJ', 'aeroporto', 'Seed local N1', 1, 1, 1, 1),
  (61002, 1, 'SBSP', 'SBSP', 'CGH', 'Congonhas', 'Sao Paulo', 'SP', 'aeroporto', 'Seed local N1', 1, 2, 1, 1),
  (61003, 1, 'SBJR', 'SBJR', NULL, 'Jacarepagua', 'Rio de Janeiro', 'RJ', 'aeroporto', 'Seed local N1', 1, 3, 1, 1),
  (61004, 1, 'SBPL01', 'SBPL01', NULL, 'Plataforma P-01', 'Bacia de Campos', 'RJ', 'plataforma', 'Seed local N1', 1, 4, 1, 1);

INSERT OR IGNORE INTO cv_tipos_voo (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (61101, 1, 'REG', 'Regular', 'Operacao interna demonstrativa', 1, 1, 1, 1),
  (61102, 1, 'FRET', 'Fretamento', 'Operacao interna demonstrativa', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_naturezas_voo (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (61201, 1, 'PAX', 'Passageiro', 'Operacao interna demonstrativa', 1, 1, 1, 1),
  (61202, 1, 'OFF', 'Offshore', 'Operacao interna demonstrativa', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_motivos_operacionais (
  id,
  empresa_id,
  codigo,
  nome,
  tipo,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (61301, 1, 'WX', 'Meteorologia', 'cancelamento', 'Catalogo local demonstrativo', 1, 1, 1, 1),
  (61302, 1, 'OPS', 'Ajuste operacional', 'geral', 'Catalogo local demonstrativo', 1, 2, 1, 1),
  (61303, 1, 'ALT', 'Alternado', 'alternado_divergido', 'Catalogo local demonstrativo', 1, 3, 1, 1);

INSERT OR IGNORE INTO cv_voos (
  id,
  empresa_id,
  prefixo,
  data_programacao,
  origem_id,
  destino_id,
  tipo_voo_id,
  natureza_voo_id,
  aeronave_id,
  horario_previsto_partida,
  horario_previsto_chegada,
  horario_real_partida,
  horario_real_chegada,
  status,
  observacoes,
  created_by,
  updated_by
) VALUES
  (
    61401,
    1,
    'ATX-LOCAL-001',
    '2026-06-14',
    61001,
    61002,
    61101,
    61201,
    24,
    '2026-06-14T10:00:00Z',
    '2026-06-14T11:05:00Z',
    NULL,
    NULL,
    'planejado',
    'Seed local para fluxo RDV ainda nao preenchido.',
    1,
    1
  ),
  (
    61402,
    1,
    'ATX-LOCAL-002',
    '2026-06-14',
    61002,
    61004,
    61102,
    61202,
    25,
    '2026-06-14T13:00:00Z',
    '2026-06-14T14:10:00Z',
    '2026-06-14T13:08:00Z',
    '2026-06-14T14:03:00Z',
    'concluido_operacionalmente',
    'Seed local para fluxo RDV em rascunho.',
    1,
    1
  );

INSERT OR IGNORE INTO cv_rdv_operacional (
  id,
  empresa_id,
  voo_id,
  numero,
  data_voo,
  horario_decolagem_real,
  horario_pouso_real,
  horas_voadas,
  numero_pousos,
  ciclos,
  combustivel_decolagem,
  combustivel_pouso,
  combustivel_consumo,
  pob,
  carga_kg,
  ocorrencias,
  divergencias,
  status,
  responsavel_preenchimento_id,
  preenchido_em,
  created_by,
  updated_by
) VALUES
  (
    61501,
    1,
    61402,
    'RDV-LOCAL-20260614-002',
    '2026-06-14',
    '2026-06-14T13:08:00Z',
    '2026-06-14T14:03:00Z',
    0.92,
    1,
    1,
    850,
    520,
    330,
    5,
    180,
    'Seed local N1',
    'Sem divergencias operacionais relevantes.',
    'rascunho',
    1,
    '2026-06-14T14:20:00Z',
    1,
    1
  );

INSERT OR IGNORE INTO cv_voo_eventos (
  id,
  empresa_id,
  voo_id,
  tipo_evento,
  status_anterior,
  status_novo,
  descricao,
  metadata_json,
  usuario_id,
  created_by,
  updated_by
) VALUES
  (
    61601,
    1,
    61402,
    'rdv',
    'concluido_operacionalmente',
    'concluido_operacionalmente',
    'RDV operacional criado no seed local',
    '{"seed":"controle_voos_local"}',
    1,
    1,
    1
  );

INSERT OR IGNORE INTO cv_aeroportos (
  id,
  empresa_id,
  codigo,
  codigo_icao,
  codigo_iata,
  nome,
  cidade,
  uf,
  tipo,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (62001, 6, 'SBRJ6', 'SBRJ', 'SDU', 'Santos Dumont', 'Rio de Janeiro', 'RJ', 'aeroporto', 'Seed local N1 tenant 6', 1, 1, 1, 1),
  (62002, 6, 'SBSP6', 'SBSP', 'CGH', 'Congonhas', 'Sao Paulo', 'SP', 'aeroporto', 'Seed local N1 tenant 6', 1, 2, 1, 1),
  (62003, 6, 'SBJR6', 'SBJR', NULL, 'Jacarepagua', 'Rio de Janeiro', 'RJ', 'aeroporto', 'Seed local N1 tenant 6', 1, 3, 1, 1),
  (62004, 6, 'SBPL06', 'SBPL06', NULL, 'Plataforma P-06', 'Bacia de Campos', 'RJ', 'plataforma', 'Seed local N1 tenant 6', 1, 4, 1, 1),
  (62005, 6, 'SBMI6', 'SBMI', NULL, 'Macae', 'Macae', 'RJ', 'aeroporto', 'Seed local N1 tenant 6 complemento SIGVOOS', 1, 5, 1, 1);

INSERT OR IGNORE INTO cv_tipos_voo (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (62101, 6, 'REG', 'Regular', 'Operacao interna demonstrativa tenant 6', 1, 1, 1, 1),
  (62102, 6, 'OFF', 'Offshore', 'Operacao interna demonstrativa tenant 6', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_naturezas_voo (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (62201, 6, 'PAX', 'Passageiro', 'Operacao interna demonstrativa tenant 6', 1, 1, 1, 1),
  (62202, 6, 'SERV', 'Servico', 'Operacao interna demonstrativa tenant 6', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_motivos_operacionais (
  id,
  empresa_id,
  codigo,
  nome,
  tipo,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (62301, 6, 'WX', 'Meteorologia', 'cancelamento', 'Catalogo local demonstrativo tenant 6', 1, 1, 1, 1),
  (62302, 6, 'OPS', 'Ajuste operacional', 'geral', 'Catalogo local demonstrativo tenant 6', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_aeroportos (
  id,
  empresa_id,
  codigo,
  codigo_icao,
  codigo_iata,
  nome,
  cidade,
  uf,
  tipo,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (63001, 7, 'SBRJ7', 'SBRJ', 'SDU', 'Santos Dumont', 'Rio de Janeiro', 'RJ', 'aeroporto', 'Seed local N1 tenant 7', 1, 1, 1, 1),
  (63002, 7, 'SBSP7', 'SBSP', 'CGH', 'Congonhas', 'Sao Paulo', 'SP', 'aeroporto', 'Seed local N1 tenant 7', 1, 2, 1, 1),
  (63003, 7, 'SBJR7', 'SBJR', NULL, 'Jacarepagua', 'Rio de Janeiro', 'RJ', 'aeroporto', 'Seed local N1 tenant 7', 1, 3, 1, 1),
  (63004, 7, 'SBPL07', 'SBPL07', NULL, 'Plataforma P-07', 'Bacia de Campos', 'RJ', 'plataforma', 'Seed local N1 tenant 7', 1, 4, 1, 1),
  (63005, 7, 'SBMI7', 'SBMI', NULL, 'Macae', 'Macae', 'RJ', 'aeroporto', 'Seed local N1 tenant 7 complemento SIGVOOS', 1, 5, 1, 1);

INSERT OR IGNORE INTO cv_tipos_voo (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (63101, 7, 'REG', 'Regular', 'Operacao interna demonstrativa tenant 7', 1, 1, 1, 1),
  (63102, 7, 'OFF', 'Offshore', 'Operacao interna demonstrativa tenant 7', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_naturezas_voo (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (63201, 7, 'PAX', 'Passageiro', 'Operacao interna demonstrativa tenant 7', 1, 1, 1, 1),
  (63202, 7, 'SERV', 'Servico', 'Operacao interna demonstrativa tenant 7', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_motivos_operacionais (
  id,
  empresa_id,
  codigo,
  nome,
  tipo,
  descricao,
  ativo,
  ordem,
  created_by,
  updated_by
) VALUES
  (63301, 7, 'WX', 'Meteorologia', 'cancelamento', 'Catalogo local demonstrativo tenant 7', 1, 1, 1, 1),
  (63302, 7, 'OPS', 'Ajuste operacional', 'geral', 'Catalogo local demonstrativo tenant 7', 1, 2, 1, 1);

INSERT OR IGNORE INTO cv_voos (
  id,
  empresa_id,
  prefixo,
  data_programacao,
  origem_id,
  destino_id,
  tipo_voo_id,
  natureza_voo_id,
  aeronave_id,
  horario_previsto_partida,
  horario_previsto_chegada,
  horario_real_partida,
  horario_real_chegada,
  status,
  observacoes,
  created_by,
  updated_by
) VALUES
  (
    62401,
    6,
    'ATX-LOCAL-101',
    '2026-06-14',
    62001,
    62002,
    62101,
    62201,
    NULL,
    '2026-06-14T09:30:00Z',
    '2026-06-14T10:40:00Z',
    NULL,
    NULL,
    'planejado',
    'Seed local para fluxo RDV ainda nao preenchido no tenant padrao local.',
    1,
    1
  ),
  (
    62402,
    6,
    'ATX-LOCAL-102',
    '2026-06-14',
    62002,
    62004,
    62102,
    62202,
    NULL,
    '2026-06-14T13:20:00Z',
    '2026-06-14T14:20:00Z',
    '2026-06-14T13:29:00Z',
    '2026-06-14T14:12:00Z',
    'concluido_operacionalmente',
    'Seed local para fluxo RDV em rascunho no tenant padrao local.',
    1,
    1
  );

INSERT OR IGNORE INTO cv_rdv_operacional (
  id,
  empresa_id,
  voo_id,
  numero,
  data_voo,
  horario_decolagem_real,
  horario_pouso_real,
  horas_voadas,
  numero_pousos,
  ciclos,
  combustivel_decolagem,
  combustivel_pouso,
  combustivel_consumo,
  pob,
  carga_kg,
  ocorrencias,
  divergencias,
  status,
  responsavel_preenchimento_id,
  preenchido_em,
  created_by,
  updated_by
) VALUES
  (
    62501,
    6,
    62402,
    'RDV-LOCAL-20260614-102',
    '2026-06-14',
    '2026-06-14T13:29:00Z',
    '2026-06-14T14:12:00Z',
    0.72,
    1,
    1,
    900,
    610,
    290,
    4,
    140,
    'Seed local N1 tenant 6',
    'Sem divergencias operacionais relevantes.',
    'rascunho',
    1,
    '2026-06-14T14:18:00Z',
    1,
    1
  );

INSERT OR IGNORE INTO cv_voo_eventos (
  id,
  empresa_id,
  voo_id,
  tipo_evento,
  status_anterior,
  status_novo,
  descricao,
  metadata_json,
  usuario_id,
  created_by,
  updated_by
) VALUES
  (
    62601,
    6,
    62402,
    'rdv',
    'concluido_operacionalmente',
    'concluido_operacionalmente',
    'RDV operacional criado no seed local tenant 6',
    '{"seed":"controle_voos_local_tenant_6"}',
    1,
    1,
    1
  );
